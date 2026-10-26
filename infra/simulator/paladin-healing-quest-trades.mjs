import assert from "node:assert/strict";
import { equipmentOwnership } from "./equipment-ownership.mjs";
import {
  legalPaladinHealingGear,
  paladinHealingHandCandidates,
} from "./paladin-healing-equipment.mjs";
import { prebisEnchantFits } from "./prebis-enchants.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

/** Compare a quest reward together with replacements for its conflicting equipped rewards.
 * This adds the minimal quest-choice displacement domain to the ordinary gear bank;
 * complete hands are repaired together and every result passes whole-loadout legality.
 * @param {{gear:object,pool:object,items:Map<number,object>,sources:Map<number,object>,context:object,inspection:object,enchantPolicy:object}} input
 * @returns {Generator<{group:string,id:string,gear:object,trade:object}>}
 */
export function* paladinHealingQuestTradeCandidates({
  gear,
  pool,
  items,
  sources,
  context,
  inspection,
  enchantPolicy,
}) {
  assert.equal(pool.schema, "kfc-paladin-healing-equipment-pool.v1");
  assert.equal(pool.slots.length, 17);
  assert(legalPaladinHealingGear(gear, items, sources, context));
  const enchants = Object.values(inspection.enchants);
  assert(
    gear.items.every(
      (spec, slot) =>
        !spec.enchant ||
        enchants.some(
          (enchant) =>
            enchant.effectId === spec.enchant &&
            prebisEnchantFits(enchant, items.get(spec.id), 4, slot, enchantPolicy),
        ),
    ),
    "Unreviewed seed enchant",
  );
  const ownership = new Map();
  function choices(id) {
    if (!id) return [];
    if (!ownership.has(id)) {
      assert(items.has(id) && sources.has(id));
      ownership.set(id, equipmentOwnership(items.get(id), sources.get(id)).questChoices);
    }
    return ownership.get(id);
  }
  const seen = new Set();
  function replace(proposal, slot, id) {
    proposal.items[slot] = { id };
    const effect = gear.items[slot].enchant;
    if (
      id &&
      effect &&
      enchants.some(
        (enchant) =>
          enchant.effectId === effect &&
          prebisEnchantFits(enchant, items.get(id), 4, slot, enchantPolicy),
      )
    )
      proposal.items[slot].enchant = effect;
  }
  for (const [anchorSlot, ids] of pool.slots.entries())
    for (const anchorItemId of ids) {
      const anchorChoices = choices(anchorItemId);
      if (!anchorChoices.length) continue;
      const displacedSlots = gear.items.flatMap((spec, slot) =>
        slot !== anchorSlot && choices(spec.id).some((quest) => anchorChoices.includes(quest))
          ? [slot]
          : [],
      );
      if (!displacedSlots.length) continue;
      const repairHands = [anchorSlot, ...displacedSlots].some(
        (slot) => slot === 14 || slot === 15,
      );
      const ordinarySlots = displacedSlots.filter((slot) => slot !== 14 && slot !== 15);
      const hands = repairHands
        ? [...paladinHealingHandCandidates(pool, items)].filter(
            (pair) =>
              (anchorSlot !== 14 || pair.mainHand === anchorItemId) &&
              (anchorSlot !== 15 || pair.offHand === anchorItemId),
          )
        : [null];
      const count = ordinarySlots.reduce(
        (total, slot) => total * BigInt(pool.slots[slot].length),
        BigInt(hands.length),
      );
      assert(
        count <= 1000000n,
        "Quest trade domain needs explicit partitioning; no truncation allowed",
      );
      const group = "quest-trade-" + anchorSlot + "-" + displacedSlots.join("-");
      function* replacements(index, changes) {
        if (index < ordinarySlots.length) {
          const slot = ordinarySlots[index];
          for (const id of pool.slots[slot])
            yield* replacements(index + 1, [...changes, [slot, id]]);
          return;
        }
        const proposal = globalThis.structuredClone(gear);
        replace(proposal, anchorSlot, anchorItemId);
        for (const [slot, id] of changes) replace(proposal, slot, id);
        if (!legalPaladinHealingGear(proposal, items, sources, context)) return;
        const id = simulationHash(proposal);
        if (seen.has(id)) return;
        seen.add(id);
        yield {
          group,
          id,
          gear: proposal,
          trade: { anchorSlot, anchorItemId, displacedSlots },
        };
      }
      for (const pair of hands)
        yield* replacements(
          0,
          pair
            ? [
                [14, pair.mainHand],
                [15, pair.offHand],
              ]
            : [],
        );
    }
}
