import assert from "node:assert/strict";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";

/** Fixed group-only proposals for early resource eligibility and a fast rescue.
 * @returns {string[]}
 */
export function paladinHealingReservePolicyIds() {
  return ["unchanged", "resource-window", "resource-window-fast-rescue"];
}

/** Change workload thresholds only; encoded cooldown timing stays with the caller.
 * @param {{frame:object,spellPolicy:object,talents:object,kind:string,policyId:string}} input
 * @returns {object}
 */
export function applyPaladinHealingReservePolicy({ frame, spellPolicy, talents, kind, policyId }) {
  assert(paladinHealingReservePolicyIds().includes(policyId), "Unreviewed reserve policy");
  assert.equal(kind, "group");
  assert.equal(frame.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(frame.assignmentScoring, "external-demand-v1");
  assert.equal(frame.requireFullTalentBuild, true);
  assert.equal(frame.allowConditionalSpellCandidates, true);
  assert(Array.isArray(frame.priorities) && frame.priorities.length > 0);
  assert(frame.priorities.every((row) => row.raidIndex === -1));
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
  if (policyId === "resource-window-fast-rescue") {
    const damagedIds = new Set(result.damage.map((row) => row.raidIndex));
    const recipients = result.targets.filter((row) => damagedIds.has(row.raidIndex));
    assert(recipients.length > 1 && recipients.length === damagedIds.size);
    assert.equal(new Set(recipients.map((row) => row.raidIndex)).size, damagedIds.size);
    const maximum = recipients[0].maximumHealth;
    assert(Number.isFinite(maximum) && maximum > 0);
    assert(recipients.every((row) => row.maximumHealth === maximum));
    const eligible = eligiblePaladinHealingRanks(spellPolicy, {
      level: 60,
      talents: { holyShock: Boolean(talents.holyShock), lightsVigil: Boolean(talents.lightsVigil) },
      allowConditionalCandidates: true,
    });
    const rescue = eligible
      .filter((row) => row.family === "flash-of-light")
      .sort((a, b) => b.rank - a.rank)[0];
    assert(rescue, "A source-admitted Flash of Light rank is required");
    result.priorities.unshift({
      spellId: rescue.spellId,
      raidIndex: -1,
      minimumMissingHealth: maximum * 0.6,
    });
    assert(result.priorities.length <= 32);
  }
  return result;
}
