import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { assertDruidHealingJob, parseDruidHealingJobReply } from "./druid-healing-protocol.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/druid-healing-job-response.v1.json", import.meta.url), "utf8"),
);

test("actual native/browser Druid job preserves its separate schema and common accounting", () => {
  const { request, reply } = fixture;
  const before = JSON.stringify(request);
  assertDruidHealingJob(request);
  assert.equal(JSON.stringify(request), before);
  assert.deepEqual(parseDruidHealingJobReply(JSON.stringify(reply), request.id), reply);
  assert.equal(reply.result.publicationAllowed, false);
});

test("Priest schemas, wrong identifiers and inconsistent Druid healing cannot enter the study", () => {
  assert.throws(() => assertDruidHealingJob({ ...fixture.request, schema: "kfc-healing-job.v1" }));
  assert.throws(() => parseDruidHealingJobReply(JSON.stringify(fixture.reply), "another-job"));
  assert.throws(() =>
    parseDruidHealingJobReply(
      JSON.stringify({ ...fixture.reply, schema: "kfc-healing-job-result.v1" }),
      fixture.request.id,
    ),
  );
  const reply = JSON.parse(JSON.stringify(fixture.reply));
  reply.result.rawHps += 1;
  assert.throws(() => parseDruidHealingJobReply(JSON.stringify(reply), fixture.request.id));
});

test("Druid errors require the common error contract and do not masquerade as results", () => {
  const reply = {
    schema: "kfc-druid-healing-job-result.v1",
    id: "failed",
    status: "error",
    error: { code: "workload_failed", message: "Unavailable talent" },
  };
  assert.deepEqual(parseDruidHealingJobReply(JSON.stringify(reply), "failed"), reply);
  assert.throws(() =>
    parseDruidHealingJobReply(JSON.stringify({ ...reply, result: fixture.reply.result }), "failed"),
  );
});
