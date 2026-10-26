import assert from "node:assert/strict";
import test from "node:test";
import { selectPaladinHealingSurvivalTraining } from "./paladin-healing-survival-selection.mjs";

const candidate = (optionId, meanMissingHealth, blocked = 0, final = 100, feasible = true) => ({
  optionId,
  meanMissingHealth,
  feasible,
  summaries: [0, 1].map(() => ({
    feasible,
    meanMissingHealth,
    manaBlockedSecondsMean: blocked,
    finalMissingHealthMean: final,
  })),
});

test("reserve selection can trade less than 1% mean deficit for less mana blocking", () => {
  const greedy = candidate("greedy", 1000, 5),
    reserve = candidate("reserve", 1005, 0),
    result = selectPaladinHealingSurvivalTraining([greedy, reserve]);
  assert.equal(result.selected.optionId, "reserve");
  assert.equal(result.bestMeanMissingHealth, 1000);
  assert.equal(result.trainingRelativeBand, 0.01);
  assert.equal(result.independentConfirmationRequired, true);
  assert.equal(result.publicationAllowed, false);
});

test("reserve preference cannot waive survival or escape the declared performance band", () => {
  const winner = candidate("winner", 1000, 5),
    outside = candidate("outside", 1011),
    dead = candidate("dead", 900, 0, 0, false);
  assert.equal(
    selectPaladinHealingSurvivalTraining([outside, dead, winner]).selected.optionId,
    "winner",
  );
  assert.throws(() => selectPaladinHealingSurvivalTraining([dead]));
});

test("worst training batch matters and ties prefer final external health reserve", () => {
  const a = candidate("a", 1000, 0, 300),
    b = candidate("b", 1005, 1, 100);
  a.summaries[1].manaBlockedSecondsMean = 3;
  assert.equal(selectPaladinHealingSurvivalTraining([a, b]).selected.optionId, "b");
  a.summaries[1].manaBlockedSecondsMean = 1;
  a.summaries[0].manaBlockedSecondsMean = 1;
  assert.equal(selectPaladinHealingSurvivalTraining([a, b]).selected.optionId, "b");
});

test("reserve selection is deterministic, preserves inputs and rejects corrupt evidence", () => {
  const rows = [candidate("b", 0), candidate("a", 0)],
    before = structuredClone(rows);
  assert.equal(selectPaladinHealingSurvivalTraining(rows).selected.optionId, "a");
  assert.equal(selectPaladinHealingSurvivalTraining(rows.toReversed()).selected.optionId, "a");
  assert.deepEqual(rows, before);
  assert.throws(() => selectPaladinHealingSurvivalTraining([rows[0], rows[0]]));
  for (const value of [NaN, Infinity, -1, undefined]) {
    const bad = structuredClone(rows);
    bad[0].summaries[0].manaBlockedSecondsMean = value;
    assert.throws(() => selectPaladinHealingSurvivalTraining(bad));
  }
  const dishonest = candidate("x", 1);
  dishonest.summaries[0].feasible = false;
  assert.throws(() => selectPaladinHealingSurvivalTraining([dishonest]));
});
