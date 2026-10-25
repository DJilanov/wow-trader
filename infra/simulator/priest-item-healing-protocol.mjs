import { assertHealingJob, parseHealingJobReply } from "./healing-protocol.mjs";

/** @param {unknown} policy @returns {void} */
export function assertPriestHealingItemPolicy(policy) {
  if (
    !policy ||
    typeof policy !== "object" ||
    Array.isArray(policy) ||
    Object.keys(policy).sort().join(",") !==
      "dormantHeartHealingEvents,dormantHeartProcChance,id,schema" ||
    policy.schema !== "kfc-priest-item-effects-policy.v1" ||
    typeof policy.id !== "string" ||
    !policy.id ||
    policy.id.length > 100 ||
    typeof policy.dormantHeartProcChance !== "number" ||
    !Number.isFinite(policy.dormantHeartProcChance) ||
    policy.dormantHeartProcChance < 0 ||
    policy.dormantHeartProcChance > 1 ||
    !["completed-casts", "direct-heals"].includes(policy.dormantHeartHealingEvents)
  )
    throw new Error("Invalid Priest item effects policy");
}

/** @param {unknown} job @returns {void} */
export function assertPriestItemHealingJob(job) {
  assertHealingJob(job);
  if (job.workload.itemEffectsPolicy !== undefined)
    assertPriestHealingItemPolicy(job.workload.itemEffectsPolicy);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePriestItemHealingJobReply(payload, expectedId, detail = false) {
  const reply = parseHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete" && reply.result.itemEffectsPolicy !== undefined)
    assertPriestHealingItemPolicy(reply.result.itemEffectsPolicy);
  return reply;
}
