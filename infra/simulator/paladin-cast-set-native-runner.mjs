import { openPaladinUtilityHealingNativeRunners } from "./paladin-utility-native-runner.mjs";
import {
  assertPaladinCastSetHealingJob,
  parsePaladinCastSetHealingJobReply,
} from "./paladin-cast-set-protocol.mjs";

/** Preserve the native executor while validating the added timing reference.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinCastSetHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinUtilityHealingNativeRunners(
    binary,
    cwd,
    expectedSha256,
    options,
  );
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinCastSetHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinCastSetHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      runner.close();
    },
  }));
}
