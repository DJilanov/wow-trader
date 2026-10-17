import assert from "node:assert/strict";
import { simulationHash } from "./simulation-cache.mjs";
import {
  decodeTalents,
  encodeTalents,
  selectedTalentEvidence,
  talentProblem,
} from "./talent-search.mjs";

export function assertCompletedTalentEvidence(review, expected, trees, winnerRotations) {
  const { baseline } = expected;
  assert.equal(review.schema, "kfc-talent-search.v1");
  assert.equal(review.status, "simulation-complete-awaiting-browser-review");
  assert.equal(review.baselineSha256, simulationHash(baseline), "Talent evidence baseline changed");
  assert.equal(review.dbSha256, baseline.dbSha256);
  assert.equal(review.gearSha256, simulationHash(baseline.settings.player.equipment));
  assert.equal(review.requestHashEncoding, "json-string");
  assert.equal(review.requestSha256, simulationHash(JSON.stringify(baseline.requestBase64)));
  for (const key of [
    "nativeBinarySha256",
    "algorithmSha256",
    "optimizerSha256",
    "controlBaselineSha256",
    "validationSeedContext",
    "validationIterationsPerSeed",
  ])
    assert.equal(review[key], expected[key], `Completed talent evidence changed: ${key}`);
  assert.equal(review.treeSha256, simulationHash(trees));
  assert.equal(
    review.original?.talents,
    encodeTalents(decodeTalents(trees, baseline.settings.player.talentsString)),
  );
  const selection = selectedTalentEvidence(review, baseline);
  for (const candidate of [review.winner, selection])
    assert.equal(talentProblem(trees, decodeTalents(trees, candidate.talents)), "");
  assert(
    winnerRotations.some(
      (rotation) => simulationHash(rotation) === simulationHash(review.winner.rotation.value),
    ),
    "Completed winner has an untested rotation",
  );
  assert(
    review.validation.every((row) =>
      [row.baseline, row.candidate].every(
        (metric) => metric.iterations === expected.validationIterationsPerSeed,
      ),
    ),
    "Completed talent precision changed",
  );
  assert(Array.isArray(review.history) && review.history.length > 0 && review.history.length <= 8);
  assert(Array.isArray(review.finalists) && review.finalists.length > 0);
  for (const candidate of review.finalists) {
    assert.equal(talentProblem(trees, decodeTalents(trees, candidate.talents)), "");
    assert(
      Number.isFinite(candidate.dps) &&
        candidate.dps > 0 &&
        Number.isFinite(candidate.stdev) &&
        candidate.stdev >= 0 &&
        candidate.iterations >= 10000,
    );
  }
}
