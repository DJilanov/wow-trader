import {
  assertPaladinRegenerationHealingJob,
  parsePaladinRegenerationHealingJobReply,
} from "./paladin-regeneration-protocol.mjs";

const friendlyItems = new Set([4262, 8346]);
const references = ["utilityHealingCanCrit", "circleChannelScales"];

/** @param {unknown} job @returns {void} */
export function assertPaladinUtilityHealingJob(job) {
  let legacyJob = job;
  if (Array.isArray(job?.workload?.cooldowns)) {
    legacyJob = {
      ...job,
      workload: {
        ...job.workload,
        cooldowns: job.workload.cooldowns.map((entry) => {
          if (!friendlyItems.has(entry?.itemId)) return entry;
          const copy = { ...entry };
          delete copy.targetRaidIndex;
          delete copy.minimumMissingHealth;
          return copy;
        }),
      },
    };
  }
  assertPaladinRegenerationHealingJob(legacyJob);
  for (const field of references)
    if (job.workload[field] !== undefined && typeof job.workload[field] !== "boolean")
      throw new Error(`Invalid Paladin ${field} reference`);
  const ids = new Set(job.workload.targets.map((target) => target.raidIndex));
  for (const entry of job.workload.cooldowns ?? []) {
    if (!friendlyItems.has(entry.itemId)) continue;
    if (
      entry.targetRaidIndex !== undefined &&
      (!Number.isSafeInteger(entry.targetRaidIndex) ||
        (entry.targetRaidIndex !== -1 && !ids.has(entry.targetRaidIndex)))
    )
      throw new Error("Invalid Paladin utility recipient");
    if (
      entry.minimumMissingHealth !== undefined &&
      (typeof entry.minimumMissingHealth !== "number" ||
        !Number.isFinite(entry.minimumMissingHealth) ||
        entry.minimumMissingHealth < 0 ||
        entry.minimumMissingHealth > 1000000)
    )
      throw new Error("Invalid Paladin utility health threshold");
    if (
      entry.itemId === 4262 &&
      entry.targetRaidIndex !== undefined &&
      ![-1, 0].includes(entry.targetRaidIndex)
    )
      throw new Error("Belt recipient must be self");
  }
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinUtilityHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinRegenerationHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete")
    for (const field of references)
      if (reply.result[field] !== undefined && typeof reply.result[field] !== "boolean")
        throw new Error(`Invalid Paladin ${field} result`);
  return reply;
}
