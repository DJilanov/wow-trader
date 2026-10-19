import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { BoundedDeliveryOptions } from "./forever-simulator-bounded-reviews";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict();
const record = z.record(z.string(), z.unknown());
const metric = z.object({
  id: digest,
  dps: z.number().finite().positive(),
  stdev: z.number().finite().nonnegative(),
  iterations: z.literal(100000),
});
const inspectedMetric = metric.extend({ iterations: z.literal(10000) });
const backend = z
  .object({
    kind: z.literal("admitted-native.v1"),
    binarySha256: digest,
    compiledDatabaseSha256: digest,
    runnerSourceSha256: digest,
    codecSha256: digest,
  })
  .strict();
const poisons = z
  .object({
    mainHandPoison: z.enum(["NoPoison", "InstantPoison", "DeadlyPoison", "WoundPoison"]),
    offHandPoison: z.enum(["NoPoison", "InstantPoison", "DeadlyPoison", "WoundPoison"]),
  })
  .strict();
const equipment = z.object({
  items: z
    .array(
      z
        .object({
          id: z.number().int().positive(),
          enchant: z.number().int().nonnegative().optional(),
        })
        .strict(),
    )
    .length(17),
});
const player = z.object({
  class: z.literal("ClassRogue"),
  level: z.literal(60),
  equipment,
  talentsString: z.string().min(1),
  rotation: record,
  rogue: z.object({ options: poisons }),
  foreverTier1Bonuses: z.literal(false),
  enableItemSwap: z.literal(false),
});
const core = z
  .object({
    family: z.enum(["venom-0", "venom-1"]),
    wantedVenom: z.union([z.literal(0), z.literal(1)]),
    source: reference,
    settingsSha256: digest,
  })
  .strict();
const state = z.object({ talentsString: z.string(), rotationOptions: record, poisons });
const resultSchema = z.object({
  schema: z.literal("kfc-bounded-native-study-result.v1"),
  identity: digest,
  declaration: reference,
  semantic: z.object({ evaluation: record }),
  publicationAllowed: z.literal(false),
});
const armSchema = z.object({
  name: z.string().min(1),
  coreFamily: z.enum(["venom-0", "venom-1"]),
  wantedVenom: z.union([z.literal(0), z.literal(1)]),
  source: reference,
  settings: record,
  state,
  inspected: inspectedMetric,
});
const planSchema = z.object({
  schema: z.literal("kfc-rogue-mutilate-frozen-validation-experiment.v1"),
  backend,
  arms: z.array(armSchema).min(2).max(12),
  iterations: z.literal(100000),
  seeds: z.array(z.number().int().positive().safe()).length(2),
  inspectedSeedRanges: z
    .array(
      z.object({
        seed: z.number().int().positive().safe(),
        iterations: z.number().int().positive().safe(),
      }),
    )
    .min(3),
  requestIds: z.array(digest).min(4).max(24),
  validationSeedContext: digest,
  validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
  publicationAllowed: z.literal(false),
});
const declarationSchema = z.object({
  schema: z.literal("kfc-rogue-mutilate-frozen-validation-declaration.v1"),
  expectedPlayerClass: z.literal(6),
  variant: z.literal("mutilate"),
  sourceRole: z.literal("mutilate-closed-venom-families"),
  backend,
  plan: record,
  coreSources: z.array(core).length(2),
  reservationPolicy: z.literal("kfc-rogue-mutilate-validation-reservation.v1"),
});
const validationSchema = z.object({
  schema: z.literal("kfc-rogue-mutilate-independent-validation.v1"),
  status: z.enum([
    "challenger-confirmed-needs-new-feedback",
    "validated-with-near-ties",
    "validated",
  ]),
  passed: z.boolean(),
  selected: record,
  selectedFamily: z.enum(["venom-0", "venom-1"]),
  selectedDps: z.number().finite().positive(),
  selectedIterations: z.literal(200000),
  comparisons: z.array(record).min(1).max(11),
  records: z
    .array(z.object({ seed: z.number().int().positive().safe(), arm: z.string(), metric }))
    .min(4)
    .max(24),
  coreSources: z.array(core).length(2),
  retainedVenomComparisonComplete: z.literal(true),
  independentFinalValidation: z.literal(true),
  publicationAllowed: z.literal(false),
});
const gapSchema = z
  .object({
    arm: z.string(),
    confirmedBetter: z.boolean(),
    averageDpsDifference: z.number().finite(),
    relativeMeanGain: z.number().finite(),
    conservativeGapFraction: z.number().finite().nonnegative(),
  })
  .strict();
const assessmentSchema = z
  .object({
    schema: z.literal("kfc-rogue-mutilate-practical-first-pass.v1"),
    status: z.literal("accepted-with-disclosed-nearby-gains"),
    profile: z.literal("rogue"),
    variant: z.literal("mutilate"),
    selectedArm: z.string(),
    selectedSettingsSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(200000),
    strictValidationPassed: z.boolean(),
    strictValidationStatus: z.string(),
    maximumRetainedGapFraction: z.literal(0.01),
    largestConservativeRetainedGapFraction: z.number().finite().nonnegative().max(0.01),
    retainedGaps: z.array(gapSchema).min(1).max(11),
    selectionChanged: z.literal(false),
    globalOptimalityProven: z.literal(false),
    deeperOptimizationDeferred: z.literal(true),
    publicationAllowed: z.literal(false),
    scope: z.string().min(1),
  })
  .strict();
const buildSchema = z.object({
  schema: z.literal("kfc-rogue-mutilate-first-pass-build.v1"),
  status: z.literal("scenario-reviewed-local-export"),
  profile: z.literal("rogue"),
  variant: z.literal("mutilate"),
  style: z.literal("mutilate"),
  name: z.literal("Mutilate · first-pass tested"),
  sourceRelease: z.string(),
  revision: z.string(),
  dbSha256: digest,
  nativeBinarySha256: digest,
  faction: z.enum(["Alliance", "Horde"]),
  referenceDps: z.number().finite().positive(),
  validationIterations: z.literal(200000),
  settings: record,
  enchantPolicy: z.object({ provisionalEffectIds: z.array(z.number()).length(0) }),
  requiresProvisionalEnchantOptIn: z.literal(false),
  evidence: z.object({
    cores: z.array(core).length(2),
    validation: reference,
    validationDeclaration: reference,
    firstPass: reference,
    parity: reference,
  }),
  scope: z.object({
    name: z.literal("bounded-mutilate-practical-first-pass.v1"),
    gearStable: z.literal(true),
    talentRotationPoisonStable: z.literal(true),
    retainedVenomComparisonComplete: z.literal(true),
    independentIncumbentMeasurement: z.literal(true),
    strictOptimalityCheckPassed: z.boolean(),
    maximumRetainedGapFraction: z.literal(0.01),
    globalOptimalityProven: z.literal(false),
    exhaustiveRotationGridRequired: z.literal(false),
    deeperOptimizationDeferred: z.literal(true),
  }),
  rotationGuidance: z.object({
    schema: z.literal("kfc-rogue-mutilate-rotation-guidance.v1"),
    rotationSha256: digest,
    talents: z.literal("30/21/0"),
    poisons,
    scenario: z.string().min(1),
    priorities: z.array(z.string().min(1)).length(5),
    caveats: z.array(z.string().min(1)).min(1),
  }),
  warnings: z.array(z.string().min(1)).min(1).max(20),
  publicPromotion: z.literal(false),
  browserHandoffRequired: z.literal(true),
});
const shareSchema = z.object({
  schema: z.literal("kfc-local-rogue-mutilate-first-pass-share.v1"),
  status: z.literal("reviewed-local"),
  campaignIdentity: digest,
  caseId: z.literal("rogue-mutilate-static"),
  profile: z.literal("rogue"),
  variant: z.literal("mutilate"),
  sourceRelease: z.string(),
  build: reference,
  requiresProvisionalEnchantOptIn: z.literal(false),
  link: z.string().min(100).max(512000),
  combatSettingsSha256: digest,
  settingsNormalization: z.object({
    schema: z.literal("kfc-level60-protobuf-combat-settings.v1"),
    codecSha256: digest,
    scope: z.string().min(1),
  }),
  checked: z.object({
    exactSelectedSetup: z.literal(true),
    actualRogueClass: z.literal(true),
    all17SlotsAndEnchants: z.literal(true),
    talentsRotationAndPoisons: z.literal(true),
    nativeWasmParity: z.literal(true),
    fullExportImportAndReload: z.literal(true),
    procConsentOffAfterImportAndReload: z.literal(true),
    previousDeliveriesUnchanged: z.literal(true),
    historicalCampaignUnchanged: z.literal(true),
    presentationUnchanged: z.literal(true),
  }),
  warnings: z.array(z.string()).max(20),
  errors: z.array(z.string()).length(0),
  nativeJobs: z.literal(0),
  browserCombatJobs: z.literal(0),
  publicPromotion: z.literal(false),
});
const closureSchema = z.object({
  schema: z.enum([
    "kfc-rogue-mutilate-core-applicability.v1",
    "kfc-rogue-mutilate-retained-venom-selected-gear-applicability.v1",
  ]),
  variant: z.literal("mutilate"),
  closed: z.literal(true),
  settings: record,
  state,
  inspectedMetric,
  gearStable: z.literal(true),
  feedbackStable: z.literal(true),
  gearCoverage: z.object({
    candidateIdsBySlot: z.array(z.array(z.number().int().positive()).min(1)).length(17),
    groups: z
      .array(z.object({ name: z.string(), proposals: z.number().int().positive() }))
      .length(27),
    finalistAudit: z
      .array(
        z.object({
          candidateId: digest,
          requestId: digest,
          gain: z.number().finite(),
          threshold: z.number().finite().nonnegative(),
        }),
      )
      .min(1)
      .max(33),
  }),
  feedbackCoverage: z.object({
    finalistAudit: z
      .array(
        z.object({
          candidateId: digest,
          requestId: digest,
          gain: z.number().finite(),
          threshold: z.number().finite().nonnegative(),
        }),
      )
      .min(1)
      .max(13),
  }),
  independentFinalValidation: z.literal(false),
  publicationAllowed: z.literal(false),
});
const admission = z.object({
  id: digest,
  error: z.literal(""),
  parties: z.literal(1),
  slots: z.literal(5),
  activePlayers: z.literal(1),
  priority: z.number().int().nonnegative(),
  prepull: z.number().int().nonnegative(),
  warnings: z.array(z.unknown()).length(0),
});
const inputSchema = z
  .object({
    requestBase64: z.string().min(1),
    gear: equipment.shape.items,
    talentsString: z.string(),
    rotation: record,
    iterations: z.literal(10000),
    seed: z.literal(77191),
    detail: z.literal(false),
  })
  .strict();

type DeliveryOptions = Pick<
  BoundedDeliveryOptions,
  "campaignIdentity" | "sourceRelease" | "revision" | "read" | "reference" | "databaseSha256"
>;
export interface MutilateReviewReference {
  readonly path: string;
  readonly sha256: string;
}
export interface MutilateFirstPassSimulatorDelivery {
  readonly review: LocalSimulatorBuildReview;
  readonly build: z.infer<typeof buildSchema>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(actual, expected), message);
}

export async function readMutilateFirstPassSimulatorDelivery(
  shareReference: MutilateReviewReference,
  options: DeliveryOptions,
): Promise<MutilateFirstPassSimulatorDelivery> {
  async function evidence(ref: MutilateReviewReference): Promise<unknown> {
    const value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Mutilate evidence checksum mismatch");
    return value;
  }
  const share = shareSchema.parse(await evidence(shareReference));
  requireMatch(
    share.campaignIdentity === options.campaignIdentity &&
      share.sourceRelease === options.sourceRelease,
    "Stale Mutilate share",
  );
  const build = buildSchema.parse(await evidence(share.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === (await options.databaseSha256()),
    "Stale Mutilate model",
  );
  const selectedPlayer = player.parse(build.settings.player);
  same(share.warnings, build.warnings, "Mutilate share warnings changed");
  requireMatch(
    build.rotationGuidance.rotationSha256 === hash(selectedPlayer.rotation),
    "Mutilate rotation guidance changed",
  );
  same(
    build.rotationGuidance.poisons,
    selectedPlayer.rogue.options,
    "Mutilate poison guidance changed",
  );
  const savedValidation = resultSchema.parse(await evidence(build.evidence.validation));
  same(
    savedValidation.declaration,
    build.evidence.validationDeclaration,
    "Mutilate validation declaration changed",
  );
  const declarationValue = await evidence(build.evidence.validationDeclaration),
    declaration = declarationSchema.parse(declarationValue);
  requireMatch(
    hash(declarationValue) === savedValidation.identity,
    "Mutilate validation identity changed",
  );
  requireMatch(
    declaration.backend.binarySha256 === build.nativeBinarySha256 &&
      declaration.backend.compiledDatabaseSha256 === build.dbSha256,
    "Mutilate backend changed",
  );
  same(declaration.coreSources, build.evidence.cores, "Mutilate core references changed");
  same(
    declaration.coreSources.map((source) => source.family).sort(),
    ["venom-0", "venom-1"],
    "Both Mutilate families required",
  );
  const plan = planSchema.parse(declaration.plan),
    validation = validationSchema.parse(savedValidation.semantic.evaluation);
  same(plan.backend, declaration.backend, "Mutilate frozen backend changed");
  same(validation.coreSources, declaration.coreSources, "Mutilate validated cores changed");
  const {
    validationSeedPolicy: _policy,
    validationSeedContext: _context,
    seeds: _seeds,
    requestIds: _ids,
    publicationAllowed: _publication,
    ...experiment
  } = declaration.plan;
  requireMatch(
    hash(experiment) === plan.validationSeedContext,
    "Mutilate frozen experiment changed",
  );
  requireMatch(
    plan.arms.length * 2 === validation.records.length &&
      plan.requestIds.length === validation.records.length &&
      new Set(plan.requestIds).size === plan.requestIds.length,
    "Incomplete Mutilate final records",
  );
  for (const [index, row] of validation.records.entries()) {
    requireMatch(
      row.metric.id === plan.requestIds[index] &&
        row.arm === plan.arms[index % plan.arms.length]!.name &&
        row.seed === plan.seeds[Math.floor(index / plan.arms.length)],
      "Mutilate final request provenance changed",
    );
  }
  const heldOut = plan.seeds.map((seed) => ({ seed, iterations: 100000 }));
  for (const [index, range] of heldOut.entries())
    for (const previous of [...plan.inspectedSeedRanges, ...heldOut.slice(0, index)])
      requireMatch(
        range.seed + range.iterations <= previous.seed ||
          previous.seed + previous.iterations <= range.seed,
        "Mutilate confirmation RNG overlaps inspected work",
      );
  const selected = plan.arms[0]!;
  requireMatch(
    selected.name === validation.selectedFamily + ":selected",
    "Mutilate selected family changed",
  );
  same(validation.selected, selected.settings, "Mutilate holdout silently selected a challenger");
  same(build.settings, selected.settings, "Mutilate exported setup changed");
  const closures = new Map<string, z.infer<typeof closureSchema>>();
  for (const source of declaration.coreSources) {
    requireMatch(source.family === "venom-" + source.wantedVenom, "Mutilate core family changed");
    const primary = source.wantedVenom === 0,
      value = record.parse(await evidence(source.source));
    requireMatch(
      value.schema ===
        (primary ? "kfc-rogue-mutilate-core-review.v1" : "kfc-bounded-native-study-result.v1"),
      "Mutilate core source role changed",
    );
    const gearSource = primary
      ? resultSchema.parse(
          await evidence(z.object({ result: reference }).parse(value.gearSource).result),
        )
      : resultSchema.parse(value);
    const gearDeclarationValue = await evidence(gearSource.declaration);
    const gearDeclaration = z.object({ schema: z.string(), backend }).parse(gearDeclarationValue);
    requireMatch(
      gearDeclaration.schema ===
        (primary
          ? "kfc-rogue-mutilate-feedback-gear-refinement-declaration.v1"
          : "kfc-rogue-mutilate-retained-venom-selected-gear-declaration.v1") &&
        hash(gearDeclarationValue) === gearSource.identity,
      "Mutilate source gear declaration changed",
    );
    same(gearDeclaration.backend, declaration.backend, "Mutilate source backend changed");
    const closureValue = primary
      ? value.assessment
      : record.parse(record.parse(value.semantic).evaluation).coreApplicability;
    const closure = closureSchema.parse(closureValue),
      corePlayer = player.parse(closure.settings.player);
    requireMatch(
      closure.schema ===
        (primary
          ? "kfc-rogue-mutilate-core-applicability.v1"
          : "kfc-rogue-mutilate-retained-venom-selected-gear-applicability.v1") &&
        hash(closure.settings) === source.settingsSha256,
      "Mutilate core applicability changed",
    );
    requireMatch(
      closure.state.rotationOptions.builder === "mutilate" &&
        closure.state.talentsString === corePlayer.talentsString,
      "Mutilate core talent/rotation family changed",
    );
    same(closure.state.poisons, corePlayer.rogue.options, "Mutilate core poison context changed");
    for (const [slot, ids] of closure.gearCoverage.candidateIdsBySlot.entries())
      requireMatch(
        ids.includes(corePlayer.equipment.items[slot]!.id),
        "Mutilate selected slot was not searched",
      );
    for (const row of [
      ...closure.gearCoverage.finalistAudit,
      ...closure.feedbackCoverage.finalistAudit,
    ])
      requireMatch(row.gain <= row.threshold, "Mutilate core has a missed qualifying finalist");
    closures.set(source.family, closure);
  }
  const selectedClosure = closures.get(selected.coreFamily);
  requireMatch(selectedClosure !== undefined, "Missing selected Mutilate closure");
  same(selectedClosure.settings, build.settings, "Mutilate selected core context changed");
  same(selectedClosure.inspectedMetric, selected.inspected, "Mutilate inspected scalar changed");
  const comparisons = plan.arms.slice(1).map((arm, index) => {
    const ranges = plan.seeds.map((seed, range) => {
      const baseline = validation.records[range * plan.arms.length]!.metric,
        candidate = validation.records[range * plan.arms.length + index + 1]!.metric;
      return {
        seed,
        baseline: { dps: baseline.dps, stdev: baseline.stdev, iterations: baseline.iterations },
        candidate: { dps: candidate.dps, stdev: candidate.stdev, iterations: candidate.iterations },
        difference: candidate.dps - baseline.dps,
        threshold: Math.max(
          0.001,
          3 * Math.sqrt(baseline.stdev ** 2 / 100000 + candidate.stdev ** 2 / 100000),
        ),
      };
    });
    const challengerConfirmedBetter = ranges.every((range) => range.difference > range.threshold),
      selectedConfirmedBetter = ranges.every((range) => -range.difference > range.threshold);
    return {
      arm: arm.name,
      challengerConfirmedBetter,
      selectedConfirmedBetter,
      uncertain: !challengerConfirmedBetter && !selectedConfirmedBetter,
      averageChallengerDpsDifference: ranges.reduce((sum, range) => sum + range.difference, 0) / 2,
      comparisons: ranges,
    };
  });
  same(validation.comparisons, comparisons, "Mutilate strict comparisons changed");
  const defeated = comparisons.some((row) => row.challengerConfirmedBetter);
  requireMatch(
    validation.passed === !defeated &&
      validation.status ===
        (defeated
          ? "challenger-confirmed-needs-new-feedback"
          : comparisons.some((row) => row.uncertain)
            ? "validated-with-near-ties"
            : "validated"),
    "Mutilate strict verdict was relabelled",
  );
  const referenceDps =
    plan.seeds.reduce(
      (sum, _, range) => sum + validation.records[range * plan.arms.length]!.metric.dps,
      0,
    ) / 2;
  requireMatch(
    referenceDps === validation.selectedDps && referenceDps === build.referenceDps,
    "Mutilate benchmark changed",
  );
  const assessment = assessmentSchema.parse(await evidence(build.evidence.firstPass));
  const gaps = comparisons.map((row) => ({
    arm: row.arm,
    confirmedBetter: row.challengerConfirmedBetter,
    averageDpsDifference: row.averageChallengerDpsDifference,
    relativeMeanGain: row.averageChallengerDpsDifference / referenceDps,
    conservativeGapFraction: Math.max(
      0,
      ...row.comparisons.map((range) => (range.difference + range.threshold) / range.baseline.dps),
    ),
  }));
  same(assessment.retainedGaps, gaps, "Mutilate disclosed gains changed");
  requireMatch(
    assessment.largestConservativeRetainedGapFraction ===
      Math.max(0, ...gaps.map((gap) => gap.conservativeGapFraction)) &&
      assessment.strictValidationPassed === validation.passed &&
      assessment.strictValidationStatus === validation.status &&
      build.scope.strictOptimalityCheckPassed === validation.passed &&
      assessment.selectedArm === selected.name &&
      assessment.selectedSettingsSha256 === hash(build.settings) &&
      assessment.referenceDps === referenceDps,
    "Mutilate first-pass acceptance changed",
  );
  const parity = z
    .object({
      schema: z.literal("kfc-rogue-mutilate-first-pass-parity.v1"),
      status: z.literal("passed"),
      sourceValidation: z.object({
        completion: reference,
        result: reference,
        declaration: reference,
      }),
      firstPass: reference,
      selectedSettingsSha256: digest,
      prepared: z.object({
        playerClass: z.literal(6),
        sourceInput: inputSchema,
        input: inputSchema,
        sourceRequestId: digest,
        browserRequestId: digest,
      }),
      nativeOrigin: z.object({ arm: z.string(), response: inspectedMetric.extend({ admission }) }),
      browser: reference,
      parity: z.object({
        status: z.literal("passed"),
        backend,
        sourceRequestId: digest,
        browserRequestId: digest,
        native: inspectedMetric,
        browser: inspectedMetric,
      }),
      errors: z.array(z.string()).length(0),
      publicationAllowed: z.literal(false),
    })
    .parse(await evidence(build.evidence.parity));
  same(parity.firstPass, build.evidence.firstPass, "Mutilate parity acceptance changed");
  const completion = z
    .object({
      schema: z.literal("kfc-bounded-native-study-completion.v1"),
      identity: digest,
      result: reference,
      publicationAllowed: z.literal(false),
    })
    .parse(await evidence(parity.sourceValidation.completion));
  requireMatch(
    completion.identity === savedValidation.identity,
    "Mutilate parity completion changed",
  );
  same(completion.result, build.evidence.validation, "Mutilate completed result changed");
  same(parity.sourceValidation.result, build.evidence.validation, "Mutilate parity result changed");
  same(
    parity.sourceValidation.declaration,
    build.evidence.validationDeclaration,
    "Mutilate parity declaration changed",
  );
  requireMatch(
    parity.selectedSettingsSha256 === hash(build.settings) &&
      parity.nativeOrigin.arm === selected.name,
    "Mutilate parity selected setup changed",
  );
  same(parity.parity.backend, declaration.backend, "Mutilate parity backend changed");
  same(parity.parity.native, selected.inspected, "Mutilate parity native metric changed");
  same(
    inspectedMetric.parse(parity.nativeOrigin.response),
    selected.inspected,
    "Mutilate raw native origin changed",
  );
  for (const input of [parity.prepared.sourceInput, parity.prepared.input]) {
    same(input.gear, selectedPlayer.equipment.items, "Mutilate parity gear/enchants changed");
    requireMatch(
      input.talentsString === selectedPlayer.talentsString,
      "Mutilate parity talents changed",
    );
    same(input.rotation, selectedPlayer.rotation, "Mutilate parity APL changed");
  }
  const wasm = z
    .object({
      id: digest,
      playerClass: z.literal(6),
      admission,
      error: z.literal(""),
      activePlayers: z.literal(1),
      duration: z.literal(300),
      metric: inspectedMetric,
      resultSha256: digest,
    })
    .parse(await evidence(parity.browser));
  same(wasm.metric, parity.parity.browser, "Mutilate raw WASM metric changed");
  requireMatch(
    hash(parity.prepared.sourceInput) === parity.prepared.sourceRequestId &&
      hash(parity.prepared.input) === parity.prepared.browserRequestId &&
      parity.parity.sourceRequestId === selected.inspected.id &&
      parity.parity.sourceRequestId === parity.prepared.sourceRequestId &&
      parity.parity.browserRequestId === parity.prepared.browserRequestId &&
      parity.nativeOrigin.response.id === selected.inspected.id &&
      parity.nativeOrigin.response.admission.id === selected.inspected.id &&
      wasm.id === parity.prepared.browserRequestId &&
      wasm.metric.id === wasm.id &&
      wasm.admission.id === wasm.id &&
      Math.abs(wasm.metric.dps - selected.inspected.dps) < 1e-8 &&
      Math.abs(wasm.metric.stdev - selected.inspected.stdev) < 1e-8,
    "Mutilate actual native/WASM parity changed",
  );
  const url = new URL(share.link);
  requireMatch(
    url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      url.pathname.replace(/\/$/, "") === `/forever-sim/${options.sourceRelease}/rogue` &&
      /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash),
    "Invalid Mutilate full-build link",
  );
  return {
    build,
    review: {
      id: share.caseId,
      spec: "rogue/mutilate",
      faction: build.faction.toLowerCase(),
      scenario: "mutilate-static",
      displayName: build.name,
      validationIterations: build.validationIterations,
      stage: "practical first pass · nearby gains disclosed",
      rotationGuidance: {
        talents: build.rotationGuidance.talents,
        scenario: build.rotationGuidance.scenario,
        priorities: build.rotationGuidance.priorities,
        caveats: build.rotationGuidance.caveats,
      },
      status: "reviewed",
      href: url.pathname + url.hash,
      referenceDps: build.referenceDps,
      requiresProvisionalEnchantOptIn: false,
      warnings: build.warnings,
    },
  };
}

export async function appendMutilateFirstPassSimulatorDelivery(
  options: DeliveryOptions & { readonly cases: readonly LocalSimulatorBuildReview[] },
): Promise<readonly LocalSimulatorBuildReview[]> {
  let pointer: {
    readonly campaignIdentity: string;
    readonly sourceRelease: string;
    readonly share: MutilateReviewReference;
  };
  try {
    pointer = z
      .object({
        schema: z.literal("kfc-local-mutilate-first-pass-delivery.v1"),
        campaignIdentity: digest,
        sourceRelease: z.string(),
        share: reference,
      })
      .strict()
      .parse(await options.read("rogue-mutilate-first-pass-delivery.json", 128000));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return options.cases;
    throw error;
  }
  if (
    pointer.campaignIdentity !== options.campaignIdentity ||
    pointer.sourceRelease !== options.sourceRelease
  )
    return options.cases;
  const delivery = await readMutilateFirstPassSimulatorDelivery(pointer.share, options);
  requireMatch(
    !options.cases.some((entry) => entry.id === delivery.review.id),
    "Mutilate delivery cannot replace a historical case",
  );
  return [...options.cases, delivery.review];
}
