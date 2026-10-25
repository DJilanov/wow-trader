import {
  assertPaladinCatalogHealingJob,
  parsePaladinCatalogHealingJobReply,
} from "./paladin-catalog-protocol.mjs";

function validatePolicy(value) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid cast-set policy");
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some(
      (key) => !["wildheartManaChance", "spellPowerChance", "dreadmistCanCrit"].includes(key),
    )
  )
    throw new Error("Invalid cast-set policy fields");
  for (const key of ["wildheartManaChance", "spellPowerChance"])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "number" ||
        !Number.isFinite(value[key]) ||
        value[key] < 0 ||
        value[key] > 1)
    )
      throw new Error("Invalid cast-set chance");
  if (value.dreadmistCanCrit !== undefined && typeof value.dreadmistCanCrit !== "boolean")
    throw new Error("Invalid Dreadmist critical reference");
}

/** @param {unknown} job @returns {void} */
export function assertPaladinCastSetHealingJob(job) {
  assertPaladinCatalogHealingJob(job);
  validatePolicy(job.workload.castSetPolicy);
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinCastSetHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinCatalogHealingJobReply(payload, expectedId, detail);
  if (reply.status === "complete") validatePolicy(reply.result.castSetPolicy);
  return reply;
}
