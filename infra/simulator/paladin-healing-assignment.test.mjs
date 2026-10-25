import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  renderPaladinHealingAssignment,
  paladinHealingAssignmentMetrics,
} from "./paladin-healing-assignment.mjs";

test("Paladin numerical objective uses external support instead of self-inflated totals", () => {
  const result = {
    hps: 5000,
    survivalRate: 1,
    manaRemainingMean: 400,
    manaBlockedSecondsMean: 0,
    assignment: {
      schema: "kfc-paladin-external-assignment.v1",
      supportHpsMean: 300,
      supportHpsStdev: 2,
      absorbedHpsMean: 20,
      healthRestoredHpsMean: 280,
      externalMissingHealthSecondsMean: 50,
      finalExternalMissingHealthMean: 10,
      damageDemandMean: 9010,
    },
  };
  const value = paladinHealingAssignmentMetrics(result);
  assert.equal(value.hps, 300);
  assert.equal(value.effectiveHealingHps, 280);
  assert.equal(value.absorbedHps, 20);
  assert.equal(value.deliveredIncomingDamageMean, 9010);
  assert.equal(result.hps, 5000);
  assert.throws(() => paladinHealingAssignmentMetrics({ ...result, assignment: undefined }));
  assert.throws(() => paladinHealingAssignmentMetrics({ ...result, survivalRate: 2 }));
  assert.throws(() =>
    paladinHealingAssignmentMetrics({
      ...result,
      assignment: { ...result.assignment, supportHpsMean: 5000 },
    }),
  );
});

test("Paladin assignment integration requires exact anchors and preserves legacy summaries", () => {
  const source = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-healing-sets-source.v1.json.gz", import.meta.url)),
    ),
  );
  const output = renderPaladinHealingAssignment(source.integration.workload);
  assert(output.includes('AssignmentScoring string `json:"assignmentScoring,omitempty"`'));
  assert(output.includes("assignment.observeDamage(beforeHealth,result)"));
  assert(output.includes("output.Assignment=assignment.result()"));
  assert(output.includes("output.MissingHealthSecondsMean += beforeMissing * elapsed"));
  assert(output.includes("healer.validateKFCPaladinSetAdmission()"));
  assert.throws(() => renderPaladinHealingAssignment("unexpected parent"));
});
