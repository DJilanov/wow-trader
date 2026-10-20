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
export const demonologyModelEvidenceReferenceSchema = z
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
export type DemonologyModelEvidenceReference = z.infer<
  typeof demonologyModelEvidenceReferenceSchema
>;
export const demonologyModelEntrySchema = z
  .object({
    id: z.literal("warlock-demonology-static"),
    profile: z.literal("warlock"),
    build: demonologyModelEvidenceReferenceSchema,
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
export type DemonologyModelEntry = z.infer<typeof demonologyModelEntrySchema>;

// This is the independently replayed export, not a wildcard approval of future Warlock results.
// New studies require their own numerical review and browser handoff before changing this pin.
export const verifiedDemonologyDelivery = Object.freeze({
  sourceRelease: "a4eabfa5c89f3813c1b74bde",
  buildSha256: "5313308452d6281ec79cc1db93c7b1bcb0b24131eea752bf4a105f48a56c95b6",
  confirmationSha256: "a5fe4dfecdeb3064cc64e3ed70fa1df17b56fd13d21a9d63a5d521799fedbc40",
});
const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("warlock-demonology-static"),
    profile: z.literal("warlock"),
    variant: z.literal("demonology"),
    name: z.literal("Demonology · pre-raid tested"),
    sourceRelease: z.literal(verifiedDemonologyDelivery.sourceRelease),
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
        anchor: demonologyModelEvidenceReferenceSchema,
        anchorResult: demonologyModelEvidenceReferenceSchema,
        gear: demonologyModelEvidenceReferenceSchema,
        gearResult: demonologyModelEvidenceReferenceSchema,
        feedback: demonologyModelEvidenceReferenceSchema,
        feedbackResult: demonologyModelEvidenceReferenceSchema,
        confirmation: demonologyModelEvidenceReferenceSchema,
        confirmationResult: demonologyModelEvidenceReferenceSchema,
        confirmationDeclaration: demonologyModelEvidenceReferenceSchema,
        parity: demonologyModelEvidenceReferenceSchema,
        consumeModel: demonologyModelEvidenceReferenceSchema,
      })
      .strict(),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-demonology-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.string(),
        activeDemon: z.enum(["Imp", "Voidwalker", "Succubus", "Felhunter"]),
        sacrificedDemon: z.enum(["NoSummon", "Imp", "Voidwalker", "Succubus", "Felhunter"]),
        weaponStone: z.enum(["Spellstone", "Firestone"]),
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
        prepull: z.array(z.string().min(1)).length(1),
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
          .length(1),
        caveats: z.array(z.string()).min(1),
      })
      .strict(),
    scope: z
      .object({
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
export type FreshDemonologySimulatorBuild = z.infer<typeof buildSchema>;
export interface DemonologyModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: DemonologyModelEvidenceReference) => Promise<unknown>;
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

export async function readFreshDemonologySimulatorBuild(
  rawEntry: DemonologyModelEntry,
  options: DemonologyModelBuildOptions,
): Promise<FreshDemonologySimulatorBuild> {
  const entry = demonologyModelEntrySchema.parse(rawEntry);
  async function reference(raw: DemonologyModelEvidenceReference): Promise<unknown> {
    const ref = demonologyModelEvidenceReferenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Demonology evidence checksum changed: " + ref.path);
    return value;
  }
  requireMatch(
    entry.build.sha256 === verifiedDemonologyDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/warlock-demonology-first-pass-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed Demonology export requires a new delivery review",
  );
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Demonology publication model/settings/DPS changed",
  );
  async function completed(ref: DemonologyModelEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: DemonologyModelEvidenceReference;
    declarationRef: DemonologyModelEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: demonologyModelEvidenceReferenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = demonologyModelEvidenceReferenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Demonology source identity changed",
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
    model = record.parse(await reference(evidence.consumeModel));
  same(anchor.resultRef, evidence.anchorResult, "Current Demonology blue result changed");
  same(geared.resultRef, evidence.gearResult, "Current Demonology gear result changed");
  same(feedback.resultRef, evidence.feedbackResult, "Current Demonology feedback result changed");
  same(
    confirmation.resultRef,
    evidence.confirmationResult,
    "Demonology confirmation result changed",
  );
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Demonology confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedDemonologyDelivery.confirmationSha256,
    "Unreviewed Demonology confirmation",
  );
  requireMatch(
    anchor.declaration.sourceRelease === build.sourceRelease &&
      geared.declaration.sourceRelease === build.sourceRelease &&
      anchor.declaration.schema === "kfc-current20-demonology-blue-declaration.v2" &&
      geared.declaration.schema === "kfc-current20-demonology-first-pass-gear-declaration.v1" &&
      anchor.declaration.expectedPlayerClass === 8 &&
      geared.declaration.expectedPlayerClass === 8 &&
      feedback.declaration.schema === "kfc-current20-demonology-feedback-declaration.v1",
    "Demonology source chain changed or reused a different engine",
  );
  requireMatch(
    feedback.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.schema ===
        "kfc-greater20-demonology-independent-confirmation-declaration.v1" &&
      confirmation.declaration.expectedPlayerClass === 8,
    "Current Demonology engine/class changed",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.feedback,
    "Demonology confirmation lost its closed feedback",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.feedbackResult,
    "Demonology confirmation lost its feedback result",
  );
  same(
    geared.declaration.sourceCompletion,
    evidence.anchor,
    "Demonology gear lost its measured blue source",
  );
  same(
    geared.declaration.sourceResult,
    evidence.anchorResult,
    "Demonology gear lost its blue result",
  );
  same(
    feedback.declaration.sourceCompletion,
    evidence.gear,
    "Demonology feedback lost its measured gear source",
  );
  same(
    feedback.declaration.sourceResult,
    evidence.gearResult,
    "Demonology feedback lost its gear result",
  );
  const backend = record.parse(confirmation.declaration.backend);
  same(anchor.declaration.backend, backend, "Demonology blue used another backend");
  same(geared.declaration.backend, backend, "Demonology gear used another backend");
  same(
    geared.declaration.importedJournals,
    anchor.result.journals,
    "Demonology gear origin reuse changed",
  );
  same(
    feedback.declaration.importedJournals,
    geared.result.journals,
    "Demonology feedback origin reuse changed",
  );
  same(
    confirmation.declaration.importedJournals,
    feedback.result.journals,
    "Demonology confirmation origin reuse changed",
  );
  same(feedback.declaration.backend, backend, "Current Demonology models disagree");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      model.release === build.sourceRelease &&
      model.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(model.descriptor).databaseSha256 === build.dbSha256,
    "Demonology Greater20 model provenance changed",
  );
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(3).parse(closing.cycles),
    last = cycles.at(-1);
  requireMatch(
    closing.schema === "kfc-current20-demonology-feedback-result.v1" &&
      closing.closed === true &&
      closing.gearApplicabilityRequired === false &&
      closing.previousModelNumericalReuse === false &&
      closing.independentFinalValidation === false &&
      last?.closed === true &&
      record.parse(last.state).materialChange === false &&
      record.parse(last.state).stateChanged === false &&
      record.parse(last.state).gearApplicabilityRequired === false &&
      record.parse(last.gear).stoppedForSmallGain === true,
    "Current Demonology feedback did not close",
  );
  same(closing.settings, build.settings, "Demonology export lost its selected settings");
  same(closing.state, build.state, "Demonology export lost its selected state");
  const initialGear = record.parse(record.parse(geared.result.semantic).evaluation),
    allGearResults = [
      initialGear,
      ...cycles.map((cycle): Record<string, unknown> => record.parse(cycle.gear)),
    ];
  requireMatch(
    record.parse(closing.initialRecheck).requiresGearContinuation ===
      !initialGear.stoppedForSmallGain,
    "Demonology initial capped gear skipped applicability",
  );
  const sweeps = allGearResults.flatMap((gear): Record<string, unknown>[] =>
    z.array(record).min(1).max(2).parse(gear.sweeps),
  );
  requireMatch(
    build.scope.currentModelGearSweeps === sweeps.length,
    "Demonology gear sweep disclosure changed",
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
      requireMatch(names.has(name), "Current Demonology audit omitted a gear slot/pair/set");
  }
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = plan.arms,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === arms.length && templates.size === entry.requestTemplates.length,
    "Demonology wire templates missing/duplicated",
  );
  const request = (
    arm: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings && record.parse(arm.settings).player),
      requestBase64 = templates.get(z.string().parse(arm.name));
    requireMatch(requestBase64, "Missing Demonology wire frame");
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
  for (const arm of arms)
    requireMatch(
      hash(request(arm, 10000, 77191)) === record.parse(arm.inspected).id,
      "Demonology inspected request changed",
    );
  same(
    plan.requestIds,
    z
      .array(z.number().int().positive().safe())
      .length(2)
      .parse(plan.seeds)
      .flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "Demonology holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "Demonology incumbent changed after confirmation");
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
  requireMatch(math.accepted, "Demonology exceeds approved2% retained margin");
  same(approval, build.approval, "Demonology exported confirmation changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Demonology approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Demonology1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Demonology disclosed precision changed",
  );
  const reservation = record.parse(
    await reference(demonologyModelEvidenceReferenceSchema.parse(approval.reservation)),
  );
  requireMatch(
    reservation.identity === verifiedDemonologyDelivery.confirmationSha256 &&
      reservation.planSha256 ===
        hash(record.parse(record.parse(confirmation.declaration.confirmationPlan).originalPlan)) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Demonology RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Demonology reserved seed ranges changed");
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-demonology-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Actual Demonology selected browser parity missing",
  );
  same(descriptor.backend, backend, "Demonology parity used another backend");
  same(native, arms[0]?.inspected, "Demonology parity native origin changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList);
  requireMatch(
    player.class === "ClassWarlock" &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.talentsString === "011-0005003231220301351-0550005003" &&
      record.parse(player.consumes).mainHandImbue === "WizardOil" &&
      record.parse(player.consumes).defaultConjured === "ConjuredDemonicRune" &&
      guide.talents === "2/31/18" &&
      guide.priorityBindings.length === actions.length,
    "Demonology build/guide lost its measured model or actions",
  );
  guide.priorityBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(actions[index]) &&
        binding.text === guide.priorities[index],
      "Demonology rotation instruction changed",
    ),
  );
  const optionsState = record.parse(build.state.options),
    optionsPlayer = record.parse(record.parse(player.warlock).options),
    prepull = z.array(record).length(1).parse(rotation.prepullActions);
  same(optionsPlayer, optionsState, "Demonology pet/stone settings changed after measurement");
  requireMatch(
    optionsPlayer.armor === "DemonArmor" &&
      optionsPlayer.summon === guide.activeDemon &&
      optionsPlayer.sacrifice === guide.sacrificedDemon &&
      optionsPlayer.weaponImbue === guide.weaponStone &&
      guide.prepullBindings.length === prepull.length &&
      guide.prepull.length === prepull.length,
    "Demonology active/sacrificed demon, stone or pre-pull instruction changed",
  );
  guide.prepullBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(prepull[index]) &&
        binding.text === guide.prepull[index],
      "Demonology pre-pull instruction changed",
    ),
  );
  same(
    prepull[0],
    {
      action: { castSpell: { spellId: { spellId: 19028 } } },
      doAtValue: { const: { val: "-1s" } },
    },
    "Demonology measured Soul Link pre-pull changed",
  );
  return build;
}
