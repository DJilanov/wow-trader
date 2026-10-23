import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { readDemonologyClosedFeedbackEvidence } from "./forever-simulator-demonology-feedback-evidence";
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

export const fullRaidDemonologyModelEntrySchema = afflictionModelEntrySchema.extend({
  id: z.literal("warlock-demonology-static"),
});
export type FullRaidDemonologyModelEntry = z.infer<typeof fullRaidDemonologyModelEntrySchema>;

export const verifiedFullRaidDemonologyNumericalDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "777581de5b4e258e9693ab97792cf076d4b172faac9a3713613897256247d48b",
  confirmationStudyIdentity: "3e25b816f168a6d498f594d159490f8fefe6aaee504741030e3e7fce31f32183",
  settingsSha256: "e5c5443378f039b80dea78e961362274a127ea8930de1ea3a757e90849b6a870",
  paritySha256: "ce07d21785f1a134d1e2a7970921e19bc5923a784492ad414be4928a402b2cd4",
  databaseSha256: "cf9262e1e29cae2aff9655f5bbfa662eb11d339a119d6f406472b4ad0935dcfe",
  nativeBinarySha256: "de9f74ba61f5aca05066033b4b0e5e996d634eabb755d51a2174600b274f3a79",
  receiptSha256: "dbbef4a44f09ef61d2cedab92d425258197bfcac15cdcda2c3db0ea46e9ce082",
  feedbackSummarySha256: "281b835d12ae25a5d6a972a9efcae19a07b98f71428a63652f7aa7a4b0d0d52a",
});

const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("warlock-demonology-static"),
    profile: z.literal("warlock"),
    variant: z.literal("demonology"),
    name: z.literal("Demonology · pre-raid tested"),
    sourceRelease: z.literal(verifiedFullRaidDemonologyNumericalDelivery.sourceRelease),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: z.literal(verifiedFullRaidDemonologyNumericalDelivery.databaseSha256),
    nativeBinarySha256: z.literal(verifiedFullRaidDemonologyNumericalDelivery.nativeBinarySha256),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    evidence: z.record(z.string(), afflictionModelEvidenceReferenceSchema),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-demonology-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.literal("2/31/18"),
        activeDemon: z.literal("Succubus"),
        sacrificedDemon: z.literal("Imp"),
        weaponStone: z.literal("Spellstone"),
        scenario: z.string().min(1),
        instruction: z.string().min(1),
        priorities: z.array(z.string().min(1)).min(1),
        priorityBindings: z.array(binding).min(1),
        prepull: z.array(z.string()).length(1),
        prepullBindings: z.array(binding).length(1),
        caveats: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    scope: z
      .object({
        sourceRole: z.literal("full-raid-demonology-practical-first-pass-confirmed"),
        primaryArchetype: z.literal("active-demon-21plus-demonology"),
        activeDemonsAndLegalPactPairsCompete: z.literal(true),
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
export type FreshFullRaidDemonologySimulatorBuild = z.infer<typeof buildSchema>;

export interface FullRaidDemonologyModelBuildOptions extends AfflictionModelBuildOptions {
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
export async function readFreshFullRaidDemonologySimulatorBuild(
  rawEntry: FullRaidDemonologyModelEntry,
  options: FullRaidDemonologyModelBuildOptions,
): Promise<FreshFullRaidDemonologySimulatorBuild> {
  const entry = fullRaidDemonologyModelEntrySchema.parse(rawEntry);
  requireMatch(
    options.reviewedBuildSha256 === verifiedFullRaidDemonologyNumericalDelivery.buildSha256 &&
      entry.build.sha256 === verifiedFullRaidDemonologyNumericalDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/warlock-demonology-full-raid-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed Demonology export requires its own delivery review",
  );
  async function reference(raw: unknown): Promise<Record<string, unknown>> {
    const ref = afflictionModelEvidenceReferenceSchema.parse(raw),
      value = record.parse(await options.reference(ref));
    requireMatch(hash(value) === ref.sha256, "Demonology evidence checksum changed: " + ref.path);
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
      hash(build.settings) === verifiedFullRaidDemonologyNumericalDelivery.settingsSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      completion.identity === verifiedFullRaidDemonologyNumericalDelivery.confirmationStudyIdentity,
    "Demonology publication changed model, selected inputs or reference DPS",
  );
  same(completion.result, evidence.confirmationResult, "Demonology final result reference changed");
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
      declaration.schema === "kfc-full-raid-demonology-independent-confirmation-declaration.v1" &&
      declaration.expectedPlayerClass === 8,
    "Demonology final declaration changed",
  );
  same(
    confirmation.declaration,
    evidence.confirmationDeclaration,
    "Demonology canonical declaration reference changed",
  );
  same(
    declaration.sourceCompletion,
    evidence.finalGearInspection,
    "Demonology final-gear inspection missing",
  );
  same(
    declaration.feedbackSourceCompletion,
    evidence.feedback,
    "Demonology closing feedback missing",
  );
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      declaration.sourceRelease === build.sourceRelease,
    "Demonology confirmation used another backend",
  );
  same(approval, build.approval, "Demonology exported approval changed");
  requireMatch(
    math.accepted && math.selectedIterations === 40000 && math.selectedDps === build.referenceDps,
    "Demonology exceeds its approved retained-contender margin",
  );
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Demonology confirmation math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Demonology original 1% assessment changed: " + key);
  requireMatch(
    math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted &&
      math.originalAssessment.strictRetainedDominancePassed ===
        build.scope.noStatisticallyBetterRetainedChallenger &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction,
    "Demonology retained-gap and strict-dominance disclosures were conflated",
  );
  const templates = new Map(
    entry.requestTemplates.map((row): readonly [string, string] => [row.arm, row.requestBase64]),
  );
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing/duplicate Demonology request frames",
  );
  function request(
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing Demonology request frame");
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
      "Demonology inspected native request changed",
    );
    const player = record.parse(arm.settings.player);
    for (const [value, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(value);
      for (const [name, setting] of Object.entries(required))
        same(actual[name], setting, "Demonology full-raid buff changed: " + name);
    }
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Demonology holdout input changed",
  );
  same(plan.arms[0]?.settings, build.settings, "Demonology selected a replacement from holdouts");
  const reservation = await reference(approval.reservation);
  requireMatch(
    reservation.identity === completion.identity &&
      reservation.planSha256 === hash(record.parse(declaration.confirmationPlan).originalPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Demonology RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Demonology reserved ranges changed");
  const receipt = await reference(evidence.numericalQualification);
  requireMatch(
    evidence.numericalQualification?.sha256 ===
      verifiedFullRaidDemonologyNumericalDelivery.receiptSha256 &&
      receipt.schema === "kfc-full-raid-demonology-numerical-qualification-receipt.v1" &&
      receipt.sourceRole === "full-raid-demonology-practical-first-pass-confirmed" &&
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
    "Demonology numerical receipt changed or conflated retained margin with strict dominance",
  );
  for (const [field, expected] of [
    ["feedback", evidence.feedback],
    ["inspection", evidence.finalGearInspection],
    ["confirmation", evidence.confirmation],
    ["confirmationResult", evidence.confirmationResult],
    ["selectedParity", evidence.parity],
    ["backend", backend],
  ] as const)
    same(receipt[field], expected, "Demonology receipt evidence changed: " + field);
  const feedbackCompletion = await reference(evidence.feedback),
    inspectionCompletion = await reference(evidence.finalGearInspection),
    readiness = record.parse(plan.readiness);
  for (const value of [feedbackCompletion, inspectionCompletion])
    requireMatch(
      value.schema === "kfc-bounded-native-study-completion.v1" &&
        value.publicationAllowed === false,
      "Demonology source completion changed",
    );
  same(feedbackCompletion.result, evidence.feedbackResult, "Demonology archived feedback changed");
  same(
    inspectionCompletion.result,
    evidence.finalGearInspectionResult,
    "Demonology archived inspection changed",
  );
  requireMatch(
    readiness.schema === "kfc-practical-first-pass-readiness.v1" &&
      readiness.sourceRole ===
        "full-raid-demonology-closed-gear-state-and-final-gear-consume-inspection" &&
      readiness.stateRecheckCompleted === true &&
      readiness.gearApplicabilityReviewed === true &&
      readiness.finalGearConsumeApplicabilityInspected === true,
    "Demonology inspection readiness changed",
  );
  for (const [field, expected] of [
    ["sourceCompletion", evidence.finalGearInspection],
    ["stateRecheckEvidence", evidence.feedbackResult],
    ["gearApplicabilityEvidence", evidence.feedbackResult],
    ["finalGearConsumeEvidence", evidence.finalGearInspectionResult],
  ] as const)
    same(readiness[field], expected, "Demonology readiness source changed: " + field);
  const summaryReference = afflictionModelEvidenceReferenceSchema.parse(evidence.feedbackSummary);
  requireMatch(
    summaryReference.sha256 === verifiedFullRaidDemonologyNumericalDelivery.feedbackSummarySha256,
    "Unreviewed Demonology compact closure",
  );
  const closure = readDemonologyClosedFeedbackEvidence(await reference(summaryReference), {
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
  requireMatch(closure.cycles === build.scope.feedbackCycles, "Demonology closure cycles changed");
  const parityRef = afflictionModelEvidenceReferenceSchema.parse(evidence.parity),
    parity = await reference(parityRef),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = metric.parse(passed.native),
    browser = metric.parse(passed.browser);
  requireMatch(
    parityRef.sha256 === verifiedFullRaidDemonologyNumericalDelivery.paritySha256 &&
      parity.schema === "kfc-full-raid-demonology-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.schema === "kfc-full-raid-demonology-selected-native-wasm-parity.v1" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(native.dps - browser.dps) < 1e-8 &&
      Math.abs(native.stdev - browser.stdev) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Demonology actual selected native/WASM parity missing",
  );
  same(descriptor.backend, backend, "Demonology selected parity backend changed");
  same(native, plan.arms[0]?.inspected, "Demonology selected parity origin changed");
  same(parity.errors, [], "Demonology selected browser contained errors");
  same(
    descriptor.sourceValidation,
    {
      completion: evidence.confirmation,
      result: evidence.confirmationResult,
      declaration: evidence.confirmationDeclaration,
    },
    "Demonology selected parity used another confirmation",
  );
  const prepared = record.parse(parity.prepared),
    selectedArm = plan.arms[0];
  requireMatch(selectedArm, "Missing selected Demonology arm");
  same(
    prepared.sourceInput,
    request(selectedArm, 10000, 77191),
    "Demonology selected original range changed",
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
    "Demonology selected raw combat identity or target evidence changed",
  );
  same(rawBrowser.metric, browser, "Demonology raw selected metrics changed");
  for (const target of budget.targets)
    requireMatch(
      target.activatedAuraRowUnionUpperBound === target.activatedRows.length &&
        new Set(target.activatedRows.map((row): number => row.index)).size ===
          target.activatedRows.length &&
        target.activatedRows.every((row): boolean => row.uptimeSecondsAvg > 0 || row.procsAvg > 0),
      "Demonology target-aura rows were dropped or duplicated",
    );
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    actions = z.array(record).parse(rotation.priorityList),
    guide = build.rotationGuidance,
    playerOptions = record.parse(record.parse(player.warlock).options);
  requireMatch(
    player.class === "ClassWarlock" &&
      player.talentsString === "011-0005003231120311351-0550005003" &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      (playerOptions.summon ?? "NoSummon") === "Succubus" &&
      (playerOptions.sacrifice ?? "NoSummon") === "Imp" &&
      playerOptions.weaponImbue === "Spellstone",
    "Demonology guide lost its exact measured active-Succubus setup",
  );
  same(playerOptions, build.state.options, "Demonology state options changed");
  const prepullActions = z.array(record).parse(rotation.prepullActions);
  same(
    prepullActions,
    [
      {
        action: { castSpell: { spellId: { spellId: 19028 } } },
        doAtValue: { const: { val: "-1s" } },
      },
    ],
    "Unexpected Demonology prepull actions",
  );
  guide.prepullBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(prepullActions[index]) &&
        row.text === guide.prepull[index],
      "Demonology prepull advice changed",
    ),
  );
  guide.priorityBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(actions[index]) &&
        row.text === guide.priorities[index],
      "Demonology rotation advice changed",
    ),
  );
  return build;
}
