import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertPaladinHealingJob,
  parsePaladinHealingJobReply,
} from "./paladin-healing-protocol.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url), "utf8"),
);

test("actual native Paladin reply preserves declared policies and common healing accounting", () => {
  const before = JSON.stringify(fixture.request);
  assertPaladinHealingJob(fixture.request);
  assert.equal(JSON.stringify(fixture.request), before);
  assert.deepEqual(
    parsePaladinHealingJobReply(JSON.stringify(fixture.reply), fixture.request.id),
    fixture.reply,
  );
  assert.equal(fixture.reply.result.effectiveHealingHps, 93.33333333333333);
  assert.equal(fixture.reply.result.publicationAllowed, false);
});

test("rejects foreign schemas and nonfinite or undeclared workload inputs before serialization", () => {
  for (const change of [
    (job) => {
      job.schema = "kfc-druid-healing-job.v1";
    },
    (job) => {
      job.workload.allowConditionalSpellCandidates = false;
    },
    (job) => {
      job.workload.rankScaling = null;
    },
    (job) => {
      job.workload.rankScaling.coefficientLossPerLevel = 0.1;
    },
    (job) => {
      job.workload.vigilRefundMode = "unknown";
    },
    (job) => {
      job.workload.targets[0].x = Number.NaN;
    },
    (job) => {
      job.workload.targets[1].raidIndex = 0;
    },
    (job) => {
      job.workload.priorities[0].minimumMissingHealth = Number.POSITIVE_INFINITY;
    },
    (job) => {
      job.workload.cooldowns = [{ itemId: 13444, spellId: 20216 }];
    },
  ]) {
    const job = structuredClone(fixture.request);
    change(job);
    assert.throws(() => assertPaladinHealingJob(job));
  }
});

test("rejects wrong identity, policy namespace and inconsistent results", () => {
  assert.throws(() => parsePaladinHealingJobReply(JSON.stringify(fixture.reply), "wrong-id"));
  for (const change of [
    (reply) => {
      reply.schema = "kfc-healing-job-result.v1";
    },
    (reply) => {
      reply.result.rawHps += 1;
    },
    (reply) => {
      reply.result.rankScaling.schema = "kfc-priest-rank-sensitivity.v1";
    },
    (reply) => {
      reply.result.vigilRefundMode = "unknown";
    },
    (reply) => {
      reply.result.classQualified = true;
    },
  ]) {
    const reply = structuredClone(fixture.reply);
    change(reply);
    assert.throws(() => parsePaladinHealingJobReply(JSON.stringify(reply), fixture.request.id));
  }
});

test("structured errors remain errors and cannot contain a successful result", () => {
  const reply = {
    schema: "kfc-paladin-healing-job-result.v1",
    id: "failed",
    status: "error",
    error: { code: "workload_failed", message: "Rank is outside pre-raid domain" },
  };
  assert.deepEqual(parsePaladinHealingJobReply(JSON.stringify(reply), "failed"), reply);
  assert.throws(() =>
    parsePaladinHealingJobReply(
      JSON.stringify({ ...reply, result: fixture.reply.result }),
      "failed",
    ),
  );
});
