import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealingRacialRules,
  renderShamanHealingRacialSources,
} from "./shaman-healing-racials.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/shaman-healing-racial-source.v1.json.gz", import.meta.url),
);
assert.equal(sha(bytes), "7c08f5d6aae62225d90808dfb53524f678bfc6d6ca42b49087ff0be0960a7ec0");
const evidence = JSON.parse(gunzipSync(bytes));
const implementation = readFileSync(
  new URL("./shaman-healing-racials.go", import.meta.url),
  "utf8",
);
const prefix = "sim/shaman/restoration/";

test("client effects retain separate damage/healing racials and owned spell durations", () => {
  const rules = extractShamanHealingRacialRules(evidence);
  assert.equal(rules.criticalHealingMultiplier, 1.02);
  assert.deepEqual(rules.ownedActions, [
    { race: 7, spellId: 20554, durationMs: 10000, cooldownMs: 180000 },
    { race: 5, spellId: 20572, durationMs: 15000, cooldownMs: 180000 },
  ]);
  assert.equal(rules.implicitActivation, false);
  assert.equal(rules.serverVerified, false);
  assert.equal(rules.publicationAllowed, false);
  assert.deepEqual(
    rules.playableRaces.map((row) => row.id),
    [1, 5, 6, 7, 10],
  );
  assert.deepEqual(
    rules.playableRaces.filter((row) => row.faction === 1).map((row) => row.name),
    ["Dwarf"],
  );
});

test("changed source, invented race eligibility and malformed effects reject", () => {
  for (const change of [
    (e) => {
      e.serverVerified = true;
    },
    (e) => {
      e.publicationAllowed = true;
    },
    (e) => {
      e.races[0].id = 3;
    },
    (e) => {
      e.playableRaceReference.races.Alliance.push("Human");
    },
    (e) => {
      e.tables.SpellEffect.find((row) => row.EffectAura === 50).EffectBasePointsF = 4;
    },
    (e) => {
      e.tables.SpellCooldowns[0].RecoveryTime = 120000;
    },
    (e) => {
      e.tables.SpellDuration[0].Duration = 15000;
    },
    (e) => {
      e.tables.SkillLineAbility.find((row) => row.Spell === 20554).RaceMasks = [2, 0];
    },
    (e) => {
      Object.values(e.sources)[0].source += "\n";
    },
  ]) {
    const altered = structuredClone(evidence);
    change(altered);
    assert.throws(() => extractShamanHealingRacialRules(altered));
  }
});

test("derivation preserves shared core and wraps every actual critical healing path once", () => {
  const before = structuredClone(evidence),
    sources = renderShamanHealingRacialSources(evidence, implementation);
  assert.deepEqual(evidence, before);
  for (const path of [
    "sim/core/racials.go",
    "sim/core/spell_outcome.go",
    "sim/core/proto/common.pb.go",
  ])
    assert.equal(sources[path], evidence.sources[path].source);
  for (const [name, count] of [
    ["kfc_baseline.go", 2],
    ["kfc_riptide.go", 2],
    ["kfc_cast_resource_sets.go", 1],
    ["kfc_utility_items.go", 2],
  ]) {
    assert.equal(
      (sources[prefix + name].match(/resto\.kfcShamanRacialHealingOutcome\(/g) ?? []).length,
      count,
    );
  }
  const run = sources[prefix + "kfc_workload_run.go"];
  assert.equal((run.match(/healer.ConfigureKFCShamanRacials/g) ?? []).length, 1);
  assert(run.includes("output.RacialUsesMean[index] /= countFloat"));
  assert(run.includes("racialUses := make([]int, len(output.RacialUsesMean))"));
  assert(run.includes("kfcShamanCopyRacialPolicy(*frame.Racials)"));
});

test("integration rejects missing or duplicated anchors rather than dropping a controller path", () => {
  const changed = structuredClone(evidence),
    row = changed.sources[prefix + "kfc_riptide.go"];
  row.source = row.source.replace(
    "target, amount, multiplier, outcome)",
    "target, amount, multiplier, (outcome))",
  );
  row.byteSha256 = sha(row.source);
  assert.throws(() => renderShamanHealingRacialSources(changed, implementation), /anchor changed/);
});
