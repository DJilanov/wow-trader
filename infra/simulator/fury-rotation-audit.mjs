import assert from "node:assert/strict";
import { simulationHash } from "./simulation-cache.mjs";
import { statisticallyBetter } from "./prebis-pool.mjs";
import { assertValidationSeeds } from "./simulation-seeds.mjs";

function checkedMetric(metric, iterations) {
  assert(
    metric &&
      Number.isSafeInteger(metric.iterations) &&
      metric.iterations >= iterations &&
      Number.isFinite(metric.dps) &&
      metric.dps > 0 &&
      Number.isFinite(metric.stdev) &&
      metric.stdev >= 0,
    "Incomplete rotation measurement",
  );
}

export function reviewedFuryRotation(review, baseline, policies) {
  assert.equal(`${baseline.profile}/${baseline.variant}`, "warrior/fury");
  return reviewedWarriorRotation(review, baseline, policies);
}

export function reviewedWarriorRotation(review, baseline, policies) {
  assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
  assert.equal(review.schema, `kfc-${baseline.variant}-rotation-audit.v1`);
  assert.equal(review.baselineSha256, simulationHash(baseline), "Stale rotation baseline");
  assert.equal(review.dbSha256, baseline.dbSha256);
  assert.equal(review.revision, baseline.revision);
  assert.equal(review.talents, baseline.settings.player.talentsString);
  assert.equal(review.policySetSha256, simulationHash(policies), "Rotation policy set changed");
  const hashes = new Set(policies.map((policy) => simulationHash(policy.value)));
  assert.equal(hashes.size, policies.length, "Repeated rotation policy");
  assert.equal(review.screen.length, policies.length, "Incomplete rotation coverage");
  assert.equal(new Set(review.screen.map((row) => row.rotationSha256)).size, hashes.size);
  for (const row of review.screen) {
    assert(hashes.has(row.rotationSha256), "Unreviewed rotation policy");
    checkedMetric(row, 1000);
  }
  const originalHash = simulationHash(baseline.settings.player.rotation);
  const winnerHash = simulationHash(review.winner.rotation.value);
  assert(hashes.has(originalHash) && hashes.has(winnerHash));
  assert(review.finalists.length >= Math.min(2, policies.length));
  for (const row of review.finalists) {
    assert(hashes.has(row.rotationSha256));
    checkedMetric(row, 10000);
  }
  assert.equal(
    new Set(review.finalists.map((row) => row.rotationSha256)).size,
    review.finalists.length,
  );
  const expectedFinalists = new Set([
    originalHash,
    ...[...review.screen]
      .sort((a, b) => b.dps - a.dps)
      .slice(0, 16)
      .map((row) => row.rotationSha256),
  ]);
  assert.equal(review.finalists.length, expectedFinalists.size, "Finalist coverage changed");
  assert(review.finalists.every((row) => expectedFinalists.has(row.rotationSha256)));
  assert(
    review.finalists.every((row, index) => !index || review.finalists[index - 1].dps >= row.dps),
  );
  assert(review.finalists.some((row) => row.rotationSha256 === originalHash));
  assert.equal(review.finalists[0].rotationSha256, winnerHash, "Winner differs from final ranking");
  assert.equal(review.validation.length, 2, "Two independent rotation validation seeds required");
  assertValidationSeeds(review, "rotation");
  assert.equal(new Set(review.validation.map((row) => row.seed)).size, 2);
  for (const row of review.validation) {
    assert(Number.isSafeInteger(row.seed) && row.seed > 0);
    assert(
      ![review.screenSeed, review.finalistSeed].includes(row.seed),
      "Validation reused a selection seed",
    );
    checkedMetric(row.baseline, 20000);
    checkedMetric(row.candidate, 20000);
    assert.equal(row.baseline.rotationSha256, originalHash);
    assert.equal(row.candidate.rotationSha256, winnerHash);
  }
  const proven = review.validation.every((row) => statisticallyBetter(row.candidate, row.baseline));
  if (proven)
    assert.notEqual(originalHash, winnerHash, "An unchanged rotation cannot establish a gain");
  assert.equal(review.validated, proven, "Rotation gain flag contradicts its measurements");
  const expected = proven ? winnerHash : originalHash;
  assert.equal(
    simulationHash(review.selection.rotation.value),
    expected,
    "Unvalidated rotation change",
  );
  return review.selection;
}
