import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertPaladinLightHealingJob,
  parsePaladinLightHealingJobReply,
} from "./paladin-healing-light-protocol.mjs";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);
const light = {
  schema: "kfc-paladin-blessing-of-light-policy.v1",
  scaling: "coefficient-factor",
  multiplierOrder: "after-healing-light",
  assignments: [{ raidIndex: 1, spellId: 19979 }],
};

test("Paladin target-buff boundary retains the actual captured job and validates both scaling cases", () => {
  assertPaladinLightHealingJob(fixture.request);
  assert.deepEqual(
    parsePaladinLightHealingJobReply(JSON.stringify(fixture.reply), fixture.request.id),
    fixture.reply,
  );
  for (const scaling of ["full-tooltip-reference", "coefficient-factor"])
    assertPaladinLightHealingJob({
      ...fixture.request,
      workload: { ...fixture.request.workload, blessingOfLight: { ...light, scaling } },
    });
});

test("Paladin target-buff boundary rejects unknown, nonfinite, stacking and absent-player assignments", () => {
  for (const mutate of [
    (p) => {
      p.assignments[0].raidIndex = Number.NaN;
    },
    (p) => {
      p.assignments[0].raidIndex = null;
    },
    (p) => {
      p.assignments[0].raidIndex = 39;
    },
    (p) => {
      p.assignments[0].spellId = 25292;
    },
    (p) => {
      p.assignments.push(p.assignments[0]);
    },
    (p) => {
      p.assignments = [];
    },
    (p) => {
      p.scaling = "server-verified";
    },
    (p) => {
      p.multiplierOrder = "unknown";
    },
    (p) => {
      p.extra = 1;
    },
    (p) => {
      p.assignments[0].extra = 1;
    },
  ]) {
    const policy = structuredClone(light);
    mutate(policy);
    assert.throws(() =>
      assertPaladinLightHealingJob({
        ...fixture.request,
        workload: { ...fixture.request.workload, blessingOfLight: policy },
      }),
    );
  }
  assert.throws(() =>
    assertPaladinLightHealingJob({
      ...fixture.request,
      workload: { ...fixture.request.workload, blessingOfLight: null },
    }),
  );
});
