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

export const dsRuinModelEntrySchema = afflictionModelEntrySchema.extend({
  id: z.literal("warlock-ds-ruin-static"),
});
export type DsRuinModelEntry = z.infer<typeof dsRuinModelEntrySchema>;

export const verifiedDsRuinNumericalDelivery = Object.freeze({
  sourceRelease: "e945e98f232cc81948ee9060",
  buildSha256: "899a30a93cd7e3ca36a319fd79fb934d35504ff2658727fe4edb62236ceb8e20",
  confirmationSha256: "a252ba57bfea5afe58731a992964b2e04352e497bf8ba804aba3dca1562be63e",
  settingsSha256: "a5b57bd6f71fb3a70e338b5ec94a0ec987ed23614c7db08d768261c265dd997b",
  paritySha256: "6048f4a5ccde63dc517c14bc5336a1feaa5e1337e2303a129b9bd5c3b45894de",
  databaseSha256: "cf9262e1e29cae2aff9655f5bbfa662eb11d339a119d6f406472b4ad0935dcfe",
  nativeBinarySha256: "de9f74ba61f5aca05066033b4b0e5e996d634eabb755d51a2174600b274f3a79",
});

const buildSchema = z
  .object({
    schema: z.literal("kfc-fresh-first-pass-build.v2"),
    id: z.literal("warlock-ds-ruin-static"),
    profile: z.literal("warlock"),
    variant: z.literal("ds_ruin"),
    name: z.literal("DS/Ruin · pre-raid tested"),
    sourceRelease: z.literal(verifiedDsRuinNumericalDelivery.sourceRelease),
    revision: z.string().min(1),
    modelPolicy: z.literal("ignore-item-bonuses"),
    dbSha256: z.literal(verifiedDsRuinNumericalDelivery.databaseSha256),
    nativeBinarySha256: z.literal(verifiedDsRuinNumericalDelivery.nativeBinarySha256),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    settings: record,
    state: record,
    approval: record,
    evidence: z.record(z.string(), afflictionModelEvidenceReferenceSchema),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-ds-ruin-rotation-guidance.v1"),
        rotationSha256: digest,
        talents: z.literal("22/11/18"),
        activeDemon: z.literal("NoSummon"),
        sacrificedDemon: z.literal("Imp"),
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
export type FreshDsRuinSimulatorBuild = z.infer<typeof buildSchema>;

export interface DsRuinModelBuildOptions extends AfflictionModelBuildOptions {
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
export async function readFreshDsRuinSimulatorBuild(
  rawEntry: DsRuinModelEntry,
  options: DsRuinModelBuildOptions,
): Promise<FreshDsRuinSimulatorBuild> {
  const entry = dsRuinModelEntrySchema.parse(rawEntry);
  requireMatch(
    options.reviewedBuildSha256 === verifiedDsRuinNumericalDelivery.buildSha256 &&
      entry.build.sha256 === verifiedDsRuinNumericalDelivery.buildSha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/warlock-ds-ruin-full-raid-v1/build-${entry.build.sha256.slice(0, 16)}.json`,
    "Unreviewed DS/Ruin export requires its own delivery review",
  );
  async function reference(raw: unknown): Promise<Record<string, unknown>> {
    const ref = afflictionModelEvidenceReferenceSchema.parse(raw),
      value = record.parse(await options.reference(ref));
    requireMatch(hash(value) === ref.sha256, "DS/Ruin evidence checksum changed: " + ref.path);
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
      hash(build.settings) === verifiedDsRuinNumericalDelivery.settingsSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      completion.identity === verifiedDsRuinNumericalDelivery.confirmationSha256,
    "DS/Ruin publication changed model, selected inputs or reference DPS",
  );
  same(completion.result, evidence.confirmationResult, "DS/Ruin final result reference changed");
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
      declaration.schema === "kfc-full-raid-ds-ruin-independent-confirmation-declaration.v1" &&
      declaration.expectedPlayerClass === 8,
    "DS/Ruin final declaration changed",
  );
  same(
    confirmation.declaration,
    evidence.confirmationDeclaration,
    "DS/Ruin canonical declaration reference changed",
  );
  same(
    declaration.sourceCompletion,
    evidence.finalGearInspection,
    "DS/Ruin final-gear inspection missing",
  );
  same(declaration.feedbackSourceCompletion, evidence.feedback, "DS/Ruin closing feedback missing");
  requireMatch(
    backend.binarySha256 === build.nativeBinarySha256 &&
      backend.compiledDatabaseSha256 === build.dbSha256 &&
      declaration.sourceRelease === build.sourceRelease,
    "DS/Ruin confirmation used another backend",
  );
  same(approval, build.approval, "DS/Ruin exported approval changed");
  requireMatch(
    math.accepted && math.selectedIterations === 40000 && math.selectedDps === build.referenceDps,
    "DS/Ruin exceeds its approved retained-contender margin",
  );
  for (const [key, value] of Object.entries(math))
    if (key !== "selectedArm" && key !== "originalAssessment")
      same(approval[key], value, "DS/Ruin confirmation math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "DS/Ruin original 1% assessment changed: " + key);
  requireMatch(
    math.originalAssessment.accepted === build.scope.originalStrictAssessmentAccepted &&
      math.originalAssessment.strictRetainedDominancePassed ===
        build.scope.noStatisticallyBetterRetainedChallenger &&
      math.largestConservativeRetainedGapFraction ===
        build.scope.largestConservativeRetainedGapFraction,
    "DS/Ruin retained-gap and strict-dominance disclosures were conflated",
  );
  const templates = new Map(
    entry.requestTemplates.map((row): readonly [string, string] => [row.arm, row.requestBase64]),
  );
  requireMatch(
    templates.size === plan.arms.length && templates.size === entry.requestTemplates.length,
    "Missing/duplicate DS/Ruin request frames",
  );
  function request(
    arm: (typeof plan.arms)[number],
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const player = record.parse(arm.settings.player),
      requestBase64 = templates.get(arm.name);
    requireMatch(requestBase64, "Missing DS/Ruin request frame");
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
      "DS/Ruin inspected native request changed",
    );
    const player = record.parse(arm.settings.player);
    for (const [value, required] of [
      [arm.settings.raidBuffs, fullRaidDefaults.raid],
      [arm.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      const actual = record.parse(value);
      for (const [name, setting] of Object.entries(required))
        same(actual[name], setting, "DS/Ruin full-raid buff changed: " + name);
    }
  }
  same(
    plan.requestIds,
    plan.seeds.flatMap((seed): string[] =>
      plan.arms.map((arm): string => hash(request(arm, 20000, seed))),
    ),
    "DS/Ruin holdout input changed",
  );
  same(plan.arms[0]?.settings, build.settings, "DS/Ruin selected a replacement from holdouts");
  const reservation = await reference(approval.reservation);
  requireMatch(
    reservation.identity === completion.identity &&
      reservation.planSha256 === hash(record.parse(declaration.confirmationPlan).originalPlan) &&
      reservation.iterations === 20000 &&
      reservation.reservedIterations === 100000,
    "DS/Ruin RNG reservation changed",
  );
  same(reservation.seeds, plan.seeds, "DS/Ruin reserved ranges changed");
  const audited = await reference(evidence.numericalQualification),
    assessment = record.parse(audited.assessment);
  requireMatch(
    audited.schema === "kfc-ds-ruin-audited-numerical-qualification.v2" &&
      assessment.approvedTwoPercentPassed === math.accepted &&
      assessment.originalOnePercentPassed === math.originalAssessment.accepted &&
      assessment.noStatisticallyBetterRetainedChallenger ===
        math.originalAssessment.strictRetainedDominancePassed &&
      audited.frontendDeliveryCompleted === false &&
      audited.publicationAllowed === false,
    "DS/Ruin audited assessment changed",
  );
  same(
    audited.confirmation,
    evidence.confirmation,
    "DS/Ruin audited receipt used another confirmation",
  );
  const parityRef = afflictionModelEvidenceReferenceSchema.parse(evidence.parity),
    parity = await reference(parityRef),
    descriptor = record.parse(parity.descriptor),
    passed = record.parse(parity.parity),
    native = metric.parse(passed.native),
    browser = metric.parse(passed.browser);
  requireMatch(
    parityRef.sha256 === verifiedDsRuinNumericalDelivery.paritySha256 &&
      parity.status === "passed-after-cleanup" &&
      passed.status === "passed" &&
      native.iterations === 10000 &&
      browser.iterations === 10000 &&
      Math.abs(native.dps - browser.dps) < 1e-8 &&
      Math.abs(native.stdev - browser.stdev) < 1e-8 &&
      descriptor.selectedSettingsSha256 === hash(build.settings),
    "DS/Ruin actual selected native/WASM parity missing",
  );
  same(descriptor.backend, backend, "DS/Ruin selected parity backend changed");
  same(native, plan.arms[0]?.inspected, "DS/Ruin selected parity origin changed");
  same(parity.errors, [], "DS/Ruin selected browser contained errors");
  const player = record.parse(build.settings.player),
    rotation = record.parse(player.rotation),
    actions = z.array(record).parse(rotation.priorityList),
    guide = build.rotationGuidance,
    playerOptions = record.parse(record.parse(player.warlock).options);
  requireMatch(
    player.class === "ClassWarlock" &&
      player.talentsString === "255000001351-0025003001-0550005003" &&
      player.distanceFromTarget === 20 &&
      player.inFrontOfTarget === false &&
      player.foreverTier1Bonuses === false &&
      player.enableItemSwap === false &&
      hash(rotation) === guide.rotationSha256 &&
      guide.priorityBindings.length === actions.length &&
      (playerOptions.summon ?? "NoSummon") === "NoSummon" &&
      playerOptions.sacrifice === "Imp" &&
      playerOptions.weaponImbue === "Spellstone",
    "DS/Ruin guide lost its exact measured pure-sacrifice setup",
  );
  same(playerOptions, build.state.options, "DS/Ruin state options changed");
  same(rotation.prepullActions ?? [], [], "DS/Ruin cannot retain an active-pet Soul Link prepull");
  guide.priorityBindings.forEach((row, index): void =>
    requireMatch(
      row.index === index &&
        row.actionSha256 === hash(actions[index]) &&
        row.text === guide.priorities[index],
      "DS/Ruin rotation advice changed",
    ),
  );
  return build;
}
