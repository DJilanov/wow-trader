import assert from "node:assert/strict";
import { eligibleShamanHealingActions } from "./shaman-healing-eligibility.mjs";

/** Restrict the full source policy to the currently tested direct-heal component.
 * @param {object} policy
 * @param {{level:number,talents?:Record<string,boolean>,allowConditionalCandidates?:boolean}} options
 * @returns {object[]}
 */
export function eligibleShamanDirectRanks(policy, options) {
  return eligibleShamanHealingActions(policy, options).filter((action) =>
    ["healing-wave", "lesser-healing-wave"].includes(action.family),
  );
}

/** Reject unavailable or unsupported priorities before direct-component admission.
 * @param {object} policy
 * @param {number[]} spellIds
 * @param {object} options
 * @returns {void}
 */
export function assertShamanDirectPriorityEligibility(policy, spellIds, options) {
  assert(Array.isArray(spellIds) && spellIds.length > 0);
  const eligible = new Set(
    eligibleShamanDirectRanks(policy, options).map((action) => action.spellId),
  );
  for (const id of spellIds)
    assert(eligible.has(id), `Shaman priority ${id} is outside the declared direct-heal domain`);
}
