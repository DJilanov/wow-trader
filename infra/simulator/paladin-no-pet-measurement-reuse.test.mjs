import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reusePaladinNoPetMeasurement } from "./paladin-no-pet-measurement-reuse.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/paladin-no-pet-measurement-reuse.v1.json.gz", import.meta.url),
    ),
  ),
);

test("verified strict-player measurements retain their actual execution origin", () => {
  const original = structuredClone(fixture.row),
    result = reusePaladinNoPetMeasurement(fixture.row, fixture.proof);
  assert.deepEqual(fixture.row, original);
  assert.notEqual(result.key, original.key);
  assert.equal(
    result.key,
    simulationHash({
      runtimeSha256: fixture.proof.targetBinarySha256,
      requestBase64: original.requestBase64,
      workloadSha256: original.workloadSha256,
      detail: original.detail,
    }),
  );
  assert.equal(result.origin.executedOnTarget, false);
  assert.equal(result.origin.sourceKey, original.key);
  assert.equal(result.origin.sourceRuntimeSha256, original.runtimeSha256);
  assert.deepEqual(result.reply.result, original.reply.result);
  assert.equal(result.reply.id, "h-" + result.key.slice(0, 32));
  assert.deepEqual(reusePaladinNoPetMeasurement(fixture.row, fixture.proof), result);
});

test("unknown runtime,changed source result or unqualified compatibility cannot be reused", () => {
  for (const change of [
    (value) => {
      value.row.key = "0".repeat(64);
    },
    (value) => {
      value.row.runtimeSha256 = "0".repeat(64);
    },
    (value) => {
      value.row.origin = {};
    },
    (value) => {
      value.row.reply.id = "other";
    },
    (value) => {
      value.row.reply.result.assignment = undefined;
    },
    (value) => {
      value.proof.qualification.classMechanicsAdmission = false;
    },
    (value) => {
      value.proof.qualification.parentNoPetCompatibility.globalHandlersChanged = true;
    },
    (value) => {
      value.proof.qualification.parentNoPetCompatibility.allParentMeasurementGroupsPreserved = false;
    },
    (value) => {
      value.proof.qualification.parentNoPetCompatibility.parentIdentity = "0".repeat(64);
    },
    (value) => {
      value.proof.qualification.identity = "0".repeat(64);
    },
  ]) {
    const value = structuredClone(fixture);
    change(value);
    assert.throws(() => reusePaladinNoPetMeasurement(value.row, value.proof));
  }
});
