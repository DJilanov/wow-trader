import {
  assertPaladinLightHealingJob,
  parsePaladinLightHealingJobReply,
} from "./paladin-healing-light-protocol.mjs";

/** @param {unknown} policy @returns {void} */
export function assertPaladinHealingItemPolicy(policy) {
  if (
    !policy ||
    typeof policy !== "object" ||
    Array.isArray(policy) ||
    Object.keys(policy).sort().join(",") !==
      "dormantHeartHealingEvents,dormantHeartProcChance,id,schema" ||
    policy.schema !== "kfc-paladin-item-effects-policy.v1" ||
    typeof policy.id !== "string" ||
    !policy.id ||
    policy.id.length > 100 ||
    typeof policy.dormantHeartProcChance !== "number" ||
    !Number.isFinite(policy.dormantHeartProcChance) ||
    policy.dormantHeartProcChance < 0 ||
    policy.dormantHeartProcChance > 1 ||
    !["completed-casts", "direct-heals"].includes(policy.dormantHeartHealingEvents)
  )
    throw new Error("Invalid Paladin item effects policy");
}

/** @param {unknown} job @returns {void} */
export function assertPaladinItemHealingJob(job) {
  assertPaladinLightHealingJob(job);
  if (job.workload.itemEffectsPolicy !== undefined)
    assertPaladinHealingItemPolicy(job.workload.itemEffectsPolicy);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinItemHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinLightHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete" && reply.result.itemEffectsPolicy !== undefined)
    assertPaladinHealingItemPolicy(reply.result.itemEffectsPolicy);
  return reply;
}
