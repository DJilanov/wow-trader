import assert from "node:assert/strict";
import { simulationHash } from "./simulation-cache.mjs";
import { legalDruidHealingGear, druidHealingHandCandidates } from "./druid-healing-equipment.mjs";
import { prebisEnchantFits } from "./prebis-enchants.mjs";

/** Every legal individual item, ordered jewelry pair and complete hand pair is retained.
 * Set subsets are enumerated separately because crossing a threshold can change the result.
 * @param {{gear:object,pool:object,items:Map<number,object>,sources:Map<number,object>,context:object,inspection:object,enchantPolicy:object,group?:string}} input
 * @returns {Generator<{group:string,id:string,gear:object}>}
 */
export function* druidHealingGearCandidates({
  gear,
  pool,
  items,
  sources,
  context,
  inspection,
  enchantPolicy,
  group,
}) {
  assert.equal(pool.schema, "kfc-druid-healing-equipment-pool.v1");
  assert.equal(pool.slots.length, 17);
  const enchantChoices = Object.values(inspection.enchants);
  assert(legalDruidHealingGear(gear, items, sources, context));
  assert(
    gear.items.every(
      (spec, slot) =>
        !spec.enchant ||
        enchantChoices.some(
          (e) =>
            e.effectId === spec.enchant &&
            prebisEnchantFits(e, items.get(spec.id), 1, slot, enchantPolicy),
        ),
    ),
    "Unreviewed seed enchant",
  );
  const include = (name) => group === undefined || group === name;
  const seen = new Set();
  function candidate(group, changes) {
    const proposal = globalThis.structuredClone(gear);
    for (const [slot, id] of changes) {
      proposal.items[slot] = { id };
      const enchant = gear.items[slot].enchant;
      if (
        id &&
        enchant &&
        enchantChoices.some(
          (e) =>
            e.effectId === enchant && prebisEnchantFits(e, items.get(id), 1, slot, enchantPolicy),
        )
      )
        proposal.items[slot].enchant = enchant;
    }
    if (!legalDruidHealingGear(proposal, items, sources, context)) return;
    const id = simulationHash(proposal);
    if (seen.has(id)) return;
    seen.add(id);
    return { group, id, gear: proposal };
  }
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16].filter((slot) => include("slot-" + slot)))
    for (const id of pool.slots[slot]) {
      const row = candidate("slot-" + slot, [[slot, id]]);
      if (row) yield row;
    }
  for (const [left, right, name] of [
    [10, 11, "rings"],
    [12, 13, "trinkets"],
  ]) {
    if (!include(name)) continue;
    for (const first of pool.slots[left])
      for (const second of pool.slots[right]) {
        const row = candidate(name, [
          [left, first],
          [right, second],
        ]);
        if (row) yield row;
      }
  }
  if (include("hands"))
    for (const pair of druidHealingHandCandidates(pool, items)) {
      const row = candidate("hands", [
        [14, pair.mainHand],
        [15, pair.offHand],
      ]);
      if (row) yield row;
    }
  const sets = new Map();
  for (const [slot, ids] of pool.slots.entries())
    for (const id of ids) {
      const setId = items.get(id).setId;
      if (!setId) continue;
      if (!sets.has(setId)) sets.set(setId, new Map());
      const entries = sets.get(setId);
      if (!entries.has(slot)) entries.set(slot, []);
      entries.get(slot).push(id);
    }
  for (const [setId, entries] of sets) {
    if (!include("set-" + setId)) continue;
    const slots = [...entries],
      count = slots.reduce((value, [, ids]) => value * BigInt(ids.length + 1), 1n);
    assert(count <= 1000000n, "Set bank limit exceeded; no partial set coverage is accepted");
    function* assignments(index, selected) {
      if (index === slots.length) {
        if (selected.length >= 2) yield selected;
        return;
      }
      yield* assignments(index + 1, selected);
      const [slot, ids] = slots[index];
      for (const id of ids) yield* assignments(index + 1, [...selected, [slot, id]]);
    }
    for (const assignment of assignments(0, [])) {
      const row = candidate("set-" + setId, assignment);
      if (row) yield row;
    }
  }
  for (const [slot, spec] of gear.items.entries()) {
    if (!include("enchant-" + slot)) continue;
    if (!spec.id) continue;
    const item = items.get(spec.id),
      effects = new Set([0]);
    for (const enchant of enchantChoices)
      if (prebisEnchantFits(enchant, item, 1, slot, enchantPolicy)) effects.add(enchant.effectId);
    for (const effect of effects) {
      const proposal = globalThis.structuredClone(gear);
      delete proposal.items[slot].enchant;
      if (effect) proposal.items[slot].enchant = effect;
      const id = simulationHash(proposal);
      if (seen.has(id)) continue;
      seen.add(id);
      yield { group: "enchant-" + slot, id, gear: proposal };
    }
  }
}
