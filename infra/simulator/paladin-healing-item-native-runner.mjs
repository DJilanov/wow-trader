import { openPaladinHealingNativeRunners } from "./paladin-healing-native-runner.mjs";
import {
  assertPaladinItemHealingJob,
  parsePaladinItemHealingJobReply,
} from "./paladin-healing-item-protocol.mjs";

/** Extend the frozen executor with the target-buff boundary while retaining its checksum, cancellation and process limits.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinItemHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinHealingNativeRunners(binary, cwd, expectedSha256, options);
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinItemHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinItemHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
