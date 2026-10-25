import { assertHealingJob, parseHealingJobReply } from "./healing-protocol.mjs";

/** @param {unknown} value @returns {void} */
export function assertDruidHealingJob(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== "kfc-druid-healing-job.v1" ||
    value.workload?.schema !== "kfc-druid-healing-workload.v1"
  ) {
    throw new Error("Invalid Druid healing job envelope");
  }
  assertHealingJob({
    ...value,
    schema: "kfc-healing-job.v1",
    workload: { ...value.workload, schema: "kfc-healing-workload.v1" },
  });
}

/** Reuse the common healing accounting checks while preserving Druid's wire contract.
 * @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object}
 */
export function parseDruidHealingJobReply(payload, expectedId, detail = false) {
  if (typeof payload !== "string") throw new Error("Druid worker returned non-JSON data");
  const reply = JSON.parse(payload);
  if (
    !reply ||
    typeof reply !== "object" ||
    Array.isArray(reply) ||
    reply.schema !== "kfc-druid-healing-job-result.v1"
  )
    throw new Error("Invalid Druid worker reply schema");
  if (reply.status !== "error" && reply.result?.schema !== "kfc-druid-healing-workload-result.v1")
    throw new Error("Invalid Druid healing result schema");
  const canonical = { ...reply, schema: "kfc-healing-job-result.v1" };
  if (reply.result !== undefined)
    canonical.result = { ...reply.result, schema: "kfc-healing-workload-result.v1" };
  parseHealingJobReply(JSON.stringify(canonical), expectedId, detail);
  return reply;
}
