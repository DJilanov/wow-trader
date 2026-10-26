import assert from "node:assert/strict";
import {
  applyPaladinHealingTankReservePolicy as applyOriginalPolicy,
  paladinHealingTankReservePolicyIds as originalIds,
} from "./paladin-healing-tank-reserve-policy.mjs";

/** Retain both original proposals alongside two fixed potion-only windows.
 * @returns {string[]}
 */
export function paladinHealingTankReservePolicyIds() {
  return [...originalIds(), "potion-window-1500", "potion-window-2000"];
}

/** Preserve rune eligibility while testing a smaller deficit for potion use.
 * @param {{frame:object,kind:string,policyId:string}} input @returns {object}
 */
export function applyPaladinHealingTankReservePolicy(input) {
  assert(paladinHealingTankReservePolicyIds().includes(input.policyId));
  if (originalIds().includes(input.policyId)) return applyOriginalPolicy(input);
  const result = applyOriginalPolicy({ ...input, policyId: "resource-window" });
  result.cooldowns = structuredClone(input.frame.cooldowns);
  const policy = result.cooldowns.find((row) => row.itemId === 13444);
  const threshold = input.policyId === "potion-window-1500" ? 1500 : 2000;
  policy.minimumMissingMana = Math.min(policy.minimumMissingMana, threshold);
  return result;
}
