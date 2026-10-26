import assert from "node:assert/strict";

/** Fixed single-target proposals; encoded resource timings belong to the request.
 * @returns {string[]}
 */
export function paladinHealingTankReservePolicyIds() {
  return ["unchanged", "resource-window"];
}

/** Preserve healing decisions while moving resource eligibility inside its window.
 * @param {{frame:object,kind:string,policyId:string}} input @returns {object}
 */
export function applyPaladinHealingTankReservePolicy({ frame, kind, policyId }) {
  assert(paladinHealingTankReservePolicyIds().includes(policyId), "Unreviewed tank reserve policy");
  assert.equal(kind, "tank");
  assert.equal(frame.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(frame.assignmentScoring, "external-demand-v1");
  assert.equal(frame.requireFullTalentBuild, true);
  assert.equal(frame.allowConditionalSpellCandidates, true);
  assert(Array.isArray(frame.damage) && frame.damage.length > 0);
  const damaged = new Set(frame.damage.map((row) => row.raidIndex));
  assert.equal(damaged.size, 1);
  const [recipient] = damaged;
  assert(Number.isSafeInteger(recipient) && recipient > 0);
  assert.equal(frame.targets.filter((row) => row.raidIndex === recipient).length, 1);
  assert.equal(new Set(frame.targets.map((row) => row.raidIndex)).size, frame.targets.length);
  assert(Array.isArray(frame.priorities) && frame.priorities.length > 0);
  assert(frame.priorities.every((row) => row.raidIndex === recipient));
  const result = structuredClone(frame);
  if (policyId === "unchanged") return result;
  assert(Array.isArray(result.cooldowns));
  for (const [itemId, threshold] of [
    [12662, 500],
    [13444, 750],
  ]) {
    const rows = result.cooldowns.filter((row) => row.itemId === itemId);
    assert.equal(rows.length, 1, "Exactly one declared resource policy is required");
    const policy = rows[0];
    assert(Number.isFinite(policy.minimumMissingMana) && policy.minimumMissingMana >= 0);
    assert.equal(policy.requireHealingDemand, true);
    policy.minimumMissingMana = Math.min(policy.minimumMissingMana, threshold);
  }
  return result;
}
