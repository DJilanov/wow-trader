import {
  assertPaladinAssignmentHealingJob,
  parsePaladinAssignmentHealingJobReply,
} from "./paladin-assignment-protocol.mjs";
import { assertPaladinLegacyItemPolicy } from "./paladin-legacy-policy.mjs";

/** @param {unknown} job @returns {void} */
export function assertPaladinLegacyHealingJob(job) {
  assertPaladinAssignmentHealingJob(job);
  if (job.workload.legacyItemsPolicy !== undefined)
    assertPaladinLegacyItemPolicy(job.workload.legacyItemsPolicy);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail
 * @param {boolean} requireAssignment @returns {object}
 */
export function parsePaladinLegacyHealingJobReply(
  payload,
  expectedId,
  detail = false,
  requireAssignment = false,
) {
  const reply = parsePaladinAssignmentHealingJobReply(
    payload,
    expectedId,
    detail,
    requireAssignment,
  );
  if (reply.status === "complete" && reply.result.legacyItemsPolicy !== undefined)
    assertPaladinLegacyItemPolicy(reply.result.legacyItemsPolicy);
  return reply;
}
