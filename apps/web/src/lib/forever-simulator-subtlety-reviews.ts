import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { BoundedDeliveryOptions } from "./forever-simulator-bounded-reviews";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { evaluatePracticalSimulatorConfirmation } from "./forever-simulator-practical-confirmation";

const prefix = "artifacts/forever-simulator/optimization/";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
function isRelativePath(path: string): boolean {
  return !path.includes("\\") && !path.includes("\0") && !path.split("/").includes("..");
}
const reference = z
  .object({
    path: z.string().startsWith(prefix).endsWith(".json").refine(isRelativePath),
    sha256: digest,
  })
  .strict();
const journal = z
  .object({
    path: z.string().startsWith(prefix).endsWith(".ndjson").refine(isRelativePath),
    byteSha256: digest,
    bytes: z.number().int().positive(),
    imported: z.boolean(),
  })
  .strict();
const pin = z
  .object({ path: z.string().min(1).refine(isRelativePath), byteSha256: digest })
  .strict();
const backend = z
  .object({
    kind: z.literal("admitted-native.v1"),
    binarySha256: digest,
    compiledDatabaseSha256: digest,
    runnerSourceSha256: digest,
    codecSha256: digest,
  })
  .strict();
const metric = z.object({
  id: digest,
  dps: z.number().finite().positive(),
  stdev: z.number().finite().nonnegative(),
  iterations: z.union([z.literal(10000), z.literal(20000)]),
});
const inspectedMetric = metric.extend({ iterations: z.literal(10000) });
const confirmationMetric = metric.extend({ iterations: z.literal(20000) });
const equipment = z
  .object({
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
  })
  .strict();
const poisons = z
  .object({ mainHandPoison: z.string().min(1), offHandPoison: z.string().min(1) })
  .strict();
const rotationShape = z
  .object({ priorityList: z.array(record).min(1), prepullActions: z.array(record).optional() })
  .passthrough();
// Request identities include APL key order. Validate without rebuilding the captured object.
const rotation = z.custom<z.infer<typeof rotationShape>>(
  (value: unknown): boolean => rotationShape.safeParse(value).success,
);
const playerSchema = z
  .object({
    class: z.literal("ClassRogue"),
    level: z.literal(60),
    equipment,
    talentsString: z.string().min(1),
    rotation,
    consumes: record,
    rogue: z.object({ options: poisons }).passthrough(),
    foreverTier1Bonuses: z.literal(false),
    enableItemSwap: z.literal(false),
  })
  .passthrough();
const inputSchema = z
  .object({
    requestBase64: z.string().min(1),
    gear: equipment.shape.items,
    talentsString: z.string().min(1),
    rotation,
    iterations: z.union([z.literal(10000), z.literal(20000)]),
    seed: z.number().int().positive().safe(),
    detail: z.literal(false),
  })
  .strict();
const admission = z
  .object({
    id: digest,
    error: z.literal(""),
    parties: z.literal(1),
    slots: z.literal(5),
    activePlayers: z.literal(1),
    priority: z.number().int().nonnegative(),
    prepull: z.number().int().nonnegative(),
    warnings: z.array(z.unknown()).length(0),
  })
  .strict();
const nativeResponse = metric.extend({ admission }).strict();
const nativeOrigin = z.object({ requestId: digest, journal, response: nativeResponse }).strict();
const reservationReference = reference.extend({ byteSha256: digest });
const guidance = z
  .object({
    schema: z.literal("kfc-rogue-subtlety-rotation-guidance.v1"),
    rotationSha256: digest,
    talents: z.string().min(1),
    poisons,
    scenario: z.string().min(1),
    instruction: z.string().min(1),
    priorities: z.array(z.string().min(1)).min(1).max(32),
    priorityBindings: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            actionSha256: digest,
            text: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    caveats: z.array(z.string().min(1)).min(1).max(20),
  })
  .strict();
const policy = z
  .object({
    version: z.literal("practical-first-pass-confirmation.v1"),
    iterations: z.literal(20000),
    ranges: z.literal(2),
    reservedRangeIterations: z.literal(100000),
    inspectedIterations: z.literal(10000),
    inspectedSeed: z.literal(77191),
    maximumArms: z.literal(12),
    maximumRetainedGapFraction: z.literal(0.01),
    standardErrorMultiplier: z.literal(3),
  })
  .strict();
const arm = z.object({
  name: z.string().min(1),
  category: z.enum(["selected", "gear", "enchant", "talent", "rotation", "poison", "family"]),
  settings: record,
  state: z.object({ talentsString: z.string(), rotationOptions: record, poisons }),
  inspected: inspectedMetric,
  source: reference,
});
const planSchema = z.object({
  schema: z.literal("kfc-practical-first-pass-frozen-confirmation.v1"),
  profile: z.literal("rogue"),
  variant: z.literal("subtlety"),
  playerClass: z.literal(6),
  playerClassName: z.literal("ClassRogue"),
  backend,
  readiness: z.object({
    schema: z.literal("kfc-practical-first-pass-readiness.v1"),
    sourceRole: z.literal("subtlety-first-pass-selected-state-recheck"),
    sourceCompletion: reference,
    stateRecheckEvidence: reference,
    gearApplicabilityEvidence: reference,
    stateRecheckCompleted: z.literal(true),
    gearApplicabilityReviewed: z.literal(true),
  }),
  scenarioSha256: digest,
  arms: z.array(arm).min(2).max(12),
  policy,
  inspectedSeedRanges: z
    .array(
      z.object({
        seed: z.number().int().positive().safe(),
        iterations: z.number().int().positive().safe(),
      }),
    )
    .min(2),
  validationSeedContext: digest,
  validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
  seeds: z.array(z.number().int().positive().safe()).length(2),
  requestIds: z.array(digest).min(4).max(24),
  publicationAllowed: z.literal(false),
});
const recordsSchema = z
  .array(
    z
      .object({
        seed: z.number().int().positive().safe(),
        arm: z.string(),
        metric: confirmationMetric,
      })
      .strict(),
  )
  .min(4)
  .max(24);
const resultSchema = z.object({
  schema: z.literal("kfc-bounded-native-study-result.v1"),
  identity: digest,
  declaration: reference,
  semantic: z.object({ evaluation: record }),
  journals: z.array(journal).min(1),
  publicationAllowed: z.literal(false),
});
const coverage = z
  .object({
    stateInspectedFinalists: z.number().int().positive(),
    gearInspectedFinalists: z.number().int().positive(),
    retainedArms: z
      .array(z.object({ name: z.string(), category: z.string(), requestId: digest }))
      .min(2),
    unavailableHighPrecisionCategories: z.array(z.enum(["rotation", "poison", "enchant"])),
  })
  .strict();
const declarationSchema = z.object({
  schema: z.literal("kfc-rogue-subtlety-practical-confirmation-declaration.v1"),
  expectedPlayerClass: z.literal(6),
  profile: z.literal("rogue"),
  variant: z.literal("subtlety"),
  phase: z.literal("confirmation-delivery"),
  sourceRole: z.literal("subtlety-first-pass-selected-state-recheck"),
  sourceCompletion: reference,
  sourceResult: reference,
  backend,
  modelFingerprint: digest,
  plan: record,
  coverage,
  inspectedOrigins: z.array(z.object({ arm: z.string(), metric: inspectedMetric, journal })),
  historicalRanges: z
    .array(
      z.object({
        identity: digest,
        ranges: z
          .array(
            z.object({ seed: z.number().int().positive().safe(), iterations: z.literal(100000) }),
          )
          .length(2),
      }),
    )
    .min(3),
  sourcePins: z.array(pin).min(1),
  reservationPolicy: z.literal("kfc-practical-first-pass-validation-reservation.v1"),
});
const checkedSchema = z
  .object({
    exactSelectedSetup: z.literal(true),
    actualRogueClass: z.literal(true),
    all17SlotsAndEnchants: z.literal(true),
    talentsRotationAndPoisons: z.literal(true),
    nativeWasmParityReused: z.literal(true),
    fullExportImportAndReload: z.literal(true),
    procConsentOffAfterImportAndReload: z.literal(true),
    noAutomaticSimulation: z.literal(true),
    previousDeliveriesUnchanged: z.literal(true),
    historicalCampaignUnchanged: z.literal(true),
    presentationUnchanged: z.literal(true),
  })
  .strict();
const shareSchema = z.object({
  schema: z.literal("kfc-local-rogue-subtlety-first-pass-share.v1"),
  status: z.literal("reviewed-local"),
  campaignIdentity: digest,
  caseId: z.literal("rogue-subtlety-static"),
  profile: z.literal("rogue"),
  variant: z.literal("subtlety"),
  sourceRelease: z.string().regex(/^[a-f0-9]{24}$/),
  build: reference,
  requiresProvisionalEnchantOptIn: z.literal(false),
  link: z.string().min(100).max(512000),
  combatSettingsSha256: digest,
  settingsNormalization: z.object({
    schema: z.literal("kfc-level60-protobuf-combat-settings.v1"),
    codecSha256: digest,
    scope: z.string().min(1),
  }),
  requestFrames: z
    .array(z.object({ arm: z.string(), inspectedInput: inputSchema }))
    .min(2)
    .max(12),
  nativeOrigins: z.array(nativeOrigin).min(6).max(36),
  checked: checkedSchema,
  sourcePins: z.array(pin).min(1),
  warnings: z.array(z.string()).max(20),
  errors: z.array(z.unknown()).length(0),
  nativeJobs: z.literal(0),
  browserCombatJobs: z.literal(0),
  publicPromotion: z.literal(false),
});
const scopeSchema = z
  .object({
    name: z.literal("bounded-subtlety-practical-first-pass.v1"),
    gearSearchStatus: z.literal("two-sweep-cap-needs-state-recheck"),
    gearSweeps: z.literal(2),
    gearGloballyConverged: z.literal(false),
    selectedStateUnchanged: z.literal(true),
    independentIncumbentMeasurement: z.literal(true),
    iterationsPerRange: z.literal(20000),
    ranges: z.literal(2),
    strictRetainedDominancePassed: z.boolean(),
    largestConservativeRetainedGapFraction: z.number().finite().nonnegative(),
    maximumRetainedGapFraction: z.literal(0.01),
    globalOptimalityProven: z.literal(false),
    deeperOptimizationDeferred: z.literal(true),
  })
  .strict();
const buildSchema = z
  .object({
    schema: z.literal("kfc-rogue-subtlety-first-pass-build.v1"),
    status: z.literal("scenario-reviewed-local-export"),
    profile: z.literal("rogue"),
    variant: z.literal("subtlety"),
    style: z.enum(["hemorrhage", "backstab", "sinister-strike"]),
    name: z.literal("Subtlety · first-pass tested"),
    sourceRelease: z.string().regex(/^[a-f0-9]{24}$/),
    revision: z.string(),
    dbSha256: digest,
    nativeBinarySha256: digest,
    faction: z.string().min(1),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    inspectedReferenceDps: z.number().finite().positive(),
    inspectedIterations: z.literal(10000),
    settings: record,
    enchantPolicy: z
      .object({
        schema: z.literal("kfc-enchant-model-policy.v1"),
        provisionalEffectIds: z.array(z.number()).length(0),
      })
      .strict(),
    enchants: z.array(record).min(1),
    requiresProvisionalEnchantOptIn: z.literal(false),
    evidence: z
      .object({
        validation: reference,
        validationDeclaration: reference,
        validationCompletion: reference,
        gear: reference,
        stateRecheck: reference,
        reservation: reservationReference,
        parity: reference,
      })
      .strict(),
    scope: scopeSchema,
    rotationGuidance: guidance,
    warnings: z.array(z.string().min(1)).min(1).max(20),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .strict();

type DeliveryOptions = Pick<
  BoundedDeliveryOptions,
  "campaignIdentity" | "sourceRelease" | "revision" | "read" | "reference" | "databaseSha256"
>;
export interface SubtletyReviewReference {
  readonly path: string;
  readonly sha256: string;
}
export interface SubtletyFirstPassSimulatorDelivery {
  readonly review: LocalSimulatorBuildReview;
  readonly build: z.infer<typeof buildSchema>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(actual, expected), message);
}
function scenarioHash(settings: Record<string, unknown>): string {
  const value = structuredClone(settings),
    player = record.parse(value.player),
    consumes = record.parse(player.consumes),
    rogue = record.parse(player.rogue),
    options = record.parse(rogue.options);
  player.equipment = {};
  player.talentsString = "";
  player.rotation = {};
  consumes.offHandImbue = "";
  delete options.mainHandPoison;
  delete options.offHandPoison;
  rogue.options = options;
  player.rogue = rogue;
  player.consumes = consumes;
  value.player = player;
  return hash(value);
}
function withSample(
  input: z.infer<typeof inputSchema>,
  iterations: 10000 | 20000,
  seed: number,
): z.infer<typeof inputSchema> {
  return {
    requestBase64: input.requestBase64,
    gear: input.gear,
    talentsString: input.talentsString,
    rotation: input.rotation,
    iterations,
    seed,
    detail: false,
  };
}

function journalFile(value: z.infer<typeof journal>): {
  path: string;
  byteSha256: string;
  bytes: number;
} {
  return { path: value.path, byteSha256: value.byteSha256, bytes: value.bytes };
}

export async function readSubtletyFirstPassSimulatorDelivery(
  shareReference: SubtletyReviewReference,
  options: DeliveryOptions,
): Promise<SubtletyFirstPassSimulatorDelivery> {
  async function evidence(ref: SubtletyReviewReference): Promise<unknown> {
    const canonical = reference.parse({ path: ref.path, sha256: ref.sha256 });
    const value = await options.reference(canonical, 4_000_000);
    requireMatch(hash(value) === ref.sha256, "Subtlety evidence checksum mismatch");
    return value;
  }
  const share = shareSchema.parse(await evidence(shareReference)),
    build = buildSchema.parse(await evidence(share.build));
  requireMatch(
    share.campaignIdentity === options.campaignIdentity &&
      share.sourceRelease === options.sourceRelease &&
      build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === (await options.databaseSha256()),
    "Stale Subtlety campaign or model",
  );
  const selectedPlayer = playerSchema.parse(build.settings.player);
  same(share.warnings, build.warnings, "Subtlety share warnings changed");
  const result = resultSchema.parse(await evidence(build.evidence.validation));
  same(
    result.declaration,
    build.evidence.validationDeclaration,
    "Subtlety validation declaration changed",
  );
  const declarationValue = await evidence(build.evidence.validationDeclaration),
    declaration = declarationSchema.parse(declarationValue),
    plan = planSchema.parse(declaration.plan);
  const folder = prefix + "bounded-native-studies/" + result.identity + "/";
  requireMatch(
    result.identity === hash(declarationValue) &&
      build.evidence.validationDeclaration.path === folder + "declaration.json" &&
      build.evidence.validation.path ===
        folder + "result-" + build.evidence.validation.sha256.slice(0, 16) + ".json",
    "Subtlety result identity or path changed",
  );
  const completion = z
    .object({
      schema: z.literal("kfc-bounded-native-study-completion.v1"),
      identity: digest,
      result: reference,
      publicationAllowed: z.literal(false),
    })
    .parse(await evidence(build.evidence.validationCompletion));
  requireMatch(
    completion.identity === result.identity &&
      build.evidence.validationCompletion.path === folder + "completed.json",
    "Subtlety completion identity changed",
  );
  same(completion.result, build.evidence.validation, "Subtlety completion result changed");
  same(plan.backend, declaration.backend, "Subtlety frozen backend changed");
  requireMatch(
    declaration.backend.binarySha256 === build.nativeBinarySha256 &&
      declaration.backend.compiledDatabaseSha256 === build.dbSha256,
    "Subtlety binary or database changed",
  );
  requireMatch(
    declaration.modelFingerprint ===
      hash({
        schema: "kfc-rogue-subtlety-practical-confirmation-model.v1",
        backend: declaration.backend,
        planSha256: hash(declaration.plan),
      }),
    "Subtlety model fingerprint changed",
  );
  same(
    plan.readiness.sourceCompletion,
    declaration.sourceCompletion,
    "Subtlety state completion changed",
  );
  same(
    plan.readiness.stateRecheckEvidence,
    declaration.sourceResult,
    "Subtlety state evidence changed",
  );
  same(
    plan.readiness.stateRecheckEvidence,
    build.evidence.stateRecheck,
    "Subtlety build state evidence changed",
  );
  same(
    plan.readiness.gearApplicabilityEvidence,
    build.evidence.gear,
    "Subtlety gear applicability changed",
  );
  const rawPlan = declaration.plan;
  const {
    validationSeedContext,
    validationSeedPolicy,
    seeds,
    requestIds,
    publicationAllowed,
    ...experiment
  } = rawPlan;
  requireMatch(
    hash(experiment) === validationSeedContext &&
      validationSeedPolicy === "kfc-disjoint-rng-ranges.v1" &&
      publicationAllowed === false,
    "Subtlety frozen seed context changed",
  );
  same(seeds, plan.seeds, "Subtlety seed projection changed");
  same(requestIds, plan.requestIds, "Subtlety request projection changed");
  const start =
    100000000 + Number.parseInt(plan.validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  same(plan.seeds, [start, start + 100000], "Subtlety RNG arena changed");
  requireMatch(
    new Set(declaration.historicalRanges.map((row) => row.identity)).size ===
      declaration.historicalRanges.length,
    "Duplicate historical Subtlety RNG owners",
  );
  for (const identity of [
    "76bded6e26f07a50c7114ac2aa984c546686ef2d6e4ff68411b9a6cd724064bf",
    "0ed80582279d0be24eaabd52b9ecb2b833bd797b03833cac2e4c1dbf494facc0",
    "b58aa143dd0242abb69dfc7d829bbec1fa2852095ea8e9339f28fe2ddc059caa",
  ])
    requireMatch(
      declaration.historicalRanges.some((row) => row.identity === identity),
      "Missing known historical Rogue RNG owner",
    );
  for (const history of declaration.historicalRanges)
    for (const range of history.ranges)
      requireMatch(
        plan.inspectedSeedRanges.some(
          (known) =>
            known.seed <= range.seed &&
            known.seed + known.iterations >= range.seed + range.iterations,
        ),
        "Previously inspected Rogue RNG range was omitted",
      );
  const reservation = z
    .object({
      schema: z.literal("kfc-practical-first-pass-validation-reservation.v1"),
      identity: digest,
      planSha256: digest,
      seedContext: digest,
      seeds: z.array(z.number().int().positive().safe()).length(2),
      iterations: z.literal(20000),
      reservedIterations: z.literal(100000),
      validationSeedPolicy: z.literal("kfc-disjoint-rng-ranges.v1"),
      confirmationPolicyVersion: z.literal("practical-first-pass-confirmation.v1"),
      profile: z.literal("rogue"),
      variant: z.literal("subtlety"),
      playerClass: z.literal(6),
    })
    .strict()
    .parse(await evidence(build.evidence.reservation));
  requireMatch(
    reservation.identity === result.identity &&
      reservation.planSha256 === hash(rawPlan) &&
      reservation.seedContext === plan.validationSeedContext &&
      build.evidence.reservation.path ===
        prefix + "first-pass-validation-reservations/" + reservation.seedContext + ".json",
    "Subtlety RNG reservation owner changed",
  );
  same(reservation.seeds, plan.seeds, "Subtlety reserved RNG ranges changed");
  const saved = z
    .object({
      schema: z.literal("kfc-practical-first-pass-independent-confirmation.v1"),
      accepted: z.literal(true),
      selected: record,
      selectedArm: z.string(),
      selectedDps: z.number().finite().positive(),
      selectedIterations: z.literal(40000),
      iterationsPerRange: z.literal(20000),
      records: recordsSchema,
      selectionChanged: z.literal(false),
      independentFinalValidation: z.literal(true),
      globalOptimalityProven: z.literal(false),
      deeperOptimizationDeferred: z.literal(true),
      publicationAllowed: z.literal(false),
      rotationGuidance: guidance,
      reservation: reservationReference,
      sourceCompletion: reference,
      sourceRole: z.literal("subtlety-first-pass-selected-state-recheck"),
      coverage,
    })
    .passthrough()
    .parse(result.semantic.evaluation);
  const math = evaluatePracticalSimulatorConfirmation(plan, saved.records);
  for (const [key, value] of Object.entries(math))
    same(saved[key], value, "Subtlety confirmation math changed: " + key);
  requireMatch(
    math.accepted &&
      build.referenceDps === math.selectedDps &&
      build.validationIterations === math.selectedIterations,
    "Subtlety first-pass acceptance changed",
  );
  same(build.settings, saved.selected, "Subtlety selected setup changed");
  same(saved.sourceCompletion, declaration.sourceCompletion, "Subtlety result source changed");
  same(saved.coverage, declaration.coverage, "Subtlety source coverage changed");
  same(saved.reservation, build.evidence.reservation, "Subtlety result reservation changed");
  same(saved.rotationGuidance, build.rotationGuidance, "Subtlety recorded rotation guide changed");
  requireMatch(
    build.scope.strictRetainedDominancePassed === math.strictRetainedDominancePassed &&
      build.scope.largestConservativeRetainedGapFraction ===
        math.largestConservativeRetainedGapFraction,
    "Subtlety scope/gap disclosure changed",
  );
  const selected = plan.arms[0];
  requireMatch(
    selected && selected.category === "selected",
    "Missing preselected Subtlety incumbent",
  );
  same(selected.settings, build.settings, "Subtlety holdout winner was substituted");
  requireMatch(
    build.style === selected.state.rotationOptions.builder &&
      build.inspectedReferenceDps === selected.inspected.dps,
    "Subtlety builder or inspected reference changed",
  );
  same(
    declaration.coverage.retainedArms,
    plan.arms.map((row) => ({
      name: row.name,
      category: row.category,
      requestId: row.inspected.id,
    })),
    "Subtlety retained arm coverage changed",
  );
  const sourcePins = new Map(share.sourcePins.map((row) => [row.path, row.byteSha256]));
  requireMatch(sourcePins.size === share.sourcePins.length, "Duplicate Subtlety source pins");
  requireMatch(
    sourcePins.get(build.evidence.reservation.path) === build.evidence.reservation.byteSha256,
    "Subtlety reservation byte pin changed",
  );
  for (const source of declaration.sourcePins)
    requireMatch(
      sourcePins.get(source.path) === source.byteSha256,
      "Subtlety handoff lost its frozen source pin",
    );
  const originMap = new Map(share.nativeOrigins.map((row) => [row.requestId, row]));
  requireMatch(
    share.requestFrames.length === plan.arms.length &&
      originMap.size === share.nativeOrigins.length &&
      originMap.size === plan.arms.length * 3,
    "Missing or duplicate Subtlety native frames/origins",
  );
  function verifyOrigin(
    input: z.infer<typeof inputSchema>,
    expected: z.infer<typeof metric>,
  ): z.infer<typeof nativeOrigin> {
    const id = hash(input),
      origin = originMap.get(id);
    requireMatch(
      origin && origin.response.id === id && origin.response.admission.id === id,
      "Missing original Subtlety native admission",
    );
    requireMatch(
      sourcePins.get(origin.journal.path) === origin.journal.byteSha256 &&
        result.journals.some((source) => isDeepStrictEqual(source, origin.journal)),
      "Subtlety native journal provenance changed",
    );
    requireMatch(
      origin.journal.imported === (input.iterations === 10000) &&
        origin.journal.path.startsWith(folder) === (input.iterations === 20000),
      "Subtlety inspected/fresh native provenance was relabelled",
    );
    const { admission: admitted, ...scalar } = origin.response;
    same(scalar, expected, "Subtlety native scalar changed");
    requireMatch(
      scalar.iterations === input.iterations &&
        admitted.priority === input.rotation.priorityList.length &&
        admitted.prepull === (input.rotation.prepullActions?.length ?? 0),
      "Subtlety native sample/action admission changed",
    );
    return origin;
  }
  const frames = share.requestFrames.map((frame, index) => {
    const candidate = plan.arms[index];
    requireMatch(
      candidate && candidate.name === frame.arm,
      "Subtlety inspected frame order changed",
    );
    const input = withSample(frame.inspectedInput, 10000, 77191),
      player = playerSchema.parse(candidate.settings.player);
    same(frame.inspectedInput, input, "Subtlety original inspected precision changed");
    same(input.gear, player.equipment.items, "Subtlety inspected gear/enchants changed");
    same(input.rotation, player.rotation, "Subtlety inspected APL changed");
    requireMatch(
      input.talentsString === player.talentsString &&
        player.talentsString === candidate.state.talentsString &&
        scenarioHash(candidate.settings) === plan.scenarioSha256,
      "Subtlety inspected talents or scenario changed",
    );
    same(player.rogue.options, candidate.state.poisons, "Subtlety inspected poisons changed");
    requireMatch(
      hash(input) === candidate.inspected.id,
      "Subtlety original request identity changed",
    );
    const origin = verifyOrigin(input, candidate.inspected),
      declared = declaration.inspectedOrigins.find(
        (row) => row.metric.id === candidate.inspected.id,
      );
    requireMatch(
      declared && declared.arm === candidate.name,
      "Missing declared original Subtlety origin",
    );
    same(declared.metric, candidate.inspected, "Subtlety original inspection changed");
    same(
      journalFile(declared.journal),
      journalFile(origin.journal),
      "Subtlety original journal changed",
    );
    return input;
  });
  for (const [index, row] of saved.records.entries()) {
    const frame = frames[index % frames.length];
    requireMatch(frame, "Missing Subtlety holdout frame");
    const input = withSample(frame, 20000, row.seed);
    requireMatch(hash(input) === plan.requestIds[index], "Subtlety held-out wire identity changed");
    verifyOrigin(input, row.metric);
  }
  const guide = build.rotationGuidance;
  requireMatch(
    guide.rotationSha256 === hash(selectedPlayer.rotation) &&
      guide.priorities.length === selectedPlayer.rotation.priorityList.length &&
      guide.priorityBindings.length === guide.priorities.length,
    "Subtlety guide/APL coverage changed",
  );
  same(guide.poisons, selectedPlayer.rogue.options, "Subtlety guide poisons changed");
  for (const [index, binding] of guide.priorityBindings.entries())
    requireMatch(
      binding.index === index &&
        binding.text === guide.priorities[index] &&
        binding.actionSha256 === hash(selectedPlayer.rotation.priorityList[index]),
      "Subtlety written instruction lost its exact APL binding",
    );
  const parity = z
    .object({
      schema: z.literal("kfc-practical-rogue-selected-parity-review.v1"),
      status: z.literal("passed"),
      descriptor: z.object({
        sourceValidation: z.object({
          completion: reference,
          result: reference,
          declaration: reference,
        }),
        backend,
        selectedSettingsSha256: digest,
        sourceRequestId: digest,
        browserRequestId: digest,
      }),
      prepared: z.object({
        schema: z.literal("kfc-rogue-selected-wasm-control.v1"),
        playerClass: z.literal(6),
        sourceInput: inputSchema,
        input: inputSchema,
        sourceRequestId: digest,
        browserRequestId: digest,
        wireSha256: digest,
        bytes: z.array(z.number().int().min(0).max(255)),
        equivalence: record,
      }),
      nativeOrigin: z.object({ journal, response: nativeResponse }),
      browser: reference.extend({ byteSha256: digest }),
      parity: z.object({
        schema: z.literal("kfc-rogue-selected-native-wasm-parity.v1"),
        status: z.literal("passed"),
        backend,
        sourceRequestId: digest,
        browserRequestId: digest,
        native: inspectedMetric,
        browser: inspectedMetric,
        equivalence: record,
        absoluteDpsDifference: z.literal(0),
        absoluteStdevDifference: z.literal(0),
        nativeJobs: z.literal(0),
        browserJobs: z.literal(1),
        browserIterations: z.literal(10000),
        inspectedRange: z.literal(true),
      }),
      errors: z.array(z.unknown()).length(0),
      publicationAllowed: z.literal(false),
    })
    .parse(await evidence(build.evidence.parity));
  requireMatch(
    sourcePins.get(parity.browser.path) === parity.browser.byteSha256,
    "Subtlety raw browser byte pin changed",
  );
  same(
    parity.descriptor.sourceValidation,
    {
      completion: build.evidence.validationCompletion,
      result: build.evidence.validation,
      declaration: build.evidence.validationDeclaration,
    },
    "Subtlety parity source changed",
  );
  same(
    parity.descriptor.backend,
    declaration.backend,
    "Subtlety parity descriptor backend changed",
  );
  same(parity.parity.backend, declaration.backend, "Subtlety parity backend changed");
  requireMatch(
    parity.descriptor.selectedSettingsSha256 === hash(build.settings),
    "Subtlety parity selected setup changed",
  );
  const selectedInput = frames[0];
  requireMatch(selectedInput, "Missing selected Subtlety input");
  same(parity.prepared.sourceInput, selectedInput, "Subtlety parity source input changed");
  for (const input of [parity.prepared.sourceInput, parity.prepared.input]) {
    same(input.gear, selectedPlayer.equipment.items, "Subtlety parity equipment changed");
    same(input.rotation, selectedPlayer.rotation, "Subtlety parity APL changed");
    requireMatch(
      input.talentsString === selectedPlayer.talentsString &&
        input.iterations === 10000 &&
        input.seed === 77191,
      "Subtlety parity talents or precision changed",
    );
  }
  const browserId = hash(parity.prepared.input);
  requireMatch(
    parity.prepared.sourceRequestId === selected.inspected.id &&
      parity.prepared.browserRequestId === browserId &&
      parity.descriptor.sourceRequestId === selected.inspected.id &&
      parity.descriptor.browserRequestId === browserId &&
      parity.parity.sourceRequestId === selected.inspected.id &&
      parity.parity.browserRequestId === browserId &&
      parity.prepared.wireSha256 ===
        createHash("sha256").update(Uint8Array.from(parity.prepared.bytes)).digest("hex") &&
      Buffer.from(parity.prepared.bytes).toString("base64") === parity.prepared.input.requestBase64,
    "Subtlety selected wire identity changed",
  );
  same(
    parity.nativeOrigin.response,
    verifyOrigin(selectedInput, selected.inspected).response,
    "Subtlety parity native origin changed",
  );
  same(
    journalFile(parity.nativeOrigin.journal),
    journalFile(verifyOrigin(selectedInput, selected.inspected).journal),
    "Subtlety parity native journal changed",
  );
  same(parity.parity.native, selected.inspected, "Subtlety parity inspected metric changed");
  same(
    parity.parity.equivalence,
    parity.prepared.equivalence,
    "Subtlety parity effective-frame proof changed",
  );
  const equivalent = z
    .object({
      schema: z.literal("kfc-frozen-native-request-equivalence.v1"),
      backend,
      detail: z.literal(false),
      nativeOnly: z.literal(true),
      leftRequestSha256: digest,
      rightRequestSha256: digest,
    })
    .parse(parity.prepared.equivalence);
  same(equivalent.backend, declaration.backend, "Subtlety equivalence backend changed");
  requireMatch(
    equivalent.leftRequestSha256 === selected.inspected.id &&
      equivalent.rightRequestSha256 === browserId,
    "Subtlety effective-frame identities changed",
  );
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
  same(wasm.metric, parity.parity.browser, "Subtlety raw WASM metric changed");
  requireMatch(
    wasm.id === browserId &&
      wasm.metric.id === browserId &&
      wasm.admission.id === browserId &&
      Math.abs(wasm.metric.dps - selected.inspected.dps) < 1e-8 &&
      Math.abs(wasm.metric.stdev - selected.inspected.stdev) < 1e-8 &&
      wasm.admission.priority === selectedPlayer.rotation.priorityList.length &&
      wasm.admission.prepull === (selectedPlayer.rotation.prepullActions?.length ?? 0),
    "Subtlety selected native/WASM parity changed",
  );
  const url = new URL(share.link);
  requireMatch(
    url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      url.pathname.replace(/\/$/, "") === "/forever-sim/" + options.sourceRelease + "/rogue" &&
      /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash),
    "Invalid Subtlety full-build link",
  );
  return {
    build,
    review: {
      id: share.caseId,
      spec: "rogue/subtlety",
      faction: build.faction.toLowerCase(),
      scenario: "subtlety-static",
      displayName: build.name,
      validationIterations: build.validationIterations,
      stage: "practical first pass · bounded gear search",
      rotationGuidance: {
        talents: guide.talents,
        scenario: guide.scenario,
        instruction: guide.instruction,
        priorities: guide.priorities,
        caveats: guide.caveats,
      },
      status: "reviewed",
      href: url.pathname + url.hash,
      referenceDps: build.referenceDps,
      requiresProvisionalEnchantOptIn: false,
      warnings: build.warnings,
    },
  };
}

export async function appendSubtletyFirstPassSimulatorDelivery(
  options: DeliveryOptions & { readonly cases: readonly LocalSimulatorBuildReview[] },
): Promise<readonly LocalSimulatorBuildReview[]> {
  let pointer: {
    readonly campaignIdentity: string;
    readonly sourceRelease: string;
    readonly share: SubtletyReviewReference;
  };
  try {
    pointer = z
      .object({
        schema: z.literal("kfc-local-subtlety-first-pass-delivery.v1"),
        campaignIdentity: digest,
        sourceRelease: z.string(),
        share: reference,
      })
      .strict()
      .parse(await options.read("rogue-subtlety-first-pass-delivery.json", 128000));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return options.cases;
    throw error;
  }
  if (
    pointer.campaignIdentity !== options.campaignIdentity ||
    pointer.sourceRelease !== options.sourceRelease
  )
    return options.cases;
  const delivery = await readSubtletyFirstPassSimulatorDelivery(pointer.share, options);
  requireMatch(
    !options.cases.some((entry) => entry.id === delivery.review.id),
    "Subtlety delivery cannot replace an existing case",
  );
  return [...options.cases, delivery.review];
}
