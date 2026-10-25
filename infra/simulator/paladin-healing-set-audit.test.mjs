import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { auditPaladinHealingSets } from "./paladin-healing-set-audit.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-sets-source.v1.json.gz", import.meta.url)),
  ),
);
const generated = gunzipSync(
  readFileSync(
    new URL("./fixtures/paladin-healing-sets-generated-parent.v1.txt.gz", import.meta.url),
  ),
).toString();
const audit = auditPaladinHealingSets(source, generated);
const threshold = (id, pieces) =>
  audit.thresholds.find((row) => row.setId === id && row.pieces === pieces);
const spell = (id) => audit.bonuses.find((row) => row.spellId === id);

test("Paladin set audit accounts for every current set, bonus and context without mutating inputs", () => {
  const original = structuredClone(source);
  assert.equal(audit.summary.setIds, 43);
  assert.equal(audit.summary.bonusSpells, 136);
  assert.equal(audit.summary.thresholds, 134);
  assert.equal(audit.summary.contexts, 30);
  assert.equal(audit.numericalAdmission, false);
  assert.equal(audit.publicationAllowed, false);
  assert.equal(audit.omittedEffectsAssumedZero, false);
  assert.deepEqual(auditPaladinHealingSets(source, generated), audit);
  assert.deepEqual(source, original);
});

test("Paladin set audit proves only two unreachable thresholds and preserves their items", () => {
  assert.equal(audit.summary.unreachableThresholds, 2);
  for (const id of [41, 65]) {
    assert.equal(threshold(id, 2).maximumActivePieces, 1);
    assert.deepEqual(threshold(id, 2).reachableContexts, []);
  }
  assert(spell(14056).retainedInEquipmentDomain);
  assert(spell(17332).retainedInEquipmentDomain);
  assert.equal(audit.slotMatchingCertifiesAcquisition, false);
});

test("Paladin set audit cannot double count one item appearing in multiple slots", () => {
  const changed = structuredClone(source);
  const member = changed.items.find((row) => row.setId === 41).id;
  changed.profiles[0].slots[0].push(member);
  const result = auditPaladinHealingSets(changed, generated);
  assert.equal(result.contexts[0].sets.find((row) => row.setId === 41).maximumActivePieces, 1);
});

test("Paladin set audit respects a set's profession requirement without pruning gear", () => {
  for (const context of audit.contexts) {
    const set = context.sets.find((row) => row.setId === 444);
    assert.equal(set.professionQualified, context.professions.includes(2));
    assert.equal(set.maximumActivePieces, context.professions.includes(2) ? set.maximumPieces : 0);
    assert.equal(set.completeLoadoutCertified, false);
  }
});

test("Paladin set audit distinguishes Beaststalker attacks from healing-cast mana procs", () => {
  assert.equal(spell(450577).proc.mask[0], 68);
  assert.equal(spell(450577).classifications[0].status, "inactive-in-declared-assignment");
  for (const id of [450527, 450576, 450608])
    assert.equal(spell(id).classifications[0].status, "runtime-review-required");
  assert.equal(audit.beaststalkerHealingCastEligible, false);
  assert.equal(spell(27498).proc.mask[0], 4);
  assert.equal(spell(450625).proc.mask[0], 81924);
  assert.equal(audit.soulforgeAndLightforgeProcMasksInterchangeable, false);
});

test("Paladin set audit recovers missing dungeon flats and current rating conversions", () => {
  assert.deepEqual(audit.summary.missingGeneratedDefinitions, [41, 65, 81, 121, 122, 123, 516]);
  assert.equal(threshold(81, 3).stats.HealingPower, 23);
  assert.equal(threshold(122, 5).stats.HealingPower, 23);
  assert.equal(threshold(122, 2).stats.SpellHit, 0.5);
  assert.equal(threshold(123, 5).stats.SpellCrit, 1.5);
  assert.equal(threshold(516, 8).stats.BonusArmor, 200);
  assert.equal(threshold(490, 3).spiritRegen, 0.15);
  assert.deepEqual(audit.summary.explicitGeneratedDifferences, []);
});

test("Paladin set audit keeps self-damage-sensitive bonuses pending runtime review", () => {
  for (const [id, pieces] of [
    [162, 4],
    [163, 6],
    [182, 4],
    [185, 4],
    [184, 6],
    [1968, 4],
  ])
    assert.equal(threshold(id, pieces).status, "runtime-review-required");
  assert.equal(spell(1291796).proc.cooldownMs, 300000);
  assert.equal(spell(1293670).proc.cooldownMs, 240000);
});

test("Paladin set audit fails closed for missing, duplicate or unclassified current data", () => {
  for (const change of [
    (copy) => copy.tables.ItemSet.pop(),
    (copy) => copy.tables.ItemSetSpell.push(copy.tables.ItemSetSpell[0]),
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 14047).EffectAura = 99999;
    },
    (copy) => {
      copy.tables.SpellAuraOptions.find((row) => row.SpellID === 450625).ProcTypeMask[0] = 4;
    },
    (copy) => {
      copy.items[0].setId = 41;
    },
  ]) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => auditPaladinHealingSets(copy, generated));
  }
});

test("Paladin set audit reports generated-stat drift instead of certifying it", () => {
  const changed = generated.replace(
    "stats.HealingPower: 18, stats.SpellDamage: 18",
    "stats.HealingPower: 19, stats.SpellDamage: 18",
  );
  assert.notEqual(changed, generated);
  const result = auditPaladinHealingSets(source, changed);
  assert.equal(result.summary.explicitGeneratedDifferences.length, 1);
  assert.equal(result.summary.explicitGeneratedDifferences[0].generatedFlatMatches, false);
  assert.deepEqual(result.summary.explicitGeneratedDifferences[0].generatedDifferences, [
    { name: "HealingPower", current: 18, generated: 19 },
  ]);
  assert.throws(() =>
    auditPaladinHealingSets(source, changed.replace("Supported: false", "Supported: maybe")),
  );
});
