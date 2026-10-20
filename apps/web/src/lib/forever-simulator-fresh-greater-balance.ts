import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { balanceSimulatorGuidanceText } from "./forever-simulator-balance-guidance";

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
export const greaterBalanceModelEvidenceReferenceSchema = z
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
export type GreaterBalanceModelEvidenceReference = z.infer<
  typeof greaterBalanceModelEvidenceReferenceSchema
>;
export const greaterBalanceModelEntrySchema = z
  .object({
    id: z.literal("balance-static"),
    profile: z.literal("balance_druid"),
    build: greaterBalanceModelEvidenceReferenceSchema,
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
export type GreaterBalanceModelEntry = z.infer<typeof greaterBalanceModelEntrySchema>;

// This is the independently replayed export, not a wildcard approval of future Balance results.
// New studies require their own numerical review and browser handoff before changing this pin.
export const verifiedGreaterBalanceDelivery = Object.freeze({
  sourceRelease: "a4eabfa5c89f3813c1b74bde",
  buildSha256: "3ef68023140b8d07b519e6d82f2b8e1bf338e2d91c8a63d65f00b1eaae4ae083",
  confirmationSha256: "bf50cc213a7e36b548f69c3877906a0716ce66b0e4e7b13ff9a0835fb6dc0996",
});
const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("balance-static"),
    profile: z.literal("balance_druid"),
    variant: z.literal("balance"),
    name: z.literal("Balance · pre-raid tested"),
    sourceRelease: z.literal(verifiedGreaterBalanceDelivery.sourceRelease),
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
        anchor: greaterBalanceModelEvidenceReferenceSchema,
        anchorResult: greaterBalanceModelEvidenceReferenceSchema,
        feedback: greaterBalanceModelEvidenceReferenceSchema,
        feedbackResult: greaterBalanceModelEvidenceReferenceSchema,
        confirmation: greaterBalanceModelEvidenceReferenceSchema,
        confirmationResult: greaterBalanceModelEvidenceReferenceSchema,
        confirmationDeclaration: greaterBalanceModelEvidenceReferenceSchema,
        parity: greaterBalanceModelEvidenceReferenceSchema,
        consumeModel: greaterBalanceModelEvidenceReferenceSchema,
      })
      .strict(),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-balance-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.string(),
        conjured: z.literal("rune"),
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
        prepull: z.array(z.never()).length(0),
        prepullBindings: z.array(z.never()).length(0),
        caveats: z.array(z.string()).min(1),
      })
      .strict(),
    scope: z
      .object({
        closingFeedbackCompleted: z.literal(true),
        previousModelNumericalReuse: z.literal(false),
        anchorMeasuredOnDifferentEngine: z.literal(true),
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
export type FreshGreaterBalanceSimulatorBuild = z.infer<typeof buildSchema>;
export interface GreaterBalanceModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: GreaterBalanceModelEvidenceReference) => Promise<unknown>;
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

export async function readFreshGreaterBalanceSimulatorBuild(
  rawEntry: GreaterBalanceModelEntry,
  options: GreaterBalanceModelBuildOptions,
): Promise<FreshGreaterBalanceSimulatorBuild> {
  const entry = greaterBalanceModelEntrySchema.parse(rawEntry);
  async function reference(raw: GreaterBalanceModelEvidenceReference): Promise<unknown> {
    const ref = greaterBalanceModelEvidenceReferenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(
      hash(value) === ref.sha256,
      "GreaterBalance evidence checksum changed: " + ref.path,
    );
    return value;
  }
  requireMatch(
    entry.build.sha256 === verifiedGreaterBalanceDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/balance-greater-first-pass-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed GreaterBalance export requires a new delivery review",
  );
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "GreaterBalance publication model/settings/DPS changed",
  );
  async function completed(ref: GreaterBalanceModelEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: GreaterBalanceModelEvidenceReference;
    declarationRef: GreaterBalanceModelEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: greaterBalanceModelEvidenceReferenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = greaterBalanceModelEvidenceReferenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "GreaterBalance source identity changed",
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
    feedback = await completed(evidence.feedback),
    confirmation = await completed(evidence.confirmation),
    model = record.parse(await reference(evidence.consumeModel));
  same(anchor.resultRef, evidence.anchorResult, "Historical GreaterBalance anchor changed");
  same(
    feedback.resultRef,
    evidence.feedbackResult,
    "Current GreaterBalance feedback result changed",
  );
  same(
    confirmation.resultRef,
    evidence.confirmationResult,
    "GreaterBalance confirmation result changed",
  );
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "GreaterBalance confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedGreaterBalanceDelivery.confirmationSha256,
    "Unreviewed GreaterBalance confirmation",
  );
  requireMatch(
    anchor.declaration.sourceRelease !== build.sourceRelease,
    "Historical GreaterBalance numbers were relabelled",
  );
  requireMatch(
    feedback.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.schema ===
        "kfc-greater20-balance-independent-confirmation-declaration.v1" &&
      confirmation.declaration.expectedPlayerClass === 1,
    "Current GreaterBalance engine/class changed",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.feedback,
    "GreaterBalance confirmation lost its closed feedback",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.feedbackResult,
    "GreaterBalance confirmation lost its feedback result",
  );
  const backend = record.parse(confirmation.declaration.backend);
  same(feedback.declaration.backend, backend, "Current GreaterBalance models disagree");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      model.release === build.sourceRelease &&
      model.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(model.descriptor).databaseSha256 === build.dbSha256,
    "GreaterBalance Greater20 model provenance changed",
  );
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(3).parse(closing.cycles),
    last = cycles.at(-1);
  requireMatch(
    closing.schema === "kfc-balance-greater20-feedback-result.v1" &&
      closing.closed === true &&
      closing.previousModelNumericalReuse === false &&
      closing.independentFinalValidation === false &&
      last?.closed === true &&
      record.parse(last.state).materialChange === false &&
      record.parse(last.gear).stoppedForSmallGain === true,
    "Current GreaterBalance feedback did not close",
  );
  same(closing.settings, build.settings, "GreaterBalance export lost its selected settings");
  same(closing.state, build.state, "GreaterBalance export lost its selected state");
  for (const cycle of cycles)
    for (const sweep of z.array(record).min(1).max(2).parse(record.parse(cycle.gear).sweeps)) {
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
        requireMatch(names.has(name), "Current GreaterBalance audit omitted a gear slot/pair/set");
    }
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = plan.arms,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === arms.length && templates.size === entry.requestTemplates.length,
    "GreaterBalance wire templates missing/duplicated",
  );
  const request = (
    arm: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings && record.parse(arm.settings).player),
      requestBase64 = templates.get(z.string().parse(arm.name));
    requireMatch(requestBase64, "Missing GreaterBalance wire frame");
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
      "GreaterBalance inspected request changed",
    );
  same(
    plan.requestIds,
    z
      .array(z.number().int().positive().safe())
      .length(2)
      .parse(plan.seeds)
      .flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "GreaterBalance holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "GreaterBalance incumbent changed after confirmation");
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
  requireMatch(math.accepted, "GreaterBalance exceeds approved2% retained margin");
  same(approval, build.approval, "GreaterBalance exported confirmation changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "GreaterBalance approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original GreaterBalance1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "GreaterBalance disclosed precision changed",
  );
  const reservation = record.parse(
    await reference(greaterBalanceModelEvidenceReferenceSchema.parse(approval.reservation)),
  );
  requireMatch(
    reservation.identity === verifiedGreaterBalanceDelivery.confirmationSha256 &&
      reservation.planSha256 ===
        hash(record.parse(record.parse(confirmation.declaration.confirmationPlan).originalPlan)) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "GreaterBalance RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "GreaterBalance reserved seed ranges changed");
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-greater20-balance-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Actual GreaterBalance selected browser parity missing",
  );
  same(descriptor.backend, backend, "GreaterBalance parity used another backend");
  same(native, arms[0]?.inspected, "GreaterBalance parity native origin changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList);
  requireMatch(
    player.class === "ClassDruid" &&
      player.level === 60 &&
      player.distanceFromTarget === 30 &&
      player.inFrontOfTarget === false &&
      Boolean(player.balanceDruid) &&
      !player.feralDruid &&
      guide.conjured === build.state.conjured &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.talents === "39/0/12" &&
      guide.priorityBindings.length === actions.length,
    "GreaterBalance build/guide lost its measured model or actions",
  );
  const talentRanks = z.string().parse(player.talentsString).split("-")[0] ?? "",
    expectedGuide = balanceSimulatorGuidanceText(rotation, Number(talentRanks[13] ?? "0") > 0);
  requireMatch(talentRanks[15] === "1", "GreaterBalance must retain Moonkin Form");
  for (const key of ["prepull", "priorities", "instruction", "scenario", "caveats"] as const)
    same(
      guide[key],
      expectedGuide[key],
      "GreaterBalance guide text disagrees with measured APL: " + key,
    );
  same(
    feedback.declaration.importedJournals,
    [],
    "Old-model Balance numerical origins were imported",
  );
  requireMatch(
    feedback.declaration.previousModelNumericalReuse === false,
    "Old Balance numbers relabelled",
  );
  guide.priorityBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(actions[index]) &&
        binding.text === guide.priorities[index],
      "GreaterBalance rotation instruction changed",
    ),
  );
  return build;
}
