import { openPaladinHealingNativeRunners } from "./paladin-healing-native-runner.mjs";
import {
  assertPaladinLightHealingJob,
  parsePaladinLightHealingJobReply,
} from "./paladin-healing-light-protocol.mjs";

/** Extend the frozen executor with the target-buff boundary while retaining its checksum, cancellation and process limits.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinLightHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinHealingNativeRunners(binary, cwd, expectedSha256, options);
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinLightHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinLightHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
