import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { reviewedBuildExport } from "../infra/simulator/reviewed-build-export.mjs";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

function fixture(provisional = false, variant = "fury") {
  const rotation = { priorityList: [] };
  const baseline = {
    schema: "kfc-optimization-baseline.v1",
    profile: "warrior",
    variant,
    playerClass: 9,
    revision: "fixture",
    dbSha256: "a".repeat(64),
    requestBase64: "fixture-request",
    predecessor: {},
    enchantPolicy: {
      schema: "kfc-enchant-model-policy.v1",
      provisionalEffectIds: provisional ? [1900] : [],
    },
    settings: {
      player: {
        race: "RaceHuman",
        talentsString: "fixture-talents",
        rotation,
        equipment: { items: Array.from({ length: 17 }, () => ({})) },
        warrior: { options: {} },
      },
      settings: { faction: "Alliance", ruleset: "RulesetForever" },
      encounter: { duration: 300, targets: [{ level: 63 }] },
    },
  };
  const metric = { dps: 100, stdev: 2, iterations: 100000 };
  const rows = (stage) =>
    independentValidationSeeds("a".repeat(64), stage).map((seed) => ({
      seed,
      baseline: { ...metric },
      candidate: { ...metric },
    }));
  const gearReview = {
    result: {
      profile: "warrior",
      variant,
      playerClass: 9,
      race: "RaceHuman",
      faction: 1,
      status: "simulation-complete-awaiting-browser-review",
      converged: true,
      accepted: false,
      gear: globalThis.structuredClone(baseline.settings.player.equipment),
      talentsString: "fixture-talents",
      rotation,
      requestSha256: simulationHash(baseline.requestBase64),
      validation: rows("gear"),
      validationSeedContext: "a".repeat(64),
      validationSeedPolicy,
    },
  };
  baseline.predecessor.gearReviewSha256 = simulationHash(gearReview);
  const talentReview = {
    schema: "kfc-talent-search.v1",
    profile: `warrior/${variant}`,
    revision: "fixture",
    dbSha256: baseline.dbSha256,
    baselineSha256: simulationHash(baseline),
    gearSha256: simulationHash(baseline.settings.player.equipment),
    requestSha256: simulationHash(JSON.stringify(baseline.requestBase64)),
    validated: false,
    validation: rows("talents"),
    validationSeedContext: "a".repeat(64),
    validationSeedPolicy,
    selection: {
      talents: "fixture-talents",
      rotation: { value: rotation },
      reason: "kept-incumbent-no-proven-gain",
    },
    history: Array.from({ length: 3 }, () => ({
      best: { talents: "fixture-talents", rotation: "incumbent" },
    })),
  };
  const browserReview = {
    schema: "kfc-baseline-browser-verification.v1",
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    iterations: 25,
    seed: 1337,
    controlledNativeDps: 100,
    capturedNativeDps: 100,
    browserDps: 100,
    nativeBinarySha256: "b".repeat(64),
    provisionalEnchantsEnabled: provisional,
  };
  const input = { baseline, gearReview, talentReview, browserReview };
  const feedbackReview = {
    ...reviewPrebisFeedback(input),
    knownRaidWeaponConsumes: [],
    provisionalIds: [],
    enchantPolicy: baseline.enchantPolicy,
  };
  const policy = { name: "Incumbent", value: rotation };
  const alternative = { name: "Alternative", value: { priorityList: [{ action: { wait: {} } }] } };
  const rotationPolicies = [policy, alternative];
  const rotationMetric = (index, iterations) => ({
    ...metric,
    dps: index ? 99 : 100,
    iterations,
    rotationSha256: simulationHash(rotationPolicies[index].value),
  });
  const rotationReview = {
    schema: `kfc-${variant}-rotation-audit.v1`,
    baselineSha256: simulationHash(baseline),
    feedbackSha256: simulationHash(feedbackReview),
    nativeBinarySha256: browserReview.nativeBinarySha256,
    dbSha256: baseline.dbSha256,
    revision: "fixture",
    talents: "fixture-talents",
    policySetSha256: simulationHash(rotationPolicies),
    screenSeed: 1337,
    finalistSeed: 77191,
    screen: [rotationMetric(0, 1000), rotationMetric(1, 1000)],
    finalists: [rotationMetric(0, 10000), rotationMetric(1, 10000)],
    winner: { rotation: policy },
    validationSeedContext: "c".repeat(64),
    validationSeedPolicy,
    validation: independentValidationSeeds("c".repeat(64), "rotation").map((seed) => ({
      seed,
      baseline: rotationMetric(0, 100000),
      candidate: rotationMetric(0, 100000),
    })),
    validated: false,
    selection: { rotation: policy },
  };
  return { ...input, feedbackReview, rotationReview, rotationPolicies };
}

test("reviewed export retains the exact benchmark and evidence without local paths or opaque requests", () => {
  const input = fixture();
  input.feedbackReview.evidencePaths = { baseline: "/private/local/path" };
  input.rotationReview.feedbackSha256 = simulationHash(input.feedbackReview);
  const output = reviewedBuildExport(input);
  assert.equal(output.status, "scenario-tested");
  assert.equal(output.referenceDps, 100);
  assert.equal(output.validationIterations, 400000);
  assert.equal(output.requiresProvisionalEnchantOptIn, false);
  assert.deepEqual(output.settings, input.baseline.settings);
  assert.equal(output.evidence.rotationPolicyCount, 2);
  assert.equal(JSON.stringify(output).includes("/private/local/path"), false);
  assert.equal("requestBase64" in output, false);
  output.settings.player.talentsString = "edited";
  assert.equal(input.baseline.settings.player.talentsString, "fixture-talents");
});

test("provisional proc export retains the opt-in requirement and warning", () => {
  const output = reviewedBuildExport(fixture(true));
  assert.equal(output.requiresProvisionalEnchantOptIn, true);
  assert.deepEqual(output.enchantPolicy.provisionalEffectIds, [1900]);
  assert(output.warnings.some((notice) => notice.includes("explicit opt-in")));
});

test("an Arms export needs its own complete feedback and rotation evidence", () => {
  const input = fixture(false, "arms");
  const output = reviewedBuildExport(input);
  assert.equal(output.variant, "arms");
  assert.match(output.name, /^Arms · Alliance/);
  assert.equal(output.validationIterations, 400000);
  input.rotationReview.schema = "kfc-fury-rotation-audit.v1";
  assert.throws(() => reviewedBuildExport(input));
});

test("tampered feedback, stale rotations, unknown provenance and raid consumes cannot be exported", () => {
  for (const change of [
    (input) => input.feedbackReview.referenceDps++,
    (input) => input.feedbackReview.iterations++,
    (input) =>
      (input.feedbackReview.knownRaidWeaponConsumes = [{ previous: "ElementalSharpeningStone" }]),
    (input) => (input.feedbackReview.provisionalIds = [11815]),
    (input) => (input.rotationReview.feedbackSha256 = "stale"),
    (input) => (input.rotationReview.nativeBinarySha256 = "changed"),
    (input) => input.rotationReview.screen.pop(),
    (input) => (input.rotationReview.selection.rotation = input.rotationPolicies[1]),
    (input) => (input.rotationReview.validation[0].candidate.iterations = 20000),
    (input) => (input.browserReview.provisionalEnchantsEnabled = false),
  ]) {
    const input = fixture(true);
    change(input);
    assert.throws(() => reviewedBuildExport(input));
  }
});

test("otherwise valid 20k feedback is not mistaken for the completed high-precision case", () => {
  const input = fixture();
  for (const report of [input.gearReview.result, input.talentReview])
    for (const row of report.validation)
      for (const key of ["baseline", "candidate"]) row[key].iterations = 20000;
  input.baseline.predecessor.gearReviewSha256 = simulationHash(input.gearReview);
  input.talentReview.baselineSha256 = simulationHash(input.baseline);
  input.browserReview.baselineSha256 = simulationHash(input.baseline);
  Object.assign(input.feedbackReview, reviewPrebisFeedback(input));
  assert.throws(() => reviewedBuildExport(input), /100k feedback/);
});

test("legal identical historical rings retain provenance without duplicating the exported warning IDs", () => {
  const input = fixture();
  for (const slot of [10, 11]) input.baseline.settings.player.equipment.items[slot] = { id: 18500 };
  input.gearReview.result.gear = globalThis.structuredClone(
    input.baseline.settings.player.equipment,
  );
  input.baseline.predecessor.gearReviewSha256 = simulationHash(input.gearReview);
  input.talentReview.baselineSha256 = simulationHash(input.baseline);
  input.talentReview.gearSha256 = simulationHash(input.baseline.settings.player.equipment);
  input.browserReview.baselineSha256 = simulationHash(input.baseline);
  Object.assign(input.feedbackReview, reviewPrebisFeedback(input), {
    provisionalIds: [18500, 18500],
  });
  input.rotationReview.baselineSha256 = simulationHash(input.baseline);
  input.rotationReview.feedbackSha256 = simulationHash(input.feedbackReview);
  assert.deepEqual(reviewedBuildExport(input).provisionalItemIds, [18500]);
});

test("valid hash links cannot bless raid consumes or invented historical provenance", () => {
  const raid = fixture();
  raid.feedbackReview.knownRaidWeaponConsumes = [{ previous: "ElementalSharpeningStone" }];
  raid.rotationReview.feedbackSha256 = simulationHash(raid.feedbackReview);
  assert.throws(() => reviewedBuildExport(raid), /Raid weapon consumes remain/);
  const provenance = fixture();
  provenance.feedbackReview.provisionalIds = [11815];
  provenance.rotationReview.feedbackSha256 = simulationHash(provenance.feedbackReview);
  assert.throws(() => reviewedBuildExport(provenance), /Invalid historical-item provenance/);
});

test("current-client acquisition assumptions are exported separately from provisional Classic stats", () => {
  const input = fixture();
  input.baseline.settings.player.equipment.items[0] = { id: 7718 };
  input.gearReview.result.gear = globalThis.structuredClone(
    input.baseline.settings.player.equipment,
  );
  input.gearReview.result.provisionalAcquisitionIds = [7718];
  input.baseline.predecessor.gearReviewSha256 = simulationHash(input.gearReview);
  input.talentReview.baselineSha256 = simulationHash(input.baseline);
  input.talentReview.gearSha256 = simulationHash(input.baseline.settings.player.equipment);
  input.browserReview.baselineSha256 = simulationHash(input.baseline);
  Object.assign(input.feedbackReview, reviewPrebisFeedback(input));
  input.rotationReview.baselineSha256 = simulationHash(input.baseline);
  input.rotationReview.feedbackSha256 = simulationHash(input.feedbackReview);
  const output = reviewedBuildExport(input);
  assert.deepEqual(output.provisionalItemIds, []);
  assert.deepEqual(output.provisionalAcquisitionItemIds, [7718]);
  assert(output.warnings.some((warning) => warning.includes("Their stats are current")));
  const invalid = fixture();
  invalid.feedbackReview.provisionalAcquisitionIds = [11815];
  invalid.rotationReview.feedbackSha256 = simulationHash(invalid.feedbackReview);
  assert.throws(() => reviewedBuildExport(invalid), /Invalid current-item acquisition provenance/);
});

test("export CLI rejects incomplete, duplicate and unknown arguments before reading evidence", () => {
  for (const args of [
    [],
    ["--feedback-review=missing.json"],
    ["--feedback-review=a.json", "--feedback-review=b.json"],
    ["--feedback-review=a.json", "--rotation-review="],
    ["--feedback-review=a.json", "--unknown=b.json"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./export-simulator-reviewed-build.mjs", import.meta.url)), ...args],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass --feedback-review=/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
