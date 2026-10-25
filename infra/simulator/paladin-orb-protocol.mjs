import {
  assertPaladinItemHealingJob,
  parsePaladinItemHealingJobReply,
} from "./paladin-healing-item-protocol.mjs";

/** @param {unknown} value @returns {void} */
export function assertPaladinOrbArea(value) {
  if (!["neutral", "haunted", "wasteland"].includes(value))
    throw new Error("Invalid Sanctified Orb area");
}

/** @param {unknown} job @returns {void} */
export function assertPaladinOrbHealingJob(job) {
  assertPaladinItemHealingJob(job);
  if (job.workload.orbArea !== undefined) assertPaladinOrbArea(job.workload.orbArea);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinOrbHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinItemHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete" && reply.result.orbArea !== undefined)
    assertPaladinOrbArea(reply.result.orbArea);
  return reply;
}
