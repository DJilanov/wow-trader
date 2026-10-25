import {
  assertPaladinUtilityHealingJob,
  parsePaladinUtilityHealingJobReply,
} from "./paladin-utility-protocol.mjs";

/** @param {unknown} job @returns {void} */
export function assertPaladinCatalogHealingJob(job) {
  assertPaladinUtilityHealingJob(job);
  if (
    job.workload.itemHealthRegenTickMs !== undefined &&
    ![2000, 5000].includes(job.workload.itemHealthRegenTickMs)
  )
    throw new Error("Invalid item health regeneration timing reference");
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinCatalogHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinUtilityHealingJobReply(payload, expectedId, detail);
  if (
    reply.status === "complete" &&
    reply.result.itemHealthRegenTickMs !== undefined &&
    ![2000, 5000].includes(reply.result.itemHealthRegenTickMs)
  )
    throw new Error("Invalid item health regeneration timing result");
  return reply;
}
