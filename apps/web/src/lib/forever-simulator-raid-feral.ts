import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { feralSimulatorGuidanceText } from "./forever-simulator-feral-guidance";
import { frostModelEvidenceReferenceSchema } from "./forever-simulator-fresh-frost";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
const referenceSchema = frostModelEvidenceReferenceSchema;
export type RaidFeralEvidenceReference = z.infer<typeof referenceSchema>;
const approvedPlanSchema = z
  .object({
    schema: z.literal("kfc-approved-first-pass-frozen-confirmation.v1"),
    approvalPolicy: z
      .object({
        schema: z.literal("kfc-owner-approved-first-pass-margin.v1"),
        maximumRetainedGapFraction: z.literal(0.02),
        originalMaximumRetainedGapFraction: z.literal(0.01),
        selectionFromHoldoutsAllowed: z.literal(false),
        scope: z.string().min(1).max(4000),
      })
      .strict(),
    originalPlan: z
      .object({
        arms: z
          .array(
            z
              .object({
                name: z.string(),
                category: z.string(),
                settings: record,
                inspected: record,
                requestSource: z.enum(["gear", "state"]),
              })
              .passthrough(),
          )
          .length(12),
        policy: z
          .object({
            version: z.string(),
            iterations: z.number(),
            ranges: z.number(),
            reservedRangeIterations: z.number(),
            inspectedIterations: z.number(),
            inspectedSeed: z.number(),
            maximumArms: z.number(),
            maximumRetainedGapFraction: z.number(),
            standardErrorMultiplier: z.number(),
          })
          .strict(),
        seeds: z.array(z.number().int().positive().safe()).length(2),
        requestIds: z.array(digest).length(24),
        inspectedSeedRanges: z
          .array(
            z
              .object({
                seed: z.number().int().positive().safe(),
                iterations: z.number().int().positive().safe(),
              })
              .strict(),
          )
          .min(1),
      })
      .passthrough(),
  })
  .strict();

export const raidFeralModelEntrySchema = z
  .object({
    id: z.literal("feral-cat-static"),
    profile: z.literal("feral_druid"),
    build: referenceSchema,
    settingsSha256: digest,
    hrefSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    requestTemplates: z
      .array(
        z
          .object({
            arm: z.string().min(1).max(80),
            requestSource: z.enum(["gear", "state"]),
            requestBase64: z.string().min(20).max(512000),
          })
          .strict(),
      )
      .length(12),
  })
  .strict();
export type RaidFeralModelEntry = z.infer<typeof raidFeralModelEntrySchema>;

// This supplemental A4 export does not replace or relabel the historical M81 evidence.
export const verifiedRaidFeralDelivery = Object.freeze({
  sourceRelease: "a4eabfa5c89f3813c1b74bde",
  sourceRevision: "9a27c3d6af91d1ca0dbcf94a124b8869ad522108",
  buildSha256: "9f925eb2459ccbc33ea2d46723b1d8db79a83f32bf2be85d42d2c47e70e1b1be",
  confirmationSha256: "8a7e0a6aee6b9541ce7937847eed945c2f68aebf384b1fcb86e283d914c59ece",
  paritySha256: "bddd17be25cd4a7187281b1e1556a95f35e8ce594daa79dcb5c5efd37cd8e986",
});
const actionBinding = z
  .object({
    index: z.number().int().nonnegative(),
    actionSha256: digest,
    text: z.string(),
  })
  .strict();
const buildSchema = z
  .object({
    schema: z.literal("kfc-raid-revalidated-prebis-build.v1"),
    id: z.literal("feral-cat-static"),
    profile: z.literal("feral_druid"),
    variant: z.literal("feral"),
    name: z.literal("Feral Cat · pre-raid tested"),
    sourceRelease: z.literal(verifiedRaidFeralDelivery.sourceRelease),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: digest,
    nativeBinarySha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    raidBuffPolicy: record,
    enchantPolicy: record,
    enchants: z.array(record).min(9).max(17),
    requiresProvisionalEnchantOptIn: z.literal(false),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-feral-cat-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.literal("9/32/10"),
        conjured: z.literal("rune"),
        prepull: z.array(z.string()).max(16),
        prepullBindings: z.array(actionBinding).max(16),
        scenario: z.string(),
        instruction: z.string(),
        priorities: z.array(z.string()).min(1),
        priorityBindings: z.array(actionBinding).min(1),
        caveats: z.array(z.string()).min(1),
      })
      .strict(),
    requestTemplates: raidFeralModelEntrySchema.shape.requestTemplates,
    evidence: z
      .object({
        previousBuild: referenceSchema,
        consumeBridge: referenceSchema,
        fullGear: referenceSchema,
        fullGearResult: referenceSchema,
        state: referenceSchema,
        stateResult: referenceSchema,
        stateDeclaration: referenceSchema,
        applicability: referenceSchema,
        applicabilityResult: referenceSchema,
        applicabilityDeclaration: referenceSchema,
        confirmation: referenceSchema,
        confirmationResult: referenceSchema,
        confirmationDeclaration: referenceSchema,
        confirmationSummary: referenceSchema,
        parity: referenceSchema,
      })
      .strict(),
    exportSourceFiles: z
      .array(z.object({ path: z.string(), byteSha256: digest }).strict())
      .min(4)
      .max(16),
    scope: z
      .object({
        name: z.literal("seven-buff-raid-revalidation-practical-first-pass.v1"),
        sourceRole: z.literal("feral-seven-buff-state-and-retained-gear-applicability-reviewed"),
        stateRecheckCompleted: z.literal(true),
        gearApplicabilityReviewed: z.literal(true),
        fullCurrentPoolSweep: z.literal(false),
        currentRetainedGearProposals: z.literal(94),
        previousFullGearPoolCounts: z.array(z.number().int().positive()).length(17),
        maximumRetainedGapFraction: z.literal(0.02),
        largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
        originalStrictAssessmentAccepted: z.literal(true),
        strictRetainedDominancePassed: z.literal(false),
        selectionChanged: z.literal(false),
        globalOptimalityProven: z.literal(false),
        deeperOptimizationDeferred: z.literal(true),
        originalClassClockAndCorrectionHistoryPreserved: z.literal(true),
      })
      .strict(),
    warnings: z.array(z.string().min(1)).min(5),
    publicPromotionAllowed: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .passthrough();
export type RaidFeralSimulatorBuild = z.infer<typeof buildSchema>;
export interface RaidFeralModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: RaidFeralEvidenceReference) => Promise<unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function same(left: unknown, right: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(left, right), message);
}

export async function readRaidFeralSimulatorBuild(
  rawEntry: RaidFeralModelEntry,
  options: RaidFeralModelBuildOptions,
): Promise<RaidFeralSimulatorBuild> {
  const entry = raidFeralModelEntrySchema.parse(rawEntry);
  requireMatch(
    entry.build.sha256 === verifiedRaidFeralDelivery.buildSha256,
    "Unreviewed Raid Feral export requires a new delivery review",
  );
  async function reference(raw: RaidFeralEvidenceReference): Promise<unknown> {
    const ref = referenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Raid Feral evidence checksum changed: " + ref.path);
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    entry.build.path ===
      `artifacts/forever-simulator/optimization/feral-raid-delivery-v1/build-${entry.build.sha256.slice(0, 16)}.json` &&
      options.sourceRelease === verifiedRaidFeralDelivery.sourceRelease &&
      options.revision === verifiedRaidFeralDelivery.sourceRevision &&
      build.sourceRelease === options.sourceRelease &&
      build.dbSha256 === options.databaseSha256 &&
      build.revision ===
        hash({ evidence: build.evidence, exportSourceFiles: build.exportSourceFiles }).slice(
          0,
          40,
        ) &&
      build.referenceDps === entry.referenceDps &&
      hash(build.settings) === entry.settingsSha256,
    "Raid Feral publication model/settings/precision changed",
  );
  same(
    entry.requestTemplates,
    build.requestTemplates,
    "Raid Feral publication wire templates changed",
  );
  async function completed(ref: RaidFeralEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: RaidFeralEvidenceReference;
    declarationRef: RaidFeralEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: referenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = referenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Raid Feral study identity changed",
    );
    return {
      result,
      declaration: record.parse(await reference(declarationRef)),
      resultRef: completion.result,
      declarationRef,
    };
  }
  const evidence = build.evidence,
    state = await completed(evidence.state),
    applicability = await completed(evidence.applicability),
    confirmation = await completed(evidence.confirmation);
  for (const [study, resultRef, declarationRef, schema] of [
    [
      state,
      evidence.stateResult,
      evidence.stateDeclaration,
      "kfc-feral-raid-core-actual-gear-state-study.v1",
    ],
    [
      applicability,
      evidence.applicabilityResult,
      evidence.applicabilityDeclaration,
      "kfc-feral-raid-retained-gear-applicability-study.v1",
    ],
    [
      confirmation,
      evidence.confirmationResult,
      evidence.confirmationDeclaration,
      "kfc-feral-seven-buff-independent-confirmation-study.v1",
    ],
  ] as const) {
    same(study.resultRef, resultRef, "Raid Feral result reference changed");
    same(study.declarationRef, declarationRef, "Raid Feral declaration reference changed");
    requireMatch(
      study.declaration.schema === schema &&
        study.declaration.sourceRelease === build.sourceRelease,
      "Raid Feral source role/engine changed",
    );
    same(
      study.declaration.importedJournals,
      [],
      "Raid Feral imported another model's numerical origins",
    );
  }
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedRaidFeralDelivery.confirmationSha256,
    "Unreviewed Raid Feral confirmation requires a new delivery review",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.applicability,
    "Raid Feral lost applicability completion",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.applicabilityResult,
    "Raid Feral lost applicability result",
  );
  const backend = record.parse(confirmation.declaration.backend),
    feedback = record.parse(record.parse(applicability.result.semantic).evaluation),
    stateFeedback = record.parse(record.parse(state.result.semantic).evaluation);
  same(state.declaration.backend, backend, "Raid Feral state used another model");
  same(applicability.declaration.backend, backend, "Raid Feral gear used another model");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      feedback.gearApplicabilityClosed === true &&
      feedback.stateRecheckRequired === false &&
      feedback.fullCurrentPoolSweep === false,
    "Raid Feral applicability/model not closed",
  );
  for (const result of [feedback, stateFeedback]) {
    same(result.settings, build.settings, "Raid Feral feedback settings changed");
    same(result.state, build.state, "Raid Feral feedback state changed");
  }
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = z.array(record).length(12).parse(plan.arms),
    seeds = z.array(z.number().int().positive().safe()).length(2).parse(plan.seeds),
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row]));
  requireMatch(templates.size === arms.length, "Missing/duplicate Raid Feral wire frames");
  const request = (
    arm: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const name = z.string().parse(arm.name),
      template = templates.get(name),
      player = record.parse(record.parse(arm.settings).player);
    requireMatch(
      template && template.requestSource === arm.requestSource,
      "Missing/mislabelled Raid Feral wire frame",
    );
    return {
      requestBase64: template.requestBase64,
      gear: record.parse(player.equipment).items,
      talentsString: player.talentsString,
      rotation: player.rotation,
      iterations,
      seed,
      detail: false,
    };
  };
  for (const arm of arms)
    requireMatch(
      hash(request(arm, 10000, 77191)) === record.parse(arm.inspected).id,
      "Raid Feral inspected request changed",
    );
  same(
    plan.requestIds,
    seeds.flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "Raid Feral holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "Raid Feral selected a new winner from holdouts");
  const evaluation = record.parse(record.parse(confirmation.result.semantic).evaluation),
    approval = record.parse(evaluation.review),
    original = record.parse(approval.originalAssessment),
    records = z
      .array(
        z
          .object({
            seed: z.number().int().positive().safe(),
            arm: z.string(),
            metric: z
              .object({
                id: digest,
                dps: z.number().finite().positive(),
                stdev: z.number().finite().nonnegative(),
                iterations: z.number().int().positive(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(24)
      .parse(original.records),
    math = evaluateApprovedSimulatorConfirmation(approved, records);
  requireMatch(
    math.accepted &&
      evaluation.readyForSelectedDelivery === true &&
      evaluation.publicPromotionAllowed === false,
    "Raid Feral exceeds approved margin or bypasses handoff",
  );
  same(approval, build.approval, "Raid Feral exported approval changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Raid Feral approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Feral1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted &&
      math.originalAssessment.strictRetainedDominancePassed ===
        build.scope.strictRetainedDominancePassed,
    "Raid Feral disclosed precision changed",
  );
  const reservation = record.parse(await reference(referenceSchema.parse(evaluation.reservation))),
    originalWirePlan = record.parse(
      record.parse(confirmation.declaration.confirmationPlan).originalPlan,
    );
  requireMatch(
    reservation.planSha256 === hash(originalWirePlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Raid Feral reservation changed",
  );
  same(reservation.seeds, seeds, "Raid Feral reserved seed ranges changed");
  const summary = record.parse(await reference(evidence.confirmationSummary));
  same(summary.review, approval, "Raid Feral confirmation summary changed");
  requireMatch(
    evidence.parity.sha256 === verifiedRaidFeralDelivery.paritySha256,
    "Unreviewed Raid Feral browser parity",
  );
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-feral-raid-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings) &&
      descriptor.freshReferenceDps === build.referenceDps &&
      descriptor.freshReferenceIterations === 40000 &&
      record.parse(parity.prepared).playerClass === 1,
    "Actual selected Raid Feral browser parity missing",
  );
  same(parity.errors, [], "Raid Feral browser had errors");
  same(descriptor.backend, backend, "Raid Feral parity used another backend");
  same(native, arms[0]?.inspected, "Raid Feral selected native origin changed");
  const player = record.parse(build.settings.player),
    encounter = record.parse(build.settings.encounter),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    raid = record.parse(build.settings.raidBuffs),
    party = record.parse(build.settings.partyBuffs),
    expectedBuffs = {
      moonkinAura: true,
      leaderOfThePack: true,
      trueshotAura: true,
      battleShout: "TristateEffectRegular",
      strengthOfEarthTotem: "TristateEffectRegular",
      graceOfAirTotem: "TristateEffectRegular",
    };
  for (const [name, value] of Object.entries(expectedBuffs)) {
    requireMatch(
      raid[name] === value && !Object.hasOwn(party, name),
      "Raid Feral core buff missing/duplicated: " + name,
    );
  }
  requireMatch(
    party.windfuryTotem === true && !party.flametongueTotem,
    "Raid Feral weapon totem changed",
  );
  same(build.raidBuffPolicy.raid, expectedBuffs, "Raid Feral raid-buff policy changed");
  same(build.raidBuffPolicy.party, { windfuryTotem: true }, "Raid Feral party-buff policy changed");
  requireMatch(
    player.class === "ClassDruid" &&
      player.level === 60 &&
      player.distanceFromTarget === 5 &&
      player.inFrontOfTarget === false &&
      Boolean(player.feralDruid) &&
      !player.balanceDruid &&
      (player.foreverTier1Bonuses === undefined || player.foreverTier1Bonuses === false) &&
      (player.enableItemSwap === undefined || player.enableItemSwap === false) &&
      player.talentsString === "050022-45010032021030212051-055" &&
      player.talentsString === build.state.talentsString &&
      build.state.conjured === "rune" &&
      record.parse(player.consumes).defaultConjured === "ConjuredDemonicRune" &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      encounter.duration === 300 &&
      (encounter.durationVariation === undefined || encounter.durationVariation === 0) &&
      z.array(record).length(1).parse(encounter.targets)[0]?.level === 63 &&
      z.array(record).length(17).parse(record.parse(player.equipment).items).length === 17 &&
      hash(rotation) === guide.rotationSha256,
    "Raid Feral measured setup/guide changed",
  );
  const expectedGuide = feralSimulatorGuidanceText(rotation, "rune");
  for (const key of ["prepull", "priorities", "instruction", "scenario", "caveats"] as const)
    same(guide[key], expectedGuide[key], "Raid Feral guide disagrees with measured APL: " + key);
  for (const [bindings, actions, text] of [
    [guide.priorityBindings, z.array(record).parse(rotation.priorityList), guide.priorities],
    [guide.prepullBindings, z.array(record).parse(rotation.prepullActions ?? []), guide.prepull],
  ] as const) {
    requireMatch(
      bindings.length === actions.length && bindings.length === text.length,
      "Raid Feral guide omitted actions",
    );
    bindings.forEach((binding, index): void =>
      requireMatch(
        binding.index === index &&
          binding.actionSha256 === hash(actions[index]) &&
          binding.text === text[index],
        "Raid Feral guide action binding changed",
      ),
    );
  }
  return build;
}
