import {
  assertPaladinSelfSetHealingJob,
  parsePaladinSelfSetHealingJobReply,
} from "./paladin-self-set-protocol.mjs";

const fields = [
  "supportHpsMean",
  "supportHpsStdev",
  "healthRestoredHpsMean",
  "absorbedHpsMean",
  "damageDemandMean",
  "overkillExcludedMean",
  "externalMissingHealthSecondsMean",
  "finalExternalMissingHealthMean",
];

/** @param {unknown} job @returns {void} */
export function assertPaladinAssignmentHealingJob(job) {
  assertPaladinSelfSetHealingJob(job);
  const scoring = job.workload.assignmentScoring;
  if (scoring !== undefined && scoring !== "" && scoring !== "external-demand-v1")
    throw new Error("Invalid external assignment scoring policy");
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail
 * @param {boolean} requireAssignment @returns {object}
 */
export function parsePaladinAssignmentHealingJobReply(
  payload,
  expectedId,
  detail = false,
  requireAssignment = false,
) {
  const reply = parsePaladinSelfSetHealingJobReply(payload, expectedId, detail);
  if (reply.status !== "complete") return reply;
  const assignment = reply.result.assignment;
  if (assignment === undefined && !requireAssignment) return reply;
  if (
    !assignment ||
    assignment.schema !== "kfc-paladin-external-assignment.v1" ||
    fields.some(
      (field) =>
        typeof assignment[field] !== "number" ||
        !Number.isFinite(assignment[field]) ||
        assignment[field] < 0,
    ) ||
    Math.abs(
      assignment.supportHpsMean - assignment.healthRestoredHpsMean - assignment.absorbedHpsMean,
    ) >
      Math.max(1, assignment.supportHpsMean) * 1e-7
  )
    throw new Error("Invalid external assignment result");
  return reply;
}
