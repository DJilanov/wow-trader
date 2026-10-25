import {
  assertPaladinOrbHealingJob,
  parsePaladinOrbHealingJobReply,
} from "./paladin-orb-protocol.mjs";

/** @param {unknown} job @returns {void} */
export function assertPaladinRecombobulatorHealingJob(job) {
  assertPaladinOrbHealingJob(job);
  if (
    job.workload.recombobulatorCanCrit !== undefined &&
    typeof job.workload.recombobulatorCanCrit !== "boolean"
  )
    throw new Error("Invalid Recombobulator critical policy");
  const ids = new Set(job.workload.targets.map((row) => row.raidIndex));
  for (const cooldown of job.workload.cooldowns ?? []) {
    const fields =
      cooldown.targetRaidIndex !== undefined || cooldown.minimumMissingHealth !== undefined;
    if (fields && ![4381, 18637].includes(cooldown.itemId))
      throw new Error("Friendly resource targeting requires a Recombobulator");
    if (
      cooldown.targetRaidIndex !== undefined &&
      (!Number.isSafeInteger(cooldown.targetRaidIndex) ||
        (cooldown.targetRaidIndex !== -1 && !ids.has(cooldown.targetRaidIndex)))
    )
      throw new Error("Invalid Recombobulator recipient");
    if (
      cooldown.minimumMissingHealth !== undefined &&
      (typeof cooldown.minimumMissingHealth !== "number" ||
        !Number.isFinite(cooldown.minimumMissingHealth) ||
        cooldown.minimumMissingHealth < 0 ||
        cooldown.minimumMissingHealth > 1000000)
    )
      throw new Error("Invalid Recombobulator health threshold");
  }
}

/** @param {string} payload @param {string} expectedId @param {boolean} detail @returns {object} */
export function parsePaladinRecombobulatorHealingJobReply(payload, expectedId, detail = false) {
  const reply = parsePaladinOrbHealingJobReply(payload, expectedId, detail);
  if (
    reply.status === "complete" &&
    reply.result.recombobulatorCanCrit !== undefined &&
    typeof reply.result.recombobulatorCanCrit !== "boolean"
  )
    throw new Error("Invalid Recombobulator critical result");
  return reply;
}
