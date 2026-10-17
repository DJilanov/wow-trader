import assert from "node:assert/strict";
import { assertIndependentSeedRanges } from "./simulation-seeds.mjs";

export async function runIndependentValidation(cache, baseline, candidate, seeds, iterations) {
  assert.equal(seeds.length, 2, "Two validation ranges required");
  assertIndependentSeedRanges(seeds.map((seed) => ({ seed, iterations })));
  const inputs = seeds.flatMap((seed) =>
    [baseline, candidate].map((alternative) => {
      assert.equal(alternative.id, undefined, "Simulation cache owns validation IDs");
      const { detail = false, ...request } = alternative;
      // Preserve the established job field order so matching measurements retain
      // their cache identities when serial checks become one worker-pool batch.
      return { ...request, iterations, seed, detail };
    }),
  );
  const results = await cache.run(inputs);
  assert.equal(results.length, inputs.length, "Incomplete independent validation batch");
  return seeds.map((seed, index) => ({
    seed,
    baseline: results[index * 2],
    candidate: results[index * 2 + 1],
  }));
}
