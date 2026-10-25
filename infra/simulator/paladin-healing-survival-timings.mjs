import assert from "node:assert/strict";
import { paladinHealingSurvivalPolicyIds } from "./paladin-healing-survival-policies.mjs";

/** Existing engine cooldown schedules supersede its optional no-overcap heuristic.
 * @param {{kind:'tank'|'group',policyId:string,durationSeconds:number}} input
 * @returns {object|null}
 */
export function paladinHealingSurvivalTimingSettings({ kind, policyId, durationSeconds }) {
  assert(paladinHealingSurvivalPolicyIds(kind).includes(policyId));
  assert(Number.isFinite(durationSeconds) && durationSeconds > 0);
  if (!policyId.includes("earlier-resources")) return null;
  assert.equal(
    durationSeconds,
    180,
    "Resource schedules are declared for the 180-second study only",
  );
  return {
    cooldowns: [
      { id: { itemId: 12662 }, timings: [15, 135] },
      { id: { itemId: 13444 }, timings: [30, 150] },
    ],
  };
}
