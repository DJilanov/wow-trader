import assert from "node:assert/strict";
import { prebisEnchantFits, prebisEnchantPolicy } from "./prebis-enchants.mjs";
import { enchantKey } from "./inspection-data.mjs";

/** Keep every model-compatible pre-raid enchant for each actual Shaman slot/item pair.
 * @param {{items:object[],slots:number[][],enchants:Record<string,object>}} input @returns {object}
 */
export function collectShamanHealingEnchants(input) {
  assert(Array.isArray(input.slots) && input.slots.length === 17);
  const items = new Map(input.items.map((row) => [row.id, row]));
  assert.equal(items.size, input.items.length);
  const policy = prebisEnchantPolicy({
    enchantPolicy: {
      schema: "kfc-enchant-model-policy.v1",
      provisionalEffectIds: [36, 803, 1898, 1900],
    },
  });
  const rows = Object.entries(input.enchants).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, row] of rows) {
    assert.equal(key, enchantKey(row));
    assert(Array.isArray(row.stats) && [0, 44].includes(row.stats.length));
    assert(row.stats.every(Number.isFinite));
    if (row.status === "provisional") assert(row.stats.every((value) => value === 0));
    assert.equal(
      row.requiredProfession,
      0,
      "Profession-bound enchants need a profile-aware successor",
    );
    assert.equal(row.requiredSkill, 0, "Skill-bound enchants need a profile-aware successor");
  }
  const all = new Set(),
    itemSlots = [];
  for (const [slot, ids] of input.slots.entries()) {
    assert.equal(new Set(ids).size, ids.length);
    for (const itemId of ids) {
      const item = items.get(itemId);
      assert(item, "Unknown Shaman enchant item " + itemId);
      const allowed = rows.filter(([, row]) => prebisEnchantFits(row, item, 7, slot, policy));
      for (const [key] of allowed) all.add(key);
      itemSlots.push({
        slot,
        itemId,
        enchantKeys: allowed.map(([key]) => key),
        noEnchantAllowed: true,
      });
    }
  }
  return {
    schema: "kfc-shaman-healing-enchant-domain.v1",
    policy,
    itemSlots,
    enchants: rows
      .filter(([key]) => all.has(key))
      .map(([key, row]) => ({ key, ...structuredClone(row) })),
    sourceRows: rows.length,
    distinctChoices: all.size,
    statPruning: false,
    qualityPruning: false,
    provisionalEffectsRetainStatus: true,
    physicalProcReferencesRequireNoOffensiveActions: true,
    currentClassRuntimeAdmission: false,
    wholeLoadoutValidationRequired: true,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

const consumeAxes = Object.freeze({
  flask: Object.freeze([0, 1, 2, 3, 4]),
  food: Object.freeze([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]),
  mainHandImbue: Object.freeze([0, 16, 20]),
  defaultPotion: Object.freeze([0, 5]),
  defaultConjured: Object.freeze([0, 2]),
  manaRegenElixir: Object.freeze([0, 2]),
});

/** Preserve the existing healer nonraid consume axes; no timing or performance claim.
 * @returns {Generator<Readonly<Record<string,number>>>}
 */
export function* shamanHealingConsumeCandidates() {
  for (const flask of consumeAxes.flask)
    for (const food of consumeAxes.food)
      for (const mainHandImbue of consumeAxes.mainHandImbue)
        for (const defaultPotion of consumeAxes.defaultPotion)
          for (const defaultConjured of consumeAxes.defaultConjured)
            for (const manaRegenElixir of consumeAxes.manaRegenElixir)
              yield Object.freeze({
                flask,
                food,
                mainHandImbue,
                defaultPotion,
                defaultConjured,
                manaRegenElixir,
              });
}

/** Reject raid food/oils and invented consumable enum values at the candidate boundary.
 * @param {unknown} value @returns {void}
 */
export function assertShamanHealingConsumeCandidate(value) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), Object.keys(consumeAxes).sort());
  for (const [field, allowed] of Object.entries(consumeAxes))
    assert(allowed.includes(value[field]), "Unreviewed Shaman consume " + field);
}
