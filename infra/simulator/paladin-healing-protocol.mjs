import { assertHealingJob, parseHealingJobReply } from "./healing-protocol.mjs";

function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Paladin " + name);
  return value;
}
function number(value, minimum, maximum, integer = false) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum &&
    (!integer || Number.isInteger(value))
  );
}
function rankPolicy(value) {
  const policy = record(value, "rank policy");
  if (
    policy.schema !== "kfc-paladin-rank-sensitivity.v1" ||
    typeof policy.id !== "string" ||
    !policy.id ||
    policy.id.length > 100 ||
    !number(policy.fullScalingGap, 0, 60, true) ||
    !number(policy.coefficientLossPerLevel, 0, 1) ||
    !["unchanged", "coefficient-factor"].includes(policy.classProcMode) ||
    !["unscaled-reference", "level-distance-sensitivity"].includes(policy.kind) ||
    (policy.kind === "unscaled-reference" &&
      (policy.fullScalingGap !== 0 ||
        policy.coefficientLossPerLevel !== 0 ||
        policy.classProcMode !== "unchanged")) ||
    (policy.kind === "level-distance-sensitivity" && policy.coefficientLossPerLevel <= 0)
  )
    throw new Error("Invalid Paladin rank-sensitivity policy");
}
const vigilModes = ["none", "once-per-cast", "per-critical-recipient"];

/** Validate the distinct workload before serialization can convert nonfinite values to null.
 * @param {unknown} value @returns {void}
 */
export function assertPaladinHealingJob(value) {
  const job = record(value, "job"),
    frame = record(job.workload, "workload");
  if (
    job.schema !== "kfc-paladin-healing-job.v1" ||
    frame.schema !== "kfc-paladin-healing-workload.v1"
  )
    throw new Error("Invalid Paladin job schema");
  assertHealingJob({
    ...job,
    schema: "kfc-healing-job.v1",
    workload: { ...frame, schema: "kfc-healing-workload.v1" },
  });
  rankPolicy(frame.rankScaling);
  if (
    frame.allowConditionalSpellCandidates !== true ||
    !vigilModes.includes(frame.vigilRefundMode) ||
    typeof frame.name !== "string" ||
    !frame.name ||
    frame.name.length > 200 ||
    !number(frame.decisionIntervalMs, 1, 1000, true) ||
    (frame.useDivineFavor !== undefined && typeof frame.useDivineFavor !== "boolean") ||
    !number(frame.divineFavorMinimumBaseCost ?? 0, 0, 1000000) ||
    (!frame.useDivineFavor && (frame.divineFavorMinimumBaseCost ?? 0) !== 0)
  )
    throw new Error("Invalid Paladin workload policy");
  if (
    !Array.isArray(frame.targets) ||
    frame.targets.length < 1 ||
    frame.targets.length > 25 ||
    !Array.isArray(frame.damage) ||
    frame.damage.length > 20000 ||
    !Array.isArray(frame.priorities) ||
    frame.priorities.length < 1 ||
    frame.priorities.length > 32
  )
    throw new Error("Invalid Paladin workload arrays");
  const targetIds = new Set();
  for (const entry of frame.targets) {
    const target = record(entry, "target");
    if (
      !number(target.raidIndex, 0, 39, true) ||
      targetIds.has(target.raidIndex) ||
      !number(target.maximumHealth, 0, 1000000) ||
      !number(target.x, -1000000, 1000000) ||
      !number(target.y, -1000000, 1000000)
    )
      throw new Error("Invalid Paladin target profile");
    targetIds.add(target.raidIndex);
  }
  for (const entry of frame.damage) {
    const event = record(entry, "damage event");
    if (
      !targetIds.has(event.raidIndex) ||
      !number(event.atMs, 0, 1800000, true) ||
      !number(event.amount, Number.MIN_VALUE, 1000000)
    )
      throw new Error("Invalid Paladin incoming damage");
  }
  for (const entry of frame.priorities) {
    const priority = record(entry, "priority");
    if (
      !number(priority.spellId, 1, 2147483647, true) ||
      !number(priority.raidIndex, -1, 39, true) ||
      (priority.raidIndex >= 0 && !targetIds.has(priority.raidIndex)) ||
      !number(priority.minimumMissingHealth, 0, 1000000000) ||
      !number(priority.minimumPartyTargets ?? 0, 0, 5, true) ||
      !number(priority.minimumPartyMissingHealth ?? 0, 0, 5000000) ||
      [priority.maintainVigil, priority.requireVigil].some(
        (flag) => flag !== undefined && typeof flag !== "boolean",
      )
    )
      throw new Error("Invalid Paladin healing priority");
  }
  if (frame.cooldowns !== undefined) {
    if (!Array.isArray(frame.cooldowns) || frame.cooldowns.length > 16)
      throw new Error("Invalid Paladin cooldowns");
    for (const entry of frame.cooldowns) {
      const cooldown = record(entry, "cooldown"),
        item = cooldown.itemId ?? 0,
        spell = cooldown.spellId ?? 0;
      if (
        !number(item, 0, 2147483647, true) ||
        !number(spell, 0, 2147483647, true) ||
        item > 0 === spell > 0 ||
        !number(cooldown.minimumMissingMana ?? 0, 0, 1000000) ||
        (cooldown.requireHealingDemand !== undefined &&
          typeof cooldown.requireHealingDemand !== "boolean")
      )
        throw new Error("Invalid Paladin resource cooldown");
    }
  }
}

/** Preserve the class schema while applying the existing exact healing accounting checks.
 * @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object}
 */
export function parsePaladinHealingJobReply(payload, expectedId, detail = false) {
  if (typeof payload !== "string") throw new Error("Paladin worker returned non-JSON data");
  const reply = record(JSON.parse(payload), "reply");
  if (reply.schema !== "kfc-paladin-healing-job-result.v1")
    throw new Error("Invalid Paladin reply schema");
  const canonical = { ...reply, schema: "kfc-healing-job-result.v1" };
  if (reply.status !== "error") {
    const result = record(reply.result, "result");
    if (
      result.schema !== "kfc-paladin-healing-workload-result.v1" ||
      !vigilModes.includes(result.vigilRefundMode)
    )
      throw new Error("Invalid Paladin result policy");
    rankPolicy(result.rankScaling);
    canonical.result = { ...result, schema: "kfc-healing-workload-result.v1" };
  } else if (reply.result !== undefined) canonical.result = reply.result;
  parseHealingJobReply(JSON.stringify(canonical), expectedId, detail);
  return reply;
}
