import assert from "node:assert/strict";
import { simulationHash } from "./simulation-cache.mjs";
import { selectedTalentEvidence } from "./talent-search.mjs";
import { statisticallyBetter } from "./prebis-pool.mjs";
import { prebisEnchantPolicy } from "./prebis-enchants.mjs";
import {
  assertValidationSeeds,
  assertIndependentSeedRanges,
  selectionSeedRanges,
  validationSeedPolicy,
} from "./simulation-seeds.mjs";

function validationRows(rows) {
  assert(Array.isArray(rows) && rows.length === 2, "Two independent validation seeds required");
  assert.equal(new Set(rows.map((row) => row.seed)).size, 2, "Repeated validation seed");
  for (const row of rows) {
    assert(Number.isSafeInteger(row.seed));
    for (const metric of [row.baseline, row.candidate])
      assert(
        metric &&
          Number.isSafeInteger(metric.iterations) &&
          metric.iterations >= 20000 &&
          Number.isFinite(metric.dps) &&
          metric.dps > 0 &&
          Number.isFinite(metric.stdev) &&
          metric.stdev >= 0,
        "Incomplete independent simulation evidence",
      );
  }
}

export function reviewPrebisFeedback({ baseline, gearReview, talentReview, browserReview }) {
  assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
  const player = baseline.settings.player;
  const gear = gearReview.result;
  const key = `${baseline.profile}/${baseline.variant}`;
  assert(gear && gear.converged === true, "Gear search has not converged");
  assert.equal(gear.status, "simulation-complete-awaiting-browser-review");
  assert.equal(`${gear.profile}/${gear.variant}`, key);
  assert.equal(gear.playerClass, baseline.playerClass);
  assert.equal(gear.race, player.race);
  assert.equal(gear.faction, baseline.settings.settings.faction === "Alliance" ? 1 : 2);
  assert.deepEqual(gear.gear, player.equipment, "Feedback equipment differs from the gear result");
  assert.equal(gear.talentsString, player.talentsString);
  assert.deepEqual(gear.rotation, player.rotation);
  assert.equal(
    baseline.predecessor?.gearReviewSha256,
    simulationHash(gearReview),
    "Unlinked gear evidence",
  );
  assert.equal(gear.requestSha256, simulationHash(baseline.requestBase64));
  if (gear.provisionalAcquisitionIds !== undefined) {
    const equipped = new Set(player.equipment.items.map((item) => item.id));
    assert(
      Array.isArray(gear.provisionalAcquisitionIds) &&
        gear.provisionalAcquisitionIds.every(
          (id) => Number.isSafeInteger(id) && id > 0 && equipped.has(id),
        ),
      "Invalid current-item acquisition provenance in gear evidence",
    );
  }
  validationRows(gear.validation);
  const gearSeedRanges = assertValidationSeeds(gear, "gear");
  assert.equal(typeof gear.accepted, "boolean");
  assert.equal(
    gear.accepted,
    gear.validation.every((row) => statisticallyBetter(row.candidate, row.baseline)),
    "Gear gain flag contradicts its measurements",
  );

  assert.equal(talentReview.schema, "kfc-talent-search.v1");
  assert.equal(talentReview.baselineSha256, simulationHash(baseline), "Stale talent baseline");
  assert.equal(talentReview.gearSha256, simulationHash(player.equipment));
  // Talent-search v1 hashed JSON values, including strings; gear and browser
  // receipts hash base64 text directly. Do not weaken this to an OR.
  assert.equal(talentReview.requestHashEncoding ?? "json-string", "json-string");
  assert.equal(
    talentReview.requestSha256,
    simulationHash(JSON.stringify(baseline.requestBase64)),
    "Talent request identity changed",
  );
  assert.equal(talentReview.dbSha256, baseline.dbSha256);
  validationRows(talentReview.validation);
  const talentSeedRanges = assertValidationSeeds(talentReview, "talents");
  assertIndependentSeedRanges([...selectionSeedRanges, ...gearSeedRanges, ...talentSeedRanges]);
  const selection = selectedTalentEvidence(talentReview, baseline);
  assert.equal(
    talentReview.validated,
    false,
    "Talent/APL change needs another equipment feedback pass",
  );
  assert.equal(selection.talents, player.talentsString);
  assert.deepEqual(selection.rotation.value, player.rotation);
  const finalRounds = talentReview.history?.slice(-3);
  assert(
    finalRounds?.length === 3 &&
      new Set(finalRounds.map((row) => `${row.best.talents}:${row.best.rotation}`)).size === 1,
    "Talent search has not held a stable result for three rounds",
  );

  assert.equal(browserReview.schema, "kfc-baseline-browser-verification.v1");
  assert.equal(
    browserReview.baselineSha256,
    simulationHash(baseline),
    "Stale browser verification",
  );
  assert.equal(browserReview.dbSha256, baseline.dbSha256);
  if (prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0)
    assert.equal(
      browserReview.provisionalEnchantsEnabled,
      true,
      "Browser did not explicitly opt into the provisional model",
    );
  assert(
    Number.isSafeInteger(browserReview.iterations) &&
      browserReview.iterations >= 25 &&
      Number.isSafeInteger(browserReview.seed),
  );
  assert(
    Number.isFinite(browserReview.controlledNativeDps) && browserReview.controlledNativeDps > 0,
  );
  assert.equal(browserReview.controlledNativeDps, browserReview.capturedNativeDps);
  assert(
    Math.abs(browserReview.browserDps - browserReview.capturedNativeDps) < 0.0051,
    "Browser/native simulation mismatch",
  );
  assert.equal(player.level ?? 60, 60);
  const encounter = baseline.settings.encounter;
  assert.equal(baseline.settings.settings.ruleset, "RulesetForever");
  assert.equal(encounter.duration, 300);
  assert.equal(encounter.durationVariation ?? 0, 0);
  assert.equal(encounter.useHealth ?? false, false);
  assert.equal(encounter.targets.length, 1);
  assert.equal(encounter.targets[0].level, 63);
  assert.equal(player.foreverTier1Bonuses ?? false, false);
  assert.equal(player.enableItemSwap ?? false, false);
  assert(
    [...(player.bonusStats?.stats ?? []), ...(player.bonusStats?.pseudoStats ?? [])].every(
      (value) => value === 0,
    ),
    "Manual bonus stats are not permitted in a recommendation baseline",
  );
  if (baseline.profile === "warrior") assert.equal(player.warrior.options.startingRage ?? 0, 0);

  const measurements = [
    ...gear.validation.map((row) => ({
      seed: row.seed,
      ...(gear.accepted ? row.candidate : row.baseline),
    })),
    ...talentReview.validation.map((row) => ({ seed: row.seed, ...row.baseline })),
  ];
  assert.equal(
    new Set(measurements.map((row) => row.seed)).size,
    4,
    "Final checks must use four distinct seeds",
  );
  const iterations = measurements.reduce((sum, row) => sum + row.iterations, 0);
  return {
    schema: "kfc-prebis-feedback-review.v1",
    status: "closed-loop-verified",
    profile: baseline.profile,
    variant: baseline.variant,
    playerClass: baseline.playerClass,
    race: player.race,
    faction: baseline.settings.settings.faction,
    revision: baseline.revision,
    dbSha256: baseline.dbSha256,
    baselineSha256: simulationHash(baseline),
    gearReviewSha256: simulationHash(gearReview),
    talentReviewSha256: simulationHash(talentReview),
    browserReviewSha256: simulationHash(browserReview),
    nativeBinarySha256: browserReview.nativeBinarySha256,
    ...(gear.provisionalAcquisitionIds
      ? { provisionalAcquisitionIds: [...gear.provisionalAcquisitionIds] }
      : {}),
    validationSeedPolicy,
    validationSeedRanges: [...gearSeedRanges, ...talentSeedRanges],
    scenario: {
      duration: encounter.duration,
      targetLevel: encounter.targets[0].level,
      executeProportion20: encounter.executeProportion20,
      partyBuffs: baseline.settings.partyBuffs,
      raidBuffs: baseline.settings.raidBuffs,
      playerBuffs: player.buffs,
      consumes: player.consumes,
    },
    measurements: measurements.map(({ seed, dps, stdev, iterations }) => ({
      seed,
      dps,
      stdev,
      iterations,
    })),
    iterations,
    referenceDps: measurements.reduce((sum, row) => sum + row.dps * row.iterations, 0) / iterations,
    notice:
      "Scenario-specific talent/APL and pre-raid gear feedback is stable, not proof of global BiS. Acquisition, consumable policy, unverified effects and public build integration require their own checks.",
  };
}
