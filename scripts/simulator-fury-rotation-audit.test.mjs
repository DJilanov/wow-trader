import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reviewedFuryRotation,
  reviewedWarriorRotation,
} from "../infra/simulator/fury-rotation-audit.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

function fixture(proven = true, variant = "fury") {
  const original = { priorityList: [{ action: { castSpell: { spellId: { spellId: 1 } } } }] };
  const alternative = { priorityList: [{ action: { castSpell: { spellId: { spellId: 2 } } } }] };
  const policies = [
    { name: "Exact incumbent", value: original },
    { name: "Alternative", value: alternative },
  ];
  const baseline = {
    profile: "warrior",
    variant,
    dbSha256: "fixture-database",
    revision: "fixture-revision",
    settings: { player: { talentsString: "fixture-talents", rotation: original } },
  };
  const metric = (rotation, dps, iterations) => ({
    rotationSha256: simulationHash(rotation),
    dps,
    iterations,
    stdev: 2,
  });
  const review = {
    schema: `kfc-${variant}-rotation-audit.v1`,
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    revision: baseline.revision,
    talents: baseline.settings.player.talentsString,
    policySetSha256: simulationHash(policies),
    screenSeed: 1337,
    finalistSeed: 77191,
    screen: [metric(alternative, 110, 1000), metric(original, 100, 1000)],
    finalists: [metric(alternative, 110, 10000), metric(original, 100, 10000)],
    winner: { rotation: policies[1] },
    validationSeedContext: "c".repeat(64),
    validationSeedPolicy,
    validation: independentValidationSeeds("c".repeat(64), "rotation").map((seed) => ({
      seed,
      baseline: metric(original, 100, 20000),
      candidate: metric(alternative, proven ? 110 : 100, 20000),
    })),
    validated: proven,
    selection: { rotation: policies[proven ? 1 : 0] },
  };
  return { review, baseline, policies };
}

test("full-policy rotation audit accepts only an independently proven change on identical final gear/talents", () => {
  const { review, baseline, policies } = fixture();
  const original = globalThis.structuredClone(baseline);
  assert.deepEqual(reviewedFuryRotation(review, baseline, policies).rotation, policies[1]);
  assert.deepEqual(baseline, original);
  const noGain = fixture(false);
  assert.deepEqual(
    reviewedFuryRotation(noGain.review, noGain.baseline, noGain.policies).rotation,
    noGain.policies[0],
  );
});

test("stale, incomplete, repeated-seed and unsupported rotation evidence fails closed", () => {
  for (const change of [
    (input) => input.review.screen.pop(),
    (input) => (input.review.baselineSha256 = "stale"),
    (input) => (input.review.talents = "different-talents"),
    (input) => (input.review.policySetSha256 = "different-policy"),
    (input) => (input.review.validation[1].seed = input.review.validation[0].seed),
    (input) => (input.review.validation[0].seed = 1337),
    (input) => (input.review.validation[0].candidate.iterations = 1000),
    (input) => (input.review.validation[0].candidate.rotationSha256 = "different-policy"),
    (input) => input.review.finalists.pop(),
    (input) => (input.review.validated = false),
    (input) => (input.review.selection.rotation = input.policies[0]),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => reviewedFuryRotation(input.review, input.baseline, input.policies));
  }
});

test("no-gain rotation evidence must retain the exact incumbent", () => {
  const input = fixture(false);
  input.review.selection.rotation = input.policies[1];
  assert.throws(
    () => reviewedFuryRotation(input.review, input.baseline, input.policies),
    /Unvalidated rotation change/,
  );
});

test("Arms rotation evidence retains the same coverage, independent precision and no-gain gates", () => {
  for (const proven of [false, true]) {
    const input = fixture(proven, "arms");
    assert.equal(
      reviewedWarriorRotation(input.review, input.baseline, input.policies),
      input.review.selection,
    );
    assert.throws(() => reviewedFuryRotation(input.review, input.baseline, input.policies));
    input.review.schema = "kfc-fury-rotation-audit.v1";
    assert.throws(() => reviewedWarriorRotation(input.review, input.baseline, input.policies));
  }
  const input = fixture(false, "arms");
  input.review.screen.pop();
  assert.throws(
    () => reviewedWarriorRotation(input.review, input.baseline, input.policies),
    /Incomplete rotation coverage/,
  );
});
