import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { feralSimulatorGuidanceText } from "./forever-simulator-feral-guidance";
import type {
  ModelFirstPassOptions,
  ModelFirstPassReference,
  SimulatorModelFirstPassEntry,
} from "./forever-simulator-model-first-pass";

const record = z.record(z.string(), z.unknown());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const referenceSchema = z
  .object({
    path: z
      .string()
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
const metricSchema = z
  .object({
    id: digest,
    dps: z.number().finite().positive(),
    stdev: z.number().finite().nonnegative(),
    iterations: z.number().int().positive(),
  })
  .strict();
const backendSchema = z
  .object({
    kind: z.literal("admitted-native.v1"),
    binarySha256: digest,
    compiledDatabaseSha256: digest,
    runnerSourceSha256: digest,
    codecSha256: digest,
  })
  .strict();
const armSchema = z
  .object({
    name: z.string().min(1).max(80),
    category: z.string().min(1),
    settings: record,
    state: record,
    inspected: metricSchema,
    source: referenceSchema,
  })
  .strict();
const bindingSchema = z
  .object({
    index: z.number().int().nonnegative(),
    actionSha256: digest,
    text: z.string().min(1),
  })
  .strict();
const guideSchema = z
  .object({
    schema: z.literal("kfc-feral-cat-rotation-guidance.v1"),
    rotationSha256: digest,
    talents: z.string().min(1),
    conjured: z.enum(["tea", "rune"]),
    prepull: z.array(z.string().min(1)).max(8),
    prepullBindings: z.array(bindingSchema).max(8),
    scenario: z.string().min(1),
    instruction: z.string().min(1),
    priorities: z.array(z.string().min(1)).min(1).max(32),
    priorityBindings: z.array(bindingSchema).min(1).max(32),
    caveats: z.array(z.string().min(1)).min(1).max(20),
  })
  .strict();
const evidenceSchema = z
  .object({
    blue: referenceSchema,
    blueResult: referenceSchema,
    gear: referenceSchema,
    gearResult: referenceSchema,
    state: referenceSchema,
    stateResult: referenceSchema,
    closing: referenceSchema,
    closingResult: referenceSchema,
    confirmation: referenceSchema,
    confirmationResult: referenceSchema,
    confirmationDeclaration: referenceSchema,
    parity: referenceSchema,
  })
  .strict();
const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v1"),
    id: z.literal("feral-cat-static"),
    profile: z.literal("feral_druid"),
    variant: z.literal("feral"),
    name: z.literal("Feral Cat · first-pass tested"),
    sourceRelease: z.string().regex(/^[a-f0-9]{24}$/),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: digest,
    nativeBinarySha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    faction: z.enum(["Alliance", "Horde"]),
    settings: record,
    state: record,
    approval: record,
    enchantPolicy: z
      .object({
        schema: z.literal("kfc-enchant-model-policy.v1"),
        provisionalEffectIds: z.array(z.never()).length(0),
      })
      .strict(),
    enchants: z
      .array(
        z
          .object({
            gearIndex: z.number().int().min(0).max(16),
            itemId: z.number().int().positive(),
            effectId: z.number().int().positive(),
            key: z.string().min(1),
            name: z.string().min(1),
            status: z.enum(["static", "scripted"]),
          })
          .strict(),
      )
      .min(1)
      .max(17),
    requiresProvisionalEnchantOptIn: z.literal(false),
    rotationGuidance: guideSchema,
    evidence: evidenceSchema,
    scope: z
      .object({
        name: z.literal("bounded-fresh-feral-first-pass.v1"),
        sourceRole: z.literal("feral-practical-first-pass-confirmed"),
        originalGearSweeps: z.literal(2),
        closingFeedbackCompleted: z.literal(true),
        closingGearSweeps: z.number().int().min(1).max(4),
        gearedStateRecheckCompleted: z.literal(true),
        stateMaterialChange: z.literal(false),
        gearApplicabilityRequired: z.literal(false),
        maximumRetainedGapFraction: z.literal(0.02),
        largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
        originalStrictAssessmentAccepted: z.boolean(),
        selectionChanged: z.literal(false),
        globalOptimalityProven: z.literal(false),
        deeperOptimizationDeferred: z.literal(true),
        numericalJobs: z.number().int().positive(),
        numericalIterations: z.number().int().positive(),
      })
      .strict(),
    warnings: z.array(z.string().min(1).max(4000)).min(1).max(20),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .strict();
export type FreshFeralSimulatorBuild = z.infer<typeof buildSchema>;
const policySchema = z
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
  .strict();
const planSchema = z
  .object({
    schema: z.literal("kfc-approved-first-pass-frozen-confirmation.v1"),
    approvalPolicy: z
      .object({
        schema: z.literal("kfc-owner-approved-first-pass-margin.v1"),
        maximumRetainedGapFraction: z.literal(0.02),
        originalMaximumRetainedGapFraction: z.literal(0.01),
        selectionFromHoldoutsAllowed: z.literal(false),
        scope: z.string().min(1),
      })
      .strict(),
    originalPlan: z
      .object({
        schema: z.literal("kfc-practical-first-pass-frozen-confirmation.v1"),
        profile: z.literal("feral_druid"),
        variant: z.literal("feral"),
        playerClass: z.literal(1),
        playerClassName: z.literal("ClassDruid"),
        backend: backendSchema,
        arms: z.array(armSchema).min(2).max(12),
        scenarioSha256: digest,
        policy: policySchema,
        readiness: z
          .object({
            schema: z.literal("kfc-practical-first-pass-readiness.v1"),
            sourceRole: z.literal("feral-closed-gear-and-state-first-pass"),
            sourceCompletion: referenceSchema,
            stateRecheckEvidence: referenceSchema,
            gearApplicabilityEvidence: referenceSchema,
            stateRecheckCompleted: z.literal(true),
            gearApplicabilityReviewed: z.literal(true),
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
          .min(1)
          .max(200),
        validationSeedContext: digest,
        validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
        publicationAllowed: z.literal(false),
      })
      .passthrough(),
  })
  .strict();

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(actual, expected), message);
}
function scenarioHash(settings: Record<string, unknown>): string {
  const value = structuredClone(settings),
    player = record.parse(value.player);
  requireMatch(
    player.class === "ClassDruid" &&
      player.distanceFromTarget === 5 &&
      player.inFrontOfTarget === false,
    "Fresh Feral class/range/facing changed",
  );
  for (const key of ["equipment", "talentsString", "rotation"]) delete player[key];
  const consumes = record.parse(player.consumes);
  for (const key of ["mainHandImbue", "defaultConjured"]) delete consumes[key];
  player.consumes = consumes;
  value.player = player;
  return hash(value);
}

export async function readFreshFeralSimulatorBuild(
  entry: SimulatorModelFirstPassEntry,
  options: ModelFirstPassOptions,
): Promise<FreshFeralSimulatorBuild> {
  requireMatch(
    entry.id === "feral-cat-static" && entry.profile === "feral_druid",
    "Wrong fresh first-pass entry",
  );
  async function reference(ref: ModelFirstPassReference): Promise<unknown> {
    const checked = referenceSchema.parse(ref),
      value = await options.reference(checked);
    requireMatch(hash(value) === checked.sha256, "Fresh Feral evidence checksum changed");
    return value;
  }
  async function completed(
    ref: ModelFirstPassReference,
    schema: string,
  ): Promise<{
    result: Record<string, unknown>;
    declaration: Record<string, unknown>;
    resultReference: ModelFirstPassReference;
    declarationReference: ModelFirstPassReference;
  }> {
    const completion = z
      .object({
        schema: z.literal("kfc-bounded-native-study-completion.v1"),
        identity: digest,
        result: referenceSchema,
        publicationAllowed: z.literal(false),
      })
      .strict()
      .parse(await reference(ref));
    const folder = `artifacts/forever-simulator/optimization/bounded-native-studies/${completion.identity}/`;
    requireMatch(ref.path === folder + "completed.json", "Fresh Feral completion path changed");
    const result = record.parse(await reference(completion.result));
    const declarationReference = referenceSchema.parse(result.declaration);
    requireMatch(
      result.schema === "kfc-bounded-native-study-result.v1" &&
        result.identity === completion.identity &&
        result.publicationAllowed === false &&
        declarationReference.path === folder + "declaration.json" &&
        declarationReference.sha256 === completion.identity &&
        completion.result.path ===
          folder + "result-" + completion.result.sha256.slice(0, 16) + ".json",
      "Fresh Feral result identity changed",
    );
    const declaration = record.parse(await reference(declarationReference));
    requireMatch(
      declaration.schema === schema &&
        declaration.sourceRelease === options.sourceRelease &&
        declaration.profile === "feral_druid" &&
        declaration.variant === "feral" &&
        declaration.expectedPlayerClass === 1,
      "Fresh Feral source/model/class changed",
    );
    return { result, declaration, resultReference: completion.result, declarationReference };
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    entry.build.path.endsWith(`/build-${entry.build.sha256.slice(0, 16)}.json`) &&
      build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      build.validationIterations === entry.validationIterations,
    "Fresh Feral build/publication identity changed",
  );
  const evidence = build.evidence;
  const blue = await completed(evidence.blue, "kfc-feral-corrected-blue-declaration.v1");
  const gear = await completed(evidence.gear, "kfc-feral-first-pass-gear-declaration.v1");
  const state = await completed(evidence.state, "kfc-feral-first-pass-state-declaration.v1");
  const closing = await completed(evidence.closing, "kfc-feral-closing-feedback-declaration.v1");
  const confirmation = await completed(
    evidence.confirmation,
    "kfc-feral-closing-confirmation-declaration.v1",
  );
  for (const [source, resultReference] of [
    [blue, evidence.blueResult],
    [gear, evidence.gearResult],
    [state, evidence.stateResult],
    [closing, evidence.closingResult],
    [confirmation, evidence.confirmationResult],
  ] as const)
    same(source.resultReference, resultReference, "Fresh Feral source result changed");
  same(
    confirmation.declarationReference,
    evidence.confirmationDeclaration,
    "Fresh Feral confirmation declaration changed",
  );
  for (const [child, parent, result] of [
    [gear, evidence.blue, evidence.blueResult],
    [state, evidence.gear, evidence.gearResult],
    [closing, evidence.state, evidence.stateResult],
    [confirmation, evidence.closing, evidence.closingResult],
  ] as const) {
    same(child.declaration.sourceCompletion, parent, "Fresh Feral source chain changed");
    same(child.declaration.sourceResult, result, "Fresh Feral source result chain changed");
  }
  const backend = backendSchema.parse(confirmation.declaration.backend);
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256,
    "Fresh Feral numerical backend changed",
  );
  for (const source of [blue, gear, state, closing])
    same(source.declaration.backend, backend, "Fresh Feral source models disagree");
  const blueOutcome = record.parse(record.parse(blue.result.semantic).evaluation);
  const gearOutcome = record.parse(record.parse(gear.result.semantic).evaluation);
  const stateOutcome = record.parse(record.parse(state.result.semantic).evaluation);
  requireMatch(
    blueOutcome.schema === "kfc-feral-first-pass-blue-selection.v1" &&
      gearOutcome.schema === "kfc-practical-first-pass-gear-selection.v1" &&
      stateOutcome.schema === "kfc-feral-practical-state-recheck.v1",
    "Fresh Feral selection protocol changed",
  );
  for (const outcome of [blueOutcome, gearOutcome, stateOutcome])
    requireMatch(
      outcome.independentFinalValidation === false && outcome.publicationAllowed === false,
      "Selection was relabelled as final validation",
    );
  const closingOutcome = record.parse(record.parse(closing.result.semantic).evaluation);
  requireMatch(
    closingOutcome.schema === "kfc-feral-practical-closing-feedback.v1" &&
      closingOutcome.closed === true &&
      closingOutcome.requiresGearContinuation === false &&
      closingOutcome.cycle === false &&
      closingOutcome.freshConfirmationAllowed === true &&
      closingOutcome.independentFinalValidation === false &&
      closingOutcome.publicationAllowed === false,
    "Fresh Feral closing feedback is incomplete",
  );
  same(gearOutcome.state, blueOutcome.state, "Gear pass changed frozen blue state");
  same(closing.declaration.initialState, stateOutcome.state, "Closing lost its original state");
  same(
    closing.declaration.initialMetric,
    record.parse(stateOutcome.selected).metric,
    "Closing lost its measured control",
  );
  same(build.state, closingOutcome.state, "Fresh Feral exported state changed");
  same(build.settings, closingOutcome.settings, "Fresh Feral exported settings changed");
  const closingRounds = z.array(record).min(1).max(2).parse(closingOutcome.rounds);
  const last = closingRounds.at(-1);
  requireMatch(
    last && last.closed === true && last.cycle === false,
    "Feral final round is not closed",
  );
  const closingGear = record.parse(last.gear),
    closingState = record.parse(last.recheck);
  requireMatch(
    closingGear.stoppedForSmallGain === true &&
      closingState.materialChange === false &&
      closingState.gearApplicabilityRequired === false &&
      closingState.requiresGearContinuation === false,
    "Feral closing gear/state applicability is not established",
  );
  same(closingState.settings, closingOutcome.settings, "Feral closing settings changed");
  same(closingState.state, closingOutcome.state, "Feral closing state changed");
  same(
    record.parse(closingState.selected).metric,
    closingOutcome.selectedMetric,
    "Feral closing metric changed",
  );
  same(
    record.parse(closingGear.selected).metric,
    closingOutcome.selectedMetric,
    "Feral gear selection metric changed",
  );
  const originalSweeps = z.array(record).length(2).parse(gearOutcome.sweeps);
  const closingSweeps = closingRounds.flatMap((round): Record<string, unknown>[] =>
    z.array(record).min(1).max(2).parse(record.parse(round.gear).sweeps),
  );
  requireMatch(
    closingSweeps.length === closingOutcome.additionalGearSweeps &&
      closingSweeps.length === build.scope.closingGearSweeps,
    "Feral closing sweep count changed",
  );
  const sweeps = z.array(record).min(1).max(2).parse(closingGear.sweeps);
  for (const sweep of [...originalSweeps, ...closingSweeps]) {
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
      requireMatch(names.has(name), "Fresh Feral gear pass omitted a slot/pair/set");
  }
  const rawPlan = record.parse(
    record.parse(confirmation.declaration.confirmationPlan).originalPlan,
  );
  const approvedPlan = planSchema.parse(confirmation.declaration.confirmationPlan),
    plan = approvedPlan.originalPlan;
  same(plan.backend, backend, "Fresh Feral confirmation model changed");
  same(
    plan.readiness.sourceCompletion,
    evidence.closing,
    "Fresh Feral readiness targets another state",
  );
  same(
    plan.readiness.stateRecheckEvidence,
    evidence.closingResult,
    "Fresh Feral state readiness changed",
  );
  same(
    plan.readiness.gearApplicabilityEvidence,
    evidence.closingResult,
    "Fresh Feral gear readiness changed",
  );
  const experiment = Object.fromEntries(
    Object.entries(rawPlan).filter(
      ([key]): boolean =>
        ![
          "validationSeedContext",
          "validationSeedPolicy",
          "seeds",
          "requestIds",
          "publicationAllowed",
        ].includes(key),
    ),
  );
  requireMatch(
    hash(experiment) === plan.validationSeedContext,
    "Fresh Feral frozen seed context changed",
  );
  const start =
    100000000 + Number.parseInt(plan.validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  same(plan.seeds, [start, start + 100000], "Fresh Feral RNG arenas changed");
  const templates = new Map(
    entry.requestTemplates.map((template) => [template.arm, template.requestBase64]),
  );
  requireMatch(
    templates.size === plan.arms.length && entry.requestTemplates.length === templates.size,
    "Fresh Feral wire templates are missing or duplicated",
  );
  function request(
    arm: z.infer<typeof armSchema>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing fresh Feral request frame");
    return {
      requestBase64,
      gear: record.parse(player.equipment).items,
      talentsString: player.talentsString,
      rotation: player.rotation,
      iterations,
      seed,
      detail: false,
    };
  }
  const ranked = z
    .array(record)
    .parse(
      record.parse(record.parse(z.array(record).parse(closingState.rounds).at(-1)).ranking).ranked,
    );
  const gearFinalists = z.array(record).parse(sweeps.at(-1)?.finalists);
  for (const arm of plan.arms) {
    const player = record.parse(arm.settings.player);
    const allocation = z
      .string()
      .regex(/^[0-5]+(?:-[0-5]*){0,2}$/)
      .parse(player.talentsString)
      .split("-")
      .map((tree): number => [...tree].reduce((sum, value) => sum + Number(value), 0));
    requireMatch(
      player.class === "ClassDruid" &&
        player.level === 60 &&
        player.foreverTier1Bonuses === false &&
        player.enableItemSwap === false &&
        allocation.reduce((sum, value) => sum + value, 0) === 51 &&
        (allocation[1] ?? 0) >= 31,
      "Fresh Feral arm has invalid class/talents/raid bonuses/swaps",
    );
    record.parse(player.feralDruid);
    const conjured = z.enum(["tea", "rune"]).parse(arm.state.conjured);
    requireMatch(
      record.parse(player.consumes).defaultConjured ===
        (conjured === "tea" ? "ConjuredRogueThistleTea" : "ConjuredDemonicRune"),
      "Fresh Feral conjured/state mismatch",
    );
    requireMatch(
      scenarioHash(arm.settings) === plan.scenarioSha256 &&
        arm.inspected.iterations === 10000 &&
        hash(request(arm, 10000, 77191)) === arm.inspected.id,
      "Fresh Feral inspected frame/scenario changed",
    );
    same(arm.source, evidence.closingResult, "Feral arm cites unrelated evidence");
    if (arm.category === "selected") {
      same(arm.inspected, closingOutcome.selectedMetric, "Feral selected10k origin changed");
      same(arm.settings, build.settings, "Feral selected settings changed");
      same(arm.state, build.state, "Feral selected state changed");
    } else if (["gear", "enchant"].includes(arm.category)) {
      const row = gearFinalists.find((candidate): boolean =>
        isDeepStrictEqual(candidate.metric, arm.inspected),
      );
      requireMatch(row, "Feral gear arm has no genuine inspected origin");
      same(row.gear, player.equipment, "Feral gear arm changed its equipment");
      same(arm.state, closingOutcome.state, "Feral gear arm changed its measured state");
    } else {
      const row = ranked.find((candidate): boolean =>
        isDeepStrictEqual(candidate.metric, arm.inspected),
      );
      requireMatch(row, "Feral state arm has no genuine inspected origin");
      same(
        record.parse(row.candidate).state,
        arm.state,
        "Feral arm state disagrees with its origin",
      );
      same(
        row.request,
        request(arm, 10000, 77191),
        "Feral state arm request disagrees with its origin",
      );
      same(
        player.equipment,
        record.parse(build.settings.player).equipment,
        "Feral state arm changed unmeasured gear",
      );
    }
  }
  const selected = plan.arms[0];
  requireMatch(selected?.category === "selected", "Fresh Feral selected arm missing");
  same(selected.settings, build.settings, "Fresh Feral selected incumbent changed");
  same(selected.inspected, closingOutcome.selectedMetric, "Fresh Feral selected origin changed");
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Fresh Feral held-out request identities changed",
  );
  const approval = record.parse(record.parse(confirmation.result.semantic).evaluation);
  same(build.approval, approval, "Fresh Feral exported approval changed");
  const original = record.parse(approval.originalAssessment);
  const records = z
    .array(
      z
        .object({ seed: z.number().int().positive().safe(), arm: z.string(), metric: metricSchema })
        .strict(),
    )
    .min(4)
    .max(24)
    .parse(original.records);
  const math = evaluateApprovedSimulatorConfirmation(approvedPlan, records);
  requireMatch(math.accepted, "Fresh Feral exceeds approved2% margin");
  for (const key of [
    "accepted",
    "status",
    "selectedDps",
    "selectedIterations",
    "iterationsPerRange",
    "largestConservativeRetainedGapFraction",
    "maximumRetainedGapFraction",
    "selectionChanged",
    "globalOptimalityProven",
  ] as const)
    same(approval[key], math[key], "Fresh Feral approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Fresh Feral original1% assessment changed: " + key);
  same(approval.selected, build.settings, "Fresh Feral holdout changed its incumbent");
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === build.validationIterations &&
      build.scope.largestConservativeRetainedGapFraction ===
        math.largestConservativeRetainedGapFraction &&
      build.scope.originalStrictAssessmentAccepted === math.originalAssessment.accepted,
    "Fresh Feral public precision/gap disclosure changed",
  );
  const invocation = [blue, gear, state, closing, confirmation].map(
    (source): Record<string, unknown> => record.parse(source.result.invocation),
  );
  requireMatch(
    invocation.reduce(
      (sum, row): number => sum + z.number().int().nonnegative().parse(row.nativeJobs),
      0,
    ) === build.scope.numericalJobs &&
      invocation.reduce(
        (sum, row): number => sum + z.number().int().nonnegative().parse(row.nativeIterations),
        0,
      ) === build.scope.numericalIterations,
    "Fresh Feral work counts changed",
  );
  const reservationRef = referenceSchema.parse(approval.reservation),
    reservation = record.parse(await reference(reservationRef));
  requireMatch(
    reservation.schema === "kfc-practical-first-pass-validation-reservation.v1" &&
      reservation.identity === confirmation.declarationReference.sha256 &&
      reservation.planSha256 === hash(rawPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Fresh Feral RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Fresh Feral RNG reservation lost its ranges");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    guide = build.rotationGuidance;
  requireMatch(
    hash(rotation) === guide.rotationSha256 && guide.conjured === build.state.conjured,
    "Fresh Feral guide rotation/conjured changed",
  );
  const expectedGuide = feralSimulatorGuidanceText(rotation, guide.conjured);
  for (const key of ["prepull", "priorities", "instruction", "scenario", "caveats"] as const)
    same(guide[key], expectedGuide[key], "Fresh Feral guide text disagrees with its APL: " + key);
  const allocation = z
    .string()
    .parse(player.talentsString)
    .split("-")
    .map((tree): number => [...tree].reduce((sum, value) => sum + Number(value), 0));
  requireMatch(
    guide.talents === allocation.join("/"),
    "Fresh Feral guide talent allocation changed",
  );
  for (const [bindings, rows, texts] of [
    [guide.priorityBindings, z.array(record).parse(rotation.priorityList), guide.priorities],
    [guide.prepullBindings, z.array(record).parse(rotation.prepullActions ?? []), guide.prepull],
  ] as const) {
    requireMatch(
      bindings.length === rows.length && bindings.length === texts.length,
      "Fresh Feral guide omitted an action",
    );
    bindings.forEach((binding, index): void =>
      requireMatch(
        binding.index === index &&
          binding.actionSha256 === hash(rows[index]) &&
          binding.text === texts[index],
        "Fresh Feral guide action binding changed",
      ),
    );
  }
  const items = z
    .array(
      z
        .object({
          id: z.number().int().nonnegative().optional(),
          enchant: z.number().int().positive().optional(),
        })
        .strict(),
    )
    .length(17)
    .parse(record.parse(player.equipment).items);
  requireMatch(
    items.filter((item) => item.enchant).length === build.enchants.length &&
      new Set(build.enchants.map((choice) => choice.gearIndex)).size === build.enchants.length,
    "Fresh Feral enchant coverage changed",
  );
  for (const choice of build.enchants)
    requireMatch(
      items[choice.gearIndex]?.id === choice.itemId &&
        items[choice.gearIndex]?.enchant === choice.effectId &&
        choice.key.startsWith(choice.effectId + ":"),
      "Fresh Feral enchant binding changed",
    );
  const parity = record.parse(await reference(evidence.parity));
  requireMatch(
    parity.schema === "kfc-feral-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      parity.publicationAllowed === false,
    "Fresh Feral selected parity incomplete",
  );
  same(parity.errors, [], "Fresh Feral browser errors");
  const descriptor = record.parse(parity.descriptor),
    prepared = record.parse(parity.prepared),
    summary = record.parse(parity.parity);
  same(
    record.parse(descriptor.sourceValidation).completion,
    evidence.confirmation,
    "Fresh Feral parity validates another confirmation",
  );
  requireMatch(
    descriptor.selectedSettingsSha256 === entry.settingsSha256,
    "Fresh Feral parity targets another selected frame",
  );
  same(
    prepared.sourceInput,
    request(selected, 10000, 77191),
    "Fresh Feral parity source wire changed",
  );
  same(descriptor.backend, backend, "Fresh Feral parity backend changed");
  const native = record.parse(record.parse(parity.nativeOrigin).response),
    browser = record.parse(await reference(referenceSchema.parse(parity.browser)));
  const nativeMetric = metricSchema.parse(
    Object.fromEntries(
      ["id", "dps", "stdev", "iterations"].map((key): [string, unknown] => [key, native[key]]),
    ),
  );
  const browserMetric = metricSchema.parse(browser.metric);
  same(nativeMetric, selected.inspected, "Fresh Feral parity lost genuine selected10k origin");
  requireMatch(
    browser.playerClass === 1 &&
      browser.error === "" &&
      browser.activePlayers === 1 &&
      browser.duration === 300 &&
      browser.id === prepared.browserRequestId &&
      browserMetric.id === browser.id &&
      browserMetric.iterations === 10000 &&
      prepared.sourceRequestId === nativeMetric.id &&
      Math.abs(browserMetric.dps - nativeMetric.dps) < 1e-8 &&
      Math.abs(browserMetric.stdev - nativeMetric.stdev) < 1e-8,
    "Fresh Feral native/browser selected parity failed",
  );
  for (const [admission, id] of [
    [record.parse(native.admission), nativeMetric.id],
    [record.parse(browser.admission), browserMetric.id],
  ] as const)
    requireMatch(
      admission.error === "" &&
        admission.id === id &&
        admission.parties === 1 &&
        admission.activePlayers === 1 &&
        admission.priority === z.array(z.unknown()).parse(rotation.priorityList).length &&
        admission.prepull === z.array(z.unknown()).parse(rotation.prepullActions ?? []).length &&
        Array.isArray(admission.warnings) &&
        admission.warnings.length === 0,
      "Fresh Feral native/browser APL admission failed",
    );
  same(summary.backend, backend, "Fresh Feral parity summary backend changed");
  requireMatch(
    summary.status === "passed" &&
      summary.absoluteDpsDifference === 0 &&
      summary.absoluteStdevDifference === 0,
    "Fresh Feral parity summary changed",
  );
  return build;
}
