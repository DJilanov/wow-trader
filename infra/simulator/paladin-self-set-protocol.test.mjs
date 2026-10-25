import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPaladinSelfSetHealingJob,
  parsePaladinSelfSetHealingJobReply,
} from "./paladin-self-set-protocol.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);

test("Paladin self-set transport preserves old jobs and explicit false/zero references", () => {
  assertPaladinSelfSetHealingJob(fixture.request);
  assert.deepEqual(
    parsePaladinSelfSetHealingJobReply(
      JSON.stringify(fixture.reply),
      fixture.request.id,
      fixture.request.detail,
    ),
    fixture.reply,
  );
  for (const policy of [
    { thresholdTiming: "before-hit" },
    { regenerationTickMs: 5000 },
    { selfDamageTriggers: false },
    { devoutProcChance: 0 },
  ]) {
    const job = structuredClone(fixture.request);
    job.workload.selfSetPolicy = policy;
    assertPaladinSelfSetHealingJob(job);
    const reply = structuredClone(fixture.reply);
    reply.result.selfSetPolicy = policy;
    assert.deepEqual(
      parsePaladinSelfSetHealingJobReply(JSON.stringify(reply), job.id, job.detail).result
        .selfSetPolicy,
      policy,
    );
  }
});

test("Paladin self-set transport rejects malformed jobs and result policies", () => {
  for (const policy of [
    null,
    [],
    {},
    1,
    { unknown: 1 },
    { thresholdTiming: null },
    { thresholdTiming: "later" },
    { regenerationTickMs: 3000 },
    { regenerationTickMs: "2000" },
    { selfDamageTriggers: 0 },
    { devoutProcChance: -1 },
    { devoutProcChance: 1.01 },
    { devoutProcChance: NaN },
    { devoutProcChance: Infinity },
  ]) {
    const job = structuredClone(fixture.request);
    job.workload.selfSetPolicy = policy;
    assert.throws(() => assertPaladinSelfSetHealingJob(job));
    const reply = structuredClone(fixture.reply);
    reply.result.selfSetPolicy = policy;
    assert.throws(() =>
      parsePaladinSelfSetHealingJobReply(JSON.stringify(reply), job.id, job.detail),
    );
  }
});
