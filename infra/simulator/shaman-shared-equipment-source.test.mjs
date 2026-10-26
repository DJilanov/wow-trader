import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

const bytes = readFileSync(
  new URL("fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "bbdfa1fa0b846f0b46ffe418a1ca1cdbe99194ad9b7767a3bddf7685f9ac82bf",
);
const evidence = JSON.parse(gunzipSync(bytes));

test("all 2017 candidates retain current and historical item links and 33 exact sets", () => {
  const review = reviewShamanSharedEquipmentSource(evidence);
  assert.equal(review.items.length, 2017);
  assert.equal(review.setsInventory.length, 33);
  assert.equal(review.linkedItems, 251);
  assert.equal(review.currentBaseLinkedItems, 149);
  assert.equal(review.historicalBaseLinkedItems, 102);
  assert.equal(review.itemEffectLinks, 268);
  assert.equal(review.setThresholds, 104);
  assert.equal(review.triggerClosureSpells, 341);
  assert.equal(review.unsupportedModifiers.length, 20);
  assert.equal(review.currentMissingItems, 557);
  assert(review.items.every((row) => row.runtimeAdmission === false));
  assert(review.setsInventory.every((row) => row.runtimeAdmission === false));
  for (const key of [
    "fullItemEffectAdmission",
    "fullClassAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(review[key], false);
  const riptide = review.items.find((row) => row.itemId === 22345);
  assert.equal(riptide.currentBaseRecordPresent, false);
  assert.equal(riptide.effects[0].effect.SpellID, 27797);
  assert.deepEqual(
    review.spellGraph.find((row) => row.id === 27797).directOwnedFamilyMaskMatches,
    [408521, 1239242, 1239243],
  );
  assert(review.setsInventory.some((row) => row.id === 2111));
});

test("item, set, lookup and transitive spell omissions require a new review", () => {
  for (const mutate of [
    (data) => data.tables.ItemXItemEffect.pop(),
    (data) => data.tables.ItemEffect.pop(),
    (data) => data.tables.ItemSetSpell.pop(),
    (data) => data.tables.SpellEffect.pop(),
    (data) => data.tables.Spell.pop(),
    (data) => data.lookups.SpellDuration.pop(),
    (data) => data.additionalLinkedIds.pop(),
    (data) => {
      data.candidateIds[0] = data.candidateIds[1];
    },
    (data) => {
      data.tables.SpellAuraOptions[0].SpellProcsPerMinuteID = 100;
    },
    (data) => {
      data.ownedClassOptions[0].SpellClassMask = [0, 0, 0, 0];
    },
    (data) => {
      data.fullItemEffectAdmission = true;
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewShamanSharedEquipmentSource(changed));
  }
});

test("every captured trigger joins the full graph without interpreting spell text as a proc", () => {
  const review = reviewShamanSharedEquipmentSource(evidence),
    ids = new Set(review.spellGraph.map((row) => row.id));
  for (const row of review.spellGraph) for (const id of row.triggerSpellIds) assert(ids.has(id));
  assert.equal(review.missingCapturedGraphReferences, 0);
  assert.equal(review.directFamilyMaskMatchesAreRuntimeAdmission, false);
  const blueDragon = review.items.find((row) => row.itemId === 19288);
  const root = review.spellGraph.find((row) => row.id === blueDragon.effects[0].effect.SpellID);
  assert(root.description.includes("increase your Spirit"));
  assert(root.triggerSpellIds.length > 0);
  assert.equal(blueDragon.runtimeAdmission, false);
});

test("review leaves source untouched and returns independently owned effect payloads", () => {
  const before = structuredClone(evidence),
    review = reviewShamanSharedEquipmentSource(evidence);
  assert.deepEqual(evidence, before);
  review.items.find((row) => row.effects.length).effects[0].effect.SpellID = 0;
  review.spellGraph.find((row) => row.effects.length).effects[0].EffectSpellClassMask[0] = 123;
  review.setsInventory[0].thresholds[0].Threshold = 999;
  review.unsupportedModifiers[0].value = 999;
  assert.deepEqual(evidence, before);
  assert.equal(reviewShamanSharedEquipmentSource(evidence).itemEffectLinks, 268);
});
