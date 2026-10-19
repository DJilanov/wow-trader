import { createHash } from "node:crypto";
import { z } from "zod";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1), sha256: digest });
const pointerSchema = z
  .object({
    schema: z.literal("kfc-local-bounded-deliveries.v1"),
    campaignIdentity: digest,
    sourceRelease: z.string(),
    cases: z.record(
      z.string(),
      z.object({ supersedesExportSha256: digest, share: reference }).strict(),
    ),
  })
  .strict();
const settingsSchema = z.record(z.string(), z.unknown());
const gearSchema = z.object({
  items: z
    .array(
      z
        .object({
          id: z.number().int().positive(),
          enchant: z.number().int().nonnegative().optional(),
        })
        .passthrough(),
    )
    .length(17),
});
const playerSchema = z.object({
  equipment: gearSchema,
  talentsString: z.string().min(1),
  rotation: z.record(z.string(), z.unknown()),
  race: z.string(),
});
const buildSchema = z.object({
  schema: z.literal("kfc-bounded-spearing-build.v1"),
  status: z.literal("scenario-reviewed-local-export"),
  profile: z.literal("warrior"),
  variant: z.literal("fury"),
  sourceRelease: z.string(),
  revision: z.string(),
  dbSha256: digest,
  nativeBinarySha256: digest,
  referenceDps: z.number().finite().positive(),
  validationIterations: z.literal(400000),
  settings: settingsSchema,
  enchantPolicy: z.object({
    provisionalEffectIds: z.array(z.number().int().positive()).nonempty(),
  }),
  requiresProvisionalEnchantOptIn: z.literal(true),
  evidence: z.object({
    closing: reference,
    baseline: reference,
    talents: reference,
    selectedContext: reference,
    accessories: reference,
    accessoryResult: reference,
    accessoryReplay: reference,
    parity: reference,
  }),
  scope: z.object({
    name: z.literal("bounded-reviewed-talent-apl-and-all-slot-feedback.v1"),
    exhaustiveRotationGridRequired: z.literal(false),
    globalOptimalityProven: z.literal(false),
  }),
  warnings: z.array(z.string()).max(20),
  publicPromotion: z.literal(false),
  browserHandoffRequired: z.literal(true),
});
const shareSchema = z.object({
  schema: z.literal("kfc-local-bounded-build-share.v1"),
  status: z.literal("reviewed-local"),
  campaignIdentity: digest,
  caseId: z.string(),
  sourceRelease: z.string(),
  build: reference,
  supersedesExport: reference,
  requiresProvisionalEnchantOptIn: z.literal(true),
  link: z.string().min(100).max(512000),
  combatSettingsSha256: digest,
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
const observationSchema = z.object({
  role: z.literal("baseline"),
  dps: z.number().finite().positive(),
  stdev: z.number().finite().nonnegative(),
  iterations: z.literal(100000),
  input: z.object({
    requestBase64: z.string(),
    gear: gearSchema.shape.items,
    talentsString: z.string(),
    rotation: z.record(z.string(), z.unknown()),
    iterations: z.literal(100000),
    seed: z.number().int().positive(),
    detail: z.literal(false),
  }),
});
const coreSchema = z.object({
  schema: z.literal("kfc-corrected-spearing-closing-talent-applicability.v2"),
  status: z.literal("unchanged-context-talent-feedback-reused"),
  closedCoreLoop: z.literal(true),
  publicationAllowed: z.literal(false),
  references: z.object({ baseline: reference, search: reference, talentReplay: reference }),
  selected: z.object({
    gear: gearSchema,
    talents: z.string(),
    rotation: z.record(z.string(), z.unknown()),
  }),
  selectedContextSupplement: z.object({ completion: reference }),
  context: z.object({
    backend: z.object({
      kind: z.literal("admitted-native.v1"),
      binarySha256: digest,
      compiledDatabaseSha256: digest,
    }),
  }),
  observations: z.array(observationSchema).length(4),
  representedIterations: z.literal(400000),
  referenceDps: z.number().finite().positive(),
});

interface EvidenceReference {
  readonly path: string;
  readonly sha256: string;
}
export interface BoundedDeliveryOptions {
  readonly cases: readonly LocalSimulatorBuildReview[];
  readonly predecessors: ReadonlyMap<string, string>;
  readonly campaignIdentity: string;
  readonly sourceRelease: string;
  readonly revision: string;
  readonly read: (path: string, maximumBytes: number) => Promise<unknown>;
  readonly reference: (reference: EvidenceReference, maximumBytes?: number) => Promise<unknown>;
  readonly databaseSha256: () => Promise<string>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function same(actual: unknown, expected: unknown, message: string): void {
  if (hash(actual) !== hash(expected)) throw new Error(message);
}
function combatSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  );
}

export async function applyBoundedLocalSimulatorDeliveries(
  options: BoundedDeliveryOptions,
): Promise<readonly LocalSimulatorBuildReview[]> {
  let pointer: z.infer<typeof pointerSchema>;
  try {
    pointer = pointerSchema.parse(await options.read("bounded-deliveries.json", 128000));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return options.cases;
    throw error;
  }
  if (
    pointer.campaignIdentity !== options.campaignIdentity ||
    pointer.sourceRelease !== options.sourceRelease
  )
    return options.cases;
  const replacements = new Map<string, LocalSimulatorBuildReview>();
  for (const [id, delivery] of Object.entries(pointer.cases)) {
    const previous = options.cases.find((row) => row.id === id);
    if (
      !previous ||
      previous.status !== "reviewed" ||
      previous.spec !== "warrior/fury" ||
      previous.scenario !== "provisional-procs" ||
      options.predecessors.get(id) !== delivery.supersedesExportSha256
    )
      throw new Error("Stale bounded delivery predecessor");
    const share = shareSchema.parse(await options.reference(delivery.share, 600000));
    if (
      share.caseId !== id ||
      share.campaignIdentity !== options.campaignIdentity ||
      share.sourceRelease !== options.sourceRelease ||
      share.supersedesExport.sha256 !== delivery.supersedesExportSha256
    )
      throw new Error("Stale bounded delivery share");
    await options.reference(share.supersedesExport);
    const build = buildSchema.parse(await options.reference(share.build));
    if (
      build.sourceRelease !== options.sourceRelease ||
      build.revision !== options.revision ||
      build.dbSha256 !== (await options.databaseSha256())
    )
      throw new Error("Stale bounded delivery model");
    same(share.warnings, build.warnings, "Bounded share warnings changed");
    same(
      hash(combatSettings(build.settings)),
      share.combatSettingsSha256,
      "Bounded share settings changed",
    );
    const core = coreSchema.parse(await options.reference(build.evidence.closing));
    same(core.references.baseline, build.evidence.baseline, "Bounded baseline reference changed");
    same(core.references.talentReplay, build.evidence.talents, "Bounded talent reference changed");
    same(
      core.selectedContextSupplement.completion,
      build.evidence.selectedContext,
      "Bounded gear reference changed",
    );
    if (
      core.context.backend.binarySha256 !== build.nativeBinarySha256 ||
      core.context.backend.compiledDatabaseSha256 !== build.dbSha256
    )
      throw new Error("Bounded native model changed");
    const baseline = z
      .object({
        schema: z.literal("kfc-optimization-baseline.v1"),
        profile: z.literal("warrior"),
        variant: z.literal("fury"),
        sourceRelease: z.string(),
        revision: z.string(),
        dbSha256: digest,
        requestBase64: z.string(),
        settings: settingsSchema,
      })
      .parse(await options.reference(build.evidence.baseline));
    if (
      baseline.sourceRelease !== build.sourceRelease ||
      baseline.revision !== build.revision ||
      baseline.dbSha256 !== build.dbSha256
    )
      throw new Error("Bounded baseline model changed");
    same(
      build.settings,
      baseline.settings,
      "Bounded selected setup requires a recaptured baseline",
    );
    const player = playerSchema.parse(build.settings.player);
    same(player.equipment, core.selected.gear, "Bounded selected gear changed");
    same(player.rotation, core.selected.rotation, "Bounded selected rotation changed");
    same(player.talentsString, core.selected.talents, "Bounded selected talents changed");
    const settingsFaction = z
      .object({ faction: z.string() })
      .parse(build.settings.settings).faction;
    if (settingsFaction.toLowerCase() !== previous.faction.toLowerCase())
      throw new Error("Bounded delivery faction changed");
    for (const observation of core.observations) {
      if (observation.input.requestBase64 !== baseline.requestBase64)
        throw new Error("Bounded observation control changed");
      same(observation.input.gear, player.equipment.items, "Bounded observation gear changed");
      same(observation.input.rotation, player.rotation, "Bounded observation rotation changed");
      same(
        observation.input.talentsString,
        player.talentsString,
        "Bounded observation talents changed",
      );
    }
    const benchmark =
      core.observations.reduce((sum, row) => sum + row.dps * row.iterations, 0) /
      core.representedIterations;
    if (benchmark !== build.referenceDps || benchmark !== core.referenceDps)
      throw new Error("Bounded benchmark changed");
    const search = z
      .object({
        schema: z.literal("kfc-current-spearing-talent-feedback.v2"),
        selected: z.object({
          talents: z.string(),
          resolvedRotation: z.record(z.string(), z.unknown()),
        }),
        parityRecords: z.array(reference),
      })
      .parse(await options.reference(core.references.search));
    const talents = z
      .object({
        schema: z.literal("kfc-readonly-corrected-spearing-talent-review.v1"),
        status: z.literal("passed-corrected-talent-feedback-needs-gear-adapter"),
        source: reference,
      })
      .parse(await options.reference(build.evidence.talents));
    same(talents.source, core.references.search, "Bounded talent search changed");
    same(search.selected.talents, player.talentsString, "Bounded final talent selection changed");
    same(
      search.selected.resolvedRotation,
      player.rotation,
      "Bounded final rotation selection changed",
    );
    if (!search.parityRecords.some((ref) => hash(ref) === hash(build.evidence.parity)))
      throw new Error("Bounded parity is not reviewed");
    const parity = z
      .object({
        request: z.object({
          requestBase64: z.string(),
          gear: gearSchema.shape.items,
          talentsString: z.string(),
          rotation: z.record(z.string(), z.unknown()),
          iterations: z.literal(25),
          seed: z.literal(1337),
          detail: z.literal(false),
        }),
        native: z.object({
          id: digest,
          dps: z.number().finite().positive(),
          stdev: z.number().finite().nonnegative(),
          iterations: z.literal(25),
        }),
        wasm: z.object({
          requestSha256: digest,
          error: z.literal(""),
          activePlayers: z.literal(1),
          metric: z.object({
            id: digest,
            dps: z.number().finite().positive(),
            stdev: z.number().finite().nonnegative(),
            iterations: z.literal(25),
          }),
          admission: z.object({
            id: digest,
            error: z.literal(""),
            parties: z.literal(1),
            slots: z.literal(5),
            activePlayers: z.literal(1),
            priority: z.number().int(),
            prepull: z.number().int(),
            warnings: z.array(z.unknown()).length(0),
          }),
        }),
      })
      .parse(await options.reference(build.evidence.parity));
    same(
      parity.request,
      {
        requestBase64: baseline.requestBase64,
        gear: player.equipment.items,
        talentsString: player.talentsString,
        rotation: player.rotation,
        iterations: 25,
        seed: 1337,
        detail: false,
      },
      "Bounded parity setup changed",
    );
    if (
      hash(parity.request) !== parity.native.id ||
      parity.native.id !== parity.wasm.requestSha256 ||
      parity.native.id !== parity.wasm.admission.id ||
      parity.native.id !== parity.wasm.metric.id ||
      Math.abs(parity.native.dps - parity.wasm.metric.dps) >= 1e-8 ||
      Math.abs(parity.native.stdev - parity.wasm.metric.stdev) >= 1e-8
    )
      throw new Error("Bounded native/browser parity changed");
    const rotationCounts = z
      .object({
        priorityList: z.array(z.unknown()),
        prepullActions: z.array(z.unknown()).optional(),
      })
      .parse(player.rotation);
    if (
      parity.wasm.admission.priority !== rotationCounts.priorityList.length ||
      parity.wasm.admission.prepull !== (rotationCounts.prepullActions?.length ?? 0)
    )
      throw new Error("Bounded parity admission changed");
    const selected = z
      .object({
        schema: z.literal("kfc-selected-fury-context-completion.v1"),
        result: reference,
        replay: reference,
      })
      .parse(await options.reference(build.evidence.selectedContext));
    const selectedResultValue = await options.reference(selected.result, 16_000_000);
    const selectedResult = z
      .object({
        schema: z.literal("kfc-selected-fury-context-result.v1"),
        status: z.literal("selected-context-no-confirmed-challenger"),
        evaluation: z
          .object({ requiresFeedback: z.literal(false), selectedGear: gearSchema })
          .passthrough(),
      })
      .parse(selectedResultValue);
    const selectedReplay = z
      .object({
        schema: z.literal("kfc-selected-fury-context-replay.v1"),
        status: z.literal("passed-selected-context-no-confirmed-challenger"),
        evaluationSha256: digest,
      })
      .parse(await options.reference(selected.replay));
    same(selectedResult.evaluation.selectedGear, player.equipment, "Bounded gear sweep changed");
    const selectedEvaluationValue = z
      .object({ evaluation: z.unknown() })
      .parse(selectedResultValue).evaluation;
    if (selectedReplay.evaluationSha256 !== hash(selectedEvaluationValue))
      throw new Error("Bounded gear replay changed");
    const completion = z
      .object({
        schema: z.literal("kfc-corrected-spearing-accessory-completion.v1"),
        status: z.literal("no-confirmed-accessory-challenger-needs-rotation"),
        result: reference,
        replay: reference,
      })
      .parse(await options.reference(build.evidence.accessories));
    same(completion.result, build.evidence.accessoryResult, "Bounded accessory result changed");
    same(completion.replay, build.evidence.accessoryReplay, "Bounded accessory replay changed");
    const result = z
      .object({
        schema: z.literal("kfc-corrected-spearing-accessory-cohort-result.v1"),
        status: z.literal("no-confirmed-accessory-challenger-needs-rotation"),
        closing: reference,
        cases: z.array(reference).length(2),
      })
      .parse(await options.reference(completion.result));
    same(result.closing, build.evidence.closing, "Bounded accessory context changed");
    const kinds = new Set<string>();
    for (const ref of result.cases) {
      const accessory = z
        .object({
          schema: z.literal("kfc-spearing-accessory-result.v2"),
          status: z.literal("no-confirmed-challenger"),
          kind: z.enum(["rings", "trinkets"]),
          incumbent: z.object({ gear: gearSchema }),
        })
        .parse(await options.reference(ref));
      kinds.add(accessory.kind);
      same(accessory.incumbent.gear, player.equipment, "Bounded accessory gear changed");
    }
    if (kinds.size !== 2) throw new Error("Incomplete bounded accessory coverage");
    z.object({
      schema: z.literal("kfc-spearing-accessory-replay.v1"),
      status: z.literal("passed-no-confirmed-accessory-challenger"),
      nativeJobs: z.literal(0),
      sourceCacheWrites: z.literal(0),
    }).parse(await options.reference(completion.replay));
    const url = new URL(share.link);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.pathname.replace(/\/$/, "") !== `/forever-sim/${options.sourceRelease}/warrior` ||
      !/^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash)
    )
      throw new Error("Invalid bounded local share URL");
    replacements.set(id, {
      ...previous,
      stage: "bounded calculations reviewed",
      href: url.pathname + url.hash,
      referenceDps: build.referenceDps,
      warnings: share.warnings,
      requiresProvisionalEnchantOptIn: true,
    });
  }
  return options.cases.map((row) => replacements.get(row.id) ?? row);
}
