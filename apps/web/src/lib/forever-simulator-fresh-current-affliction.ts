import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { readCurrentAfflictionClosedFeedbackEvidence } from "./forever-simulator-current-affliction-feedback-evidence";
import {
  afflictionModelEntrySchema,
  afflictionModelEvidenceReferenceSchema,
  type AfflictionModelBuildOptions,
} from "./forever-simulator-fresh-affliction";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown()),
  integer = z.number().int().positive().safe(),
  metric = z
    .object({
      id: digest,
      dps: z.number().finite().positive(),
      stdev: z.number().finite().nonnegative(),
      iterations: integer,
    })
    .strict(),
  binding = z
    .object({
      index: z.number().int().nonnegative(),
      actionSha256: digest,
      text: z.string().min(1),
    })
    .strict();

export const currentAfflictionModelEntrySchema = afflictionModelEntrySchema.extend({
  id: z.literal("warlock-affliction-static"),
});
export type CurrentAfflictionModelEntry = z.infer<typeof currentAfflictionModelEntrySchema>;

export const verifiedCurrentAfflictionNumericalDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "7c2fae6c943f0b8a16f8045315385206160b899025a03601554457882bd6fd16",
  confirmationStudyIdentity: "c3f7b2f7a5b6b0baf405317949b0df4031a5e3ca12082033d8f9631a5a87478a",
  settingsSha256: "dca945a57cac675a1c8c5f11484ef22b4e83abadfbfe6a33fd9408842268743a",
  paritySha256: "38590fe0212ec01df275c2f8dcb5cfc43769af6e34f79920ac9590bc2c57d198",
  databaseSha256: "cf9262e1e29cae2aff9655f5bbfa662eb11d339a119d6f406472b4ad0935dcfe",
  nativeBinarySha256: "de9f74ba61f5aca05066033b4b0e5e996d634eabb755d51a2174600b274f3a79",
  receiptSha256: "ac35384d8f964d73d2479f54e0b55fdc5603b834a212a0eccc5b08717dc1efd2",
  feedbackSummarySha256: "00cd00af3fe1cdcfe5c467725e2246f289ec79977fa9dcf601ac2439f59e4e5f",
});

const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("warlock-affliction-static"),
    profile: z.literal("warlock"),
    variant: z.literal("affliction"),
    name: z.literal("Affliction · pre-raid tested"),
    sourceRelease: z.literal(verifiedCurrentAfflictionNumericalDelivery.sourceRelease),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: z.literal(verifiedCurrentAfflictionNumericalDelivery.databaseSha256),
    nativeBinarySha256: z.literal(verifiedCurrentAfflictionNumericalDelivery.nativeBinarySha256),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    evidence: z.record(z.string(), afflictionModelEvidenceReferenceSchema),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-current-affliction-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.literal("30/0/21"),
        activeDemon: z.literal("Succubus"),
        sacrificedDemon: z.literal("NoSummon"),
        weaponStone: z.literal("Spellstone"),
        scenario: z.string().min(1),
        instruction: z.string().min(1),
        priorities: z.array(z.string().min(1)).min(1),
        priorityBindings: z.array(binding).min(1),
        prepull: z.array(z.string()).length(0),
        prepullBindings: z.array(binding).length(0),
        caveats: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    scope: z
      .object({
        sourceRole: z.literal("current-full-raid-affliction-practical-first-pass-confirmed"),
        primaryArchetype: z.literal("26plus-shadow-mastery-affliction"),
        activeDemonsNoPetAndLegalPureSacrificesCompete: z.literal(true),
        closingFeedbackCompleted: z.literal(true),
        feedbackCycles: z.number().int().min(1).max(3),
        finalGearConsumeApplicabilityInspected: z.literal(true),
        gearedStateRecheckCompleted: z.literal(true),
        stateChanged: z.literal(false),
        finalGearSmallGainStop: z.literal(true),
        gearApplicabilityRequired: z.literal(false),
        previousModelNumericalReuse: z.literal(false),
        exactCurrentBackendScalarReuse: z.literal(true),
        maximumRetainedGapFraction: z.literal(0.02),
        largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
        originalStrictAssessmentAccepted: z.boolean(),
        noStatisticallyBetterRetainedChallenger: z.boolean(),
        selectionChanged: z.literal(false),
        globalOptimalityProven: z.literal(false),
        numericalJobs: integer,
        numericalIterations: integer,
        selectedObservedTargetAuraBoundPassed: z.literal(true),
        targetAuraObservationIterations: z.literal(10000),
        globalTargetDebuffSlotEnforcementProven: z.literal(false),
      })
      .passthrough(),
    requiresProvisionalEnchantOptIn: z.literal(false),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .passthrough();
export type FreshCurrentAfflictionSimulatorBuild = z.infer<typeof buildSchema>;

export interface CurrentAfflictionModelBuildOptions extends AfflictionModelBuildOptions {
  readonly reviewedBuildSha256: string;
}

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
                inspected: metric,
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
        seeds: z.array(integer).length(2),
        requestIds: z.array(digest).min(4).max(24),
        inspectedSeedRanges: z
          .array(z.object({ seed: integer, iterations: integer }).strict())
          .min(1),
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
function same(left: unknown, right: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(left, right), message);
}

/** Request-time verification of a hash-pinned, fully replayed export; the expensive full raw-journal/gear search replay remains an offline delivery requirement. */
export async function readFreshCurrentAfflictionSimulatorBuild(
  rawEntry: CurrentAfflictionModelEntry,
  options: CurrentAfflictionModelBuildOptions,
): Promise<FreshCurrentAfflictionSimulatorBuild> {
  const entry = currentAfflictionModelEntrySchema.parse(rawEntry);
  requireMatch(
    options.reviewedBuildSha256 === verifiedCurrentAfflictionNumericalDelivery.buildSha256 &&
      entry.build.sha256 === verifiedCurrentAfflictionNumericalDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/warlock-affliction-current-full-raid-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed CurrentAffliction export requires its own delivery review",
  );
  async function reference(raw: unknown): Promise<Record<string, unknown>> {
    const ref = afflictionModelEvidenceReferenceSchema.parse(raw),
      value = record.parse(await options.reference(ref));
    requireMatch(
      hash(value) === ref.sha256,
      "CurrentAffliction evidence checksum changed: " + ref.path,
    );
    return value;
  }
  const build = buildSchema.parse(await reference(entry.build)),
    evidence = build.evidence,
    completion = z
      .object({
        schema: z.literal("kfc-bounded-native-study-completion.v1"),
        identity: digest,
        result: afflictionModelEvidenceReferenceSchema,
        publicationAllowed: z.literal(false),
      })
      .strict()
      .parse(await reference(evidence.confirmation));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === verifiedCurrentAfflictionNumericalDelivery.settingsSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      completion.identity === verifiedCurrentAfflictionNumericalDelivery.confirmationStudyIdentity,
    "CurrentAffliction publication changed model, selected inputs or reference DPS",
  );
  same(
    completion.result,
    evidence.confirmationResult,
    "CurrentAffliction final result reference changed",
  );
  const confirmation = await reference(completion.result),
    declaration = await reference(evidence.confirmationDeclaration),
    backend = record.parse(declaration.backend),
    approval = record.parse(record.parse(confirmation.semantic).evaluation),
    original = record.parse(approval.originalAssessment),
    approved = approvedPlanSchema.parse(declaration.confirmationPlan),
    plan = approved.originalPlan,
    records = z
      .array(z.object({ seed: integer, arm: z.string(), metric }).strict())
      .min(4)
      .max(24)
      .parse(original.records),
    math = evaluateApprovedSimulatorConfirmation(approved, records);
  requireMatch(
    hash(declaration) === completion.identity &&
      declaration.schema ===
        "kfc-current-full-raid-affliction-independent-confirmation-declaration.v1" &&
      declaration.expectedPlayerClass === 8,
    "CurrentAffliction final declaration changed",
  );
  same(
    confirmation.declaration,
    evidence.confirmationDeclaration,
    "CurrentAffliction canonical declaration reference changed",
  );
  same(
    declaration.sourceCompletion,
    evidence.finalGearInspection,
    "CurrentAffliction final-gear inspection missing",
  );
  same(
    declaration.feedbackSourceCompletion,
    evidence.feedback,
    "CurrentAffliction closing feedback missing",
  );
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      declaration.sourceRelease === build.sourceRelease,
    "CurrentAffliction confirmation used another backend",
  );
  same(approval, build.approval, "CurrentAffliction exported approval changed");
  requireMatch(
    math.accepted && math.selectedIterations === 40000 && math.selectedDps === build.referenceDps,
    "CurrentAffliction exceeds its approved retained-contender margin",
  );
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "CurrentAffliction confirmation math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "CurrentAffliction original 1% assessment changed: " + key);
  requireMatch(
    math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted &&
      math.originalAssessment.strictRetainedDominancePassed ===
        build.scope.noStatisticallyBetterRetainedChallenger &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction,
    "CurrentAffliction retained-gap and strict-dominance disclosures were conflated",
  );
  const templates = new Map(
    entry.requestTemplates.map((row): readonly [string, string] => [row.arm, row.requestBase64]),
  );
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing/duplicate CurrentAffliction request frames",
  );
  function request(
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing CurrentAffliction request frame");
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
  for (const arm of plan.arms) {
    requireMatch(
      hash(request(arm, 10000, 77191)) === arm.inspected.id,
      "CurrentAffliction inspected native request changed",
    );
    const player = record.parse(arm.settings.player);
    for (const [value, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(value);
      for (const [name, setting] of Object.entries(required))
        same(actual[name], setting, "CurrentAffliction full-raid buff changed: " + name);
    }
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "CurrentAffliction holdout input changed",
  );
  same(
    plan.arms[0]?.settings,
    build.settings,
    "CurrentAffliction selected a replacement from holdouts",
  );
  const reservation = await reference(approval.reservation);
  requireMatch(
    reservation.identity === completion.identity &&
      reservation.planSha256 === hash(record.parse(declaration.confirmationPlan).originalPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "CurrentAffliction RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "CurrentAffliction reserved ranges changed");
  const receipt = await reference(evidence.numericalQualification);
  requireMatch(
    evidence.numericalQualification?.sha256 ===
      verifiedCurrentAfflictionNumericalDelivery.receiptSha256 &&
      receipt.schema === "kfc-current-full-raid-affliction-numerical-qualification-receipt.v1" &&
      receipt.sourceRole === "current-full-raid-affliction-practical-first-pass-confirmed" &&
      receipt.sourceRelease === build.sourceRelease &&
      receipt.selectedSettingsSha256 === hash(build.settings) &&
      receipt.referenceDps === math.selectedDps &&
      receipt.validationIterations === 40000 &&
      receipt.approvedMaximumRetainedGapFraction === 0.02 &&
      receipt.originalMaximumRetainedGapFraction === 0.01 &&
      receipt.largestConservativeRetainedGapFraction ===
        math.largestConservativeRetainedGapFraction &&
      receipt.originalOnePercentPassed === math.originalAssessment.accepted &&
      receipt.strictRetainedDominancePassed ===
        math.originalAssessment.strictRetainedDominancePassed &&
      receipt.finalGearConsumeApplicabilityInspected === true &&
      receipt.frontendDeliveryCompleted === false &&
      receipt.publicationAllowed === false,
    "CurrentAffliction numerical receipt changed or conflated retained margin with strict dominance",
  );
  for (const [field, expected] of [
    ["feedback", evidence.feedback],
    ["inspection", evidence.finalGearInspection],
    ["confirmation", evidence.confirmation],
    ["confirmationResult", evidence.confirmationResult],
    ["selectedParity", evidence.parity],
    ["backend", backend],
  ] as const)
    same(receipt[field], expected, "CurrentAffliction receipt evidence changed: " + field);
  const feedbackCompletion = await reference(evidence.feedback),
    inspectionCompletion = await reference(evidence.finalGearInspection),
    readiness = record.parse(plan.readiness);
  for (const value of [feedbackCompletion, inspectionCompletion])
    requireMatch(
      value.schema === "kfc-bounded-native-study-completion.v1" &&
        value.publicationAllowed === false,
      "CurrentAffliction source completion changed",
    );
  same(
    feedbackCompletion.result,
    evidence.feedbackResult,
    "CurrentAffliction archived feedback changed",
  );
  same(
    inspectionCompletion.result,
    evidence.finalGearInspectionResult,
    "CurrentAffliction archived inspection changed",
  );
  requireMatch(
    readiness.schema === "kfc-practical-first-pass-readiness.v1" &&
      readiness.sourceRole ===
        "current-full-raid-affliction-closed-gear-state-and-final-gear-consume-inspection" &&
      readiness.stateRecheckCompleted === true &&
      readiness.gearApplicabilityReviewed === true &&
      readiness.finalGearConsumeApplicabilityInspected === true,
    "CurrentAffliction inspection readiness changed",
  );
  for (const [field, expected] of [
    ["sourceCompletion", evidence.finalGearInspection],
    ["stateRecheckEvidence", evidence.feedbackResult],
    ["gearApplicabilityEvidence", evidence.feedbackResult],
    ["finalGearConsumeEvidence", evidence.finalGearInspectionResult],
  ] as const)
    same(readiness[field], expected, "CurrentAffliction readiness source changed: " + field);
  const summaryReference = afflictionModelEvidenceReferenceSchema.parse(evidence.feedbackSummary);
  requireMatch(
    summaryReference.sha256 === verifiedCurrentAfflictionNumericalDelivery.feedbackSummarySha256,
    "Unreviewed CurrentAffliction compact closure",
  );
  const closure = readCurrentAfflictionClosedFeedbackEvidence(await reference(summaryReference), {
    summaryReference,
    sourceCompletion: afflictionModelEvidenceReferenceSchema.parse(evidence.feedback),
    sourceResult: afflictionModelEvidenceReferenceSchema.parse(evidence.feedbackResult),
    sourceRelease: build.sourceRelease,
    backend: {
      kind: z.literal("admitted-native.v1").parse(backend.kind),
      binarySha256: digest.parse(backend.binarySha256),
      compiledDatabaseSha256: digest.parse(backend.compiledDatabaseSha256),
      runnerSourceSha256: digest.parse(backend.runnerSourceSha256),
      codecSha256: digest.parse(backend.codecSha256),
    },
    settingsSha256: hash(build.settings),
    stateSha256: hash(build.state),
    gearSha256: hash(record.parse(build.settings.player).equipment),
  });
  requireMatch(
    closure.cycles === build.scope.feedbackCycles,
    "CurrentAffliction closure cycles changed",
  );
  const parityRef = afflictionModelEvidenceReferenceSchema.parse(evidence.parity),
    parity = await reference(parityRef),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = metric.parse(passed.native),
    browser = metric.parse(passed.browser);
  requireMatch(
    parityRef.sha256 === verifiedCurrentAfflictionNumericalDelivery.paritySha256 &&
      parity.schema === "kfc-current-full-raid-affliction-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.schema === "kfc-current-full-raid-affliction-selected-native-wasm-parity.v1" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(native.dps - browser.dps) < 1e-8 &&
      Math.abs(native.stdev - browser.stdev) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "CurrentAffliction actual selected native/WASM parity missing",
  );
  same(descriptor.backend, backend, "CurrentAffliction selected parity backend changed");
  same(native, plan.arms[0]?.inspected, "CurrentAffliction selected parity origin changed");
  same(parity.errors, [], "CurrentAffliction selected browser contained errors");
  same(
    descriptor.sourceValidation,
    {
      completion: evidence.confirmation,
      result: evidence.confirmationResult,
      declaration: evidence.confirmationDeclaration,
    },
    "CurrentAffliction selected parity used another confirmation",
  );
  const prepared = record.parse(parity.prepared),
    selectedArm = plan.arms[0];
  requireMatch(selectedArm, "Missing selected CurrentAffliction arm");
  same(
    prepared.sourceInput,
    request(selectedArm, 10000, 77191),
    "CurrentAffliction selected original range changed",
  );
  const rawBrowser = await reference(parity.browser),
    resultBytes = z
      .array(z.number().int().min(0).max(255))
      .min(1)
      .max(32 * 1024 ** 2)
      .parse(rawBrowser.resultResponseBytes),
    budget = z
      .object({
        schema: z.literal("kfc-observed-target-aura-budget-evidence.v1"),
        requestId: digest,
        resultSha256: digest,
        iterations: z.literal(10000),
        bossDebuffLimit: z.literal(16),
        playerBuffLimit: z.null(),
        playerAuraRows: z.number().int().nonnegative(),
        observedConservativeBoundPassed: z.literal(true),
        targets: z
          .array(
            z
              .object({
                targetIndex: z.literal(0),
                name: z.string().min(1),
                activatedAuraRowUnionUpperBound: z.number().int().min(1).max(16),
                conservativeSixteenAuraBoundPassed: z.literal(true),
                activatedRows: z
                  .array(
                    z
                      .object({
                        index: z.number().int().nonnegative(),
                        id: record,
                        uptimeSecondsAvg: z.number().finite().nonnegative(),
                        procsAvg: z.number().finite().nonnegative(),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(16),
              })
              .strict(),
          )
          .length(1),
        observedOnly: z.literal(true),
        globalSixteenSlotEnforcementProven: z.literal(false),
        scope: z.string().min(1).max(4000),
      })
      .strict()
      .parse(passed.targetAuraBudget);
  requireMatch(
    createHash("sha256").update(Uint8Array.from(resultBytes)).digest("hex") ===
      budget.resultSha256 &&
      budget.resultSha256 === rawBrowser.resultSha256 &&
      budget.requestId === browser.id &&
      rawBrowser.id === browser.id &&
      rawBrowser.playerClass === 8 &&
      rawBrowser.activePlayers === 1 &&
      rawBrowser.error === "" &&
      rawBrowser.duration === 300 &&
      prepared.playerClass === 8 &&
      descriptor.sourceRequestId === native.id &&
      descriptor.browserRequestId === browser.id,
    "CurrentAffliction selected raw combat identity or target evidence changed",
  );
  same(rawBrowser.metric, browser, "CurrentAffliction raw selected metrics changed");
  for (const target of budget.targets)
    requireMatch(
      target.activatedAuraRowUnionUpperBound === target.activatedRows.length &&
        new Set(target.activatedRows.map((row): number => row.index)).size ===
          target.activatedRows.length &&
        target.activatedRows.every((row): boolean => row.uptimeSecondsAvg > 0 || row.procsAvg > 0),
      "CurrentAffliction target-aura rows were dropped or duplicated",
    );
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    actions = z.array(record).parse(rotation.priorityList),
    guide = build.rotationGuidance,
    playerOptions = record.parse(record.parse(player.warlock).options);
  requireMatch(
    player.class === "ClassWarlock" &&
      player.talentsString === "2550010013520105--0550205103" &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      (playerOptions.summon ?? "NoSummon") === "Succubus" &&
      (playerOptions.sacrifice ?? "NoSummon") === "NoSummon" &&
      playerOptions.weaponImbue === "Spellstone",
    "CurrentAffliction guide lost its exact measured active-Succubus setup",
  );
  same(playerOptions, build.state.options, "CurrentAffliction state options changed");
  const prepullActions = z.array(record).parse(rotation.prepullActions ?? []);
  same(prepullActions, [], "Unexpected CurrentAffliction prepull actions");
  guide.prepullBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(prepullActions[index]) &&
        row.text === guide.prepull[index],
      "CurrentAffliction prepull advice changed",
    ),
  );
  guide.priorityBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(actions[index]) &&
        row.text === guide.priorities[index],
      "CurrentAffliction rotation advice changed",
    ),
  );
  return build;
}
