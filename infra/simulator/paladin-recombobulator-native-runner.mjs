import { openPaladinOrbHealingNativeRunners } from "./paladin-orb-native-runner.mjs";
import {
  assertPaladinRecombobulatorHealingJob,
  parsePaladinRecombobulatorHealingJobReply,
} from "./paladin-recombobulator-protocol.mjs";

/** Extend the frozen executor with the coupled friendly-resource boundary while retaining its checksum, cancellation and process limits.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinRecombobulatorHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinOrbHealingNativeRunners(binary, cwd, expectedSha256, options);
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinRecombobulatorHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinRecombobulatorHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
