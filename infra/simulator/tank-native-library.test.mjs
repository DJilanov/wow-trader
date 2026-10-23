import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  await readFile(new globalThis.URL("./tank-native-library.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  },
);
assert.deepEqual(compiled.diagnostics, []);
const { parseTankNativePayload, tankCombatIdentity } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);
function fixture() {
  const builds = ["raid", "solo"].flatMap((scenario) =>
    ["threat", "mitigation"].map((objective) => ({
      id: `${scenario}-${objective}`,
      label: `${scenario} ${objective}`,
      scenario,
      objective,
      requiresProvisionalEnchantOptIn: false,
      warnings: ["Synthetic unit fixture, not a real tank recommendation."],
      proto: {
        player: {
          class: 9,
          level: 60,
          foreverTier1Bonuses: false,
          equipment: { items: Array.from({ length: 17 }, (_, id) => ({ id })) },
          profession1: 2,
          profession2: 3,
        },
        settings: { ruleset: 1, iterations: 5000, fixedRngSeed: "81491001" },
        encounter: { duration: scenario === "raid" ? 300 : 60, targets: [{ level: 63 }] },
        partyBuffs: { windfuryTotem: scenario === "raid" },
      },
      reference: {
        iterations: 40000,
        health: 6000,
        armor: 7000,
        metrics: { threat: { avg: 1000 }, dtps: { avg: 300 } },
      },
    })),
  );
  return {
    schema: "kfc-tank-native-library.v1",
    profile: "tank_warrior",
    defaultBuildId: "raid-mitigation",
    builds,
  };
}
test("native library requires all four conservative setups and a qualified default", () => {
  const parsed = parseTankNativePayload(fixture());
  assert.equal(parsed.builds.length, 4);
  assert.equal(parsed.defaultBuildId, "raid-mitigation");
  assert.equal(parsed.builds[0].reference.iterations, 40000);
  for (const change of [
    (value) => {
      value.defaultBuildId = "raid-threat";
    },
    (value) => {
      value.profile = "protection_paladin";
    },
    (value) => {
      value.builds = value.builds.slice(1);
    },
    (value) => {
      value.builds = [...value.builds, value.builds[0]];
    },
  ]) {
    const invalid = fixture();
    change(invalid);
    assert.throws(() => parseTankNativePayload(invalid));
  }
});
test("native payload rejects wrong rulesets, levels, metrics and malformed equipment", () => {
  for (const field of ["class", "level", "foreverTier1Bonuses"]) {
    const data = fixture();
    data.builds[0].proto.player[field] = field === "foreverTier1Bonuses" ? true : 59;
    assert.throws(() => parseTankNativePayload(data));
  }
  const data = fixture();
  data.builds[0].proto.settings.ruleset = 2;
  assert.throws(() => parseTankNativePayload(data));
  const wrong = fixture();
  wrong.builds[0].reference.health = 0;
  assert.throws(() => parseTankNativePayload(wrong));
  const missing = fixture();
  missing.builds[0].proto.player.equipment.items.pop();
  assert.throws(() => parseTankNativePayload(missing));
});
test("custom character matching ignores UI preferences and protobuf defaults but tracks combat changes", () => {
  const original = parseTankNativePayload(fixture()).builds[0].proto,
    edited = globalThis.structuredClone(original);
  edited.player.level = 0;
  edited.player.name = "A saved character label";
  edited.player.database = { items: [{ id: 123 }] };
  edited.player.knownSpells = [];
  edited.player.equipment.items[0] = {};
  edited.settings.iterations = 100;
  edited.settings.fixedRngSeed = 83300001n;
  assert.equal(tankCombatIdentity(original), tankCombatIdentity(edited));
  for (const [key, value] of [
    ["profession2", 4],
    ["talentsString", "5-0-5"],
    ["buffs", { blessingOfSalvation: true }],
  ]) {
    const changed = globalThis.structuredClone(edited);
    changed.player[key] = value;
    assert.notEqual(tankCombatIdentity(original), tankCombatIdentity(changed));
  }
  const changed = globalThis.structuredClone(edited);
  changed.partyBuffs = { windfuryTotem: false };
  assert.notEqual(tankCombatIdentity(original), tankCombatIdentity(changed));
});
