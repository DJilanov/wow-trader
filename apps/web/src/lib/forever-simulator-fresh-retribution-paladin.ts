import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown()),
  positiveInteger = z.number().int().positive().safe();

export const retributionPaladinModelEvidenceReferenceSchema = z
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
export type RetributionPaladinModelEvidenceReference = z.infer<
  typeof retributionPaladinModelEvidenceReferenceSchema
>;

export const retributionPaladinModelEntrySchema = z
  .object({
    id: z.literal("paladin-retribution-static"),
    profile: z.literal("retribution_paladin"),
    build: retributionPaladinModelEvidenceReferenceSchema,
    settingsSha256: digest,
    hrefSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    requestTemplates: z
      .array(
        z
          .object({
            arm: z.string().min(1).max(80),
            requestBase64: z.string().min(20).max(512000),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();
export type RetributionPaladinModelEntry = z.infer<typeof retributionPaladinModelEntrySchema>;

export const verifiedRetributionPaladinDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "08c7fbb728582e0a0eaced85344b0a2a4f072e90112babb6585efb6d4171ef42",
  confirmationSha256: "890a0b72fb9bbe151e9894e420f24268da36203c637100ad237d6897895e8c9c",
  sourceAuditSha256: "a9730e592145ea1c3f6d5413b8c48b5c131c79e5f5343fd2f55a4e4f3ddbd236",
});

const binding = z
    .object({
      index: z.number().int().nonnegative(),
      actionSha256: digest,
      text: z.string().min(1),
    })
    .strict(),
  evidenceReference = retributionPaladinModelEvidenceReferenceSchema,
  buildSchema = z
    .object({
      schema: z.literal("kfc-fresh-first-pass-build.v2"),
      id: z.literal("paladin-retribution-static"),
      profile: z.literal("retribution_paladin"),
      variant: z.literal("retribution"),
      name: z.literal("Retribution · pre-raid tested"),
      sourceRelease: z.literal(verifiedRetributionPaladinDelivery.sourceRelease),
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
          priorStructuralAnchor: evidenceReference,
          priorStructuralGear: evidenceReference,
          feedback: evidenceReference,
          feedbackResult: evidenceReference,
          finalInspection: evidenceReference,
          finalInspectionResult: evidenceReference,
          confirmation: evidenceReference,
          confirmationResult: evidenceReference,
          confirmationDeclaration: evidenceReference,
          parity: evidenceReference,
          completionTransport: evidenceReference,
          sourceVerification: evidenceReference,
          freeSealModel: evidenceReference,
          catalogModel: evidenceReference,
          acceptedControls: evidenceReference,
        })
        .strict(),
      rotationGuidance: z
        .object({
          schema: z.literal("kfc-paladin-retribution-rotation-guidance.v1"),
          rotationSha256: digest,
          talents: z.string().regex(/^\d+\/\d+\/\d+$/),
          scenario: z.string().min(1),
          instruction: z.string().min(1),
          priorities: z.array(z.string().min(1)).min(1),
          priorityBindings: z.array(binding).min(1),
          prepull: z.array(z.string().min(1)).length(1),
          prepullBindings: z.array(binding).length(1),
          caveats: z.array(z.string().min(1)).min(1),
        })
        .strict(),
      scope: z
        .object({
          name: z.literal("bounded-paladin-retribution-first-pass.v1"),
          completionTransportAuthenticated: z.literal(true),
          originalStudiesUnchanged: z.literal(true),
          closingFeedbackCompleted: z.literal(true),
          fixedPointWithinDeclaredPolicy: z.literal(true),
          feedbackCycles: positiveInteger.max(2),
          currentModelGearSweeps: positiveInteger.max(6),
          gearedStateRecheckCompleted: z.literal(true),
          finalGearSmallGainStop: z.literal(true),
          gearApplicabilityRequired: z.literal(false),
          previousModelNumericalReuse: z.literal(false),
          exactCurrentBackendScalarReuse: z.literal(true),
          maximumRetainedGapFraction: z.literal(0.02),
          largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
          originalStrictAssessmentAccepted: z.boolean(),
          selectionChanged: z.literal(false),
          globalOptimalityProven: z.literal(false),
          livePvpAccessVerified: z.literal(false),
          numericalJobs: positiveInteger,
          numericalIterations: positiveInteger,
        })
        .passthrough(),
      requiresProvisionalEnchantOptIn: z.literal(false),
      publicPromotion: z.literal(false),
      browserHandoffRequired: z.literal(true),
    })
    .passthrough(),
  approvedPlanSchema = z
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
          seeds: z.array(positiveInteger).length(2),
          requestIds: z.array(digest).min(4).max(24),
          inspectedSeedRanges: z
            .array(z.object({ seed: positiveInteger, iterations: positiveInteger }).strict())
            .min(1),
        })
        .passthrough(),
    })
    .strict();

export type FreshRetributionPaladinSimulatorBuild = z.infer<typeof buildSchema>;
export interface RetributionPaladinModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reviewedBuildSha256: string;
  readonly reference: (reference: RetributionPaladinModelEvidenceReference) => Promise<unknown>;
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

interface CompletedSource {
  readonly completion: Record<string, unknown>;
  readonly result: Record<string, unknown>;
  readonly declaration: Record<string, unknown>;
  readonly resultRef: RetributionPaladinModelEvidenceReference;
  readonly declarationRef: RetributionPaladinModelEvidenceReference;
}

async function readRetributionSources(
  build: FreshRetributionPaladinSimulatorBuild,
  reference: RetributionPaladinModelBuildOptions["reference"],
): Promise<{
  feedback: CompletedSource;
  inspection: CompletedSource;
  confirmation: CompletedSource;
}> {
  async function completed(
    ref: RetributionPaladinModelEvidenceReference,
  ): Promise<CompletedSource> {
    const completion = z
        .object({
          schema: z.literal("kfc-bounded-native-study-completion.v1"),
          identity: digest,
          result: evidenceReference,
          publicationAllowed: z.literal(false),
        })
        .strict()
        .parse(await reference(ref)),
      prefix = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`,
      result = record.parse(await reference(completion.result)),
      declarationRef = evidenceReference.parse(result.declaration);
    requireMatch(
      ref.path === prefix + "completed.json" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        completion.result.path ===
          prefix + `result-${completion.result.sha256.slice(0, 16)}.json` &&
        declarationRef.path === prefix + "declaration.json" &&
        declarationRef.sha256 === completion.identity,
      "Ret completed source identity changed",
    );
    return {
      completion,
      result,
      declaration: record.parse(await reference(declarationRef)),
      resultRef: completion.result,
      declarationRef,
    };
  }
  const evidence = build.evidence,
    feedback = await completed(evidence.feedback),
    inspection = await completed(evidence.finalInspection),
    confirmation = await completed(evidence.confirmation),
    backend = record.parse(confirmation.declaration.backend);
  for (const [source, schema, resultRef] of [
    [feedback, "kfc-paladin-retribution-free-seal-correction.v1", evidence.feedbackResult],
    [
      inspection,
      "kfc-paladin-finite-final-inspection-declaration.v1",
      evidence.finalInspectionResult,
    ],
    [
      confirmation,
      "kfc-paladin-independent-final-confirmation-declaration.v1",
      evidence.confirmationResult,
    ],
  ] as const) {
    requireMatch(
      source.declaration.schema === schema &&
        source.declaration.profile === "retribution_paladin" &&
        source.declaration.variant === "retribution" &&
        source.declaration.expectedPlayerClass === 4 &&
        source.declaration.sourceRelease === build.sourceRelease,
      "Ret reused another class, spec or engine",
    );
    same(source.resultRef, resultRef, "Ret result reference changed");
    same(source.declaration.backend, backend, "Ret source backend changed");
  }
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Ret confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedRetributionPaladinDelivery.confirmationSha256,
    "Unreviewed Ret confirmation",
  );
  same(feedback.declaration.importedJournals, [], "Ret imported old-model native scores");
  for (const source of [inspection, confirmation]) {
    same(
      source.declaration.sourceCompletion,
      evidence.feedback,
      "Ret lost closed corrected feedback",
    );
    same(source.declaration.sourceResult, feedback.resultRef, "Ret lost corrected feedback result");
  }
  same(
    inspection.declaration.importedJournals,
    feedback.result.journals,
    "Ret inspection origin reuse changed",
  );
  same(
    confirmation.declaration.importedJournals,
    inspection.result.journals,
    "Ret holdout origin reuse changed",
  );
  same(
    confirmation.declaration.inspectionResult,
    inspection.resultRef,
    "Ret finite inspection result changed",
  );

  const transport = record.parse(await reference(evidence.completionTransport)),
    runtime = z
      .object({
        reused: z.literal(false),
        nativeJobs: z.literal(9),
        nativeIterations: z.literal(90000),
        sourceReused: z.literal(3),
      })
      .strict()
      .parse(transport.runtimeOnlyFields);
  requireMatch(
    transport.schema === "kfc-paladin-retribution-completion-transport-audit.v1" &&
      transport.numericalPayloadChanged === false &&
      transport.selectionChanged === false &&
      transport.nativeJobs === 0 &&
      transport.browserJobs === 0 &&
      transport.publicationAllowed === false,
    "Ret completion transport audit changed",
  );
  same(
    transport.storedCompletion,
    evidence.finalInspection,
    "Ret canonical inspection completion changed",
  );
  same(
    transport.legacyRuntimeReference,
    confirmation.declaration.inspectionCompletion,
    "Ret historical transport reference changed",
  );
  same(transport.result, inspection.resultRef, "Ret completion transport lost its actual result");
  same(
    hash({ ...inspection.completion, ...runtime }),
    evidenceReference.parse(transport.legacyRuntimeReference).sha256,
    "Ret transport exception does not reproduce the exact historical runtime envelope",
  );
  const audit = record.parse(await reference(evidence.sourceVerification));
  requireMatch(
    evidence.sourceVerification.sha256 === verifiedRetributionPaladinDelivery.sourceAuditSha256 &&
      audit.schema === "kfc-paladin-retribution-source-verification-audit.v2" &&
      audit.status === "source-replayed-needs-selected-parity" &&
      audit.approved2Percent === true &&
      audit.original1Percent === true &&
      audit.numericalPayloadChanged === false &&
      audit.selectionChanged === false &&
      audit.selectedSettingsSha256 === hash(build.settings) &&
      audit.selectedDps === build.referenceDps &&
      audit.validationIterations === 40000,
    "Ret source-verification audit changed",
  );
  same(audit.sourceCompletion, evidence.confirmation, "Ret source audit lost its holdouts");
  same(audit.sourceResult, evidence.confirmationResult, "Ret source audit lost its result");
  same(
    audit.inspectionTransport,
    transport,
    "Ret source audit lost the explicit transport receipt",
  );
  same(
    audit.inspectionCompletionCanonical,
    evidence.finalInspection,
    "Ret source audit lost canonical inspection",
  );

  const freeSeal = record.parse(await reference(evidence.freeSealModel)),
    catalog = record.parse(await reference(evidence.catalogModel)),
    controls = record.parse(await reference(evidence.acceptedControls)),
    controlParity = record.parse(controls.parity);
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      freeSeal.schema === "kfc-paladin-free-seal-model-context.v1" &&
      freeSeal.release === build.sourceRelease &&
      freeSeal.nativeBinarySha256 === build.nativeBinarySha256 &&
      record.parse(freeSeal.descriptor).databaseSha256 === build.dbSha256 &&
      record.parse(freeSeal.descriptor).parentModel === catalog.release &&
      catalog.schema === "kfc-paladin-pvp-model-context.v1" &&
      catalog.release === "16bad68d90fb60af41c567a5" &&
      record.parse(catalog.descriptor).databaseSha256 === build.dbSha256,
    "Ret corrected free-seal or current PvP model provenance changed",
  );
  requireMatch(
    evidence.acceptedControls.sha256 ===
      "8bb791a81d4aadeec1b2e6f501ff548d6dbf374f4f171278e1681339b308f6a1" &&
      controls.schema === "kfc-paladin-free-seal-controls.v1" &&
      controlParity.status === "passed-after-cleanup" &&
      controlParity.expectedClass === 4 &&
      z.array(record).parse(controlParity.records).length === 55,
    "Ret corrected free/paid-seal mechanics controls changed",
  );
  return { feedback, inspection, confirmation };
}

function validateRetributionFeedback(
  build: FreshRetributionPaladinSimulatorBuild,
  feedback: CompletedSource,
  inspection: CompletedSource,
  confirmation: CompletedSource,
): void {
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(2).parse(closing.cycles),
    last = cycles.at(-1),
    lastGear = record.parse(last?.gear),
    lastState = record.parse(
      closing.closing ? record.parse(closing.closing).recheck : last?.recheck,
    ),
    sweeps = cycles.flatMap((cycle): Record<string, unknown>[] =>
      z.array(record).min(1).max(2).parse(record.parse(cycle.gear).sweeps),
    );
  requireMatch(
    closing.schema === "kfc-paladin-geared-feedback-result.v1" &&
      closing.fixedPointWithinDeclaredPolicy === true &&
      closing.gearApplicabilityRequired === false &&
      closing.independentFinalValidation === false &&
      closing.publicationAllowed === false &&
      lastGear.stoppedForSmallGain === true &&
      build.scope.feedbackCycles === cycles.length &&
      build.scope.currentModelGearSweeps === sweeps.length,
    "Ret gear/state feedback did not close",
  );
  same(closing.settings, build.settings, "Ret final settings changed");
  same(closing.state, build.state, "Ret final state changed");
  same(lastGear.gear, closing.gear, "Ret final gear changed");
  same(lastGear.state, build.state, "Ret gear applicability used another state");
  same(lastState.state, build.state, "Ret state recheck changed its selected talents/rotation");
  const stateRounds = z.array(record).min(1).parse(record.parse(lastState.policy).rounds);
  requireMatch(
    stateRounds.at(-1)?.seed === 77291 && stateRounds.at(-1)?.iterations === 10000,
    "Ret state inspection must retain its actual 77291 seed, not relabel its metric",
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
      "slot:16",
      "pair:14+15",
      "pair:10+11",
      "pair:12+13",
      "expanded-sets",
    ])
      requireMatch(names.has(name), "Ret omitted a slot, ordered pair or set");
    requireMatch(
      [...names].some((name): boolean => name.startsWith("enchant:")),
      "Ret omitted enchant comparisons",
    );
  }
  for (const field of ["nativeJobs", "nativeIterations"] as const) {
    const total = [feedback, inspection, confirmation].reduce(
      (sum, source): number =>
        sum + positiveInteger.parse(record.parse(source.result.invocation)[field]),
      0,
    );
    same(
      total,
      field === "nativeJobs" ? build.scope.numericalJobs : build.scope.numericalIterations,
      "Ret numerical provenance totals changed",
    );
  }
}

function validateRetributionConfirmation(
  entry: RetributionPaladinModelEntry,
  build: FreshRetributionPaladinSimulatorBuild,
  inspection: CompletedSource,
  confirmation: CompletedSource,
): z.infer<typeof approvedPlanSchema>["originalPlan"] {
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing or duplicated Ret wire templates",
  );
  const request = (
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing actual Ret wire");
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
  for (const arm of plan.arms) {
    const player = record.parse(arm.settings.player),
      consumes = record.parse(player.consumes),
      encounter = record.parse(arm.settings.encounter),
      target = z.array(record).length(1).parse(encounter.targets)[0];
    requireMatch(
      player.class === "ClassPaladin" &&
        player.level === 60 &&
        player.retributionPaladin &&
        !player.protectionPaladin &&
        !player.holyPaladin &&
        player.distanceFromTarget === 5 &&
        player.inFrontOfTarget === false &&
        player.foreverTier1Bonuses === false &&
        player.enableItemSwap === false &&
        consumes.manaRegenElixir === "GreaterMagebloodElixir" &&
        consumes.defaultConjured === "ConjuredDemonicRune" &&
        !record.parse(arm.settings.debuffs).stormstrike &&
        encounter.duration === 300 &&
        target?.level === 63 &&
        target.mobType === "MobTypeDragonkin",
      "Ret final arm changed its class or fixed scenario",
    );
    z.array(record).length(17).parse(record.parse(player.equipment).items);
    const bonus = record.parse(player.bonusStats);
    for (const name of ["stats", "pseudoStats"])
      requireMatch(
        z
          .array(z.number().finite())
          .parse(bonus[name] ?? [])
          .every((value): boolean => value === 0),
        "Ret final arm added manual stats",
      );
    for (const [values, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(values);
      for (const [name, value] of Object.entries(required))
        same(actual[name], value, "Ret raid buff changed: " + name);
    }
    requireMatch(
      hash(request(arm, 10000, 77191)) === arm.inspected.id,
      "Ret inspected request changed",
    );
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Ret holdout request changed",
  );
  same(plan.arms[0]?.settings, build.settings, "Ret selected winner changed after holdouts");
  const inspected = z
    .array(record)
    .length(plan.arms.length)
    .parse(record.parse(record.parse(inspection.result.semantic).evaluation).metrics);
  same(
    new Map(inspected.map((metric) => [metric.id, metric])),
    new Map(plan.arms.map((arm) => [arm.inspected.id, arm.inspected])),
    "Ret holdouts lost actual finite inspection metrics",
  );
  const approval = record.parse(record.parse(confirmation.result.semantic).evaluation),
    original = record.parse(approval.originalAssessment),
    records = z
      .array(
        z
          .object({
            seed: positiveInteger,
            arm: z.string(),
            metric: z
              .object({
                id: digest,
                dps: z.number().finite().positive(),
                stdev: z.number().finite().nonnegative(),
                iterations: positiveInteger,
              })
              .strict(),
          })
          .strict(),
      )
      .min(4)
      .max(24)
      .parse(original.records),
    math = evaluateApprovedSimulatorConfirmation(approved, records);
  requireMatch(math.accepted, "Ret exceeds the approved 2% margin");
  same(approval, build.approval, "Ret exported approval changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Ret approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Ret 1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Ret disclosed precision changed",
  );
  return plan;
}

async function validateRetributionParityAndGuide(
  build: FreshRetributionPaladinSimulatorBuild,
  plan: z.infer<typeof approvedPlanSchema>["originalPlan"],
  confirmation: CompletedSource,
  reference: RetributionPaladinModelBuildOptions["reference"],
): Promise<void> {
  const reservation = record.parse(
      await reference(evidenceReference.parse(build.approval.reservation)),
    ),
    rawPlan = record.parse(confirmation.declaration.confirmationPlan).originalPlan;
  requireMatch(
    reservation.identity === verifiedRetributionPaladinDelivery.confirmationSha256 &&
      reservation.planSha256 === hash(rawPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Ret fresh RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Ret reserved seeds changed");
  const parity = record.parse(await reference(build.evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser),
    wasm = record.parse(await reference(evidenceReference.parse(parity.browser)));
  requireMatch(
    parity.schema === "kfc-paladin-retribution-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.schema === "kfc-paladin-retribution-selected-native-wasm-parity.v1" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(z.number().parse(native.dps) - z.number().parse(browser.dps)) < 1e-8 &&
      Math.abs(z.number().parse(native.stdev) - z.number().parse(browser.stdev)) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings) &&
      wasm.playerClass === 4 &&
      wasm.error === "" &&
      wasm.duration === 300 &&
      wasm.activePlayers === 1,
    "Actual selected Ret native/WASM parity missing",
  );
  same(parity.errors, [], "Ret parity has browser errors");
  same(descriptor.backend, confirmation.declaration.backend, "Ret parity backend changed");
  same(
    record.parse(descriptor.sourceValidation).completion,
    build.evidence.confirmation,
    "Ret parity lost fresh confirmation",
  );
  same(
    descriptor.inspectionCompletionCanonical,
    build.evidence.finalInspection,
    "Ret parity lost canonical inspection",
  );
  same(
    descriptor.inspectionTransport,
    await reference(build.evidence.completionTransport),
    "Ret parity lost its transport audit",
  );
  same(native, plan.arms[0]?.inspected, "Ret parity native origin changed");
  same(wasm.metric, browser, "Ret raw browser result changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList),
    prepull = z.array(record).length(1).parse(rotation.prepullActions);
  requireMatch(
    hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      guide.priorities.length === actions.length &&
      guide.prepullBindings.length === prepull.length &&
      guide.prepull.length === prepull.length &&
      player.talentsString === build.state.talentsString &&
      guide.talents === "11/8/32" &&
      guide.instruction.includes("main-hand autoattacks") &&
      guide.instruction.includes("libram") &&
      guide.priorities.some((text): boolean => text.includes("Holy Strike")),
    "Ret guide lost its exact measured actions",
  );
  for (const [bindings, entries, texts] of [
    [guide.priorityBindings, actions, guide.priorities],
    [guide.prepullBindings, prepull, guide.prepull],
  ] as const)
    bindings.forEach((item, index): void =>
      requireMatch(
        item.index === index &&
          item.actionSha256 === hash(entries[index]) &&
          item.text === texts[index],
        "Ret ordered action guidance changed",
      ),
    );
}

export async function readFreshRetributionPaladinSimulatorBuild(
  rawEntry: unknown,
  options: RetributionPaladinModelBuildOptions,
): Promise<FreshRetributionPaladinSimulatorBuild> {
  const entry = retributionPaladinModelEntrySchema.parse(rawEntry),
    reviewedBuildSha256 = digest.parse(options.reviewedBuildSha256);
  requireMatch(
    reviewedBuildSha256 === verifiedRetributionPaladinDelivery.buildSha256 &&
      entry.build.sha256 === reviewedBuildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/paladin-retribution-first-pass-v1/build-${reviewedBuildSha256.slice(0, 16)}.json`,
    "Unreviewed Ret export requires an independent delivery review",
  );
  async function reference(raw: RetributionPaladinModelEvidenceReference): Promise<unknown> {
    const ref = evidenceReference.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Ret evidence checksum changed: " + ref.path);
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Ret publication model, settings or DPS changed",
  );
  const sources = await readRetributionSources(build, reference);
  validateRetributionFeedback(build, sources.feedback, sources.inspection, sources.confirmation);
  const plan = validateRetributionConfirmation(
    entry,
    build,
    sources.inspection,
    sources.confirmation,
  );
  await validateRetributionParityAndGuide(build, plan, sources.confirmation, reference);
  return build;
}
