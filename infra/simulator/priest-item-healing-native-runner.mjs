import { openHealingNativeRunners } from "./healing-native-runner.mjs";
import {
  assertPriestItemHealingJob,
  parsePriestItemHealingJobReply,
} from "./priest-item-healing-protocol.mjs";

/** @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPriestItemHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const workers = await openHealingNativeRunners(binary, cwd, expectedSha256, options);
  return workers.map((worker) => ({
    binarySha256: worker.binarySha256,
    async run(job) {
      assertPriestItemHealingJob(job);
      const reply = await worker.run(job);
      return parsePriestItemHealingJobReply(JSON.stringify(reply), job.id, job.detail);
    },
    close() {
      worker.close();
    },
  }));
}
