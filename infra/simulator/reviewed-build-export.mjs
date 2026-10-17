import assert from "node:assert/strict";
import { reviewPrebisFeedback } from "./prebis-feedback.mjs";
import { reviewedWarriorRotation } from "./fury-rotation-audit.mjs";
import { prebisEnchantPolicy } from "./prebis-enchants.mjs";
import { simulationHash } from "./simulation-cache.mjs";
import { assertIndependentSeedRanges, assertValidationSeeds } from "./simulation-seeds.mjs";

export function reviewedBuildExport(input) {
  const { baseline, feedbackReview, rotationReview, rotationPolicies } = input;
  assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
  const verified = reviewPrebisFeedback(input);
  for (const [key, value] of Object.entries(verified))
    assert.deepEqual(feedbackReview[key], value, `Feedback receipt changed: ${key}`);
  assert(
    verified.measurements.every((metric) => metric.iterations >= 100000),
    "Public build export requires the completed 100k feedback checks",
  );
  assert.equal(rotationReview.feedbackSha256, simulationHash(feedbackReview));
  assert.equal(rotationReview.nativeBinarySha256, verified.nativeBinarySha256);
  const rotation = reviewedWarriorRotation(rotationReview, baseline, rotationPolicies);
  assert.equal(rotationReview.validated, false, "Rotation gain needs another feedback pass");
  assert.deepEqual(rotation.rotation.value, baseline.settings.player.rotation);
  assert(
    rotationReview.validation.every((row) =>
      [row.baseline, row.candidate].every((metric) => metric.iterations >= 100000),
    ),
    "Public build export requires the completed 100k rotation checks",
  );
  assertIndependentSeedRanges([
    ...verified.validationSeedRanges,
    ...assertValidationSeeds(rotationReview, "rotation"),
  ]);
  assert.deepEqual(feedbackReview.knownRaidWeaponConsumes, [], "Raid weapon consumes remain");
  const provisionalIds = feedbackReview.provisionalIds;
  const equipped = new Set(baseline.settings.player.equipment.items.map((item) => item.id));
  assert(
    Array.isArray(provisionalIds) &&
      provisionalIds.every((id) => Number.isSafeInteger(id) && id > 0 && equipped.has(id)),
    "Invalid historical-item provenance",
  );
  const enchantPolicy = prebisEnchantPolicy(baseline);
  const provisionalAcquisitionIds = feedbackReview.provisionalAcquisitionIds ?? [];
  assert(
    Array.isArray(provisionalAcquisitionIds) &&
      provisionalAcquisitionIds.every(
        (id) => Number.isSafeInteger(id) && id > 0 && equipped.has(id),
      ),
    "Invalid current-item acquisition provenance",
  );
  assert.deepEqual(feedbackReview.enchantPolicy, enchantPolicy);
  const provisionalEnchants = enchantPolicy.provisionalEffectIds.length > 0;
  return {
    schema: "kfc-reviewed-simulator-build.v1",
    profile: baseline.profile,
    variant: baseline.variant,
    name: `${baseline.variant === "arms" ? "Arms" : "Fury"} · ${verified.faction} · ${provisionalEnchants ? "provisional proc models" : "conservative enchants"}`,
    status: "scenario-tested",
    revision: verified.revision,
    dbSha256: verified.dbSha256,
    nativeBinarySha256: verified.nativeBinarySha256,
    race: verified.race,
    faction: verified.faction,
    referenceDps: verified.referenceDps,
    validationIterations: verified.iterations,
    settings: globalThis.structuredClone(baseline.settings),
    enchantPolicy: globalThis.structuredClone(enchantPolicy),
    requiresProvisionalEnchantOptIn: provisionalEnchants,
    provisionalItemIds: [...new Set(provisionalIds)],
    ...(provisionalAcquisitionIds.length
      ? { provisionalAcquisitionItemIds: [...new Set(provisionalAcquisitionIds)] }
      : {}),
    evidence: {
      baselineSha256: simulationHash(baseline),
      feedbackSha256: simulationHash(feedbackReview),
      gearSha256: verified.gearReviewSha256,
      talentsSha256: verified.talentReviewSha256,
      browserSha256: verified.browserReviewSha256,
      rotationAuditSha256: simulationHash(rotationReview),
      rotationPolicyCount: rotationPolicies.length,
      validationSeedPolicy: verified.validationSeedPolicy,
    },
    warnings: [
      "Scenario-specific feedback search, not proof of global BiS or a cross-class ranking.",
      "No honor-rank or reputation cap. Not a launch-day or low-cost loadout; release unlocks still need verification.",
      ...(provisionalIds.length
        ? [
            "Includes provisional Classic items: Forever stats, availability and proc behavior remain unverified.",
          ]
        : []),
      ...(provisionalEnchants
        ? [
            "Weapon-proc models are provisional. Loading this case must require explicit opt-in; never enable them silently.",
          ]
        : []),
      ...(provisionalAcquisitionIds.length
        ? [
            "Some current-client items use provisional historical acquisition. Their stats are current; Forever availability and vendor access remain unverified. Set/utility limitations follow the selected engine model.",
          ]
        : []),
      "Loading a complete benchmark replaces gear, talents, rotation, race, professions, buffs, consumes and encounter. Saved builds must not be replaced automatically.",
    ],
  };
}
