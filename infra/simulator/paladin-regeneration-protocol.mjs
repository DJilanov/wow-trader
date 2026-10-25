import {
  assertPaladinRecombobulatorHealingJob,
  parsePaladinRecombobulatorHealingJobReply,
} from "./paladin-recombobulator-protocol.mjs";

const areas = new Set(["neutral", "haunted", "wasteland"]);

/** @param {unknown} job @returns {void} */
export function assertPaladinRegenerationHealingJob(job) {
  assertPaladinRecombobulatorHealingJob(job);
  const { itemArea, orbArea } = job.workload;
  if (itemArea !== undefined && !areas.has(itemArea))
    throw new Error("Invalid Paladin item area reference");
  if (itemArea !== undefined && orbArea !== undefined && itemArea !== orbArea)
    throw new Error("Item area and legacy Orb area disagree");
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinRegenerationHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinRecombobulatorHealingJobReply(payload, expectedId, detail);
  if (
    reply.status === "complete" &&
    reply.result.itemArea !== undefined &&
    !areas.has(reply.result.itemArea)
  )
    throw new Error("Invalid Paladin item area result");
  return reply;
}
