import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { frostModelEvidenceReferenceSchema } from "./forever-simulator-fresh-frost";
import { hunterBeastMasteryDeliveryDefinition } from "./forever-simulator-hunter-reviews";
import { hunterMarksmanshipDeliveryDefinition } from "./forever-simulator-hunter-marksmanship-reviews";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown()),
  referenceSchema = frostModelEvidenceReferenceSchema;
export type RaidHunterEvidenceReference = z.infer<typeof referenceSchema>;
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

export const raidHunterModelEntrySchema = z
  .object({
    id: z.enum([
      "hunter-beast-mastery-static",
      "hunter-marksmanship-static",
      "hunter-survival-static",
    ]),
    profile: z.literal("hunter"),
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
export type RaidHunterModelEntry = z.infer<typeof raidHunterModelEntrySchema>;

export const verifiedRaidHunterDeliveries = Object.freeze([
  {
    key: "bm",
    id: "hunter-beast-mastery-static",
    internalId: "hunter-beast-mastery",
    variant: "beast_mastery",
    buildSha256: "c1639945a99fb2e7ab8b5ae469ebeb5cd808f81bcfcad8c1328e0e53088536df",
    confirmationSha256: "ff705895222ad89a75f539157a8c1664352fe553cdd323f69668b2423250d280",
    paritySha256: "e9f23c7e22c7a5133e3ce994630e11d29004afdae5f4a6b65e3f4fc268d3b5b6",
  },
  {
    key: "mm",
    id: "hunter-marksmanship-static",
    internalId: "hunter-marksmanship",
    variant: "marksmanship",
    buildSha256: "dde8f58d66bc02dbb17b7f5551755e48fe157ce7e0802ab3a17f4a94acef3d52",
    confirmationSha256: "26bf389e72ff5d4b602b4dbcbcf7b561c4a7ad59237d505cf057ddedf93e4394",
    paritySha256: "00a238d699627193593ab2fcad85284d2f998b4e313a403b4d982b2b866e7933",
  },
  {
    key: "sv",
    id: "hunter-survival-static",
    internalId: "hunter-survival",
    variant: "survival",
    buildSha256: "2ffd6a535c009e2ee3e563924b75768c746821f4068253802c3ffc8a25fc1d7e",
    confirmationSha256: "485fc9f2f0f7530cf7605c44cefca90553f47c11940109e7d5371c4598ac7a32",
    paritySha256: "1897547c999fbf893cf7fce583b7c74fcd3cbdfae5f1258555df6e009402015f",
  },
]);
const binding = z
  .object({ index: z.number().int().nonnegative(), actionSha256: digest, text: z.string().min(1) })
  .strict();
const buildSchema = z
  .object({
    schema: z.literal("kfc-raid-revalidated-prebis-build.v1"),
    id: z.string(),
    profile: z.literal("hunter"),
    variant: z.enum(["beast_mastery", "marksmanship", "survival"]),
    name: z.string().min(1),
    sourceRelease: z.literal("a4eabfa5c89f3813c1b74bde"),
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
        schema: z.string(),
        rotationSha256: digest,
        talents: z.string(),
        petType: z.enum(["PetNone", "Cat", "Raptor", "WindSerpent", "CarrionBird", "Scorpid"]),
        prepull: z.array(z.string()).max(8),
        prepullBindings: z.array(binding).max(8),
        petInstruction: z.string(),
        scenario: z.string(),
        instruction: z.string(),
        priorities: z.array(z.string()).min(1).max(32),
        priorityBindings: z.array(binding).min(1).max(32),
        caveats: z.array(z.string()).min(1).max(20),
      })
      .strict(),
    requestTemplates: raidHunterModelEntrySchema.shape.requestTemplates,
    evidence: z
      .object({
        previousBuild: referenceSchema,
        consumeBridge: referenceSchema,
        consumeBridgeAudit: referenceSchema,
        fullGear: referenceSchema,
        fullGearResult: referenceSchema,
        fullGearDeclaration: referenceSchema,
        state: referenceSchema,
        stateResult: referenceSchema,
        stateDeclaration: referenceSchema,
        unchangedStateGearApplicability: z
          .object({
            mode: z.literal("exact-full-gear-state-unchanged"),
            stateSummary: referenceSchema,
            fullGearSelection: referenceSchema,
            separateCorrectionRequired: z.literal(false),
          })
          .strict(),
        confirmation: referenceSchema,
        confirmationResult: referenceSchema,
        confirmationDeclaration: referenceSchema,
        confirmationSummary: referenceSchema,
        parity: referenceSchema,
      })
      .strict(),
    scope: z
      .object({
        name: z.literal("seven-buff-raid-revalidation-practical-first-pass.v1"),
        sourceRole: z.string(),
        stateRecheckCompleted: z.literal(true),
        gearApplicabilityReviewed: z.literal(true),
        fullCurrentPoolSweep: z.literal(true),
        currentPoolCounts: z.array(z.number().int().positive()).length(17),
        currentUniqueGearProposals: z.number().int().positive(),
        freshConfirmationCoverage: record.optional(),
        maximumRetainedGapFraction: z.literal(0.02),
        largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
        originalStrictAssessmentAccepted: z.boolean(),
        strictRetainedDominancePassed: z.boolean(),
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
export type RaidHunterSimulatorBuild = z.infer<typeof buildSchema>;
export interface RaidHunterModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: RaidHunterEvidenceReference) => Promise<unknown>;
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

export async function readRaidHunterSimulatorBuild(
  rawEntry: RaidHunterModelEntry,
  options: RaidHunterModelBuildOptions,
): Promise<RaidHunterSimulatorBuild> {
  const entry = raidHunterModelEntrySchema.parse(rawEntry),
    verified = verifiedRaidHunterDeliveries.find((row) => row.id === entry.id);
  requireMatch(
    verified && entry.build.sha256 === verified.buildSha256,
    "Unreviewed Raid Hunter export requires a new delivery review",
  );
  async function reference(raw: RaidHunterEvidenceReference): Promise<unknown> {
    const ref = referenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Raid Hunter evidence checksum changed: " + ref.path);
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    entry.build.path ===
      `artifacts/forever-simulator/optimization/hunter-${verified.key}-raid-delivery-v1/build-${entry.build.sha256.slice(0, 16)}.json` &&
      options.sourceRelease === build.sourceRelease &&
      options.revision === "9a27c3d6af91d1ca0dbcf94a124b8869ad522108" &&
      build.dbSha256 === options.databaseSha256 &&
      build.id === verified.internalId &&
      build.variant === verified.variant &&
      build.referenceDps === entry.referenceDps &&
      hash(build.settings) === entry.settingsSha256 &&
      build.revision ===
        hash({ evidence: build.evidence, exportSourceFiles: build.exportSourceFiles }).slice(0, 40),
    "Raid Hunter publication/model/settings changed",
  );
  same(entry.requestTemplates, build.requestTemplates, "Raid Hunter wire templates changed");
  async function completed(ref: RaidHunterEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: RaidHunterEvidenceReference;
    declarationRef: RaidHunterEvidenceReference;
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
      "Raid Hunter study identity changed",
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
    gear = await completed(evidence.fullGear),
    confirmation = await completed(evidence.confirmation);
  for (const [study, resultRef, declarationRef, schema] of [
    [
      state,
      evidence.stateResult,
      evidence.stateDeclaration,
      `kfc-hunter-${verified.key}-raid-core-actual-gear-state-study.v1`,
    ],
    [
      gear,
      evidence.fullGearResult,
      evidence.fullGearDeclaration,
      `kfc-hunter-${verified.key}-raid-core-fixed-state-gear-study.v1`,
    ],
    [
      confirmation,
      evidence.confirmationResult,
      evidence.confirmationDeclaration,
      `kfc-hunter-${verified.key}-seven-buff-independent-confirmation-study.v1`,
    ],
  ] as const) {
    same(study.resultRef, resultRef, "Raid Hunter result changed");
    same(study.declarationRef, declarationRef, "Raid Hunter declaration changed");
    requireMatch(
      study.declaration.schema === schema &&
        study.declaration.sourceRelease === build.sourceRelease,
      "Raid Hunter source role/model changed",
    );
    same(study.declaration.importedJournals, [], "Raid Hunter imported old-context measurements");
  }
  requireMatch(
    confirmation.declarationRef.sha256 === verified.confirmationSha256,
    "Unreviewed Raid Hunter confirmation",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.state,
    "Raid Hunter lost state applicability",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.stateResult,
    "Raid Hunter lost state result",
  );
  const backend = record.parse(confirmation.declaration.backend),
    stateFeedback = record.parse(record.parse(state.result.semantic).evaluation),
    gearFeedback = record.parse(record.parse(gear.result.semantic).evaluation);
  same(state.declaration.backend, backend, "Raid Hunter state backend changed");
  same(gear.declaration.backend, backend, "Raid Hunter gear backend changed");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      stateFeedback.materialChange === false &&
      stateFeedback.gearApplicabilityRequired === false &&
      gearFeedback.stoppedForSmallGain === true,
    "Raid Hunter full-gear/unchanged-state applicability is not closed",
  );
  same(stateFeedback.settings, build.settings, "Raid Hunter selected state settings changed");
  same(stateFeedback.state, build.state, "Raid Hunter selected state changed");
  same(gearFeedback.settings, build.settings, "Raid Hunter gear belongs to a different state");
  same(
    state.declaration.initialState,
    build.state,
    "Raid Hunter state changed after full gear sweep",
  );
  same(
    record.parse(gear.declaration.coverage).itemsBySlot,
    build.scope.currentPoolCounts,
    "Raid Hunter slot coverage changed",
  );
  requireMatch(
    record.parse(gear.declaration.coverage).uniqueProposals ===
      build.scope.currentUniqueGearProposals,
    "Raid Hunter gear proposal coverage changed",
  );
  if (build.scope.freshConfirmationCoverage !== undefined)
    same(
      build.scope.freshConfirmationCoverage,
      confirmation.declaration.coverage,
      "Raid Hunter fresh coverage was relabelled",
    );
  const applicability = evidence.unchangedStateGearApplicability;
  same(
    record.parse(state.declaration.parent).gearSelection,
    applicability.fullGearSelection,
    "Raid Hunter lost full gear selection",
  );
  const gearSelection = record.parse(await reference(applicability.fullGearSelection)),
    stateSummary = record.parse(await reference(applicability.stateSummary));
  same(
    gearSelection.completion,
    await reference(evidence.fullGear),
    "Raid Hunter gear selection completion changed",
  );
  same(
    stateSummary.completion,
    await reference(evidence.state),
    "Raid Hunter state summary completion changed",
  );
  same(
    record.parse(gear.declaration.parent).comparison,
    evidence.consumeBridge,
    "Raid Hunter consume bridge changed",
  );
  same(
    record.parse(gear.declaration.parent).audit,
    evidence.consumeBridgeAudit,
    "Raid Hunter consume bridge audit changed",
  );
  await reference(evidence.consumeBridge);
  await reference(evidence.consumeBridgeAudit);
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = z.array(record).length(12).parse(plan.arms),
    seeds = z.array(z.number().int().positive().safe()).length(2).parse(plan.seeds),
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row]));
  requireMatch(templates.size === arms.length, "Missing/duplicate Raid Hunter wire frames");
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
      "Missing/mislabelled Raid Hunter wire frame",
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
      "Raid Hunter inspected request changed",
    );
  same(
    plan.requestIds,
    seeds.flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "Raid Hunter holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "Raid Hunter selected a new winner from holdouts");
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
    "Raid Hunter exceeds approved margin or bypasses handoff",
  );
  same(approval, build.approval, "Raid Hunter exported approval changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Raid Hunter approval math changed: " + key);
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
    "Raid Hunter disclosed precision changed",
  );
  const reservation = record.parse(await reference(referenceSchema.parse(evaluation.reservation))),
    originalWirePlan = record.parse(
      record.parse(confirmation.declaration.confirmationPlan).originalPlan,
    );
  requireMatch(
    reservation.planSha256 === hash(originalWirePlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Raid Hunter reservation changed",
  );
  same(reservation.seeds, seeds, "Raid Hunter reserved seed ranges changed");
  const summary = record.parse(await reference(evidence.confirmationSummary));
  same(summary.review, approval, "Raid Hunter confirmation summary changed");

  requireMatch(
    evidence.parity.sha256 === verified.paritySha256,
    "Unreviewed Raid Hunter browser parity",
  );
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === `kfc-hunter-${verified.key}-raid-selected-parity-review.v1` &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings) &&
      descriptor.freshReferenceDps === build.referenceDps &&
      descriptor.freshReferenceIterations === 40000 &&
      record.parse(parity.prepared).playerClass === 2,
    "Actual Raid Hunter browser parity missing",
  );
  same(parity.errors, [], "Raid Hunter browser errors");
  same(descriptor.backend, backend, "Raid Hunter parity backend changed");
  same(native, arms[0]?.inspected, "Raid Hunter selected origin changed");
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
  for (const [name, value] of Object.entries(expectedBuffs))
    requireMatch(
      raid[name] === value && !Object.hasOwn(party, name),
      "Raid Hunter core buff missing/duplicated: " + name,
    );
  same(build.raidBuffPolicy.raid, expectedBuffs, "Raid Hunter raid buff policy changed");
  same(
    build.raidBuffPolicy.party,
    { windfuryTotem: true },
    "Raid Hunter party buff policy changed",
  );
  requireMatch(
    party.windfuryTotem === true &&
      !party.flametongueTotem &&
      player.class === "ClassHunter" &&
      [undefined, 0, 60].includes(player.level as number | undefined) &&
      player.race === "RaceDwarf" &&
      player.distanceFromTarget === (verified.key === "sv" ? 5 : 12) &&
      !player.foreverTier1Bonuses &&
      !player.enableItemSwap &&
      player.talentsString === build.state.talentsString &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      encounter.duration === 300 &&
      [undefined, 0].includes(encounter.durationVariation as number | undefined) &&
      z.array(record).length(1).parse(encounter.targets)[0]?.level === 63 &&
      z.array(record).length(17).parse(record.parse(player.equipment).items).length === 17 &&
      hash(rotation) === guide.rotationSha256 &&
      guide.petType === record.parse(record.parse(player.hunter).options).petType,
    "Raid Hunter measured setup or guide changed",
  );
  if (verified.key === "bm")
    hunterBeastMasteryDeliveryDefinition.validateGuidance(guide, { ...player, level: 60 });
  if (verified.key === "mm")
    hunterMarksmanshipDeliveryDefinition.validateGuidance(guide, { ...player, level: 60 });
  for (const [bindings, actions, text] of [
    [guide.priorityBindings, z.array(record).parse(rotation.priorityList), guide.priorities],
    [guide.prepullBindings, z.array(record).parse(rotation.prepullActions ?? []), guide.prepull],
  ] as const) {
    requireMatch(
      bindings.length === actions.length && bindings.length === text.length,
      "Raid Hunter guide omitted actions",
    );
    bindings.forEach((binding, index): void =>
      requireMatch(
        binding.index === index &&
          binding.actionSha256 === hash(actions[index]) &&
          binding.text === text[index],
        "Raid Hunter guide binding changed",
      ),
    );
  }
  return build;
}
