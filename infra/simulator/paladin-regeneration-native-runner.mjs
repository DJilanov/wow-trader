import { openPaladinRecombobulatorHealingNativeRunners } from "./paladin-recombobulator-native-runner.mjs";
import {
  assertPaladinRegenerationHealingJob,
  parsePaladinRegenerationHealingJobReply,
} from "./paladin-regeneration-protocol.mjs";

/** Extend the frozen executor with the coupled friendly-resource boundary while retaining its checksum, cancellation and process limits.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinRegenerationHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinRecombobulatorHealingNativeRunners(
    binary,
    cwd,
    expectedSha256,
    options,
  );
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinRegenerationHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinRegenerationHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
