import assert from "node:assert/strict";
import { eligiblePrebis, legalPrebisGear } from "./prebis-pool.mjs";

function assertContext(context) {
  assert.equal(context.playerClass, 1, "This equipment adapter is Druid-only");
  assert.equal(context.requireCraftAudit, true);
  assert([1, 2].includes(context.faction));
  assert.equal(context.factionName, context.faction === 1 ? "Alliance" : "Horde");
  assert.equal(context.originalItems.length, 17);
  assert(context.currentIds instanceof Set);
  assert.equal(context.professions.length, 2);
  assert.equal(new Set(context.professions).size, 2);
}

function allowedHand(item, slot) {
  if (slot === 14) {
    if ([6, 8].includes(item.weaponType)) return item.handType === 4;
    if (item.weaponType === 4) return [1, 2, 4].includes(item.handType);
    return [2, 3].includes(item.weaponType) && [1, 2].includes(item.handType);
  }
  return slot === 15 && item.weaponType === 5 && item.handType === 3;
}

/** Retain the common acquisition restrictions without a DPS rotation's weapon-style lock.
 * @param {object} item @param {object} source @param {object} context @param {number} slot
 * @returns {boolean}
 */
export function eligibleDruidHealingItem(item, source, context, slot) {
  assertContext(context);
  assert(Number.isInteger(slot) && slot >= 0 && slot < 17);
  if (!item || !source || !Number.isSafeInteger(source.requiredLevel) || source.requiredLevel < 0)
    return false;
  if (item.type === 13 && !allowedHand(item, slot)) return false;
  // Only the reference style changes. Ownership, race, faction and profession inputs stay intact.
  const originalItems = context.originalItems.slice();
  originalItems[slot] = item;
  return eligiblePrebis(item, source, { ...context, originalItems }, slot);
}

/** Validate the entire loadout, including paired hands and shared ownership restrictions.
 * @param {object} gear @param {Map<number, object>} items
 * @param {Map<number, object>} sources @param {object} context @returns {boolean}
 */
export function legalDruidHealingGear(gear, items, sources, context) {
  assertContext(context);
  if (!Array.isArray(gear.items) || gear.items.length !== 17) return false;
  for (const [slot, spec] of gear.items.entries()) {
    if (!spec || !Number.isSafeInteger(spec.id ?? 0) || (spec.id ?? 0) < 0) return false;
    if (!spec.id) {
      if (slot !== 15 || spec.enchant) return false;
      continue;
    }
    if (!eligibleDruidHealingItem(items.get(spec.id), sources.get(spec.id), context, slot))
      return false;
  }
  const mainHand = items.get(gear.items[14].id);
  if (!mainHand || (mainHand.handType === 4 && gear.items[15].id)) return false;
  return legalPrebisGear(gear, items, sources, {
    ...context,
    originalItems: gear.items.map((spec) => items.get(spec.id)),
  });
}

/** Enumerate every acquisition-eligible item in each slot without stat/quality pruning.
 * @param {Map<number, object>} items @param {Map<number, object>} sources
 * @param {object} context @returns {object}
 */
export function collectDruidHealingEquipment(items, sources, context) {
  assertContext(context);
  assert(items instanceof Map && sources instanceof Map);
  const slots = Array.from({ length: 17 }, (_, slot) =>
    [...items.values()]
      .filter((item) => eligibleDruidHealingItem(item, sources.get(item.id), context, slot))
      .map((item) => item.id)
      .sort((a, b) => a - b),
  );
  return {
    schema: "kfc-druid-healing-equipment-pool.v1",
    slots,
    totalDistinctCandidates: new Set(slots.flat()).size,
    statPruning: false,
    qualityPruning: false,
    weaponStyleLocked: false,
    wholeLoadoutValidationRequired: true,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Generate hand candidates lazily; complete gear must still pass legalDruidHealingGear.
 * @param {object} pool @param {Map<number, object>} items
 * @returns {Generator<{mainHand: number, offHand: number}>}
 */
export function* druidHealingHandCandidates(pool, items) {
  assert.equal(pool.schema, "kfc-druid-healing-equipment-pool.v1");
  assert.equal(pool.slots.length, 17);
  for (const mainHand of pool.slots[14]) {
    const item = items.get(mainHand);
    assert(item && allowedHand(item, 14));
    yield { mainHand, offHand: 0 };
    if (item.handType === 4) continue;
    for (const offHand of pool.slots[15]) {
      const held = items.get(offHand);
      assert(held && allowedHand(held, 15));
      yield { mainHand, offHand };
    }
  }
}
