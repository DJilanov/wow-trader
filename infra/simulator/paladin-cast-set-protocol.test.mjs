import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPaladinCastSetHealingJob,
  parsePaladinCastSetHealingJobReply,
} from "./paladin-cast-set-protocol.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);

test("Paladin cast-set transport preserves old jobs and explicit false/zero references", () => {
  assertPaladinCastSetHealingJob(fixture.request);
  assert.deepEqual(
    parsePaladinCastSetHealingJobReply(
      JSON.stringify(fixture.reply),
      fixture.request.id,
      fixture.request.detail,
    ),
    fixture.reply,
  );
  for (const policy of [
    { wildheartManaChance: 0 },
    { spellPowerChance: 1 },
    { dreadmistCanCrit: false },
  ]) {
    const job = structuredClone(fixture.request);
    job.workload.castSetPolicy = policy;
    assertPaladinCastSetHealingJob(job);
    const reply = structuredClone(fixture.reply);
    reply.result.castSetPolicy = policy;
    assert.deepEqual(
      parsePaladinCastSetHealingJobReply(JSON.stringify(reply), job.id, job.detail).result
        .castSetPolicy,
      policy,
    );
  }
});

test("Paladin cast-set transport rejects malformed jobs and result policies", () => {
  for (const policy of [
    null,
    [],
    {},
    1,
    { unknown: 1 },
    { wildheartManaChance: null },
    { wildheartManaChance: -1 },
    { spellPowerChance: 1.01 },
    { spellPowerChance: NaN },
    { spellPowerChance: Infinity },
    { dreadmistCanCrit: 1 },
  ]) {
    const job = structuredClone(fixture.request);
    job.workload.castSetPolicy = policy;
    assert.throws(() => assertPaladinCastSetHealingJob(job));
    const reply = structuredClone(fixture.reply);
    reply.result.castSetPolicy = policy;
    assert.throws(() =>
      parsePaladinCastSetHealingJobReply(JSON.stringify(reply), job.id, job.detail),
    );
  }
});
