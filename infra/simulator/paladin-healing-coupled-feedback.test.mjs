import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPaladinCoupledTrainingSeeds } from "./paladin-healing-coupled-feedback.mjs";

function candidate(id, { gear = id, survival = 0, delivered = 70, missing = 20, hps = 10 } = {}) {
  const feasible = survival === 1 && delivered === 100;
  const summary = {
    survivalRate: survival,
    deliveredIncomingDamageMean: delivered,
    meanMissingHealth: missing,
    manaBlockedSecondsMean: 2,
    finalMissingHealthMean: 3,
    hps,
    feasible,
  };
  return {
    optionId: id.repeat(64),
    gearId: gear.repeat(64),
    summaries: [{ ...summary }, { ...summary }],
    feasible,
    meanMissingHealth: missing,
  };
}
function source(rows, selected = null) {
  return { measured: rows, selected, sourceSelectedOptionId: rows[0].optionId };
}

test("failed training produces exploratory seeds without inventing a recommendation", () => {
  const rows = [
      candidate("a"),
      candidate("b", { delivered: 80 }),
      candidate("c", { delivered: 90 }),
    ],
    result = source(rows),
    before = structuredClone(result);
  const value = selectPaladinCoupledTrainingSeeds({ result, plannedDamage: 100 });
  assert.equal(value.sourceTrainingWinnerId, null);
  assert.equal(value.noSourceSurvivors, true);
  assert.equal(value.seeds[0].optionId, rows[2].optionId);
  assert(value.seeds.every((row) => row.feedbackOnly && !row.recommendation));
  assert.equal(value.publicationAllowed, false);
  assert.deepEqual(result, before);
});
test("survival and delivered demand beat a high HPS result from a collapsed assignment", () => {
  const rows = [
    candidate("a", { hps: 99999, delivered: 20, missing: 0 }),
    candidate("b", { survival: 0.5, delivered: 70 }),
    candidate("c", { survival: 0.5, delivered: 90 }),
  ];
  const value = selectPaladinCoupledTrainingSeeds({ result: source(rows), plannedDamage: 100 });
  assert.deepEqual(
    value.seeds.map((row) => row.optionId),
    [rows[2].optionId, rows[1].optionId, rows[0].optionId],
  );
});
test("retain the exact training winner, diverse gears and the original incumbent", () => {
  const rows = [
    candidate("a", { gear: "a", survival: 1, delivered: 100, missing: 30 }),
    candidate("b", { gear: "b", survival: 1, delivered: 100, missing: 10 }),
    candidate("c", { gear: "b", survival: 1, delivered: 100, missing: 11 }),
    candidate("d", { gear: "d", survival: 1, delivered: 100, missing: 12 }),
  ];
  const value = selectPaladinCoupledTrainingSeeds({
    result: source(rows, rows[2]),
    plannedDamage: 100,
    maximumDistinctGears: 2,
  });
  assert.equal(value.seeds[0].optionId, rows[2].optionId);
  assert(value.seeds.some((row) => row.optionId === rows[3].optionId));
  assert(value.seeds.some((row) => row.optionId === rows[0].optionId));
  assert(value.seeds.length <= 3);
});
test("unmeasured incumbents, fabricated feasibility and invalid delivery are rejected", () => {
  const rows = [candidate("a"), candidate("b")];
  for (const mutate of [
    (result) => {
      result.sourceSelectedOptionId = "f".repeat(64);
    },
    (result) => {
      result.measured[0].feasible = true;
    },
    (result) => {
      result.measured[0].summaries[0].deliveredIncomingDamageMean = 101;
    },
    (result) => {
      result.selected = result.measured[0];
    },
  ]) {
    const result = source(structuredClone(rows));
    mutate(result);
    assert.throws(() => selectPaladinCoupledTrainingSeeds({ result, plannedDamage: 100 }));
  }
});
