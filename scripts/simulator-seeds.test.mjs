import assert from "node:assert/strict";
import { test } from "node:test";
import {
  independentValidationSeeds,
  assertIndependentSeedRanges,
  assertValidationSeeds,
  selectionSeedRanges,
  validationSeedPolicy,
  parseValidationIterations,
} from "../infra/simulator/simulation-seeds.mjs";

test("validation precision is an explicit supported choice without changing selection trials", () => {
  assert.equal(parseValidationIterations(undefined), 20000);
  assert.equal(parseValidationIterations("20000"), 20000);
  assert.equal(parseValidationIterations("100000"), 100000);
  for (const input of [0, -1, 20001, 50000, 100001, "NaN", "", "20k"])
    assert.throws(() => parseValidationIterations(input), /validation-iterations/);
});

test("experiment-derived stage namespaces reserve disjoint safe-integer iteration ranges", () => {
  for (const context of ["0".repeat(64), "a".repeat(64), "f".repeat(64)]) {
    const ranges = [...selectionSeedRanges];
    for (const stage of ["talents", "gear", "rotation", "proc"]) {
      const seeds = independentValidationSeeds(context, stage);
      assert.deepEqual(independentValidationSeeds(context, stage), seeds);
      assert.equal(seeds[1] - seeds[0], 100000);
      assert.deepEqual(JSON.parse(JSON.stringify(seeds)), seeds);
      ranges.push(...seeds.map((seed) => ({ seed, iterations: 20000 })));
    }
    assertIndependentSeedRanges(ranges);
  }
  assert.throws(() => independentValidationSeeds("invalid", "gear"));
  assert.throws(() => independentValidationSeeds("a".repeat(64), "unknown"));
});

test("distinct starting seeds do not excuse the actual legacy overlapping iteration intervals", () => {
  assert.throws(
    () =>
      assertIndependentSeedRanges([
        { seed: 77191, iterations: 10000 },
        { seed: 61357, iterations: 20000 },
      ]),
    /Overlapping RNG seed ranges/,
  );
  assert.throws(
    () =>
      assertIndependentSeedRanges([
        { seed: 99173, iterations: 20000 },
        { seed: 48211, iterations: 20000 },
        { seed: 29531, iterations: 20000 },
        { seed: 61357, iterations: 20000 },
      ]),
    /Overlapping RNG seed ranges/,
  );
  const adjacent = [
    { seed: 10, iterations: 20 },
    { seed: 30, iterations: 20 },
  ];
  const original = globalThis.structuredClone(adjacent);
  assertIndependentSeedRanges(adjacent);
  assert.deepEqual(adjacent, original);
  for (const seed of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])
    assert.throws(() => assertIndependentSeedRanges([{ seed, iterations: 20 }]));
});

test("validation provenance rejects legacy policies, seed substitution and range overflow", () => {
  const evidence = {
    validationSeedPolicy,
    validationSeedContext: "b".repeat(64),
    validation: independentValidationSeeds("b".repeat(64), "gear").map((seed) => ({
      seed,
      baseline: { iterations: 20000 },
      candidate: { iterations: 20000 },
    })),
  };
  assert.equal(assertValidationSeeds(evidence, "gear").length, 2);
  for (const change of [
    (input) => delete input.validationSeedPolicy,
    (input) => (input.validationSeedContext = "c".repeat(64)),
    (input) => (input.validation[1].seed = input.validation[0].seed),
    (input) => (input.validation[0].candidate.iterations = 100001),
    (input) => (input.validation[0].baseline.iterations = 1000),
  ]) {
    const input = globalThis.structuredClone(evidence);
    change(input);
    assert.throws(() => assertValidationSeeds(input, "gear"));
  }
});
