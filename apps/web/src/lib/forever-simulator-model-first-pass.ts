import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { evaluateApprovedSimulatorConfirmation } from "./forever-simulator-approved-confirmation";
import { hunterMarksmanshipDeliveryDefinition } from "./forever-simulator-hunter-marksmanship-reviews";
import {
  readFreshSurvivalSimulatorBuild,
  type FreshSurvivalSimulatorBuild,
} from "./forever-simulator-fresh-survival";
import {
  readFreshFeralSimulatorBuild,
  type FreshFeralSimulatorBuild,
} from "./forever-simulator-fresh-feral";
import {
  readFreshBalanceSimulatorBuild,
  type FreshBalanceSimulatorBuild,
} from "./forever-simulator-fresh-balance";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
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
export type ModelFirstPassReference = z.infer<typeof referenceSchema>;
export const simulatorModelFirstPassEntrySchema = z
  .object({
    id: z.enum([
      "hunter-marksmanship-static",
      "hunter-survival-static",
      "feral-cat-static",
      "balance-static",
    ]),
    profile: z.enum(["hunter", "feral_druid", "balance_druid"]),
    build: referenceSchema,
    settingsSha256: digest,
    hrefSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    requestTemplates: z
      .array(
        z
          .object({ arm: z.string().min(1).max(80), requestBase64: z.string().min(20).max(512000) })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict()
  .refine(
    (entry): boolean =>
      entry.profile ===
      (entry.id === "feral-cat-static"
        ? "feral_druid"
        : entry.id === "balance-static"
          ? "balance_druid"
          : "hunter"),
    "First-pass build profile does not match its ID",
  );
export type SimulatorModelFirstPassEntry = z.infer<typeof simulatorModelFirstPassEntrySchema>;

const metric = z
  .object({
    id: digest,
    dps: z.number().finite().positive(),
    stdev: z.number().finite().nonnegative(),
    iterations: z.number().int().positive(),
  })
  .strict();
const arm = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1),
    settings: record,
    state: record,
    inspected: metric,
    source: referenceSchema,
  })
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
const policy = z
  .object({
    schema: z.literal("kfc-owner-approved-first-pass-margin.v1"),
    maximumRetainedGapFraction: z.literal(0.02),
    originalMaximumRetainedGapFraction: z.literal(0.01),
    selectionFromHoldoutsAllowed: z.literal(false),
    scope: z.string().min(1).max(4000),
  })
  .strict();
const originalPlanSchema = z
  .object({
    schema: z.literal("kfc-practical-first-pass-frozen-confirmation.v1"),
    profile: z.literal("hunter"),
    variant: z.literal("marksmanship"),
    playerClass: z.literal(2),
    playerClassName: z.literal("ClassHunter"),
    backend,
    arms: z.array(arm).min(2).max(12),
    scenarioSha256: digest,
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
    readiness: z
      .object({
        sourceRole: z.literal("hunter-mm-no-item-skill-selection"),
        sourceCompletion: referenceSchema,
        stateRecheckEvidence: referenceSchema,
        gearApplicabilityEvidence: referenceSchema,
        stateRecheckCompleted: z.literal(true),
        gearApplicabilityReviewed: z.literal(true),
      })
      .passthrough(),
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
  .passthrough();
const approvedPlanSchema = z
  .object({
    schema: z.literal("kfc-approved-first-pass-frozen-confirmation.v1"),
    approvalPolicy: policy,
    originalPlan: originalPlanSchema,
  })
  .strict();
const recordsSchema = z
  .array(z.object({ seed: z.number().int().positive().safe(), arm: z.string(), metric }).strict())
  .min(4)
  .max(24);
const guidanceSchema = z
  .object({
    schema: z.literal("kfc-hunter-marksmanship-rotation-guidance.v1"),
    rotationSha256: digest,
    talents: z.string().min(1),
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
    caveats: z.array(z.string().min(1)).max(20),
  })
  .passthrough();
const buildSchema = z
  .object({
    schema: z.literal("kfc-model-first-pass-build.v1"),
    id: z.literal("hunter-marksmanship-static"),
    profile: z.literal("hunter"),
    variant: z.literal("marksmanship"),
    name: z.literal("Marksmanship · first-pass tested"),
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
    rotationGuidance: guidanceSchema,
    evidence: z
      .object({
        selection: referenceSchema,
        selectionResult: referenceSchema,
        confirmation: referenceSchema,
        confirmationResult: referenceSchema,
        confirmationDeclaration: referenceSchema,
        parity: referenceSchema,
      })
      .strict(),
    scope: record,
    warnings: z.array(z.string().min(1).max(4000)).min(1).max(20),
    publicPromotion: z.literal(false),
    browserHandoffRequired: z.literal(true),
  })
  .strict();
export type SimulatorModelFirstPassBuild =
  | z.infer<typeof buildSchema>
  | FreshSurvivalSimulatorBuild
  | FreshFeralSimulatorBuild
  | FreshBalanceSimulatorBuild;
export interface ModelFirstPassOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: ModelFirstPassReference) => Promise<unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(actual, expected), message);
}

export async function readSimulatorModelFirstPassBuild(
  rawEntry: SimulatorModelFirstPassEntry,
  options: ModelFirstPassOptions,
): Promise<SimulatorModelFirstPassBuild> {
  const entry = simulatorModelFirstPassEntrySchema.parse(rawEntry);
  if (entry.id === "balance-static") return readFreshBalanceSimulatorBuild(entry, options);
  if (entry.id === "feral-cat-static") return readFreshFeralSimulatorBuild(entry, options);
  if (entry.id === "hunter-survival-static") return readFreshSurvivalSimulatorBuild(entry, options);
  requireMatch(
    entry.build.path.endsWith(`/build-${entry.build.sha256.slice(0, 16)}.json`),
    "First-pass build filename changed content identity",
  );
  async function reference(ref: ModelFirstPassReference): Promise<unknown> {
    const checked = referenceSchema.parse(ref);
    const value = await options.reference(checked);
    requireMatch(hash(value) === checked.sha256, "First-pass evidence checksum changed");
    return value;
  }
  async function completed(
    ref: ModelFirstPassReference,
    schema: string,
  ): Promise<{
    readonly completion: Record<string, unknown>;
    readonly result: Record<string, unknown>;
    readonly declaration: Record<string, unknown>;
    readonly resultReference: ModelFirstPassReference;
    readonly declarationReference: ModelFirstPassReference;
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
    requireMatch(ref.path === folder + "completed.json", "Unexpected first-pass completion path");
    const result = z
      .object({
        schema: z.literal("kfc-bounded-native-study-result.v1"),
        identity: digest,
        declaration: referenceSchema,
        semantic: record,
        journals: z.array(z.object({ imported: z.literal(false) }).passthrough()).min(1),
        publicationAllowed: z.literal(false),
      })
      .passthrough()
      .parse(await reference(completion.result));
    requireMatch(
      result.identity === completion.identity &&
        result.declaration.path === folder + "declaration.json" &&
        result.declaration.sha256 === completion.identity &&
        completion.result.path ===
          folder + "result-" + completion.result.sha256.slice(0, 16) + ".json",
      "First-pass completion/declaration/result identity changed",
    );
    const declaration = record.parse(await reference(result.declaration));
    requireMatch(
      declaration.schema === schema && declaration.sourceRelease === options.sourceRelease,
      "First-pass source/model declaration changed",
    );
    return {
      completion,
      result,
      declaration,
      resultReference: completion.result,
      declarationReference: result.declaration,
    };
  }
  const build = buildSchema.parse(await reference(entry.build));
  requireMatch(
    build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "First-pass build belongs to another model or publication",
  );
  const selection = await completed(
    build.evidence.selection,
    "kfc-hunter-mm-no-item-skill-correction-declaration.v1",
  );
  const confirmation = await completed(
    build.evidence.confirmation,
    "kfc-hunter-mm-no-item-skill-confirmation-declaration.v1",
  );
  same(
    selection.resultReference,
    build.evidence.selectionResult,
    "First-pass selection result changed",
  );
  same(
    confirmation.resultReference,
    build.evidence.confirmationResult,
    "First-pass confirmation result changed",
  );
  same(
    confirmation.declarationReference,
    build.evidence.confirmationDeclaration,
    "First-pass confirmation declaration changed",
  );
  const selectedBackend = backend.parse(selection.declaration.backend);
  same(confirmation.declaration.backend, selectedBackend, "First-pass native models disagree");
  requireMatch(
    selectedBackend.binarySha256 === build.nativeBinarySha256 &&
      selectedBackend.compiledDatabaseSha256 === build.dbSha256,
    "First-pass numerical backend changed",
  );
  same(
    confirmation.declaration.selection,
    selection.resultReference,
    "Confirmation targets another first-pass selection",
  );
  const outcome = z
    .object({
      schema: z.literal("kfc-hunter-mm-no-item-skill-selection.v1"),
      settings: record,
      state: record,
      arms: z.array(record).min(2).max(12),
      rotationGuidance: record,
      gear: z
        .object({
          gear: record,
          policy: record,
          sweeps: z
            .array(
              z
                .object({
                  candidateIdsBySlot: z
                    .array(z.array(z.number().int().nonnegative()).min(1))
                    .length(17),
                  groups: z.array(z.object({ name: z.string() }).passthrough()).min(17),
                  material: z.boolean(),
                })
                .passthrough(),
            )
            .length(1),
        })
        .passthrough(),
      publicationAllowed: z.literal(false),
    })
    .passthrough()
    .parse(record.parse(selection.result.semantic).evaluation);
  same(outcome.settings, build.settings, "Selected build changed after its gear/state pass");
  same(outcome.state, build.state, "First-pass selected state changed");
  const historicalCompletion = record.parse(
    await reference(referenceSchema.parse(selection.declaration.historicalCompletion)),
  );
  const historicalResult = record.parse(
    await reference(referenceSchema.parse(historicalCompletion.result)),
  );
  const historicalDeclaration = record.parse(
    await reference(referenceSchema.parse(historicalResult.declaration)),
  );
  const historicalEvaluation = record.parse(record.parse(historicalResult.semantic).evaluation);
  requireMatch(
    hash(historicalEvaluation) === selection.declaration.historicalOriginalAssessmentSha256 &&
      historicalEvaluation.accepted === false &&
      historicalEvaluation.maximumRetainedGapFraction === 0.01,
    "First-pass historical assessment was overwritten or relabelled",
  );
  const historicalArms = z
    .array(record)
    .min(2)
    .parse(record.parse(historicalDeclaration.plan).arms);
  same(
    build.state,
    historicalArms[0]?.state,
    "Model correction silently reopened the frozen talent/APL state",
  );
  same(
    outcome.rotationGuidance,
    build.rotationGuidance,
    "First-pass action-bound guidance changed",
  );
  const names = new Set(outcome.gear.sweeps[0]?.groups.map((group): string => group.name));
  for (const name of [
    ...Array.from({ length: 10 }, (_, index): string => `slot:${index}`),
    "slot:14",
    "slot:15",
    "slot:16",
    "pair:14+15",
    "pair:10+11",
    "pair:12+13",
    "expanded-sets",
  ])
    requireMatch(names.has(name), "First-pass gear coverage omitted an actual slot/pair/set group");
  requireMatch(
    outcome.gear.policy.maxSweeps === 1,
    "First-pass model correction sweep policy changed",
  );
  const rawPlan = record.parse(
    record.parse(confirmation.declaration.confirmationPlan).originalPlan,
  );
  const plan = approvedPlanSchema.parse(confirmation.declaration.confirmationPlan);
  same(plan.originalPlan.backend, selectedBackend, "Frozen first-pass plan changed model");
  same(
    plan.originalPlan.arms,
    outcome.arms.map((arm): Record<string, unknown> => ({
      ...arm,
      source: selection.resultReference,
    })),
    "Frozen first-pass arms are not the measured selections",
  );
  same(
    plan.originalPlan.readiness.sourceCompletion,
    build.evidence.selection,
    "First-pass readiness changed completion",
  );
  same(
    plan.originalPlan.readiness.gearApplicabilityEvidence,
    selection.resultReference,
    "First-pass gear readiness changed",
  );
  same(
    plan.originalPlan.readiness.stateRecheckEvidence,
    selection.resultReference,
    "First-pass state readiness changed",
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
    hash(experiment) === plan.originalPlan.validationSeedContext,
    "First-pass frozen seed context changed",
  );
  const start =
    100000000 +
    Number.parseInt(plan.originalPlan.validationSeedContext.slice(0, 8), 16) * 1000000 +
    200000;
  same(
    plan.originalPlan.seeds,
    [start, start + 100000],
    "First-pass confirmation RNG arena changed",
  );
  const templates = new Map(
    entry.requestTemplates.map((template) => [template.arm, template.requestBase64]),
  );
  requireMatch(
    templates.size === plan.originalPlan.arms.length &&
      entry.requestTemplates.length === templates.size,
    "Missing or duplicate first-pass wire templates",
  );
  const nativeRequest = (
    value: z.infer<typeof arm>,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => {
    const player = record.parse(value.settings.player);
    const requestBase64 = templates.get(value.name);
    requireMatch(requestBase64, "Missing first-pass request frame");
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
  for (const value of plan.originalPlan.arms) {
    const player = record.parse(value.settings.player);
    hunterMarksmanshipDeliveryDefinition.validateArm(value.state, player);
    requireMatch(
      player.foreverTier1Bonuses === false && player.enableItemSwap === false,
      "First-pass arm enables free raid bonuses or swaps",
    );
    requireMatch(
      hunterMarksmanshipDeliveryDefinition.scenarioHash(value.settings) ===
        plan.originalPlan.scenarioSha256 &&
        value.inspected.iterations === 10000 &&
        hash(nativeRequest(value, 10000, 77191)) === value.inspected.id,
      "First-pass inspected state/frame/scenario changed",
    );
  }
  same(
    plan.originalPlan.requestIds,
    plan.originalPlan.seeds.flatMap((seed): string[] =>
      plan.originalPlan.arms.map((value): string => hash(nativeRequest(value, 20000, seed))),
    ),
    "First-pass held-out request identities changed",
  );
  const approval = record.parse(record.parse(confirmation.result.semantic).evaluation);
  same(build.approval, approval, "First-pass exported approval changed");
  const original = record.parse(approval.originalAssessment);
  const records = recordsSchema.parse(original.records);
  const math = evaluateApprovedSimulatorConfirmation(plan, records);
  requireMatch(math.accepted, "First-pass exceeds the approved2% margin");
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
    same(approval[key], math[key], "First-pass approval math changed: " + key);
  for (const [key, value] of Object.entries(math.originalAssessment))
    same(original[key], value, "First-pass original1% assessment changed: " + key);
  same(approval.selected, build.settings, "First-pass confirmation changed the selected incumbent");
  requireMatch(
    math.selectedDps === build.referenceDps &&
      math.selectedIterations === build.validationIterations,
    "First-pass public DPS or precision changed",
  );
  requireMatch(
    build.scope.name === "bounded-model-corrected-marksmanship-first-pass.v1" &&
      build.scope.originalGearSweeps === 2 &&
      build.scope.modelCorrectionSweeps === 1 &&
      build.scope.originalTalentStatePreserved === true &&
      build.scope.globalOptimalityProven === false &&
      build.scope.deeperOptimizationDeferred === true &&
      build.scope.maximumRetainedGapFraction === 0.02 &&
      build.scope.largestConservativeRetainedGapFraction ===
        math.largestConservativeRetainedGapFraction &&
      build.scope.originalStrictAssessmentAccepted === math.originalAssessment.accepted &&
      build.scope.modelCorrectionGearChanged === outcome.gear.sweeps[0]?.material,
    "First-pass scope/gap disclosure disagrees with its measurements",
  );
  hunterMarksmanshipDeliveryDefinition.validateGuidance(
    build.rotationGuidance,
    record.parse(build.settings.player),
  );
  const player = record.parse(build.settings.player);
  const equipment = z
    .object({
      items: z
        .array(
          z
            .object({
              id: z.number().int().nonnegative().optional(),
              enchant: z.number().int().positive().optional(),
            })
            .strict(),
        )
        .length(17),
    })
    .strict()
    .parse(player.equipment);
  const enchanted = equipment.items.flatMap((item, index): number[] =>
    item.enchant ? [index] : [],
  );
  requireMatch(
    enchanted.length === build.enchants.length &&
      new Set(build.enchants.map((choice): number => choice.gearIndex)).size === enchanted.length,
    "First-pass enchant coverage changed",
  );
  for (const choice of build.enchants)
    requireMatch(
      equipment.items[choice.gearIndex]?.id === choice.itemId &&
        equipment.items[choice.gearIndex]?.enchant === choice.effectId &&
        choice.key.startsWith(choice.effectId + ":"),
      "First-pass enchant binding changed",
    );
  const parity = z
    .object({
      schema: z.literal("kfc-model-first-pass-parity.v1"),
      id: z.literal("hunter-marksmanship-static"),
      sourceRelease: z.string(),
      settingsSha256: digest,
      prepared: record,
      native: record,
      browser: referenceSchema,
      summary: record,
      errors: z.array(z.string()).length(0),
      publicationAllowed: z.literal(false),
    })
    .strict()
    .parse(await reference(build.evidence.parity));
  requireMatch(
    parity.sourceRelease === build.sourceRelease && parity.settingsSha256 === entry.settingsSha256,
    "First-pass parity targets another build/model",
  );
  const selected = plan.originalPlan.arms[0];
  requireMatch(selected && selected.category === "selected", "Missing first-pass parity incumbent");
  same(
    parity.prepared.sourceInput,
    nativeRequest(selected, 10000, 77191),
    "First-pass parity source wire changed",
  );
  const browser = z
    .object({
      id: digest,
      playerClass: z.literal(2),
      error: z.literal(""),
      activePlayers: z.literal(1),
      duration: z.literal(300),
      metric,
      admission: record,
      resultSha256: digest,
    })
    .passthrough()
    .parse(await reference(parity.browser));
  const native = metric.parse(
    Object.fromEntries(
      ["id", "dps", "stdev", "iterations"].map((key): [string, unknown] => [
        key,
        parity.native[key],
      ]),
    ),
  );
  same(
    native,
    selected.inspected,
    "First-pass parity does not use its genuine selected10k measurement",
  );
  requireMatch(
    browser.id === parity.prepared.browserRequestId &&
      browser.metric.id === browser.id &&
      browser.metric.iterations === 10000 &&
      parity.prepared.sourceRequestId === native.id &&
      Math.abs(browser.metric.dps - native.dps) < 1e-8 &&
      Math.abs(browser.metric.stdev - native.stdev) < 1e-8,
    "First-pass native/WASM parity failed",
  );
  const rotation = record.parse(player.rotation);
  const priorityCount = z.array(z.unknown()).parse(rotation.priorityList).length;
  const prepullCount = z.array(z.unknown()).parse(rotation.prepullActions ?? []).length;
  for (const [admission, id] of [
    [record.parse(parity.native.admission), native.id],
    [browser.admission, browser.id],
  ] as const) {
    requireMatch(
      admission.error === "" &&
        admission.parties === 1 &&
        admission.activePlayers === 1 &&
        admission.id === id &&
        admission.priority === priorityCount &&
        admission.prepull === prepullCount &&
        Array.isArray(admission.warnings) &&
        admission.warnings.length === 0,
      "First-pass native/WASM APL admission failed",
    );
  }
  same(parity.summary.backend, selectedBackend, "First-pass parity backend changed");
  requireMatch(
    parity.summary.status === "passed" &&
      parity.summary.absoluteDpsDifference === 0 &&
      parity.summary.absoluteStdevDifference === 0,
    "First-pass selected parity summary changed",
  );
  return build;
}
