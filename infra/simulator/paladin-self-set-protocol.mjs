import {
  assertPaladinCastSetHealingJob,
  parsePaladinCastSetHealingJobReply,
} from "./paladin-cast-set-protocol.mjs";

function validatePolicy(value) {
  if (value === undefined) return;
  const fields = [
    "thresholdTiming",
    "regenerationTickMs",
    "selfDamageTriggers",
    "devoutProcChance",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length === 0 ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error("Invalid self-set policy");
  if (
    value.thresholdTiming !== undefined &&
    !["after-hit", "before-hit"].includes(value.thresholdTiming)
  )
    throw new Error("Invalid self-set threshold timing");
  if (value.regenerationTickMs !== undefined && ![2000, 5000].includes(value.regenerationTickMs))
    throw new Error("Invalid self-set regeneration timing");
  if (value.selfDamageTriggers !== undefined && typeof value.selfDamageTriggers !== "boolean")
    throw new Error("Invalid self-set damage reference");
  if (
    value.devoutProcChance !== undefined &&
    (typeof value.devoutProcChance !== "number" ||
      !Number.isFinite(value.devoutProcChance) ||
      value.devoutProcChance < 0 ||
      value.devoutProcChance > 1)
  )
    throw new Error("Invalid Devout chance reference");
}

/** @param {unknown} job @returns {void} */
export function assertPaladinSelfSetHealingJob(job) {
  assertPaladinCastSetHealingJob(job);
  validatePolicy(job.workload.selfSetPolicy);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinSelfSetHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinCastSetHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete") validatePolicy(reply.result.selfSetPolicy);
  return reply;
}
