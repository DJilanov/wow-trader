import assert from "node:assert/strict";
import { simulationHash } from "./simulation-fingerprint.mjs";
import { paladinHealingGearCandidates } from "./paladin-healing-gear-bank.mjs";
import { legalPaladinHealingGear } from "./paladin-healing-equipment.mjs";
import { prebisEnchantFits } from "./prebis-enchants.mjs";

/** Enumerate only acquisition changes; preserve every new item, pair and set threshold.
 * @param {object} referencePool @param {object} pool @param {Map<number,object>} items
 * @returns {{newIdsBySlot:number[][],groups:string[]}}
 */
export function paladinHealingDomainGroups(referencePool, pool, items) {
  for (const value of [referencePool, pool]) {
    assert.equal(value.schema, "kfc-paladin-healing-equipment-pool.v1");
    assert.equal(value.slots.length, 17);
  }
  const newIdsBySlot = pool.slots.map((ids, slot) =>
      ids.filter((id) => !referencePool.slots[slot].includes(id)),
    ),
    groups = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16]
      .filter((slot) => newIdsBySlot[slot].length)
      .map((slot) => "slot-" + slot);
  for (const [left, right, name] of [
    [10, 11, "rings"],
    [12, 13, "trinkets"],
    [14, 15, "hands"],
  ])
    if (newIdsBySlot[left].length || newIdsBySlot[right].length) groups.push(name);
  const sets = new Set(
    newIdsBySlot
      .flat()
      .map((id) => items.get(id)?.setId)
      .filter(Boolean),
  );
  groups.push(...[...sets].sort((a, b) => a - b).map((id) => "set-" + id));
  groups.push(...Array.from({ length: 17 }, (_, slot) => "enchant-" + slot));
  return { newIdsBySlot, groups };
}

/** Include both jewelry orders, complete weapon pairs and relevant multi-piece assignments.
 * @param {object} input @returns {Generator<{group:string,id:string,gear:object}>}
 */
export function* paladinHealingDomainCandidates(input) {
  const { referencePool, group, pool, items } = input,
    { newIdsBySlot } = paladinHealingDomainGroups(referencePool, pool, items),
    delta = newIdsBySlot.map((ids) => new Set(ids));
  assert(typeof group === "string");
  for (const candidate of paladinHealingGearCandidates(input)) {
    const slots = group.startsWith("slot-")
      ? [Number(group.slice(5))]
      : group === "rings"
        ? [10, 11]
        : group === "trinkets"
          ? [12, 13]
          : group === "hands"
            ? [14, 15]
            : group.startsWith("set-")
              ? candidate.gear.items
                  .map((row, slot) =>
                    items.get(row.id)?.setId === Number(group.slice(4)) ? slot : -1,
                  )
                  .filter((slot) => slot >= 0)
              : [];
    if (
      group.startsWith("enchant-") ||
      slots.some((slot) => delta[slot].has(candidate.gear.items[slot].id))
    )
      yield candidate;
  }
}

/** Repair every unavailable slot before benchmarking another acquisition context.
 * @param {object} input @returns {Generator<{id:string,gear:object,changedSlots:number[]}>}
 */
export function* paladinHealingDomainRepairs({
  gear,
  pool,
  items,
  sources,
  context,
  inspection,
  enchantPolicy,
}) {
  assert.equal(gear.items.length, 17);
  const slots = gear.items
      .map((row, slot) =>
        pool.slots[slot].includes(row.id) || (slot === 15 && row.id === 0) ? -1 : slot,
      )
      .filter((slot) => slot >= 0),
    choices = Object.values(inspection.enchants);
  if (slots.some((slot) => slot === 14 || slot === 15))
    for (const slot of [14, 15]) if (!slots.includes(slot)) slots.push(slot);
  slots.sort((a, b) => a - b);
  const options = slots.map((slot) => (slot === 15 ? [0, ...pool.slots[slot]] : pool.slots[slot])),
    count = options.reduce((value, ids) => value * BigInt(ids.length), 1n);
  assert(count <= 1_000_000n, "Repair bank limit exceeded; partial coverage is not accepted");
  const seen = new Set();
  function* assign(index, proposal) {
    if (index === slots.length) {
      if (!legalPaladinHealingGear(proposal, items, sources, context)) return;
      if (
        !proposal.items.every(
          (row, slot) =>
            !row.enchant ||
            choices.some(
              (enchant) =>
                enchant.effectId === row.enchant &&
                prebisEnchantFits(enchant, items.get(row.id), 4, slot, enchantPolicy),
            ),
        )
      )
        return;
      const id = simulationHash(proposal);
      if (!seen.has(id)) {
        seen.add(id);
        yield { id, gear: proposal, changedSlots: slots };
      }
      return;
    }
    const slot = slots[index];
    for (const id of options[index]) {
      const next = globalThis.structuredClone(proposal),
        enchant = gear.items[slot].enchant;
      next.items[slot] = { id };
      if (
        id &&
        enchant &&
        choices.some(
          (entry) =>
            entry.effectId === enchant &&
            prebisEnchantFits(entry, items.get(id), 4, slot, enchantPolicy),
        )
      )
        next.items[slot].enchant = enchant;
      yield* assign(index + 1, next);
    }
  }
  yield* assign(0, globalThis.structuredClone(gear));
}
