import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

async function compile(name) {
  const result = ts.transpileModule(await readFile(new URL(name, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}
const tank = Buffer.from(await compile("./tank-native-library.ts")).toString("base64"),
  combat = (await compile("./combat-native-library.ts")).replace(
    'from "./tank-native-library"',
    `from "data:text/javascript;base64,${tank}"`,
  ),
  { parseCombatNativePayload, combatBuildIdentity } = await import(
    `data:text/javascript;base64,${Buffer.from(combat).toString("base64")}`
  ),
  source = JSON.parse(
    gunzipSync(
      await readFile(
        new URL("./fixtures/current-combat-native-library.v1.json.gz", import.meta.url),
      ),
    ),
  );
function fixture() {
  return structuredClone(source.payload);
}

test("loads the actual selected current-model Fury snapshots with conservative first default", () => {
  assert.equal(
    source.source.byteSha256,
    "f5b99f41c12f3b9d95cceca3fc2e942af292c66c33180921f13e7513ac8b124f",
  );
  const result = parseCombatNativePayload(fixture());
  assert.equal(result.defaultBuildId, "fury-standard");
  assert.equal(result.builds.length, 2);
  assert.equal(result.builds[0].reference.iterations, 40000);
  assert.equal(result.builds[0].reference.dps.avg, 861.6174844955759);
  assert.equal(result.builds[1].requiresProvisionalEnchantOptIn, true);
  for (const build of result.builds) {
    assert.equal(build.proto.raidBuffs.trueshotAura, true);
    assert.equal(build.proto.raidBuffs.strengthOfEarthTotem, 2);
    assert.equal(build.proto.raidBuffs.graceOfAirTotem, 2);
    assert.equal(build.proto.partyBuffs.windfuryTotem, true);
    assert.equal(build.proto.player.buffs.blessingOfKings, true);
  }
});
test("wrong character factory, ruleset, level and hidden Tier 1 or item swaps are rejected", () => {
  for (const change of [
    (row) => (row.proto.player.class = 5),
    (row) => (row.proto.player.level = 59),
    (row) => (row.proto.player.spec.oneofKind = "tankWarrior"),
    (row) => (row.proto.player.foreverTier1Bonuses = true),
    (row) => (row.proto.player.enableItemSwap = true),
    (row) => (row.proto.settings.ruleset = 0),
    (row) => (row.proto.settings.fixedRngSeed = "0"),
    (row) => delete row.proto.player.consumes,
  ]) {
    const data = fixture();
    change(data.builds[0]);
    assert.throws(() => parseCombatNativePayload(data));
  }
});
test("incomplete gear and unsupported measurements fail before changing the character", () => {
  for (const change of [
    (row) => row.proto.player.equipment.items.pop(),
    (row) => (row.proto.player.equipment.items[0].id = -1),
    (row) => (row.proto.player.equipment.items[0].enchant = -1),
    (row) => (row.reference.iterations = 39999),
    (row) => (row.reference.dps.avg = 0),
    (row) => (row.reference.dps.stdev = -1),
    (row) => (row.reference.dps.avg = Number.NaN),
  ]) {
    const data = fixture();
    change(data.builds[0]);
    assert.throws(() => parseCombatNativePayload(data));
  }
});
test("duplicate builds, missing defaults and provisional defaults cannot become first visit", () => {
  const duplicate = fixture();
  duplicate.builds[1].id = duplicate.builds[0].id;
  assert.throws(() => parseCombatNativePayload(duplicate));
  for (const id of ["missing", "fury-procs"]) {
    const data = fixture();
    data.defaultBuildId = id;
    assert.throws(() => parseCombatNativePayload(data));
  }
});
test("parsed loadouts own their data and cannot mutate the source snapshot", () => {
  const data = fixture(),
    before = structuredClone(data),
    parsed = parseCombatNativePayload(data);
  assert.deepEqual(data, before);
  parsed.builds[0].proto.player.equipment.items[0].id = 1;
  parsed.builds[0].proto.settings.fixedRngSeed = "1";
  parsed.builds[0].warnings.push("Changed view");
  assert.deepEqual(data, before);
});

test("references ignore display and sampling changes but follow the ruleset and combat context", () => {
  const original = fixture().builds[0].proto,
    cosmetic = structuredClone(original);
  cosmetic.player.name = "My saved character";
  cosmetic.player.database = { items: [], enchants: [] };
  cosmetic.settings.iterations = 32;
  cosmetic.settings.fixedRngSeed = "1";
  assert.equal(combatBuildIdentity(original), combatBuildIdentity(cosmetic));
  for (const change of [
    (row) => (row.settings.ruleset = 0),
    (row) => (row.raidBuffs.trueshotAura = false),
    (row) => (row.player.consumes.flask = 0),
    (row) => (row.encounter.duration = 60),
    (row) => (row.player.equipment.items[0].id = 1),
  ]) {
    const changed = structuredClone(original);
    change(changed);
    assert.notEqual(combatBuildIdentity(original), combatBuildIdentity(changed));
  }
});
