import { isDeepStrictEqual } from "node:util";
import { openPaladinAssignmentHealingNativeRunners } from "./paladin-assignment-native-runner.mjs";
import {
  assertPaladinLegacyHealingJob,
  parsePaladinLegacyHealingJobReply,
} from "./paladin-legacy-protocol.mjs";

/** @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?:number,timeoutMs?:number}} options @returns {Promise<object[]>}
 */
export async function openPaladinLegacyHealingNativeRunners(
  binary,
  cwd,
  expectedSha256,
  options = {},
) {
  const runners = await openPaladinAssignmentHealingNativeRunners(
    binary,
    cwd,
    expectedSha256,
    options,
  );
  return runners.map((runner) => ({
    binarySha256: runner.binarySha256,
    async run(job) {
      assertPaladinLegacyHealingJob(job);
      const reply = await runner.run(job),
        parsed = parsePaladinLegacyHealingJobReply(
          JSON.stringify(reply),
          job.id,
          job.detail,
          job.workload.assignmentScoring === "external-demand-v1",
        );
      if (
        parsed.status === "complete" &&
        !isDeepStrictEqual(parsed.result.legacyItemsPolicy, job.workload.legacyItemsPolicy)
      )
        throw new Error("Paladin legacy item reference echo differs from request");
      return parsed;
    },
    close() {
      runner.close();
    },
  }));
}
