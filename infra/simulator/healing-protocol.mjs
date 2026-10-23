/** @param {unknown} value @param {string} name @returns {Record<string, unknown>} */
function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid healing ${name}`);
  return value;
}

/** @param {unknown} value @returns {void} */
export function assertHealingJob(value) {
  const job = record(value, "job");
  if (
    job.schema !== "kfc-healing-job.v1" ||
    typeof job.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(job.id) ||
    typeof job.requestBase64 !== "string" ||
    !job.requestBase64 ||
    typeof job.detail !== "boolean" ||
    record(job.workload, "workload").schema !== "kfc-healing-workload.v1"
  )
    throw new Error("Invalid healing job envelope");
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parseHealingJobReply(payload, expectedId, detail = false) {
  if (typeof payload !== "string") throw new Error("Healing worker returned non-JSON data");
  const reply = record(JSON.parse(payload), "reply");
  if (reply.schema !== "kfc-healing-job-result.v1" || reply.id !== expectedId)
    throw new Error("Healing worker reply does not match the request");
  if (reply.status === "error") {
    const failure = record(reply.error, "error");
    if (
      reply.result !== undefined ||
      typeof failure.code !== "string" ||
      !failure.code ||
      typeof failure.message !== "string" ||
      !failure.message
    )
      throw new Error("Invalid healing worker error");
    return reply;
  }
  if (reply.status !== "complete" || reply.error !== undefined)
    throw new Error("Invalid healing worker status");
  const result = record(reply.result, "result");
  if (
    result.schema !== "kfc-healing-workload-result.v1" ||
    typeof result.name !== "string" ||
    !result.name ||
    !Number.isSafeInteger(result.iterations) ||
    result.iterations < 1 ||
    result.iterations > 10000 ||
    result.classQualified !== false ||
    result.publicationAllowed !== false ||
    Object.hasOwn(result, "dps")
  )
    throw new Error("Invalid or unqualified healing result contract");
  for (const key of [
    "hps",
    "hpsStdev",
    "rawHps",
    "effectiveHealingHps",
    "overhealingHps",
    "absorbedHps",
    "survivalRate",
    "manaRemainingMean",
    "missingHealthSecondsMean",
    "finalMissingHealthMean",
    "manaBlockedSecondsMean",
    "plannedIncomingPostMitigationDamage",
    "deliveredIncomingDamageMean",
  ]) {
    if (typeof result[key] !== "number" || !Number.isFinite(result[key]) || result[key] < 0)
      throw new Error(`Invalid healing measurement: ${key}`);
  }
  const tolerance = Math.max(1, result.rawHps, result.hps) * 1e-7;
  if (
    result.survivalRate > 1 ||
    Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) > tolerance ||
    Math.abs(result.rawHps - result.effectiveHealingHps - result.overhealingHps) > tolerance ||
    result.deliveredIncomingDamageMean > result.plannedIncomingPostMitigationDamage + tolerance
  )
    throw new Error("Inconsistent healing accounting");
  if (detail) {
    const metrics = record(result.metrics, "detailed metrics");
    if (
      Math.abs(record(metrics.hps, "detailed HPS").avg - result.hps) > tolerance ||
      typeof metrics.hps.avg !== "number" ||
      !Number.isFinite(metrics.hps.avg)
    )
      throw new Error("Detailed healing metrics disagree with the summary");
  } else if (result.metrics !== undefined) {
    throw new Error("Unexpected detailed healing metrics");
  }
  return reply;
}
