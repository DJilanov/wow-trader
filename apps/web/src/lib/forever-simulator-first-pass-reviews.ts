import { createHash } from "node:crypto";
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
  iterations: z.number().int().positive(),
});
const player = z.object({
  equipment: z.object({
    items: z
      .array(
        z
          .object({
            id: z.number().int().positive().optional(),
            enchant: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .length(17),
  }),
  talentsString: z.string().min(1),
  rotation: record,
  consumes: z.object({ mainHandImbue: z.enum(["DenseSharpeningStone", "DenseWeightstone"]) }),
});
const backend = z.object({
  kind: z.literal("admitted-native.v1"),
  binarySha256: digest,
  compiledDatabaseSha256: digest,
  runnerSourceSha256: digest,
  codecSha256: digest,
});
const buildSchema = z.object({
  schema: z.literal("kfc-first-pass-simulator-build.v1"),
  status: z.literal("scenario-reviewed-local-export"),
  profile: z.literal("warrior"),
  variant: z.literal("fury"),
  style: z.literal("two-hand-fury"),
  name: z.literal("Two-hand Fury · Standard enchants"),
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
    core: reference,
    coreDeclaration: reference,
    validation: reference,
    validationDeclaration: reference,
    parity: reference,
  }),
  scope: z.object({
    name: z.literal("bounded-first-pass-with-independent-finalists.v1"),
    gearStable: z.literal(true),
    talentRotationStable: z.literal(true),
    independentValidation: z.literal(true),
    exhaustiveRotationGridRequired: z.literal(false),
    globalOptimalityProven: z.literal(false),
  }),
  warnings: z.array(z.string().min(1)).min(1).max(20),
  publicPromotion: z.literal(false),
  browserHandoffRequired: z.literal(true),
});
const shareSchema = z.object({
  schema: z.literal("kfc-local-first-pass-build-share.v1"),
  status: z.literal("reviewed-local"),
  campaignIdentity: digest,
  caseId: z.literal("two-hand-fury-static"),
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
    all17SlotsAndEnchants: z.literal(true),
    nativeWasmParityReused: z.literal(true),
    fullExportImportAndReload: z.literal(true),
    procConsentOffAfterImportAndReload: z.literal(true),
    previousDeliveryUnchanged: z.literal(true),
    historicalCampaignUnchanged: z.literal(true),
  }),
  warnings: z.array(z.string()).max(20),
  nativeJobs: z.literal(0),
  browserCombatJobs: z.literal(0),
  publicPromotion: z.literal(false),
});
const resultSchema = z.object({
  schema: z.literal("kfc-bounded-native-study-result.v1"),
  identity: digest,
  declaration: reference,
  semantic: z.object({ evaluation: record }),
  publicationAllowed: z.literal(false),
});
const coreSchema = z.object({
  schema: z.literal("kfc-two-hand-fury-bounded-core-loop.v1"),
  closed: z.literal(true),
  settings: record,
  gearEvidence: z.object({
    stable: z.literal(true),
    settings: record,
    gear: record,
    policy: z.object({ finalistSeed: z.literal(77191) }),
  }),
  feedbackEvidence: z.object({
    stable: z.literal(true),
    settings: record,
    talentsString: z.string(),
    rotation: record,
  }),
  independentFinalValidation: z.literal(false),
  publicationAllowed: z.literal(false),
});
const declarationSchema = z.object({
  schema: z.literal("kfc-two-hand-fury-frozen-validation-declaration.v1"),
  sourceCore: reference,
  backend,
  templates: z
    .array(
      z.object({
        imbue: z.enum(["DenseSharpeningStone", "DenseWeightstone"]),
        requestBase64: z.string().min(1),
      }),
    )
    .length(2),
  plan: record,
});
const planSchema = z.object({
  schema: z.literal("kfc-two-hand-fury-frozen-validation-experiment.v1"),
  source: reference,
  arms: z
    .array(
      z.object({
        name: z.string().min(1),
        settings: record,
        inspected: metric.extend({ iterations: z.literal(10000) }),
      }),
    )
    .min(3)
    .max(5),
  iterations: z.literal(100000),
  validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
  validationSeedContext: digest,
  seeds: z.array(z.number().int().positive().safe()).length(2),
});
const comparisonSchema = z.object({
  arm: z.string(),
  challengerConfirmedBetter: z.literal(false),
  selectedConfirmedBetter: z.boolean(),
  uncertain: z.boolean(),
  averageChallengerDpsDifference: z.number().finite(),
});
const validationSchema = z.object({
  schema: z.literal("kfc-two-hand-fury-independent-validation.v1"),
  status: z.enum(["first-pass-validated", "first-pass-validated-with-near-ties"]),
  passed: z.literal(true),
  selected: record,
  selectedDps: z.number().finite().positive(),
  selectedIterations: z.literal(200000),
  comparisons: z.array(comparisonSchema),
  records: z.array(z.object({ seed: z.number().int().positive().safe(), arm: z.string(), metric })),
  independentFinalValidation: z.literal(true),
  publicationAllowed: z.literal(false),
});

type FirstPassOptions = Pick<
  BoundedDeliveryOptions,
  "campaignIdentity" | "sourceRelease" | "revision" | "read" | "reference" | "databaseSha256"
>;
export interface FirstPassReference {
  readonly path: string;
  readonly sha256: string;
}
export interface FirstPassSimulatorDelivery {
  readonly review: LocalSimulatorBuildReview;
  readonly build: z.infer<typeof buildSchema>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function same(actual: unknown, expected: unknown, message: string): void {
  if (hash(actual) !== hash(expected)) throw new Error(message);
}
function requireMatch(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function readFirstPassSimulatorDelivery(
  shareReference: FirstPassReference,
  options: FirstPassOptions,
): Promise<FirstPassSimulatorDelivery> {
  async function evidence(ref: FirstPassReference): Promise<unknown> {
    const value = await options.reference(ref);
    requireMatch(hash(value) === ref.sha256, "First-pass evidence checksum mismatch");
    return value;
  }
  const share = shareSchema.parse(await evidence(shareReference));
  requireMatch(
    share.campaignIdentity === options.campaignIdentity &&
      share.sourceRelease === options.sourceRelease,
    "Stale first-pass share",
  );
  const build = buildSchema.parse(await evidence(share.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === (await options.databaseSha256()),
    "Stale first-pass model",
  );
  same(share.warnings, build.warnings, "First-pass share warnings changed");
  const selectedPlayer = player.parse(build.settings.player);
  requireMatch(!selectedPlayer.equipment.items[15]?.id, "Two-hand preset has an offhand item");
  const coreResult = resultSchema.parse(await evidence(build.evidence.core));
  const core = coreSchema.parse(coreResult.semantic.evaluation);
  same(core.settings, build.settings, "First-pass core settings changed");
  same(core.gearEvidence.settings, build.settings, "First-pass gear context is stale");
  same(core.feedbackEvidence.settings, build.settings, "First-pass talent/APL context is stale");
  same(core.gearEvidence.gear, selectedPlayer.equipment, "First-pass gear changed");
  requireMatch(
    core.feedbackEvidence.talentsString === selectedPlayer.talentsString,
    "First-pass talents changed",
  );
  same(core.feedbackEvidence.rotation, selectedPlayer.rotation, "First-pass rotation changed");
  same(
    coreResult.declaration,
    build.evidence.coreDeclaration,
    "First-pass core declaration link changed",
  );
  const coreDeclarationValue = await evidence(build.evidence.coreDeclaration);
  const coreDeclaration = z
    .object({
      schema: z.literal("kfc-two-hand-fury-bounded-core-declaration.v1"),
      backend,
      sourceFeedback: reference,
    })
    .parse(coreDeclarationValue);
  requireMatch(
    hash(coreDeclarationValue) === coreResult.identity,
    "First-pass core identity changed",
  );
  const validationResult = resultSchema.parse(await evidence(build.evidence.validation));
  same(
    validationResult.declaration,
    build.evidence.validationDeclaration,
    "First-pass validation declaration link changed",
  );
  const declarationValue = await evidence(build.evidence.validationDeclaration);
  const declaration = declarationSchema.parse(declarationValue);
  requireMatch(
    hash(declarationValue) === validationResult.identity,
    "First-pass validation identity changed",
  );
  same(declaration.sourceCore, build.evidence.core, "First-pass validation has a different core");
  same(declaration.backend, coreDeclaration.backend, "First-pass validation engine changed");
  requireMatch(
    declaration.backend.binarySha256 === build.nativeBinarySha256 &&
      declaration.backend.compiledDatabaseSha256 === build.dbSha256,
    "First-pass backend differs from export",
  );
  const plan = planSchema.parse(declaration.plan);
  same(plan.source, build.evidence.core, "First-pass frozen source changed");
  const {
    validationSeedPolicy: seedPolicy,
    validationSeedContext: seedContext,
    seeds,
    scope,
    ...experiment
  } = declaration.plan;
  requireMatch(
    seedPolicy === plan.validationSeedPolicy &&
      seedContext === hash(experiment) &&
      typeof scope === "string",
    "First-pass frozen plan changed",
  );
  const start =
    100000000 + Number.parseInt(plan.validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  same(seeds, [start, start + 100000], "First-pass validation seed ranges changed");
  requireMatch(
    plan.arms[0]?.name === "selected" &&
      new Set(plan.arms.map((arm) => arm.name)).size === plan.arms.length,
    "Invalid frozen first-pass arms",
  );
  same(plan.arms[0].settings, build.settings, "First-pass frozen incumbent changed");
  const validation = validationSchema.parse(validationResult.semantic.evaluation);
  same(validation.selected, build.settings, "First-pass validated settings changed");
  const width = plan.arms.length;
  requireMatch(
    validation.records.length === width * 2 &&
      new Set(validation.records.map((row) => row.metric.id)).size === width * 2,
    "Incomplete first-pass validation records",
  );
  function input(
    settings: Record<string, unknown>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    const value = player.parse(settings.player);
    const template = declaration.templates.find(
      (entry) => entry.imbue === value.consumes.mainHandImbue,
    );
    requireMatch(template !== undefined, "Missing first-pass weapon context");
    return {
      requestBase64: template.requestBase64,
      gear: value.equipment.items,
      talentsString: value.talentsString,
      rotation: value.rotation,
      iterations,
      seed,
      detail: false,
    };
  }
  for (const arm of plan.arms)
    requireMatch(
      arm.inspected.id === hash(input(arm.settings, 10000, 77191)),
      "First-pass inspected contender changed",
    );
  for (const [index, row] of validation.records.entries()) {
    const arm = plan.arms[index % width]!;
    requireMatch(
      row.arm === arm.name &&
        row.seed === plan.seeds[Math.floor(index / width)] &&
        row.metric.iterations === 100000 &&
        row.metric.id === hash(input(arm.settings, 100000, row.seed)),
      "First-pass validation request changed",
    );
  }
  const dps = (validation.records[0]!.metric.dps + validation.records[width]!.metric.dps) / 2;
  requireMatch(
    dps === build.referenceDps && dps === validation.selectedDps,
    "First-pass validation DPS changed",
  );
  requireMatch(
    validation.comparisons.length === width - 1,
    "Incomplete first-pass challenger comparisons",
  );
  let uncertain = false;
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
      "A confirmed first-pass challenger requires feedback",
    );
    const selectedBetter = differences.every((row) => -row.difference > row.threshold),
      comparison = validation.comparisons[index - 1]!;
    requireMatch(
      comparison.arm === plan.arms[index]!.name &&
        comparison.selectedConfirmedBetter === selectedBetter &&
        comparison.uncertain === !selectedBetter &&
        comparison.averageChallengerDpsDifference ===
          (differences[0]!.difference + differences[1]!.difference) / 2,
      "First-pass comparison verdict changed",
    );
    uncertain ||= !selectedBetter;
  }
  requireMatch(
    validation.status ===
      (uncertain ? "first-pass-validated-with-near-ties" : "first-pass-validated"),
    "First-pass uncertainty was hidden",
  );
  const parity = z
    .object({
      schema: z.literal("kfc-two-hand-fury-feedback-native-wasm-parity.v1"),
      status: z.literal("passed"),
      source: reference,
      backend,
      input: record,
      native: metric.extend({
        admission: z.object({
          error: z.literal(""),
          activePlayers: z.literal(1),
          warnings: z.array(z.unknown()).length(0),
        }),
      }),
      browser: metric,
      errors: z.array(z.unknown()).length(0),
      nativeJobs: z.literal(0),
      browserJobs: z.literal(1),
    })
    .parse(await evidence(build.evidence.parity));
  same(parity.source, coreDeclaration.sourceFeedback, "First-pass parity source changed");
  same(parity.backend, declaration.backend, "First-pass parity engine changed");
  same(parity.input, input(build.settings, 10000, 77191), "First-pass parity request changed");
  requireMatch(
    parity.native.id === hash(parity.input) &&
      parity.native.iterations === 10000 &&
      parity.browser.iterations === 10000 &&
      Math.abs(parity.native.dps - parity.browser.dps) < 1e-8 &&
      Math.abs(parity.native.stdev - parity.browser.stdev) < 1e-8,
    "First-pass browser/native parity failed",
  );
  const url = new URL(share.link);
  requireMatch(
    url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      url.pathname.replace(/\/$/, "") === `/forever-sim/${options.sourceRelease}/warrior` &&
      /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash),
    "Invalid first-pass full-build link",
  );
  return {
    build,
    review: {
      id: share.caseId,
      spec: "warrior/fury",
      faction: build.faction.toLowerCase(),
      scenario: "two-hand-static",
      displayName: build.name,
      validationIterations: build.validationIterations,
      stage: "bounded first pass validated",
      status: "reviewed",
      href: url.pathname + url.hash,
      referenceDps: build.referenceDps,
      requiresProvisionalEnchantOptIn: false,
      warnings: build.warnings,
    },
  };
}

export async function appendFirstPassSimulatorDeliveries(
  options: FirstPassOptions & { readonly cases: readonly LocalSimulatorBuildReview[] },
): Promise<readonly LocalSimulatorBuildReview[]> {
  let pointer: z.infer<typeof pointerSchema>;
  try {
    pointer = pointerSchema.parse(await options.read("first-pass-deliveries.json", 128000));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return options.cases;
    throw error;
  }
  if (
    pointer.campaignIdentity !== options.campaignIdentity ||
    pointer.sourceRelease !== options.sourceRelease
  )
    return options.cases;
  const cases = [...options.cases],
    ids = new Set(cases.map((row) => row.id));
  for (const [id, ref] of Object.entries(pointer.cases)) {
    requireMatch(!ids.has(id), "A first-pass delivery cannot overwrite a historical case");
    const delivery = await readFirstPassSimulatorDelivery(ref, options);
    requireMatch(delivery.review.id === id, "First-pass case ID changed");
    cases.push(delivery.review);
    ids.add(id);
  }
  return cases;
}
const pointerSchema = z
  .object({
    schema: z.literal("kfc-local-first-pass-deliveries.v1"),
    campaignIdentity: digest,
    sourceRelease: z.string(),
    cases: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), reference),
  })
  .strict();
