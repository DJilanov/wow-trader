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
export const frostModelEvidenceReferenceSchema = z
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
export type FrostModelEvidenceReference = z.infer<typeof frostModelEvidenceReferenceSchema>;
export const frostModelEntrySchema = z
  .object({
    id: z.literal("mage-frost-static"),
    profile: z.literal("mage"),
    build: frostModelEvidenceReferenceSchema,
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
export type FrostModelEntry = z.infer<typeof frostModelEntrySchema>;

// This is the independently replayed export, not a wildcard approval of future Mage results.
// New studies require their own numerical review and browser handoff before changing this pin.
export const verifiedFrostDelivery = Object.freeze({
  sourceRelease: "a4eabfa5c89f3813c1b74bde",
  buildSha256: "a87279b23229d77ddcb5c1468f364c50554250b720573b15c0e79c4c34109959",
  confirmationSha256: "34913766d9020475caa3e3f25a1493a9c19c51136718db4b5d31ec5a66336bb9",
});
const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("mage-frost-static"),
    profile: z.literal("mage"),
    variant: z.literal("frost"),
    name: z.literal("Frost · first-pass tested"),
    sourceRelease: z.literal(verifiedFrostDelivery.sourceRelease),
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
        anchor: frostModelEvidenceReferenceSchema,
        anchorResult: frostModelEvidenceReferenceSchema,
        feedback: frostModelEvidenceReferenceSchema,
        feedbackResult: frostModelEvidenceReferenceSchema,
        confirmation: frostModelEvidenceReferenceSchema,
        confirmationResult: frostModelEvidenceReferenceSchema,
        confirmationDeclaration: frostModelEvidenceReferenceSchema,
        parity: frostModelEvidenceReferenceSchema,
        consumeModel: frostModelEvidenceReferenceSchema,
      })
      .strict(),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-frost-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.string(),
        manaPolicy: z.literal("rune-priority"),
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
export type FreshFrostSimulatorBuild = z.infer<typeof buildSchema>;
export interface FrostModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: FrostModelEvidenceReference) => Promise<unknown>;
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

export async function readFreshFrostSimulatorBuild(
  rawEntry: FrostModelEntry,
  options: FrostModelBuildOptions,
): Promise<FreshFrostSimulatorBuild> {
  const entry = frostModelEntrySchema.parse(rawEntry);
  async function reference(raw: FrostModelEvidenceReference): Promise<unknown> {
    const ref = frostModelEvidenceReferenceSchema.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Frost evidence checksum changed: " + ref.path);
    return value;
  }
  requireMatch(
    entry.build.sha256 === verifiedFrostDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/mage-frost-first-pass-v2/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed Frost export requires a new delivery review",
  );
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Frost publication model/settings/DPS changed",
  );
  async function completed(ref: FrostModelEvidenceReference): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultRef: FrostModelEvidenceReference;
    declarationRef: FrostModelEvidenceReference;
  }> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: frostModelEvidenceReferenceSchema,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = frostModelEvidenceReferenceSchema.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Frost source identity changed",
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
  same(anchor.resultRef, evidence.anchorResult, "Historical Frost anchor changed");
  same(feedback.resultRef, evidence.feedbackResult, "Current Frost feedback result changed");
  same(confirmation.resultRef, evidence.confirmationResult, "Frost confirmation result changed");
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Frost confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedFrostDelivery.confirmationSha256,
    "Unreviewed Frost confirmation",
  );
  requireMatch(
    anchor.declaration.sourceRelease !== build.sourceRelease,
    "Historical Frost numbers were relabelled",
  );
  requireMatch(
    feedback.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.sourceRelease === build.sourceRelease &&
      confirmation.declaration.schema ===
        "kfc-greater20-frost-independent-confirmation-declaration.v1" &&
      confirmation.declaration.expectedPlayerClass === 3,
    "Current Frost engine/class changed",
  );
  same(
    confirmation.declaration.sourceCompletion,
    evidence.feedback,
    "Frost confirmation lost its closed feedback",
  );
  same(
    confirmation.declaration.sourceResult,
    evidence.feedbackResult,
    "Frost confirmation lost its feedback result",
  );
  const backend = record.parse(confirmation.declaration.backend);
  same(feedback.declaration.backend, backend, "Current Frost models disagree");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      model.release === build.sourceRelease &&
      model.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(model.descriptor).databaseSha256 === build.dbSha256,
    "Frost Greater20 model provenance changed",
  );
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(3).parse(closing.cycles),
    last = cycles.at(-1);
  requireMatch(
    closing.schema === "kfc-mage-greater20-feedback-result.v1" &&
      closing.closed === true &&
      closing.previousModelNumericalReuse === false &&
      closing.independentFinalValidation === false &&
      last?.closed === true &&
      record.parse(last.state).materialChange === false &&
      record.parse(last.gear).stoppedForSmallGain === true,
    "Current Frost feedback did not close",
  );
  same(closing.settings, build.settings, "Frost export lost its selected settings");
  same(closing.state, build.state, "Frost export lost its selected state");
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
        requireMatch(names.has(name), "Current Frost audit omitted a gear slot/pair/set");
    }
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    arms = plan.arms,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === arms.length && templates.size === entry.requestTemplates.length,
    "Frost wire templates missing/duplicated",
  );
  const request = (
    arm: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings && record.parse(arm.settings).player),
      requestBase64 = templates.get(z.string().parse(arm.name));
    requireMatch(requestBase64, "Missing Frost wire frame");
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
      "Frost inspected request changed",
    );
  same(
    plan.requestIds,
    z
      .array(z.number().int().positive().safe())
      .length(2)
      .parse(plan.seeds)
      .flatMap((seed): string[] => arms.map((arm): string => hash(request(arm, 20000, seed)))),
    "Frost holdout request changed",
  );
  same(arms[0]?.settings, build.settings, "Frost incumbent changed after confirmation");
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
  requireMatch(math.accepted, "Frost exceeds approved2% retained margin");
  same(approval, build.approval, "Frost exported confirmation changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Frost approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Frost1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Frost disclosed precision changed",
  );
  const reservation = record.parse(
    await reference(frostModelEvidenceReferenceSchema.parse(approval.reservation)),
  );
  requireMatch(
    reservation.identity === verifiedFrostDelivery.confirmationSha256 &&
      reservation.planSha256 ===
        hash(record.parse(record.parse(confirmation.declaration.confirmationPlan).originalPlan)) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Frost RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Frost reserved seed ranges changed");
  const parity = record.parse(await reference(evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser);
  requireMatch(
    parity.schema === "kfc-mage-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      native.dps === browser.dps &&
      native.stdev === browser.stdev &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Actual Frost selected browser parity missing",
  );
  same(descriptor.backend, backend, "Frost parity used another backend");
  same(native, arms[0]?.inspected, "Frost parity native origin changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList);
  requireMatch(
    player.class === "ClassMage" &&
      record.parse(player.consumes).manaRegenElixir === "GreaterMagebloodElixir" &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.talents === "17/0/34" &&
      guide.priorityBindings.length === actions.length,
    "Frost build/guide lost its measured model or actions",
  );
  guide.priorityBindings.forEach((binding, index): void =>
    requireMatch(
      binding.index === index &&
        binding.actionSha256 === hash(actions[index]) &&
        binding.text === guide.priorities[index],
      "Frost rotation instruction changed",
    ),
  );
  return build;
}
