import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
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

export const destructionModelEntrySchema = afflictionModelEntrySchema.extend({
  id: z.literal("warlock-destruction-static"),
});
export type DestructionModelEntry = z.infer<typeof destructionModelEntrySchema>;

export const verifiedDestructionNumericalDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "91eee58450aea012fe9269fb5734d84b407ad1e5437e43e6b11d2eb11047f049",
  confirmationSha256: "40dd9b6d6297981fd3ddde2b36b59df6a6ca9c1b12b832ac1de4781bfed987d6",
  settingsSha256: "cfd588fca64df291a75f80739a45e52b9f72d2f96683dbb6d5af693cd25fc9b7",
  paritySha256: "0c5eeb5692685b30c648ed700bbd241c36ef38f9346fc3ca620fc61473035108",
  databaseSha256: "cf9262e1e29cae2aff9655f5bbfa662eb11d339a119d6f406472b4ad0935dcfe",
  nativeBinarySha256: "de9f74ba61f5aca05066033b4b0e5e996d634eabb755d51a2174600b274f3a79",
});

const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("warlock-destruction-static"),
    profile: z.literal("warlock"),
    variant: z.literal("destruction"),
    name: z.literal("Destruction · pre-raid tested"),
    sourceRelease: z.literal(verifiedDestructionNumericalDelivery.sourceRelease),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: z.literal(verifiedDestructionNumericalDelivery.databaseSha256),
    nativeBinarySha256: z.literal(verifiedDestructionNumericalDelivery.nativeBinarySha256),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    evidence: z.record(z.string(), afflictionModelEvidenceReferenceSchema),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-destruction-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.literal("0/23/28"),
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
        closingFeedbackCompleted: z.literal(true),
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
      })
      .passthrough(),
    requiresProvisionalEnchantOptIn: z.literal(false),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .passthrough();
export type FreshDestructionSimulatorBuild = z.infer<typeof buildSchema>;

export interface DestructionModelBuildOptions extends AfflictionModelBuildOptions {
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
export async function readFreshDestructionSimulatorBuild(
  rawEntry: DestructionModelEntry,
  options: DestructionModelBuildOptions,
): Promise<FreshDestructionSimulatorBuild> {
  const entry = destructionModelEntrySchema.parse(rawEntry);
  requireMatch(
    options.reviewedBuildSha256 === verifiedDestructionNumericalDelivery.buildSha256 &&
      entry.build.sha256 === verifiedDestructionNumericalDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/warlock-destruction-full-raid-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed Destruction export requires its own delivery review",
  );
  async function reference(raw: unknown): Promise<Record<string, unknown>> {
    const ref = afflictionModelEvidenceReferenceSchema.parse(raw),
      value = record.parse(await options.reference(ref));
    requireMatch(hash(value) === ref.sha256, "Destruction evidence checksum changed: " + ref.path);
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
      hash(build.settings) === verifiedDestructionNumericalDelivery.settingsSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      completion.identity === verifiedDestructionNumericalDelivery.confirmationSha256,
    "Destruction publication changed model, selected inputs or reference DPS",
  );
  same(
    completion.result,
    evidence.confirmationResult,
    "Destruction final result reference changed",
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
      declaration.schema === "kfc-full-raid-destruction-independent-confirmation-declaration.v1" &&
      declaration.expectedPlayerClass === 8,
    "Destruction final declaration changed",
  );
  same(
    confirmation.declaration,
    evidence.confirmationDeclaration,
    "Destruction canonical declaration reference changed",
  );
  same(
    declaration.sourceCompletion,
    evidence.finalGearInspection,
    "Destruction final-gear inspection missing",
  );
  same(
    declaration.feedbackSourceCompletion,
    evidence.feedback,
    "Destruction closing feedback missing",
  );
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      declaration.sourceRelease === build.sourceRelease,
    "Destruction confirmation used another backend",
  );
  same(approval, build.approval, "Destruction exported approval changed");
  requireMatch(
    math.accepted && math.selectedIterations === 40000 && math.selectedDps === build.referenceDps,
    "Destruction exceeds its approved retained-contender margin",
  );
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "Destruction confirmation math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "Destruction original 1% assessment changed: " + key);
  requireMatch(
    math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted &&
      math.originalAssessment.strictRetainedDominancePassed ===
        build.scope.noStatisticallyBetterRetainedChallenger &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction,
    "Destruction retained-gap and strict-dominance disclosures were conflated",
  );
  const templates = new Map(
    entry.requestTemplates.map((row): readonly [string, string] => [row.arm, row.requestBase64]),
  );
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing/duplicate Destruction request frames",
  );
  function request(
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing Destruction request frame");
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
      "Destruction inspected native request changed",
    );
    const player = record.parse(arm.settings.player);
    for (const [value, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(value);
      for (const [name, setting] of Object.entries(required))
        same(actual[name], setting, "Destruction full-raid buff changed: " + name);
    }
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "Destruction holdout input changed",
  );
  same(plan.arms[0]?.settings, build.settings, "Destruction selected a replacement from holdouts");
  const reservation = await reference(approval.reservation);
  requireMatch(
    reservation.identity === completion.identity &&
      reservation.planSha256 === hash(record.parse(declaration.confirmationPlan).originalPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "Destruction RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Destruction reserved ranges changed");
  const receipt = await reference(evidence.numericalQualification);
  requireMatch(
    receipt.schema === "kfc-destruction-numerical-qualification-receipt.v1" &&
      receipt.sourceRole === "full-raid-destruction-practical-first-pass-confirmed" &&
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
    "Destruction numerical receipt changed or conflated retained margin with strict dominance",
  );
  for (const [field, expected] of [
    ["feedback", evidence.feedback],
    ["inspection", evidence.finalGearInspection],
    ["confirmation", evidence.confirmation],
    ["confirmationResult", evidence.confirmationResult],
    ["selectedParity", evidence.parity],
    ["backend", backend],
  ] as const)
    same(receipt[field], expected, "Destruction receipt evidence changed: " + field);
  const parityRef = afflictionModelEvidenceReferenceSchema.parse(evidence.parity),
    parity = await reference(parityRef),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = metric.parse(passed.native),
    browser = metric.parse(passed.browser);
  requireMatch(
    parityRef.sha256 === verifiedDestructionNumericalDelivery.paritySha256 &&
      parity.schema === "kfc-destruction-selected-parity-review.v1" &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(native.dps - browser.dps) < 1e-8 &&
      Math.abs(native.stdev - browser.stdev) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "Destruction actual selected native/WASM parity missing",
  );
  same(descriptor.backend, backend, "Destruction selected parity backend changed");
  same(native, plan.arms[0]?.inspected, "Destruction selected parity origin changed");
  same(parity.errors, [], "Destruction selected browser contained errors");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    actions = z.array(record).parse(rotation.priorityList),
    guide = build.rotationGuidance,
    playerOptions = record.parse(record.parse(player.warlock).options);
  requireMatch(
    player.class === "ClassWarlock" &&
      player.talentsString === "-03050032200203003-005025510310033" &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      (playerOptions.summon ?? "NoSummon") === "Succubus" &&
      (playerOptions.sacrifice ?? "NoSummon") === "NoSummon" &&
      playerOptions.weaponImbue === "Spellstone",
    "Destruction guide lost its exact measured active-Succubus setup",
  );
  same(playerOptions, build.state.options, "Destruction state options changed");
  same(rotation.prepullActions ?? [], [], "Unexpected Destruction prepull actions");
  guide.priorityBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(actions[index]) &&
        row.text === guide.priorities[index],
      "Destruction rotation advice changed",
    ),
  );
  return build;
}
