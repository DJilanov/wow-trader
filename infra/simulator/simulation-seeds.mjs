import assert from "node:assert/strict";

export const validationSeedPolicy = "kfc-disjoint-rng-ranges.v1";
export function parseValidationIterations(value) {
  const count = Number(value ?? 20000);
  assert([20000, 100000].includes(count), "Use --validation-iterations=20000 or 100000");
  return count;
}
export const selectionSeedRanges = Object.freeze([
  Object.freeze({ label: "adaptive selection", seed: 1337, iterations: 4000 }),
  Object.freeze({ label: "finalist selection", seed: 77191, iterations: 10000 }),
]);

export function independentValidationSeeds(context, stage) {
  assert(typeof context === "string" && /^[a-f0-9]{64}$/.test(context), "Invalid seed context");
  const offsets = { talents: 0, gear: 200000, rotation: 400000, proc: 600000 };
  assert(Object.hasOwn(offsets, stage), "Unknown validation stage");
  // core/sim.go reseedRands uses starting seed + iteration. Reserve separate
  // 100k ranges per check and a million-seed arena per hashed experiment.
  const start = 100000000 + Number.parseInt(context.slice(0, 8), 16) * 1000000 + offsets[stage];
  return [start, start + 100000];
}

export function assertIndependentSeedRanges(ranges) {
  const ordered = ranges
    .map((range) => {
      assert(
        Number.isSafeInteger(range.seed) &&
          range.seed > 0 &&
          Number.isSafeInteger(range.iterations) &&
          range.iterations > 0 &&
          Number.isSafeInteger(range.seed + range.iterations),
        "Invalid RNG seed range",
      );
      return { ...range, end: range.seed + range.iterations };
    })
    .sort((a, b) => a.seed - b.seed);
  for (let index = 1; index < ordered.length; index++)
    assert(
      ordered[index - 1].end <= ordered[index].seed,
      `Overlapping RNG seed ranges: ${ordered[index - 1].label ?? ordered[index - 1].seed} and ${ordered[index].label ?? ordered[index].seed}`,
    );
}

export function assertValidationSeeds(evidence, stage) {
  assert.equal(
    evidence.validationSeedPolicy,
    validationSeedPolicy,
    "Legacy validation needs disjoint-range rerun",
  );
  const expected = independentValidationSeeds(evidence.validationSeedContext, stage);
  assert.equal(evidence.validation?.length, 2, "Two validation ranges required");
  const ranges = evidence.validation.map((row, index) => {
    assert.equal(row.seed, expected[index], "Validation seed differs from its experiment context");
    assert(
      [row.baseline, row.candidate].every(
        (metric) => Number.isSafeInteger(metric?.iterations) && metric.iterations >= 20000,
      ),
      "Incomplete validation iteration count",
    );
    const iterations = Math.max(row.baseline.iterations, row.candidate.iterations);
    assert(iterations <= 100000, "Validation exceeded its reserved seed range");
    return { label: `${stage} validation ${index + 1}`, seed: row.seed, iterations };
  });
  assertIndependentSeedRanges([...selectionSeedRanges, ...ranges]);
  return ranges;
}
