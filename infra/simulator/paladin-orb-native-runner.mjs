import { openPaladinItemHealingNativeRunners } from "./paladin-healing-item-native-runner.mjs";
import {
  assertPaladinOrbHealingJob,
  parsePaladinOrbHealingJobReply,
} from "./paladin-orb-protocol.mjs";

/** Extend the frozen executor with the Orb area boundary while retaining its checksum, cancellation and process limits.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinOrbHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinItemHealingNativeRunners(binary, cwd, expectedSha256, options);
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinOrbHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinOrbHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
