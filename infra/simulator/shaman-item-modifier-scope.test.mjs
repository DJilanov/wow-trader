import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewShamanItemModifierScope, renderShamanFlatItemRegeneration } from "./shaman-item-modifier-scope.mjs";

const evidence = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/shaman-item-modifier-scope-source.v1.json.gz", import.meta.url))));
const shared = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url))));

test("classifies all twenty actual unresolved modifiers without dropping an eligible item", () => {
  const result = reviewShamanItemModifierScope(evidence);
  assert.deepEqual(evidence.modifiers, shared.unsupportedModifiers);
  assert.equal(result.rows.length, 20);
  assert.equal(result.healthRegeneration.length, 8);
  assert.equal(result.rows.filter((row) => !row.affectsDeclaredHealingAssignment).length, 12);
  assert(result.rows.every((row) => row.retainedAsCandidate));
  assert.equal(result.currentCatalogFullyVerified, false);
  assert.equal(result.startsNewClassClock, false);
  assert.equal(result.publicationAllowed, false);
});

test("derives health-per-five units from the captured current client strings", () => {
  const result = reviewShamanItemModifierScope(evidence);
  assert.equal(result.healthRegenerationUnitsVerified, true);
  assert.equal(result.serverTickTimingVerified, false);
  assert.deepEqual(result.healthRegeneration.map((row) => [row.itemId, row.healthPerFive]),
    [[2816, 12], [6320, 4], [6459, 6], [6461, 10], [6910, 5], [7684, 9], [14149, 5], [17743, 11]]);
  for (const item of evidence.items) assert.deepEqual(item, shared.items.find((row) => row.id === item.id));
});

test("retains offensive discrepancies instead of declaring the full catalog verified", () => {
  const result = reviewShamanItemModifierScope(evidence);
  assert.deepEqual(result.physicalDifferences, [{ id: 227809, name: "Studded Timbermaw Brawlers",
    statType: 83, current: 3, catalog: 0, affectsDeclaredHealingAssignment: false, requiresOffensiveCatalogReview: true }]);
  assert.equal(result.rows.find((row) => row.id === 12775).kind, "ignored-item-weapon-skill");
  assert.equal(result.rows.find((row) => row.id === 272437).kind, "expertise");
});

test("rejects changed amounts, missing records, changed meanings and missing unit evidence", () => {
  const edits = [
    (value) => { value.modifiers[1].value++; },
    (value) => { value.modifiers.pop(); },
    (value) => { value.statNames[0].name = "MANA_REGENERATION"; },
    (value) => { value.globals[0].TagText_lang = "per second"; },
    (value) => { value.rawItems[0].StatModifier_bonusStat = []; },
    (value) => { value.serverTickTimingVerified = true; },
  ];
  for (const edit of edits) { const changed = structuredClone(evidence); edit(changed); assert.throws(() => reviewShamanItemModifierScope(changed)); }
});

test("renders only explicit owned item regeneration and two actor hooks", () => {
  const implementation = readFileSync(new URL("./shaman-flat-item-regeneration.go", import.meta.url), "utf8");
  const actor = "package restoration\ntype RestorationShaman struct {\n}\nfunc initialize() {\n\tresto.registerKFCShamanCastResourceSets()\n}\n";
  const result = renderShamanFlatItemRegeneration({ evidence, implementation, actor });
  assert(result.actor.includes("kfcFlatItemRegeneration *kfcShamanFlatItemRegeneration"));
  assert(result.actor.includes("resto.registerKFCShamanFlatItemRegeneration()"));
  assert(result.implementation.includes("2816:12"));
  assert(!result.implementation.includes("// KFC_SHAMAN_FLAT_ITEM_REGENERATION_VALUES"));
  assert.throws(() => renderShamanFlatItemRegeneration({ evidence, implementation, actor: actor + actor }));
  assert.throws(() => renderShamanFlatItemRegeneration({ evidence, implementation: "", actor }));
});
