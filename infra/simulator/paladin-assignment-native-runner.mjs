import { openPaladinSelfSetHealingNativeRunners } from "./paladin-self-set-native-runner.mjs";
import {
  assertPaladinAssignmentHealingJob,
  parsePaladinAssignmentHealingJobReply,
} from "./paladin-assignment-protocol.mjs";

/** @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinAssignmentHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinSelfSetHealingNativeRunners(
    binary,
    cwd,
    expectedSha256,
    options,
  );
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinAssignmentHealingJob(job);
      const reply = await runner.run(job);
      return parsePaladinAssignmentHealingJobReply(
        JSON.stringify(reply),
        job.id,
        job.detail,
        job.workload.assignmentScoring === "external-demand-v1",
      );
    },
    close() {
      runner.close();
    },
  }));
}
