import assert from "node:assert/strict";
import { accessoryChallengeVerdict, createAccessoryChallenges } from "./accessory-challengers.mjs";
import { simulationHash } from "./simulation-cache.mjs";
import { assertIndependentSeedRanges } from "./simulation-seeds.mjs";

export function accessoryFeedbackSettings(baseline, review, audit, db, sources) {
  assert.equal(review.status, "closed-loop-verified");
  assert.equal(review.baselineSha256, simulationHash(baseline));
  assert.equal(audit.schema, "kfc-accessory-challenger-audit.v1");
  assert.equal(audit.status, "challenger-requires-feedback");
  assert.equal(audit.feedbackReviewSha256, simulationHash(review));
  for (const field of ["profile", "variant", "dbSha256"])
    assert.equal(audit[field], baseline[field]);
  assert.equal(audit.dbSha256, simulationHash(db));
  assert.equal(audit.baselineSha256, simulationHash(baseline));
  assert.equal(audit.nativeBinarySha256, review.nativeBinarySha256);
  const best = audit.bestConfirmed;
  assert(best && best.confirmed === true, "No independently confirmed accessory improvement");
  const measured = audit.challenges.find((row) => row.challenge.id === best.challenge.id);
  assert.deepEqual(measured, best, "Unlinked accessory winner");
  const verdict = accessoryChallengeVerdict(best.comparisons);
  for (const [key, value] of Object.entries(verdict)) assert.deepEqual(best[key], value);
  assert(verdict.confirmed, "Accessory gain does not pass both independent ranges");
  assert.deepEqual(
    best.comparisons.map((row) => row.seed),
    audit.validationSeeds,
  );
  assertIndependentSeedRanges([
    ...review.validationSeedRanges,
    { seed: audit.screeningSeed, iterations: audit.screeningIterations },
    ...best.comparisons.map((row) => ({ seed: row.seed, iterations: 100000 })),
  ]);
  const bank = createAccessoryChallenges(baseline, db, sources, audit.kind);
  const legal = bank.candidates.find((entry) => entry.id === best.challenge.id);
  assert.deepEqual(best.challenge, legal, "Accessory winner is not a legal current candidate");
  assert.notEqual(
    legal.id,
    bank.incumbentId,
    "Unchanged accessories cannot produce a new baseline",
  );
  const settings = globalThis.structuredClone(baseline.settings);
  settings.player.equipment = globalThis.structuredClone(legal.gear);
  return settings;
}
