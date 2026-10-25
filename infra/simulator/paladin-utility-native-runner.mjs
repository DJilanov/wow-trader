import { openPaladinHealingNativeRunners } from "./paladin-healing-native-runner.mjs";
import {
  assertPaladinUtilityHealingJob,
  parsePaladinUtilityHealingJobReply,
} from "./paladin-utility-protocol.mjs";

/** Validate utility jobs around the unchanged checksum-verified process executor.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinUtilityHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinHealingNativeRunners(binary, cwd, expectedSha256, options);
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinUtilityHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinUtilityHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
