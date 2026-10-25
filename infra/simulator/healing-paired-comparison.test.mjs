import assert from "node:assert/strict";
import test from "node:test";
import { comparePairedHealingBatches } from "./healing-paired-comparison.mjs";

test("paired healing estimates use batch differences and the four-batch t interval", () => {
  const result = comparePairedHealingBatches([10, 12, 14, 16], [8, 8, 8, 8]),
    margin = (3.182446305284263 * Math.sqrt(20 / 3 / 4)) / 8;
  assert.equal(result.meanDifference, 5);
  assert.equal(result.relativeDifference, 5 / 8);
  assert(Math.abs(result.monteCarlo95Interval[0] - (5 / 8 - margin)) < 1e-12);
  assert(Math.abs(result.monteCarlo95Interval[1] - (5 / 8 + margin)) < 1e-12);
});

test("paired healing preserves equal observations and finite zero-demand normalization", () => {
  assert.deepEqual(comparePairedHealingBatches([1, 100, 1000, 10000], [1, 100, 1000, 10000]), {
    meanDifference: 0,
    relativeDifference: 0,
    monteCarlo95Interval: [0, 0],
  });
  assert.equal(comparePairedHealingBatches([0, 0, 0, 0], [0, 0, 0, 0]).relativeDifference, 0);
  assert.equal(comparePairedHealingBatches([1, 1, 1, 1], [0, 0, 0, 0]).relativeDifference, 1);
  assert.equal(
    comparePairedHealingBatches([8, 8, 8, 8], [10, 10, 10, 10]).relativeDifference,
    -0.2,
  );
});

test("paired healing rejects missing, unpaired and nonfinite evidence", () => {
  const valid = [1, 2, 3, 4];
  for (const invalid of [[], [1, 2, 3], [1, 2, 3, 4, 5], [1, NaN, 3, 4], [1, -1, 3, 4]]) {
    assert.throws(() => comparePairedHealingBatches(invalid, valid));
    assert.throws(() => comparePairedHealingBatches(valid, invalid));
  }
  assert.throws(() => comparePairedHealingBatches([Number.MAX_VALUE, 0, 0, 0], valid));
});
