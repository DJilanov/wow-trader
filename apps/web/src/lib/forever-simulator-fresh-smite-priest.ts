import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
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
              })
              .passthrough(),
          )
          .min(2)
          .max(12),
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
        requestIds: z.array(digest).min(4).max(24),
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
export const smitePriestModelEvidenceReferenceSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(240)
      .refine(
        (path: string): boolean =>
          /^(?:artifacts\/forever-simulator\/)?optimization\/.+\.json$/.test(path) &&
          !path.includes("\\") &&
          !path.includes("\0") &&
          !path.split("/").includes(".."),
      ),
    sha256: digest,
    byteSha256: digest.optional(),
  })
  .strict();
export type SmitePriestModelEvidenceReference = z.infer<
  typeof smitePriestModelEvidenceReferenceSchema
>;
export const smitePriestModelEntrySchema = z
  .object({
    id: z.literal("priest-smite-static"),
    profile: z.literal("smite_priest"),
    build: smitePriestModelEvidenceReferenceSchema,
    settingsSha256: digest,
    hrefSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    requestTemplates: z
      .array(
        z
          .object({ arm: z.string().min(1).max(80), requestBase64: z.string().min(20).max(512000) })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
export type SmitePriestModelEntry = z.infer<typeof smitePriestModelEntrySchema>;

// This is the independently replayed export, not a wildcard approval of future Priest results.
// New studies require their own numerical review and browser handoff before changing this pin.
export const verifiedSmitePriestDelivery = Object.freeze({
  sourceRelease: "bbbde15964092df1ecbf1dec",
  buildSha256: "b66a63df10b5a598bc65c719ae51d4ab71ef4bcce2b0a7b35caf454bf55076a6",
  confirmationSha256: "d2abe81d0113878d29d668348a96114aefc62472887af2d39d34992be3aea203",
});
const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("priest-smite-static"),
    profile: z.literal("smite_priest"),
    variant: z.literal("smite"),
    name: z.literal("Smite · pre-raid tested"),
    sourceRelease: z.literal(verifiedSmitePriestDelivery.sourceRelease),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: digest,
    nativeBinarySha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    evidence: z
      .object({
        anchor: smitePriestModelEvidenceReferenceSchema,
        anchorResult: smitePriestModelEvidenceReferenceSchema,
        gear: smitePriestModelEvidenceReferenceSchema,
        gearResult: smitePriestModelEvidenceReferenceSchema,
        feedback: smitePriestModelEvidenceReferenceSchema,
        feedbackResult: smitePriestModelEvidenceReferenceSchema,
        confirmation: smitePriestModelEvidenceReferenceSchema,
        confirmationResult: smitePriestModelEvidenceReferenceSchema,
        confirmationDeclaration: smitePriestModelEvidenceReferenceSchema,
        parity: smitePriestModelEvidenceReferenceSchema,
        consumeModel: smitePriestModelEvidenceReferenceSchema,
        catalogModel: smitePriestModelEvidenceReferenceSchema,
      })
      .strict(),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-smite-priest-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.string(),
        scenario: z.string(),
        instruction: z.string(),
        priorities: z.array(z.string()).min(1),
        priorityBindings: z.array(
          z
            .object({
              index: z.number().int().nonnegative(),
              actionSha256: digest,
              text: z.string(),
            })
            .strict(),
        ),
        prepull: z.array(z.string().min(1)).length(0),
        prepullBindings: z
          .array(
            z
              .object({
                index: z.number().int().nonnegative(),
                actionSha256: digest,
                text: z.string().min(1),
              })
              .strict(),
          )
          .length(0),
        caveats: z.array(z.string()).min(1),
      })
      .strict(),
    scope: z
      .object({
        name: z.literal("bounded-smite-priest-first-pass.v2"),
        adaptiveRankPoliciesReviewed: z.literal(true),
        rotationPolicies: z.literal(82),
        gearedStateRecheckCompleted: z.literal(true),
        closingFeedbackCompleted: z.literal(true),
        previousModelNumericalReuse: z.literal(false),
        anchorMeasuredOnDifferentEngine: z.literal(false),
        exactCurrentBackendScalarReuse: z.literal(true),
        stateChanged: z.literal(false),
        finalGearSmallGainStop: z.literal(true),
        gearApplicabilityRequired: z.literal(false),
        selectionChanged: z.literal(false),
        globalOptimalityProven: z.literal(false),
        maximumRetainedGapFraction: z.literal(0.02),
        largestConservativeRetainedGapFraction: z.number().nonnegative(),
        originalStrictAssessmentAccepted: z.boolean(),
        numericalJobs: z.number().int().positive(),
        numericalIterations: z.number().int().positive(),
      })
      .passthrough(),
    requiresProvisionalEnchantOptIn: z.literal(false),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .passthrough();
export type FreshSmitePriestSimulatorBuild = z.infer<typeof buildSchema>;
export interface SmitePriestModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: SmitePriestModelEvidenceReference) => Promise<unknown>;
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

export async function readFreshSmitePriestSimulatorBuild(
  rawEntry: SmitePriestModelEntry,
  options: SmitePriestModelBuildOptions,
): Promise<FreshSmitePriestSimulatorBuild> {
  const entry = smitePriestModelEntrySchema.parse(rawEntry);
  async function reference(raw: SmitePriestModelEvidenceReference): Promise<unknown> {
    const ref = smitePriestModelEvidenceReferenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Smite Priest evidence checksum changed: " + ref.path);
    return value;
  }
  requireMatch(
    entry.build.sha256 === verifiedSmitePriestDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/priest-smite-first-pass-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed Smite Priest export requires a new delivery review",
  );
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Smite Priest publication model/settings/DPS changed",
  );
  async function completed(ref: SmitePriestModelEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: SmitePriestModelEvidenceReference;
    declarationRef: SmitePriestModelEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: smitePriestModelEvidenceReferenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = smitePriestModelEvidenceReferenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Smite Priest source identity changed",
    );
    return {
      result,
      declaration: record.parse(await reference(declarationRef)),
      resultRef: completion.result,
      declarationRef,
    };
  }
  const evidence = build.evidence,
    anchor = await completed(evidence.anchor),
    geared = await completed(evidence.gear),
    feedback = await completed(evidence.feedback),
    confirmation = await completed(evidence.confirmation),
    model = record.parse(await reference(evidence.consumeModel)),
    catalog = record.parse(await reference(evidence.catalogModel));
  same(anchor.resultRef, evidence.anchorResult, "Current Smite Priest blue result changed");
  same(geared.resultRef, evidence.gearResult, "Current Smite Priest gear result changed");
  same(feedback.resultRef, evidence.feedbackResult, "Current Smite Priest feedback result changed");
  same(
    confirmation.resultRef,
    evidence.confirmationResult,
    "Smite Priest confirmation result changed",
  );
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Smite Priest confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedSmitePriestDelivery.confirmationSha256,
    "Unreviewed Smite Priest confirmation",
  );
  requireMatch(
    anchor.declaration.sourceRelease === build.sourceRelease &&
      geared.declaration.sourceRelease === build.sourceRelease &&
      anchor.declaration.schema === "kfc-full-raid-smite-priest-blue-declaration.v1" &&
      geared.declaration.schema === "kfc-smite-priest-first-pass-gear-declaration.v1" &&
      anchor.declaration.expectedPlayerClass === 5 &&
      geared.declaration.expectedPlayerClass === 5 &&
      feedback.declaration.schema === "kfc-smite-priest-feedback-declaration.v2" &&
      feedback.declaration.phase === "correction" &&
      feedback.declaration.expectedPlayerClass === 5 &&
      [anchor.declaration, geared.declaration, feedback.declaration].every(
        (declaration): boolean =>
          declaration.profile === "smite_priest" && declaration.variant === "smite",
      ),
    "Smite Priest source chain changed or reused a different engine",
  );
  requireMatch(
    feedback.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.schema ===
        "kfc-smite-priest-independent-confirmation-declaration.v1" &&
      confirmation.declaration.expectedPlayerClass === 5,
    "Current Smite Priest engine/class changed",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.feedback,
    "Smite Priest confirmation lost its closed feedback",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.feedbackResult,
    "Smite Priest confirmation lost its feedback result",
  );
  same(
    geared.declaration.sourceCompletion,
    evidence.anchor,
    "Smite Priest gear lost its measured blue source",
  );
  same(
    geared.declaration.sourceResult,
    evidence.anchorResult,
    "Smite Priest gear lost its blue result",
  );
  same(
    feedback.declaration.sourceCompletion,
    evidence.gear,
    "Smite Priest feedback lost its measured gear source",
  );
  same(
    feedback.declaration.sourceResult,
    evidence.gearResult,
    "Smite Priest feedback lost its gear result",
  );
  const backend = record.parse(confirmation.declaration.backend);
  same(anchor.declaration.backend, backend, "Smite Priest blue used another backend");
  same(geared.declaration.backend, backend, "Smite Priest gear used another backend");
  same(
    geared.declaration.importedJournals,
    anchor.result.journals,
    "Smite Priest gear origin reuse changed",
  );
  same(
    feedback.declaration.importedJournals,
    geared.result.journals,
    "Smite Priest feedback origin reuse changed",
  );
  same(
    confirmation.declaration.importedJournals,
    feedback.result.journals,
    "Smite Priest confirmation origin reuse changed",
  );
  same(feedback.declaration.backend, backend, "Current Smite Priest models disagree");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      catalog.schema === "kfc-priest-pvp-model-context.v1" &&
      catalog.release === build.sourceRelease &&
      catalog.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(catalog.descriptor).databaseSha256 === build.dbSha256 &&
      record.parse(catalog.descriptor).parentModel === model.release &&
      model.schema === "kfc-greater-mageblood-model-context.v1" &&
      model.release === "a4eabfa5c89f3813c1b74bde",
    "Smite Priest Greater20 model provenance changed",
  );
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).max(3).parse(closing.cycles),
    last = cycles.at(-1),
    closingState = record.parse(last?.state ?? closing.initialRecheck),
    closingGear = record.parse(last?.gear ?? record.parse(geared.result.semantic).evaluation);
  requireMatch(
    closing.schema === "kfc-smite-priest-feedback-result.v2" &&
      closing.closed === true &&
      closing.gearApplicabilityRequired === false &&
      closing.previousModelNumericalReuse === false &&
      closing.independentFinalValidation === false &&
      (!last || last.closed === true) &&
      closingState.materialChange === false &&
      closingState.stateChanged === false &&
      closingState.gearApplicabilityRequired === false &&
      closingGear.stoppedForSmallGain === true,
    "Current Smite Priest feedback did not close",
  );
  same(closing.settings, build.settings, "Smite Priest export lost its selected settings");
  same(closing.state, build.state, "Smite Priest export lost its selected state");
  const initialGear = record.parse(record.parse(geared.result.semantic).evaluation),
    allGearResults = [
      initialGear,
      ...cycles.map((cycle): Record<string, unknown> => record.parse(cycle.gear)),
    ];
  requireMatch(
    record.parse(closing.initialRecheck).requiresGearContinuation ===
      !initialGear.stoppedForSmallGain,
    "Smite Priest initial capped gear skipped applicability",
  );
  const sweeps = allGearResults.flatMap((gear): Record<string, unknown>[] =>
    z.array(record).min(1).max(2).parse(gear.sweeps),
  );
  requireMatch(
    build.scope.currentModelGearSweeps === sweeps.length,
    "Smite Priest gear sweep disclosure changed",
  );
  for (const sweep of sweeps) {
    z.array(z.array(z.number().int().nonnegative()).min(1))
      .length(17)
      .parse(sweep.candidateIdsBySlot);
    const names = new Set(
      z
        .array(record)
        .parse(sweep.groups)
        .map((group): string => z.string().parse(group.name)),
    );
    for (const name of [
      ...Array.from({ length: 10 }, (_, index): string => `slot:${index}`),
      "slot:14",
      "slot:15",
      "slot:16",
      "pair:14+15",
      "pair:10+11",
      "pair:12+13",
      "expanded-sets",
    ])
      requireMatch(names.has(name), "Current Smite Priest audit omitted a gear slot/pair/set");
  }
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = plan.arms,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  const adaptiveArms = arms.filter(
    (arm): boolean => record.parse(record.parse(arm.state).rotationPolicy).rankBudget !== undefined,
  );
  requireMatch(
    adaptiveArms.length > 0 && adaptiveArms.length < arms.length,
    "Smite Priest confirmation omitted the measured fixed/adaptive-rank comparison",
  );
  requireMatch(
    templates.size === arms.length && templates.size === entry.requestTemplates.length,
    "Smite Priest wire templates missing/duplicated",
  );
  const request = (
    arm: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings && record.parse(arm.settings).player),
      requestBase64 = templates.get(z.string().parse(arm.name));
    requireMatch(requestBase64, "Missing Smite Priest wire frame");
    return {
      requestBase64,
      gear: record.parse(player.equipment).items,
      talentsString: player.talentsString,
      rotation: player.rotation,
      iterations,
      seed,
      detail: false,
    };
  };
  for (const arm of arms) {
    const settings = record.parse(arm.settings),
      player = record.parse(settings.player);
    for (const [values, required] of [
      [settings.raidBuffs, fullRaidDefaults.raid],
      [settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(values);
      for (const [name, value] of Object.entries(required))
        same(actual[name], value, "Smite Priest full-raid buff changed: " + name);
    }
  }
  for (const arm of arms)
    requireMatch(
      hash(request(arm, 10000, 77191)) === record.parse(arm.inspected).id,
      "Smite Priest inspected request changed",
    );
  same(
    plan.requestIds,
    z
      .array(z.number().int().positive().safe())
      .length(2)
      .parse(plan.seeds)
      .flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "Smite Priest holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "Smite Priest incumbent changed after confirmation");
  const approval = record.parse(record.parse(confirmation.result.semantic).evaluation),
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
      .min(4)
      .max(24)
      .parse(original.records),
    math = evaluateApprovedSimulatorConfirmation(approved, records);
  requireMatch(math.accepted, "Smite Priest exceeds approved2% retained margin");
  same(approval, build.approval, "Smite Priest exported confirmation changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Smite Priest approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Smite Priest1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Smite Priest disclosed precision changed",
  );
  const reservation = record.parse(
    await reference(smitePriestModelEvidenceReferenceSchema.parse(approval.reservation)),
  );
  requireMatch(
    reservation.identity === verifiedSmitePriestDelivery.confirmationSha256 &&
      reservation.planSha256 ===
        hash(record.parse(record.parse(confirmation.declaration.confirmationPlan).originalPlan)) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Smite Priest RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Smite Priest reserved seed ranges changed");
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-smite-priest-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Actual Smite Priest selected browser parity missing",
  );
  same(descriptor.backend, backend, "Smite Priest parity used another backend");
  same(native, arms[0]?.inspected, "Smite Priest parity native origin changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList);
  requireMatch(
    player.class === "ClassPriest" &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.talentsString === "50403003103-305151000320005-50002" &&
      record.parse(player.consumes).mainHandImbue === "WizardOil" &&
      record.parse(player.consumes).defaultConjured === "ConjuredDemonicRune" &&
      guide.talents === "19/25/7" &&
      guide.priorityBindings.length === actions.length,
    "Smite Priest build/guide lost its measured model or actions",
  );
  guide.priorityBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(actions[index]) &&
        binding.text === guide.priorities[index],
      "Smite Priest rotation instruction changed",
    ),
  );
  const optionsPlayer = record.parse(record.parse(player.smitePriest).options),
    prepull = z
      .array(record)
      .length(0)
      .parse(rotation.prepullActions ?? []);
  requireMatch(
    optionsPlayer.armor === "InnerFire" &&
      build.state.talentsString === player.talentsString &&
      player.channelClipDelayMs === 100 &&
      guide.prepullBindings.length === prepull.length &&
      guide.prepull.length === prepull.length &&
      guide.caveats.some((text): boolean => text.includes("outside healing")),
    "Smite Priest Inner Fire, timing or survival guidance changed",
  );
  guide.prepullBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(prepull[index]) &&
        binding.text === guide.prepull[index],
      "Smite Priest pre-pull instruction changed",
    ),
  );
  same(prepull, [], "Smite Priest has no measured prepull actions");
  return build;
}
