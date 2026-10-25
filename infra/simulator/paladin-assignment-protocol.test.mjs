import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPaladinAssignmentHealingJob,
  parsePaladinAssignmentHealingJobReply,
} from "./paladin-assignment-protocol.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);
const assignment = {
  schema: "kfc-paladin-external-assignment.v1",
  supportHpsMean: 120,
  supportHpsStdev: 10,
  healthRestoredHpsMean: 100,
  absorbedHpsMean: 20,
  damageDemandMean: 15000,
  overkillExcludedMean: 0,
  externalMissingHealthSecondsMean: 15,
  finalExternalMissingHealthMean: 20,
};

test("Paladin assignment transport preserves old jobs and validates explicit scores", () => {
  assertPaladinAssignmentHealingJob(fixture.request);
  assert.deepEqual(
    parsePaladinAssignmentHealingJobReply(
      JSON.stringify(fixture.reply),
      fixture.request.id,
      fixture.request.detail,
    ),
    fixture.reply,
  );
  const job = structuredClone(fixture.request);
  job.workload.assignmentScoring = "external-demand-v1";
  assertPaladinAssignmentHealingJob(job);
  const reply = structuredClone(fixture.reply);
  reply.result.assignment = assignment;
  assert.deepEqual(
    parsePaladinAssignmentHealingJobReply(JSON.stringify(reply), job.id, job.detail, true).result
      .assignment,
    assignment,
  );
});

test("Paladin assignment transport rejects malformed policy and absent or inconsistent scores", () => {
  for (const policy of [null, false, 1, {}, [], "other"]) {
    const job = structuredClone(fixture.request);
    job.workload.assignmentScoring = policy;
    assert.throws(() => assertPaladinAssignmentHealingJob(job));
  }
  for (const value of [
    undefined,
    null,
    {},
    { ...assignment, schema: "other" },
    { ...assignment, supportHpsMean: 121 },
    { ...assignment, overkillExcludedMean: -1 },
    { ...assignment, supportHpsStdev: "10" },
    { ...assignment, finalExternalMissingHealthMean: Infinity },
  ]) {
    const reply = structuredClone(fixture.reply);
    reply.result.assignment = value;
    assert.throws(() =>
      parsePaladinAssignmentHealingJobReply(
        JSON.stringify(reply),
        fixture.request.id,
        fixture.request.detail,
        true,
      ),
    );
  }
});
