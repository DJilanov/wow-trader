import assert from "node:assert/strict";

/** Compare four independently seeded, equally sized paired healing batches.
 * Positive missing-health differences mean the selected plan performed worse.
 * @param {number[]} selected @param {number[]} contender
 * @returns {{relativeDifference:number,meanDifference:number,monteCarlo95Interval:[number,number]}}
 */
export function comparePairedHealingBatches(selected, contender) {
  assert(Array.isArray(selected) && Array.isArray(contender));
  assert.equal(selected.length, 4, "Four independent batches are required");
  assert.equal(contender.length, 4, "Paired batches must have equal sizes");
  assert([...selected, ...contender].every((value) => Number.isFinite(value) && value >= 0));
  let meanDifference = 0,
    squaredDeviations = 0,
    contenderMean = 0;
  for (let index = 0; index < 4; index++) {
    const difference = selected[index] - contender[index],
      delta = difference - meanDifference;
    meanDifference += delta / (index + 1);
    squaredDeviations += delta * (difference - meanDifference);
    contenderMean += (contender[index] - contenderMean) / (index + 1);
  }
  const margin = 3.182446305284263 * Math.sqrt(Math.max(0, squaredDeviations) / 3 / 4),
    denominator = Math.max(1, contenderMean),
    lower = (meanDifference - margin) / denominator,
    upper = (meanDifference + margin) / denominator;
  assert([meanDifference, margin, lower, upper].every(Number.isFinite));
  return {
    relativeDifference: meanDifference / denominator,
    meanDifference,
    monteCarlo95Interval: [lower, upper],
  };
}
