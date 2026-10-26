import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanHealingRelicSource } from "./shaman-healing-relic-source.mjs";

const bytes = readFileSync(
  new URL("fixtures/shaman-relic-families-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "d86797de334036031f250485584f3fc6500cb94d23c1f23c2925e0662896d4d6",
);
const evidence = JSON.parse(gunzipSync(bytes));

test("all ten relics are retained with five healing/resource effects and five scoped inactive effects", () => {
  const review = extractShamanHealingRelicSource(evidence);
  assert.equal(review.items.length, 10);
  assert.equal(review.ownedActions.length, 32);
  assert.deepEqual(review.healingRelevantItemIds, [22345, 23200, 249398, 272431, 279249]);
  assert.equal(review.inactiveItemIds.length, 5);
  assert.deepEqual(review.provisionalBaseItemIds, [22345, 22395, 23200]);
  assert.equal(review.items.filter((row) => row.currentBaseItemRecordPresent).length, 7);
  assert.equal(review.unclassifiedItems, 0);
  assert.equal(review.runtimeAdmission, false);
  assert.equal(review.numericalQualification, false);
});

test("current families distinguish Riptide cost Water Shield charges and both Wave families", () => {
  const review = extractShamanHealingRelicSource(evidence),
    byId = new Map(review.items.map((row) => [row.itemId, row]));
  assert.deepEqual(byId.get(22345).affectedActions, [408521, 1239242, 1239243]);
  assert.deepEqual(byId.get(23200).affectedActions, [408510]);
  assert.equal(byId.get(272431).affectedActions.length, 9);
  assert.equal(byId.get(279249).affectedActions.length, 6);
  assert.equal(byId.get(249398).effects[0].amount, 8);
  assert.equal(byId.get(272432).kind, "offensive-lightning-bolt-maelstrom");
  assert.equal(byId.get(249443).kind, "grounding-totem-cooldown");
});

test("new conditions family changes payload drift and misleading dummy descriptions require review", () => {
  for (const change of [
    (source) => (source.tables.ItemEffect[0].PlayerConditionID = 1),
    (source) =>
      (source.tables.ItemSparse = source.tables.ItemSparse.filter((row) => row.id !== 249398)),
    (source) =>
      (source.tables.SpellEffect.find((row) => row.SpellID === 28856).EffectSpellClassMask = [
        64, 0, 0, 0,
      ]),
    (source) =>
      (source.tables.SpellEffect.find((row) => row.SpellID === 1306448).EffectBasePointsF = 5),
    (source) =>
      (source.tables.SpellEffect.find((row) => row.SpellID === 1291076).EffectBonusCoefficient = 0),
    (source) =>
      (source.tables.SpellEffect.find((row) => row.SpellID === 1248756).EffectTriggerSpell = 123),
    (source) =>
      (source.tables.SpellClassOptions = source.tables.SpellClassOptions.filter(
        (row) => row.SpellID !== 408510,
      )),
    (source) =>
      (source.tables.Spell.find((row) => row.id === 1291078).Description_lang =
        "Resurrection speed"),
    (source) => source.ownedActions.push({ id: 25357, family: "healing-wave" }),
  ]) {
    const altered = structuredClone(evidence);
    change(altered);
    assert.throws(() => extractShamanHealingRelicSource(altered));
  }
});

test("review does not mutate source or leak mutable masks to later callers", () => {
  const before = structuredClone(evidence),
    review = extractShamanHealingRelicSource(evidence);
  review.items[0].effects[0].mask[0] = 123;
  review.ownedActions[0].mask[0] = 999;
  assert.deepEqual(evidence, before);
  assert.notEqual(extractShamanHealingRelicSource(evidence).items[0].effects[0].mask[0], 123);
});
