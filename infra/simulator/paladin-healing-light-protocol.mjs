import {
  assertPaladinHealingJob,
  parsePaladinHealingJobReply,
} from "./paladin-healing-protocol.mjs";

function assertLightPolicy(policy, targetIds) {
  if (
    !policy ||
    typeof policy !== "object" ||
    Array.isArray(policy) ||
    Object.keys(policy).some(
      (key) => !["schema", "scaling", "multiplierOrder", "assignments"].includes(key),
    ) ||
    policy.schema !== "kfc-paladin-blessing-of-light-policy.v1" ||
    !["full-tooltip-reference", "coefficient-factor"].includes(policy.scaling) ||
    !["before-healing-light", "after-healing-light"].includes(policy.multiplierOrder) ||
    !Array.isArray(policy.assignments) ||
    policy.assignments.length < 1 ||
    policy.assignments.length > 40
  )
    throw new Error("Invalid Blessing of Light policy");
  const seen = new Set();
  for (const assignment of policy.assignments) {
    if (
      !assignment ||
      typeof assignment !== "object" ||
      Array.isArray(assignment) ||
      Object.keys(assignment).some((key) => !["raidIndex", "spellId"].includes(key)) ||
      !Number.isSafeInteger(assignment.raidIndex) ||
      assignment.raidIndex < 0 ||
      assignment.raidIndex > 39 ||
      (targetIds && !targetIds.has(assignment.raidIndex)) ||
      seen.has(assignment.raidIndex) ||
      ![19977, 19978, 19979, 25890].includes(assignment.spellId)
    )
      throw new Error("Invalid Blessing of Light assignment");
    seen.add(assignment.raidIndex);
  }
}

/** Validate the optional target buff before JSON can normalize nonfinite input.
 * @param {unknown} job @returns {void}
 */
export function assertPaladinLightHealingJob(job) {
  assertPaladinHealingJob(job);
  if (job.workload.blessingOfLight !== undefined)
    assertLightPolicy(
      job.workload.blessingOfLight,
      new Set(job.workload.targets.map((target) => target.raidIndex)),
    );
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinLightHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinHealingJobReply(payload, expectedId, detail);
  if (reply.status !== "error" && reply.result.blessingOfLight !== undefined)
    assertLightPolicy(reply.result.blessingOfLight);
  return reply;
}
