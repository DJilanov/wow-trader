import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { BoundedDeliveryOptions } from "./forever-simulator-bounded-reviews";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict();
const record = z.record(z.string(), z.unknown());
const builder = z.enum(["backstab", "sinister-strike"]);
const poison = z.enum(["NoPoison", "InstantPoison", "DeadlyPoison", "WoundPoison"]);
const poisons = z.object({ mainHandPoison: poison, offHandPoison: poison }).strict();
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
  consumes: z.object({
    mainHandImbue: z.literal("ShadowOil"),
    offHandImbue: z.enum(["DenseSharpeningStone", "DenseWeightstone"]),
  }),
  rogue: z.object({ options: poisons }),
  foreverTier1Bonuses: z.literal(false),
  enableItemSwap: z.literal(false),
});
const state = z.object({
  talentsString: z.string().min(1),
  rotationOptions: z.object({ builder }),
  poisons,
});
const metric = z.object({
  id: digest,
  dps: z.number().finite().positive(),
  stdev: z.number().finite().nonnegative(),
  iterations: z.number().int().positive(),
});
const inspected = metric.extend({ iterations: z.literal(10000) });
const backend = z
  .object({
    kind: z.literal("admitted-native.v1"),
    binarySha256: digest,
    compiledDatabaseSha256: digest,
    runnerSourceSha256: digest,
    codecSha256: digest,
  })
  .strict();
const coreReference = z.object({ builder, source: reference, settingsSha256: digest }).strict();
const template = z.object({
  mainHandImbue: z.literal("ShadowOil"),
  offHandImbue: z.enum(["DenseSharpeningStone", "DenseWeightstone"]),
  requestBase64: z.string().min(1),
  poisons,
});
const resultSchema = z.object({
  schema: z.literal("kfc-bounded-native-study-result.v1"),
  identity: digest,
  declaration: reference,
  semantic: z.object({ evaluation: record }),
  publicationAllowed: z.literal(false),
});
const policy = z.object({
  finalists: z.literal(10000),
  minimumFinalistGain: z.literal(0.1),
  finalConservativeSE: z.literal(1.96),
});
const finalist = z.object({ id: digest, metric: inspected });
const closureSchema = z.object({
  schema: z.enum(["kfc-rogue-bounded-core-closure.v1", "kfc-rogue-bounded-core-closure.v2"]),
  variant: z.literal("combat"),
  builder,
  closed: z.literal(true),
  settings: record,
  state,
  inspectedMetric: inspected,
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
const armSchema = z.object({
  name: z.string().min(1),
  coreBuilder: builder,
  source: reference,
  settings: record,
  state,
  inspected,
});
const range = z.object({
  seed: z.number().int().positive().safe(),
  iterations: z.number().int().positive().safe(),
});
const planSchema = z
  .object({
    schema: z.literal("kfc-rogue-combat-frozen-validation-experiment.v1"),
    backend,
    arms: z.array(armSchema).min(2).max(14),
    iterations: z.literal(100000),
    inspectedSeedRanges: z.array(range).min(3),
    policy: z.string().min(1),
    validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
    validationSeedContext: digest,
    seeds: z.array(z.number().int().positive().safe()).length(2),
    requestIds: z.array(digest).min(4).max(28),
    publicationAllowed: z.literal(false),
  })
  .strict();
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
const nativeMetric = inspected.extend({ admission });
const declarationSchema = z.object({
  schema: z.literal("kfc-rogue-combat-frozen-validation-declaration.v1"),
  expectedPlayerClass: z.literal(6),
  backend,
  plan: record,
  coreSources: z.array(coreReference).length(2),
  inspectedOrigins: z
    .array(z.object({ arm: z.string(), response: nativeMetric }))
    .min(2)
    .max(14),
  reservationPolicy: z.literal("kfc-rogue-combat-validation-reservation.v1"),
});
const validationSchema = z.object({
  schema: z.literal("kfc-rogue-combat-independent-validation.v1"),
  status: z.enum(["validated", "validated-with-near-ties"]),
  passed: z.literal(true),
  selected: record,
  selectedBuilder: builder,
  selectedDps: z.number().finite().positive(),
  selectedIterations: z.literal(200000),
  comparisons: z.array(
    z.object({
      arm: z.string(),
      challengerConfirmedBetter: z.literal(false),
      selectedConfirmedBetter: z.boolean(),
      uncertain: z.boolean(),
      averageChallengerDpsDifference: z.number().finite(),
    }),
  ),
  records: z.array(
    z.object({
      seed: z.number().int().positive().safe(),
      arm: z.string(),
      metric: metric.extend({ iterations: z.literal(100000) }),
    }),
  ),
  coreSources: z.array(coreReference).length(2),
  reservation: reference,
  retainedBuilderComparisonComplete: z.literal(true),
  independentFinalValidation: z.literal(true),
  publicationAllowed: z.literal(false),
});
const buildSchema = z.object({
  schema: z.literal("kfc-rogue-combat-simulator-build.v1"),
  status: z.literal("scenario-reviewed-local-export"),
  profile: z.literal("rogue"),
  variant: z.literal("combat"),
  style: z.enum(["combat-backstab", "combat-sinister-strike"]),
  name: z.string().min(1).max(160),
  faction: z.enum(["Alliance", "Horde"]),
  sourceRelease: z.string(),
  revision: z.string(),
  dbSha256: digest,
  nativeBinarySha256: digest,
  referenceDps: z.number().finite().positive(),
  validationIterations: z.literal(200000),
  settings: record,
  enchantPolicy: z.object({ provisionalEffectIds: z.array(z.number()).length(0) }),
  requiresProvisionalEnchantOptIn: z.literal(false),
  evidence: z.object({
    cores: z.array(coreReference).length(2),
    validation: reference,
    validationDeclaration: reference,
    parity: reference,
  }),
  scope: z.object({
    name: z.literal("bounded-combat-two-builder-independent-finalists.v1"),
    gearStable: z.literal(true),
    talentRotationPoisonStable: z.literal(true),
    retainedBuilderComparisonComplete: z.literal(true),
    independentValidation: z.literal(true),
    exhaustiveRotationGridRequired: z.literal(false),
    globalOptimalityProven: z.literal(false),
    uncertainComparisons: z.array(z.string()),
  }),
  warnings: z.array(z.string().min(1)).min(1).max(20),
  publicPromotion: z.literal(false),
  browserHandoffRequired: z.literal(true),
});
const shareSchema = z.object({
  schema: z.literal("kfc-local-rogue-combat-build-share.v1"),
  status: z.literal("reviewed-local"),
  campaignIdentity: digest,
  caseId: z.literal("rogue-combat-static"),
  profile: z.literal("rogue"),
  variant: z.literal("combat"),
  style: z.enum(["combat-backstab", "combat-sinister-strike"]),
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
    nativeWasmParityReused: z.literal(true),
    fullExportImportAndReload: z.literal(true),
    procConsentOffAfterImportAndReload: z.literal(true),
    previousDeliveriesUnchanged: z.literal(true),
    historicalCampaignUnchanged: z.literal(true),
    presentationUnchanged: z.literal(true),
  }),
  warnings: z.array(z.string()).max(20),
  nativeJobs: z.literal(0),
  browserCombatJobs: z.literal(0),
  publicPromotion: z.literal(false),
});

type DeliveryOptions = Pick<
  BoundedDeliveryOptions,
  "campaignIdentity" | "sourceRelease" | "revision" | "read" | "reference" | "databaseSha256"
>;
export interface RogueReviewReference {
  readonly path: string;
  readonly sha256: string;
}
export interface RogueCombatSimulatorDelivery {
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
function envelope(settings: Record<string, unknown>): unknown {
  const selected = player.parse(settings.player),
    raw = record.parse(settings.player);
  const options = record.parse(record.parse(raw.rogue).options);
  const { mainHandPoison: _main, offHandPoison: _off, ...remaining } = options;
  return {
    ...settings,
    player: {
      ...raw,
      equipment: {},
      talentsString: "",
      rotation: {},
      consumes: { ...record.parse(raw.consumes), offHandImbue: "" },
      rogue: { ...record.parse(raw.rogue), options: remaining },
    },
    class: selected.class,
  };
}
function auditFinalists(
  rows: readonly z.infer<typeof finalist>[],
  control: z.infer<typeof inspected>,
  controls: z.infer<typeof policy>,
): unknown {
  return rows.map((row) => {
    const gain = row.metric.dps - control.dps,
      threshold = Math.max(
        controls.minimumFinalistGain,
        (controls.finalConservativeSE * (row.metric.stdev + control.stdev)) / Math.sqrt(10000),
      );
    requireMatch(
      row.metric.id === control.id || gain <= threshold,
      "Rogue core has a missed qualifying finalist",
    );
    return { candidateId: row.id, requestId: row.metric.id, gain, threshold };
  });
}

export async function readRogueCombatSimulatorDelivery(
  shareReference: RogueReviewReference,
  options: DeliveryOptions,
): Promise<RogueCombatSimulatorDelivery> {
  async function evidence(ref: RogueReviewReference): Promise<unknown> {
    const value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "Rogue evidence checksum mismatch");
    return value;
  }
  const share = shareSchema.parse(await evidence(shareReference));
  requireMatch(
    share.campaignIdentity === options.campaignIdentity &&
      share.sourceRelease === options.sourceRelease,
    "Stale Rogue share",
  );
  const build = buildSchema.parse(await evidence(share.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === (await options.databaseSha256()),
    "Stale Rogue model",
  );
  same(share.warnings, build.warnings, "Rogue share warnings changed");
  requireMatch(share.style === build.style, "Rogue style changed");
  player.parse(build.settings.player);
  const savedValidation = resultSchema.parse(await evidence(build.evidence.validation));
  same(
    savedValidation.declaration,
    build.evidence.validationDeclaration,
    "Rogue validation declaration changed",
  );
  const declarationValue = await evidence(build.evidence.validationDeclaration),
    declaration = declarationSchema.parse(declarationValue);
  requireMatch(
    hash(declarationValue) === savedValidation.identity,
    "Rogue validation identity changed",
  );
  requireMatch(
    declaration.backend.binarySha256 === build.nativeBinarySha256 &&
      declaration.backend.compiledDatabaseSha256 === build.dbSha256,
    "Rogue validation backend changed",
  );
  same(declaration.coreSources, build.evidence.cores, "Rogue core sources changed");
  same(
    declaration.coreSources.map((core) => core.builder).sort(),
    ["backstab", "sinister-strike"],
    "Both Rogue cores are required",
  );
  const templates = new Map<string, z.infer<typeof template>[]>(),
    closures = new Map<string, z.infer<typeof closureSchema>>();
  for (const core of declaration.coreSources) {
    const source = record.parse(await evidence(core.source));
    const backstab = core.builder === "backstab";
    if (backstab)
      requireMatch(
        source.schema === "kfc-rogue-bounded-core-review.v2",
        "Wrong Backstab core role",
      );
    const gearValue = backstab
      ? await evidence(z.object({ result: reference }).parse(source.gearSource).result)
      : source;
    const gearResult = resultSchema.parse(gearValue);
    const gearDeclarationValue = await evidence(gearResult.declaration);
    const gearDeclaration = z
      .object({
        schema: z.enum([
          "kfc-rogue-feedback-gear-refinement-declaration.v1",
          "kfc-rogue-retained-feedback-gear-refinement-declaration.v1",
        ]),
        backend,
        sourceFeedback: z.object({
          result: reference,
          declaration: reference,
          stable: z.literal(true),
        }),
      })
      .parse(gearDeclarationValue);
    requireMatch(
      gearDeclaration.schema ===
        (backstab
          ? "kfc-rogue-feedback-gear-refinement-declaration.v1"
          : "kfc-rogue-retained-feedback-gear-refinement-declaration.v1") &&
        hash(gearDeclarationValue) === gearResult.identity,
      "Wrong Rogue gear role/identity",
    );
    same(gearDeclaration.backend, declaration.backend, "Rogue gear backend changed");
    const gear = z
      .object({
        schema: z.literal("kfc-rogue-feedback-gear-refinement.v1"),
        builder,
        stable: z.literal(true),
        settings: record,
        state,
        gear: equipment,
        policy,
        passes: z
          .array(
            z.object({
              accepted: z.literal(false),
              stable: z.literal(true),
              selected: z.object({ gear: equipment, metric: inspected }),
              finalistSelection: z.array(finalist).min(1).max(33),
            }),
          )
          .length(1),
        independentFinalValidation: z.literal(false),
        publicationAllowed: z.literal(false),
      })
      .parse(gearResult.semantic.evaluation);
    const closure = closureSchema.parse(
      backstab ? source.closure : gearResult.semantic.evaluation.coreApplicability,
    );
    const feedbackResult = resultSchema.parse(
      await evidence(gearDeclaration.sourceFeedback.result),
    );
    same(
      feedbackResult.declaration,
      gearDeclaration.sourceFeedback.declaration,
      "Rogue feedback source changed",
    );
    const feedbackDeclarationValue = await evidence(feedbackResult.declaration);
    const feedbackDeclaration = z
      .object({
        schema: z.enum([
          "kfc-rogue-combat-feedback-declaration.v1",
          "kfc-rogue-retained-actual-gear-feedback-declaration.v1",
        ]),
        backend,
        preparation: reference,
      })
      .parse(feedbackDeclarationValue);
    requireMatch(
      hash(feedbackDeclarationValue) === feedbackResult.identity &&
        feedbackDeclaration.schema ===
          (backstab
            ? "kfc-rogue-combat-feedback-declaration.v1"
            : "kfc-rogue-retained-actual-gear-feedback-declaration.v1"),
      "Wrong Rogue feedback role/identity",
    );
    same(feedbackDeclaration.backend, declaration.backend, "Rogue feedback backend changed");
    const feedback = z
      .object({
        schema: z.literal("kfc-rogue-bounded-feedback.v1"),
        stable: z.literal(true),
        settings: record,
        state,
        policy,
        rounds: z
          .array(
            z.object({
              accepted: z.boolean(),
              chosen: z.object({ state, rotation: record, metric: inspected }),
              finalists: z.array(finalist).min(1).max(13),
            }),
          )
          .min(1),
        independentFinalValidation: z.literal(false),
        publicationAllowed: z.literal(false),
      })
      .parse(feedbackResult.semantic.evaluation);
    const last = feedback.rounds.at(-1)!;
    requireMatch(
      !last.accepted && gear.builder === core.builder && closure.builder === core.builder,
      "Rogue feedback/core is not closed",
    );
    same(closure.settings, gear.settings, "Rogue gear settings changed");
    same(closure.settings, feedback.settings, "Rogue feedback settings changed");
    same(closure.state, gear.state, "Rogue gear state changed");
    same(closure.state, feedback.state, "Rogue feedback state changed");
    same(
      gear.gear,
      player.parse(closure.settings.player).equipment,
      "Rogue selected equipment changed",
    );
    same(gear.passes[0]!.selected.gear, gear.gear, "Rogue final gear control changed");
    same(closure.inspectedMetric, gear.passes[0]!.selected.metric, "Rogue gear metric changed");
    same(closure.inspectedMetric, last.chosen.metric, "Rogue feedback metric changed");
    same(closure.state, last.chosen.state, "Rogue selected feedback changed");
    same(
      last.chosen.rotation,
      player.parse(closure.settings.player).rotation,
      "Rogue selected rotation changed",
    );
    same(
      auditFinalists(gear.passes[0]!.finalistSelection, closure.inspectedMetric, gear.policy),
      closure.gearCoverage.finalistAudit,
      "Rogue gear finalist audit changed",
    );
    same(
      auditFinalists(last.finalists, closure.inspectedMetric, feedback.policy),
      closure.feedbackCoverage.finalistAudit,
      "Rogue feedback finalist audit changed",
    );
    requireMatch(
      hash(closure.settings) === core.settingsSha256,
      "Rogue core full settings changed",
    );
    const preparation = z
      .object({
        schema: z.literal("kfc-rogue-combat-feedback-preparation.v1"),
        status: z.literal("actual-gear-poison-combat-parity-passed"),
        backend,
        templates: z.array(template).length(32),
        canaries: z.object({
          status: z.literal("passed-after-cleanup"),
          expectedClass: z.literal(6),
          errors: z.array(z.unknown()).length(0),
        }),
        publicationAllowed: z.literal(false),
      })
      .parse(await evidence(feedbackDeclaration.preparation));
    same(preparation.backend, declaration.backend, "Rogue preparation backend changed");
    requireMatch(
      new Set(
        preparation.templates.map((row) =>
          [row.offHandImbue, row.poisons.mainHandPoison, row.poisons.offHandPoison].join(":"),
        ),
      ).size === 32,
      "Incomplete Rogue poison/weapon templates",
    );
    templates.set(core.builder, preparation.templates);
    closures.set(core.builder, closure);
  }
  const plan = planSchema.parse(declaration.plan);
  same(plan.backend, declaration.backend, "Rogue frozen backend changed");
  const {
    validationSeedPolicy: _seedPolicy,
    validationSeedContext,
    seeds,
    requestIds,
    publicationAllowed: _publication,
    ...experiment
  } = declaration.plan;
  requireMatch(validationSeedContext === hash(experiment), "Rogue frozen plan changed");
  const start =
    100000000 + Number.parseInt(plan.validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  same(seeds, [start, start + 100000], "Rogue final RNG ranges changed");
  for (const required of [
    { seed: 1337, iterations: 4000 },
    { seed: 77191, iterations: 10000 },
    { seed: 2247222508200000, iterations: 200000 },
  ])
    requireMatch(
      plan.inspectedSeedRanges.some(
        (entry) =>
          entry.seed <= required.seed &&
          entry.seed + entry.iterations >= required.seed + required.iterations,
      ),
      "Rogue inspected recovery/selection ranges were omitted",
    );
  const ranges = [
    ...plan.inspectedSeedRanges,
    ...plan.seeds.map((seed) => ({ seed, iterations: 100000 })),
  ].sort((a, b) => a.seed - b.seed);
  for (let index = 0; index < ranges.length; index++)
    requireMatch(
      Number.isSafeInteger(ranges[index]!.seed + ranges[index]!.iterations) &&
        (index === 0 ||
          ranges[index - 1]!.seed + ranges[index - 1]!.iterations <= ranges[index]!.seed),
      "Rogue confirmation RNG ranges overlap",
    );
  const incumbentArms = plan.arms.filter((arm) => arm.name.endsWith(":selected"));
  same(
    incumbentArms.map((arm) => arm.coreBuilder).sort(),
    ["backstab", "sinister-strike"],
    "Missing Rogue incumbent builder",
  );
  requireMatch(
    plan.arms[0]!.name.endsWith(":selected") &&
      new Set(plan.arms.map((arm) => arm.name)).size === plan.arms.length,
    "Invalid Rogue final arms",
  );
  function input(
    arm: z.infer<typeof armSchema>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const selected = player.parse(arm.settings.player);
    same(arm.state.poisons, selected.rogue.options, "Rogue poison state changed");
    requireMatch(arm.state.talentsString === selected.talentsString, "Rogue talent state changed");
    const selectedTemplate = templates
      .get(arm.coreBuilder)
      ?.find(
        (row) =>
          row.mainHandImbue === selected.consumes.mainHandImbue &&
          row.offHandImbue === selected.consumes.offHandImbue &&
          isDeepStrictEqual(row.poisons, arm.state.poisons),
      );
    requireMatch(selectedTemplate !== undefined, "Missing Rogue source-frame poison template");
    return {
      requestBase64: selectedTemplate.requestBase64,
      gear: selected.equipment.items,
      talentsString: selected.talentsString,
      rotation: selected.rotation,
      iterations,
      seed,
      detail: false,
    };
  }
  for (const arm of plan.arms) {
    same(envelope(arm.settings), envelope(build.settings), "Rogue final scenario changed");
    same(
      arm.source,
      declaration.coreSources.find((core) => core.builder === arm.coreBuilder)?.source,
      "Rogue arm source changed",
    );
    requireMatch(
      hash(input(arm, 10000, 77191)) === arm.inspected.id,
      "Rogue inspected request changed",
    );
    const origin = declaration.inspectedOrigins.find((entry) => entry.arm === arm.name)?.response;
    requireMatch(origin !== undefined, "Missing admitted Rogue contender");
    same(
      { id: origin.id, dps: origin.dps, stdev: origin.stdev, iterations: origin.iterations },
      arm.inspected,
      "Rogue admitted contender metric changed",
    );
    requireMatch(origin.admission.id === arm.inspected.id, "Rogue contender admission changed");
    if (arm.name.endsWith(":selected")) {
      const closure = closures.get(arm.coreBuilder)!;
      same(closure.settings, arm.settings, "Rogue incumbent settings changed");
      same(closure.state, arm.state, "Rogue incumbent state changed");
      same(closure.inspectedMetric, arm.inspected, "Rogue incumbent inspected metric changed");
    }
  }
  same(
    requestIds,
    plan.seeds.flatMap((seed) => plan.arms.map((arm) => hash(input(arm, 100000, seed)))),
    "Rogue frozen final request IDs changed",
  );
  const validation = validationSchema.parse(savedValidation.semantic.evaluation),
    width = plan.arms.length;
  same(validation.coreSources, build.evidence.cores, "Rogue validated cores changed");
  same(validation.selected, build.settings, "Rogue selected settings changed");
  same(plan.arms[0]!.settings, build.settings, "Rogue frozen selected settings changed");
  requireMatch(
    validation.selectedBuilder === plan.arms[0]!.state.rotationOptions.builder &&
      build.style === `combat-${validation.selectedBuilder}`,
    "Rogue selected builder changed",
  );
  requireMatch(
    validation.records.length === width * 2 &&
      new Set(validation.records.map((row) => row.metric.id)).size === width * 2 &&
      validation.comparisons.length === width - 1,
    "Incomplete Rogue final measurements",
  );
  for (const [index, row] of validation.records.entries())
    requireMatch(
      row.arm === plan.arms[index % width]!.name &&
        row.seed === plan.seeds[Math.floor(index / width)] &&
        row.metric.id === plan.requestIds[index],
      "Rogue final measurement request changed",
    );
  const dps = (validation.records[0]!.metric.dps + validation.records[width]!.metric.dps) / 2;
  requireMatch(
    dps === validation.selectedDps && dps === build.referenceDps,
    "Rogue final DPS changed",
  );
  const uncertain: string[] = [];
  for (let index = 1; index < width; index++) {
    const differences = plan.seeds.map((_, range) => {
      const baseline = validation.records[range * width]!.metric,
        candidate = validation.records[range * width + index]!.metric;
      return {
        difference: candidate.dps - baseline.dps,
        threshold: Math.max(
          0.001,
          3 * Math.sqrt((baseline.stdev ** 2 + candidate.stdev ** 2) / 100000),
        ),
      };
    });
    requireMatch(
      !differences.every((row) => row.difference > row.threshold),
      "A confirmed Rogue challenger requires feedback",
    );
    const selectedBetter = differences.every((row) => -row.difference > row.threshold),
      comparison = validation.comparisons[index - 1]!;
    requireMatch(
      comparison.arm === plan.arms[index]!.name &&
        comparison.selectedConfirmedBetter === selectedBetter &&
        comparison.uncertain === !selectedBetter &&
        comparison.averageChallengerDpsDifference ===
          (differences[0]!.difference + differences[1]!.difference) / 2,
      "Rogue final comparison changed",
    );
    if (!selectedBetter) uncertain.push(comparison.arm);
  }
  same(build.scope.uncertainComparisons, uncertain, "Rogue uncertainty was hidden");
  requireMatch(
    validation.status === (uncertain.length ? "validated-with-near-ties" : "validated"),
    "Rogue validation status changed",
  );
  const reservation = z
    .object({
      schema: z.literal("kfc-rogue-combat-validation-reservation.v1"),
      identity: digest,
      planSha256: digest,
      seedContext: digest,
      seeds: z.array(z.number()).length(2),
      iterations: z.literal(100000),
      validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
    })
    .parse(await evidence(validation.reservation));
  requireMatch(
    reservation.identity === savedValidation.identity &&
      reservation.planSha256 === hash(declaration.plan) &&
      reservation.seedContext === plan.validationSeedContext,
    "Rogue final reservation changed",
  );
  same(reservation.seeds, plan.seeds, "Rogue reserved seeds changed");
  const parity = z
    .object({
      schema: z.literal("kfc-rogue-selected-parity-review.v1"),
      status: z.literal("passed"),
      sourceValidation: z.object({ result: reference, declaration: reference }),
      selectedArm: z.string(),
      selectedSettingsSha256: digest,
      prepared: z.object({
        sourceInput: record,
        input: record,
        sourceRequestId: digest,
        browserRequestId: digest,
      }),
      browser: reference.extend({ byteSha256: digest }),
      parity: z.object({
        status: z.literal("passed"),
        backend,
        sourceRequestId: digest,
        browserRequestId: digest,
        native: inspected,
        browser: inspected,
        nativeJobs: z.literal(0),
        browserJobs: z.literal(1),
        browserIterations: z.literal(10000),
        inspectedRange: z.literal(true),
        absoluteDpsDifference: z.literal(0),
        absoluteStdevDifference: z.literal(0),
      }),
      errors: z.array(z.unknown()).length(0),
      publicationAllowed: z.literal(false),
    })
    .parse(await evidence(build.evidence.parity));
  same(
    parity.sourceValidation.result,
    build.evidence.validation,
    "Rogue parity validation changed",
  );
  same(
    parity.sourceValidation.declaration,
    build.evidence.validationDeclaration,
    "Rogue parity declaration changed",
  );
  requireMatch(
    parity.selectedArm === plan.arms[0]!.name &&
      parity.selectedSettingsSha256 === hash(build.settings),
    "Rogue parity selected setup changed",
  );
  same(
    parity.prepared.sourceInput,
    input(plan.arms[0]!, 10000, 77191),
    "Rogue parity native input changed",
  );
  same(parity.parity.backend, declaration.backend, "Rogue parity backend changed");
  same(parity.parity.native, plan.arms[0]!.inspected, "Rogue parity native metric changed");
  const wasm = z
    .object({
      id: digest,
      playerClass: z.literal(6),
      admission,
      error: z.literal(""),
      activePlayers: z.literal(1),
      duration: z.literal(300),
      metric: inspected,
      resultSha256: digest,
    })
    .parse(await evidence(parity.browser));
  same(wasm.metric, parity.parity.browser, "Rogue raw browser metric changed");
  requireMatch(
    hash(parity.prepared.sourceInput) === parity.prepared.sourceRequestId &&
      parity.prepared.sourceRequestId === parity.parity.sourceRequestId &&
      hash(parity.prepared.input) === parity.prepared.browserRequestId &&
      parity.prepared.browserRequestId === parity.parity.browserRequestId &&
      wasm.id === parity.prepared.browserRequestId &&
      wasm.admission.id === wasm.id &&
      wasm.metric.id === wasm.id &&
      Math.abs(wasm.metric.dps - parity.parity.native.dps) < 1e-8 &&
      Math.abs(wasm.metric.stdev - parity.parity.native.stdev) < 1e-8,
    "Rogue browser/native parity changed",
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
    "Invalid Rogue full-build link",
  );
  return {
    build,
    review: {
      id: share.caseId,
      spec: "rogue/combat",
      faction: build.faction.toLowerCase(),
      scenario: "combat-static",
      displayName: build.name,
      validationIterations: build.validationIterations,
      stage: "bounded Combat independently validated",
      status: "reviewed",
      href: url.pathname + url.hash,
      referenceDps: build.referenceDps,
      requiresProvisionalEnchantOptIn: false,
      warnings: build.warnings,
    },
  };
}

export async function appendRogueCombatSimulatorDelivery(
  options: DeliveryOptions & { readonly cases: readonly LocalSimulatorBuildReview[] },
): Promise<readonly LocalSimulatorBuildReview[]> {
  let pointer: {
    readonly campaignIdentity: string;
    readonly sourceRelease: string;
    readonly share: RogueReviewReference;
  };
  try {
    pointer = z
      .object({
        schema: z.literal("kfc-local-rogue-combat-delivery.v1"),
        campaignIdentity: digest,
        sourceRelease: z.string(),
        share: reference,
      })
      .strict()
      .parse(await options.read("rogue-combat-delivery.json", 128000));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return options.cases;
    throw error;
  }
  if (
    pointer.campaignIdentity !== options.campaignIdentity ||
    pointer.sourceRelease !== options.sourceRelease
  )
    return options.cases;
  const delivery = await readRogueCombatSimulatorDelivery(pointer.share, options);
  requireMatch(
    !options.cases.some((entry) => entry.id === delivery.review.id),
    "Rogue delivery cannot replace a historical case",
  );
  return [...options.cases, delivery.review];
}
