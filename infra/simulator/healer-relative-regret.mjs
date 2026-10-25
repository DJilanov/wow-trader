import assert from "node:assert/strict";

/** @typedef {{policyId:string,feasible:boolean,meanMissingHealth:number}} HealingPolicyCase */
/** @typedef {{id:string,cases:HealingPolicyCase[]}} HealingPolicyCandidate */
/** @typedef {{id:string,feasible:boolean,withinTolerance:boolean,worstRelativeRegret:number|null,meanRelativeRegret:number|null,policyGaps:{policyId:string,relativeRegret:number|null}[]}} HealingRegretScore */

/** Compare the same choice across differently scaled healing policies.
 * @param {HealingPolicyCandidate[]} candidates
 * @param {string[]} policyIds
 * @param {number} tolerance
 * @returns {HealingRegretScore[]}
 */
export function rankHealingPolicyRegret(candidates, policyIds, tolerance = 0.02) {
  assert(Array.isArray(candidates) && candidates.length > 0);
  assert(Array.isArray(policyIds) && policyIds.length > 0);
  assert(policyIds.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(policyIds).size, policyIds.length, "Duplicate healing policy");
  assert(Number.isFinite(tolerance) && tolerance >= 0 && tolerance <= 1);
  assert.equal(
    new Set(candidates.map((row) => row.id)).size,
    candidates.length,
    "Duplicate candidate",
  );
  for (const candidate of candidates) {
    assert(typeof candidate.id === "string" && candidate.id.length > 0);
    assert.equal(candidate.cases.length, policyIds.length, "Incomplete healing policies");
    for (const [index, item] of candidate.cases.entries()) {
      assert.equal(item.policyId, policyIds[index], "Reordered or missing healing policy");
      assert.equal(typeof item.feasible, "boolean");
      assert(Number.isFinite(item.meanMissingHealth) && item.meanMissingHealth >= 0);
    }
  }
  const best = policyIds.map((id, index) => {
    const feasible = candidates.map((row) => row.cases[index]).filter((row) => row.feasible);
    assert(feasible.length > 0, `No feasible candidate for healing policy: ${id}`);
    return Math.min(...feasible.map((row) => row.meanMissingHealth));
  });
  return candidates
    .map((candidate) => {
      const feasible = candidate.cases.every((row) => row.feasible);
      const policyGaps = candidate.cases.map((item, index) => ({
        policyId: item.policyId,
        relativeRegret: item.feasible
          ? (item.meanMissingHealth - best[index]) / Math.max(1, best[index])
          : null,
      }));
      const gaps = policyGaps.map((row) => row.relativeRegret ?? 0);
      const worstRelativeRegret = feasible ? Math.max(...gaps) : null;
      return {
        id: candidate.id,
        feasible,
        withinTolerance:
          feasible && worstRelativeRegret !== null && worstRelativeRegret <= tolerance,
        worstRelativeRegret,
        meanRelativeRegret: feasible
          ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length
          : null,
        policyGaps,
      };
    })
    .sort(
      (a, b) =>
        Number(b.feasible) - Number(a.feasible) ||
        (a.worstRelativeRegret ?? 0) - (b.worstRelativeRegret ?? 0) ||
        (a.meanRelativeRegret ?? 0) - (b.meanRelativeRegret ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
