import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

function relink(input) {
  input.baseline.predecessor.gearReviewSha256 = simulationHash(input.gearReview);
  input.talentReview.baselineSha256 = simulationHash(input.baseline);
  input.talentReview.gearSha256 = simulationHash(input.baseline.settings.player.equipment);
  input.browserReview.baselineSha256 = simulationHash(input.baseline);
  return input;
}

function fixture() {
  const player = {
    race: "RaceOrc",
    talentsString: "fixture-talents",
    rotation: { priorityList: [] },
    warrior: { options: {} },
    equipment: { items: Array.from({ length: 17 }, () => ({})) },
  };
  const metric = { dps: 100, stdev: 10, iterations: 20000 };
  const rows = (seeds) =>
    seeds.map((seed) => ({ seed, baseline: { ...metric }, candidate: { ...metric } }));
  return relink({
    baseline: {
      schema: "kfc-optimization-baseline.v1",
      profile: "warrior",
      variant: "fury",
      playerClass: 9,
      revision: "pinned",
      dbSha256: "a".repeat(64),
      requestBase64: "fixture",
      predecessor: {},
      settings: {
        player,
        settings: { faction: "Horde", ruleset: "RulesetForever" },
        encounter: { duration: 300, targets: [{ level: 63 }] },
      },
    },
    gearReview: {
      fingerprint: "f".repeat(64),
      result: {
        profile: "warrior",
        variant: "fury",
        playerClass: 9,
        race: player.race,
        faction: 2,
        status: "simulation-complete-awaiting-browser-review",
        converged: true,
        accepted: false,
        gear: globalThis.structuredClone(player.equipment),
        talentsString: player.talentsString,
        rotation: player.rotation,
        requestSha256: simulationHash("fixture"),
        validation: rows(independentValidationSeeds("a".repeat(64), "gear")),
        validationSeedContext: "a".repeat(64),
        validationSeedPolicy,
      },
    },
    talentReview: {
      schema: "kfc-talent-search.v1",
      profile: "warrior/fury",
      revision: "pinned",
      dbSha256: "a".repeat(64),
      requestSha256: simulationHash(JSON.stringify("fixture")),
      validated: false,
      validation: rows(independentValidationSeeds("a".repeat(64), "talents")),
      validationSeedContext: "a".repeat(64),
      validationSeedPolicy,
      selection: {
        talents: player.talentsString,
        rotation: { value: player.rotation },
        reason: "kept-incumbent-no-proven-gain",
      },
      history: Array.from({ length: 3 }, () => ({
        best: { talents: player.talentsString, rotation: "incumbent" },
      })),
    },
    browserReview: {
      schema: "kfc-baseline-browser-verification.v1",
      dbSha256: "a".repeat(64),
      iterations: 25,
      seed: 1337,
      controlledNativeDps: 101,
      capturedNativeDps: 101,
      browserDps: 101,
      nativeBinarySha256: "b".repeat(64),
    },
  });
}

test("closed-loop review links actual final gear, stable talents, four independent seeds and browser parity", () => {
  const report = reviewPrebisFeedback(fixture());
  assert.equal(report.status, "closed-loop-verified");
  assert.equal(report.referenceDps, 100);
  assert.equal(report.iterations, 80000);
  assert.equal(report.measurements.length, 4);
});

test("unfinished, stale, paid-stat or contradictory evidence cannot pass the closed-loop gate", () => {
  for (const change of [
    (input) => (input.gearReview.result.converged = false),
    (input) => (input.gearReview.result.validation[0].candidate.iterations = 20),
    (input) => (input.gearReview.result.accepted = true),
    (input) => input.talentReview.history.pop(),
    (input) => (input.talentReview.history[0].best.rotation = "changed"),
    (input) => (input.talentReview.validation[0].seed = 1),
    (input) => (input.browserReview.browserDps = 102),
    (input) => (input.baseline.settings.player.bonusStats = { stats: [1] }),
    (input) => (input.baseline.settings.encounter.targets[0].level = 62),
    (input) => (input.baseline.settings.encounter.useHealth = true),
    (input) => (input.baseline.settings.player.warrior.options.startingRage = 50),
  ]) {
    const input = fixture();
    change(input);
    relink(input);
    assert.throws(() => reviewPrebisFeedback(input));
  }
  const stale = fixture();
  stale.browserReview.baselineSha256 = "stale";
  assert.throws(() => reviewPrebisFeedback(stale), /Stale browser/);
});

test("a provisional-model case needs a browser proof with explicit model opt-in", () => {
  const input = fixture();
  input.baseline.enchantPolicy = {
    schema: "kfc-enchant-model-policy.v1",
    provisionalEffectIds: [1900],
  };
  relink(input);
  assert.throws(() => reviewPrebisFeedback(input), /explicitly opt/);
  input.browserReview.provisionalEnchantsEnabled = true;
  assert.equal(reviewPrebisFeedback(input).status, "closed-loop-verified");
  input.talentReview.requestSha256 = simulationHash(input.baseline.requestBase64);
  assert.throws(() => reviewPrebisFeedback(input), /request identity/);
});
