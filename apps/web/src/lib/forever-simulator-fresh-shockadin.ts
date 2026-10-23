import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown()),
  positiveInteger = z.number().int().positive().safe();

export const shockadinModelEvidenceReferenceSchema = z
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
export type ShockadinModelEvidenceReference = z.infer<typeof shockadinModelEvidenceReferenceSchema>;

export const shockadinModelEntrySchema = z
  .object({
    id: z.literal("paladin-shockadin-static"),
    profile: z.literal("retribution_paladin"),
    build: shockadinModelEvidenceReferenceSchema,
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
export type ShockadinModelEntry = z.infer<typeof shockadinModelEntrySchema>;

export const verifiedShockadinDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "b59923487ee7150ebe74f5543e9a087e0b9853c9420c285cfd9519c4d5325dfc",
  confirmationSha256: "f3be916e414cfc56e2b3996a9bc4dced44f55d931a76a672a3f2a9011bbd4496",
  confirmationResultSha256: "4e57411c51c1eef7be82c171630e5970bd1bf39b83fc588a59b1125576ce6000",
  feedbackSha256: "0f8141ac270124d687d565912bdb4fcf374efed2b7ae9d8ea7b57e227a342a88",
  gearSha256: "dfd2ca5fe0237533a376bfa8d2f439c746806d81c996c316f38e380f34062f1d",
  blueSha256: "2a38a94f78a70ab4c035667177d49f4e4ee7d923b983e89897ddc3eaa603faf4",
  paritySha256: "9232fb010411b14df9eb288a921be9e519fc8fc55209ee045639f732057e2610",
});

const binding = z
    .object({
      index: z.number().int().nonnegative(),
      actionSha256: digest,
      text: z.string().min(1),
    })
    .strict(),
  evidenceReference = shockadinModelEvidenceReferenceSchema,
  buildSchema = z
    .object({
      schema: z.literal("kfc-fresh-first-pass-build.v2"),
      id: z.literal("paladin-shockadin-static"),
      profile: z.literal("retribution_paladin"),
      variant: z.literal("shockadin"),
      name: z.literal("Shockadin · pre-raid tested"),
      sourceRelease: z.literal(verifiedShockadinDelivery.sourceRelease),
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
          blueControls: evidenceReference,
          gearControls: evidenceReference,
          gearedControls: evidenceReference,
          freeSealModel: evidenceReference,
          catalogModel: evidenceReference,
          acceptedControls: evidenceReference,
        })
        .strict(),
      rotationGuidance: z
        .object({
          schema: z.literal("kfc-paladin-shockadin-rotation-guidance.v1"),
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
          name: z.literal("bounded-paladin-shockadin-first-pass.v1"),

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
          numericalCounterScope: z.string().min(1),
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

export type FreshShockadinSimulatorBuild = z.infer<typeof buildSchema>;
export interface ShockadinModelBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reviewedBuildSha256: string;
  readonly reference: (reference: ShockadinModelEvidenceReference) => Promise<unknown>;
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
  readonly resultRef: ShockadinModelEvidenceReference;
  readonly declarationRef: ShockadinModelEvidenceReference;
}

async function readShockadinSources(
  build: FreshShockadinSimulatorBuild,
  reference: ShockadinModelBuildOptions["reference"],
): Promise<{
  blue: CompletedSource;
  gear: CompletedSource;
  feedback: CompletedSource;
  inspection: CompletedSource;
  confirmation: CompletedSource;
}> {
  async function completed(ref: ShockadinModelEvidenceReference): Promise<CompletedSource> {
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
      "Shockadin completed source identity changed",
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
    gear = await completed(evidenceReference.parse(feedback.declaration.sourceCompletion)),
    blue = await completed(evidenceReference.parse(gear.declaration.sourceCompletion)),
    inspection = await completed(evidence.finalInspection),
    confirmation = await completed(evidence.confirmation),
    backend = record.parse(confirmation.declaration.backend);
  for (const [source, schema, resultRef] of [
    [blue, "kfc-paladin-shockadin-blue-declaration.v1", evidence.priorStructuralAnchor],
    [gear, "kfc-paladin-shockadin-first-pass-gear-declaration.v1", evidence.priorStructuralGear],
    [feedback, "kfc-paladin-shockadin-feedback-declaration.v1", evidence.feedbackResult],
    [
      inspection,
      "kfc-paladin-shockadin-finite-final-inspection-declaration.v1",
      evidence.finalInspectionResult,
    ],
    [
      confirmation,
      "kfc-paladin-shockadin-independent-final-confirmation-declaration.v1",
      evidence.confirmationResult,
    ],
  ] as const) {
    requireMatch(
      source.declaration.schema === schema &&
        source.declaration.profile === "retribution_paladin" &&
        source.declaration.variant === "shockadin" &&
        source.declaration.expectedPlayerClass === 4 &&
        source.declaration.sourceRelease === build.sourceRelease,
      "Shockadin reused another class, spec or engine",
    );
    same(source.resultRef, resultRef, "Shockadin result reference changed");
    same(source.declaration.backend, backend, "Shockadin source backend changed");
  }
  same(
    confirmation.declarationRef,
    evidence.confirmationDeclaration,
    "Shockadin confirmation declaration changed",
  );
  requireMatch(
    confirmation.declarationRef.sha256 === verifiedShockadinDelivery.confirmationSha256,
    "Unreviewed Shockadin confirmation",
  );
  for (const [parent, identity] of [
    [blue, verifiedShockadinDelivery.blueSha256],
    [gear, verifiedShockadinDelivery.gearSha256],
    [feedback, verifiedShockadinDelivery.feedbackSha256],
  ] as const)
    requireMatch(parent.declarationRef.sha256 === identity, "Unreviewed Shockadin source parent");
  requireMatch(
    confirmation.resultRef.sha256 === verifiedShockadinDelivery.confirmationResultSha256,
    "Unreviewed Shockadin confirmation result",
  );
  same(blue.declaration.importedJournals, [], "Shockadin blue imported old-model scores");
  same(
    gear.declaration.importedJournals,
    blue.result.journals,
    "Shockadin gear origin reuse changed",
  );
  same(gear.declaration.sourceResult, blue.resultRef, "Shockadin gear lost its blue parent");
  same(
    feedback.declaration.importedJournals,
    gear.result.journals,
    "Shockadin feedback origin reuse changed",
  );
  same(
    feedback.declaration.sourceResult,
    gear.resultRef,
    "Shockadin feedback lost its gear parent",
  );
  for (const source of [inspection, confirmation]) {
    same(
      source.declaration.sourceCompletion,
      evidence.feedback,
      "Shockadin lost closed corrected feedback",
    );
    same(
      source.declaration.sourceResult,
      feedback.resultRef,
      "Shockadin lost corrected feedback result",
    );
  }
  same(
    inspection.declaration.importedJournals,
    feedback.result.journals,
    "Shockadin inspection origin reuse changed",
  );
  same(
    confirmation.declaration.importedJournals,
    inspection.result.journals,
    "Shockadin holdout origin reuse changed",
  );
  same(
    confirmation.declaration.inspectionResult,
    inspection.resultRef,
    "Shockadin finite inspection result changed",
  );

  same(
    confirmation.declaration.inspectionCompletion,
    evidence.finalInspection,
    "Shockadin must use the stored canonical finite completion, never a runtime envelope",
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
    "Shockadin corrected free-seal or current PvP model provenance changed",
  );
  requireMatch(
    evidence.acceptedControls.sha256 ===
      "8bb791a81d4aadeec1b2e6f501ff548d6dbf374f4f171278e1681339b308f6a1" &&
      controls.schema === "kfc-paladin-free-seal-controls.v1" &&
      controlParity.status === "passed-after-cleanup" &&
      controlParity.expectedClass === 4 &&
      z.array(record).parse(controlParity.records).length === 55,
    "Shockadin corrected free/paid-seal mechanics controls changed",
  );
  for (const [ref, parent, field, schema, count, expectedSha] of [
    [
      evidence.blueControls,
      blue,
      "acceptedControls",
      "kfc-paladin-shockadin-controls.v1",
      10,
      "40d25dc1f372c7f264507d9c5db9d57059322ebb5ac7d64c51432b4625cb0edd",
    ],
    [
      evidence.gearControls,
      gear,
      "parity",
      "kfc-paladin-shockadin-gear-parity.v1",
      14,
      "dfeaace6fa3a45201cad8012c01010d73d93026224ba43bb14394e896654c1d3",
    ],
    [
      evidence.gearedControls,
      feedback,
      "parity",
      "kfc-paladin-shockadin-geared-state-parity.v1",
      23,
      "eaa45ed8257d025296e09cfb98d33d22ad3d2903a3386af37a82b4ae18c15dab",
    ],
  ] as const) {
    const declared = record.parse(parent.declaration[field]),
      report = record.parse(await reference(ref)),
      parity = record.parse(report.parity);
    requireMatch(
      ref.sha256 === expectedSha &&
        ref.path === declared.path &&
        ref.sha256 === declared.sha256 &&
        report.schema === schema &&
        report.publicationAllowed === false &&
        parity.status === "passed-after-cleanup" &&
        parity.expectedClass === 4 &&
        z.array(record).parse(parity.records).length === count &&
        parity.nativeJobs === count &&
        parity.browserJobs === count &&
        parity.nativeFights === count * 25 &&
        parity.browserFights === count * 25,
      "Shockadin lost actual class4 mechanics/gear/feedback controls",
    );
    same(parity.errors, [], "Shockadin controls contain errors");
  }
  return { blue, gear, feedback, inspection, confirmation };
}

function validateShockadinFeedback(
  build: FreshShockadinSimulatorBuild,
  gear: CompletedSource,
  feedback: CompletedSource,
  confirmation: CompletedSource,
): void {
  const closing = record.parse(record.parse(feedback.result.semantic).evaluation),
    cycles = z.array(record).min(1).max(2).parse(closing.cycles),
    last = cycles.at(-1),
    lastGear = record.parse(last?.gear),
    lastState = record.parse(
      closing.closing ? record.parse(closing.closing).recheck : last?.recheck,
    ),
    initialSweeps = z
      .array(record)
      .min(1)
      .max(2)
      .parse(record.parse(record.parse(gear.result.semantic).evaluation).sweeps),
    sweeps = cycles.flatMap((cycle): Record<string, unknown>[] =>
      z.array(record).min(1).max(2).parse(record.parse(cycle.gear).sweeps),
    );
  requireMatch(
    closing.schema === "kfc-paladin-shockadin-geared-feedback-result.v1" &&
      closing.fixedPointWithinDeclaredPolicy === true &&
      closing.gearApplicabilityRequired === false &&
      closing.independentFinalValidation === false &&
      closing.publicationAllowed === false &&
      lastGear.stoppedForSmallGain === true &&
      build.scope.feedbackCycles === cycles.length &&
      build.scope.currentModelGearSweeps === initialSweeps.length + sweeps.length,
    "Shockadin gear/state feedback did not close",
  );
  same(closing.settings, build.settings, "Shockadin final settings changed");
  same(closing.state, build.state, "Shockadin final state changed");
  same(lastGear.gear, closing.gear, "Shockadin final gear changed");
  same(lastGear.state, build.state, "Shockadin gear applicability used another state");
  same(
    lastState.state,
    build.state,
    "Shockadin state recheck changed its selected talents/rotation",
  );
  const stateRounds = z.array(record).min(1).parse(record.parse(lastState.policy).rounds);
  requireMatch(
    stateRounds.at(-1)?.seed === 77291 && stateRounds.at(-1)?.iterations === 10000,
    "Shockadin state inspection must retain its actual 77291 seed, not relabel its metric",
  );
  for (const sweep of [...initialSweeps, ...sweeps]) {
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
      requireMatch(names.has(name), "Shockadin omitted a slot, ordered pair or set");
    requireMatch(
      [...names].some((name): boolean => name.startsWith("enchant:")),
      "Shockadin omitted enchant comparisons",
    );
  }
  const origins = record.parse(confirmation.result.origins);
  same(
    positiveInteger.parse(origins.uniqueRecords),
    build.scope.numericalJobs,
    "Shockadin accumulated origin count changed",
  );
  same(
    positiveInteger.parse(origins.iterations),
    build.scope.numericalIterations,
    "Shockadin recovered fight count changed",
  );
  requireMatch(
    build.scope.numericalIterations >= build.scope.numericalJobs,
    "Shockadin accumulated provenance is invalid",
  );
}

function validateShockadinConfirmation(
  entry: ShockadinModelEntry,
  build: FreshShockadinSimulatorBuild,
  inspection: CompletedSource,
  confirmation: CompletedSource,
): z.infer<typeof approvedPlanSchema>["originalPlan"] {
  const approved = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approved.originalPlan,
    templates = new Map(entry.requestTemplates.map((row) => [row.arm, row.requestBase64]));
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing or duplicated Shockadin wire templates",
  );
  const request = (
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing actual Shockadin wire");
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
      "Shockadin final arm changed its class or fixed scenario",
    );
    z.array(record).length(17).parse(record.parse(player.equipment).items);
    const bonus = record.parse(player.bonusStats);
    for (const name of ["stats", "pseudoStats"])
      requireMatch(
        z
          .array(z.number().finite())
          .parse(bonus[name] ?? [])
          .every((value): boolean => value === 0),
        "Shockadin final arm added manual stats",
      );
    for (const [values, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(values);
      for (const [name, value] of Object.entries(required))
        same(actual[name], value, "Shockadin raid buff changed: " + name);
    }
    requireMatch(
      hash(request(arm, 10000, 77191)) === arm.inspected.id,
      "Shockadin inspected request changed",
    );
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Shockadin holdout request changed",
  );
  same(plan.arms[0]?.settings, build.settings, "Shockadin selected winner changed after holdouts");
  const inspected = z
    .array(record)
    .length(plan.arms.length)
    .parse(record.parse(record.parse(inspection.result.semantic).evaluation).metrics);
  same(
    new Map(inspected.map((metric) => [metric.id, metric])),
    new Map(plan.arms.map((arm) => [arm.inspected.id, arm.inspected])),
    "Shockadin holdouts lost actual finite inspection metrics",
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
  requireMatch(math.accepted, "Shockadin exceeds the approved 2% margin");
  same(approval, build.approval, "Shockadin exported approval changed");
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Shockadin approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Original Shockadin 1% assessment changed: " + key);
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === 40000 &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction &&
      math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted,
    "Shockadin disclosed precision changed",
  );
  return plan;
}

async function validateShockadinParityAndGuide(
  build: FreshShockadinSimulatorBuild,
  plan: z.infer<typeof approvedPlanSchema>["originalPlan"],
  confirmation: CompletedSource,
  reference: ShockadinModelBuildOptions["reference"],
): Promise<void> {
  const reservation = record.parse(
      await reference(evidenceReference.parse(build.approval.reservation)),
    ),
    rawPlan = record.parse(confirmation.declaration.confirmationPlan).originalPlan;
  requireMatch(
    reservation.identity === verifiedShockadinDelivery.confirmationSha256 &&
      reservation.planSha256 === hash(rawPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Shockadin fresh RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Shockadin reserved seeds changed");
  const parity = record.parse(await reference(build.evidence.parity)),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = record.parse(passed.native),
    browser = record.parse(passed.browser),
    wasm = record.parse(await reference(evidenceReference.parse(parity.browser)));
  requireMatch(
    build.evidence.parity.sha256 === verifiedShockadinDelivery.paritySha256 &&
      parity.schema === "kfc-paladin-shockadin-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.schema === "kfc-paladin-shockadin-selected-native-wasm-parity.v1" &&
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
    "Actual selected Shockadin native/WASM parity missing",
  );
  same(parity.errors, [], "Shockadin parity has browser errors");
  same(descriptor.backend, confirmation.declaration.backend, "Shockadin parity backend changed");
  same(
    record.parse(descriptor.sourceValidation).completion,
    build.evidence.confirmation,
    "Shockadin parity lost fresh confirmation",
  );
  same(
    descriptor.sourceRequestId,
    plan.arms[0]?.inspected.id,
    "Shockadin parity lost its actual selected native request",
  );
  same(descriptor.browserRequestId, browser.id, "Shockadin parity browser identity changed");
  same(native, plan.arms[0]?.inspected, "Shockadin parity native origin changed");
  same(wasm.metric, browser, "Shockadin raw browser result changed");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance,
    actions = z.array(record).parse(rotation.priorityList),
    prepull = z.array(record).length(1).parse(rotation.prepullActions);
  const trees = z
      .string()
      .regex(/^[0-5]+-[0-5]*-[0-5]*$/)
      .parse(player.talentsString)
      .split("-"),
    allocation = trees.map((tree): number =>
      [...tree].reduce((sum, point): number => sum + Number(point), 0),
    );
  requireMatch(
    allocation.length === 3 &&
      (allocation[0] ?? 0) >= 21 &&
      allocation.reduce((sum, points): number => sum + points, 0) === 51,
    "Shockadin guide requires a real Holy Shock talent family",
  );
  requireMatch(
    hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      guide.priorities.length === actions.length &&
      guide.prepullBindings.length === prepull.length &&
      guide.prepull.length === prepull.length &&
      player.talentsString === build.state.talentsString &&
      guide.talents === allocation.join("/") &&
      guide.instruction.includes("main-hand autoattacks") &&
      guide.instruction.includes("libram") &&
      guide.priorities.some((text): boolean => text.includes("Holy Shock")),
    "Shockadin guide lost its exact measured actions",
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
        "Shockadin ordered action guidance changed",
      ),
    );
}

export async function readFreshShockadinSimulatorBuild(
  rawEntry: unknown,
  options: ShockadinModelBuildOptions,
): Promise<FreshShockadinSimulatorBuild> {
  const entry = shockadinModelEntrySchema.parse(rawEntry),
    reviewedBuildSha256 = digest.parse(options.reviewedBuildSha256);
  requireMatch(
    reviewedBuildSha256 === verifiedShockadinDelivery.buildSha256 &&
      entry.build.sha256 === reviewedBuildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/paladin-shockadin-first-pass-v1/build-${reviewedBuildSha256.slice(0, 16)}.json`,
    "Unreviewed Shockadin export requires an independent delivery review",
  );
  async function reference(raw: ShockadinModelEvidenceReference): Promise<unknown> {
    const ref = evidenceReference.parse(raw),
      value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Shockadin evidence checksum changed: " + ref.path);
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Shockadin publication model, settings or DPS changed",
  );
  const sources = await readShockadinSources(build, reference);
  validateShockadinFeedback(build, sources.gear, sources.feedback, sources.confirmation);
  const plan = validateShockadinConfirmation(
    entry,
    build,
    sources.inspection,
    sources.confirmation,
  );
  await validateShockadinParityAndGuide(build, plan, sources.confirmation, reference);
  return build;
}
