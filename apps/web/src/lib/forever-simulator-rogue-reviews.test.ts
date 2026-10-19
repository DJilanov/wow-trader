import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appendRogueCombatSimulatorDelivery,
  readRogueCombatSimulatorDelivery,
} from "./forever-simulator-rogue-reviews";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
interface Reference {
  readonly path: string;
  readonly sha256: string;
}
interface FixtureOptions {
  readonly closed?: boolean;
  readonly challengerDps?: number;
  readonly referenceDps?: number;
  readonly wasmDps?: number;
  readonly browserClass?: number;
  readonly browserBytesHash?: string;
  readonly seedOffset?: number;
  readonly differentRace?: boolean;
  readonly approved?: boolean;
}
interface Fixture {
  readonly share: Reference;
  readonly options: Parameters<typeof readRogueCombatSimulatorDelivery>[1];
}

function fixture(config: FixtureOptions = {}): Fixture {
  // Synthetic protocol-only fixture: no game data, execution or published research measurements.
  const records = new Map<string, unknown>();
  function seal(name: string, value: unknown): Reference {
    const path = `unit-only/${name}.json`;
    records.set(path, value);
    return { path, sha256: hash(value) };
  }
  const release = "a".repeat(24),
    campaign = "b".repeat(64),
    db = "c".repeat(64);
  const backend = {
    kind: "admitted-native.v1",
    binarySha256: "d".repeat(64),
    compiledDatabaseSha256: db,
    runnerSourceSha256: "e".repeat(64),
    codecSha256: "f".repeat(64),
  };
  const poisons = { mainHandPoison: "InstantPoison", offHandPoison: "DeadlyPoison" };
  const poisonNames = ["NoPoison", "InstantPoison", "DeadlyPoison", "WoundPoison"];
  function settings(builder: string): {
    readonly player: {
      class: string;
      level: number;
      race: string;
      equipment: { items: { id: number }[] };
      talentsString: string;
      rotation: Record<string, unknown>;
      consumes: { mainHandImbue: string; offHandImbue: string };
      rogue: { options: typeof poisons };
      foreverTier1Bonuses: boolean;
      enableItemSwap: boolean;
    };
    readonly encounter: { duration: number };
  } {
    return {
      player: {
        class: "ClassRogue",
        level: 60,
        race: config.differentRace && builder === "sinister-strike" ? "RaceOrc" : "RaceHuman",
        equipment: {
          items: Array.from({ length: 17 }, (_, slot) => ({
            id: 1000 + slot + (builder === "backstab" ? 0 : 100),
          })),
        },
        talentsString: "unit-talents-" + builder,
        rotation: { priorityList: [{ fixture: builder }] },
        consumes: { mainHandImbue: "ShadowOil", offHandImbue: "DenseSharpeningStone" },
        rogue: { options: poisons },
        foreverTier1Bonuses: false,
        enableItemSwap: false,
      },
      encounter: { duration: 300 },
    };
  }
  function input(
    value: ReturnType<typeof settings>,
    owner: string,
    iterations: number,
    seed: number,
  ): Record<string, unknown> {
    return {
      requestBase64: `unit-template:${owner}:DenseSharpeningStone:InstantPoison:DeadlyPoison`,
      gear: value.player.equipment.items,
      talentsString: value.player.talentsString,
      rotation: value.player.rotation,
      iterations,
      seed,
      detail: false,
    };
  }
  const cores = ["backstab", "sinister-strike"].map((builder, index) => {
    const value = settings(builder),
      state = { talentsString: value.player.talentsString, rotationOptions: { builder }, poisons };
    const inspected = {
      id: hash(input(value, builder, 10000, 77191)),
      dps: 100 - index * 10,
      stdev: 1,
      iterations: 10000,
    };
    const policy = { finalists: 10000, minimumFinalistGain: 0.1, finalConservativeSE: 1.96 };
    const gearRow = { id: hash(value.player.equipment), metric: inspected },
      feedbackRow = { id: hash(state), metric: inspected };
    const closure = {
      schema:
        builder === "backstab"
          ? "kfc-rogue-bounded-core-closure.v1"
          : "kfc-rogue-bounded-core-closure.v2",
      variant: "combat",
      builder,
      closed: config.closed ?? true,
      settings: value,
      state,
      inspectedMetric: inspected,
      gearCoverage: {
        candidateIdsBySlot: value.player.equipment.items.map((item) => [item.id]),
        groups: Array.from({ length: 27 }, (_, group) => ({
          name: "unit-group-" + group,
          proposals: 1,
        })),
        finalistAudit: [
          { candidateId: gearRow.id, requestId: inspected.id, gain: 0, threshold: 0.1 },
        ],
      },
      feedbackCoverage: {
        finalistAudit: [
          { candidateId: feedbackRow.id, requestId: inspected.id, gain: 0, threshold: 0.1 },
        ],
      },
      independentFinalValidation: false,
      publicationAllowed: false,
    };
    const templates = ["DenseSharpeningStone", "DenseWeightstone"].flatMap((offHandImbue) =>
      poisonNames.flatMap((mainHandPoison) =>
        poisonNames.map((offHandPoison) => ({
          mainHandImbue: "ShadowOil",
          offHandImbue,
          poisons: { mainHandPoison, offHandPoison },
          requestBase64: `unit-template:${builder}:${offHandImbue}:${mainHandPoison}:${offHandPoison}`,
        })),
      ),
    );
    const preparation = seal(builder + "-preparation", {
      schema: "kfc-rogue-combat-feedback-preparation.v1",
      status: "actual-gear-poison-combat-parity-passed",
      backend,
      templates,
      canaries: { status: "passed-after-cleanup", expectedClass: 6, errors: [] },
      publicationAllowed: false,
    });
    const feedbackDeclaration = seal(builder + "-feedback-declaration", {
      schema:
        builder === "backstab"
          ? "kfc-rogue-combat-feedback-declaration.v1"
          : "kfc-rogue-retained-actual-gear-feedback-declaration.v1",
      backend,
      preparation,
    });
    const feedback = seal(builder + "-feedback", {
      schema: "kfc-bounded-native-study-result.v1",
      identity: feedbackDeclaration.sha256,
      declaration: feedbackDeclaration,
      semantic: {
        evaluation: {
          schema: "kfc-rogue-bounded-feedback.v1",
          stable: true,
          settings: value,
          state,
          policy,
          rounds: [
            {
              accepted: false,
              chosen: { state, rotation: value.player.rotation, metric: inspected },
              finalists: [feedbackRow],
            },
          ],
          independentFinalValidation: false,
          publicationAllowed: false,
        },
      },
      publicationAllowed: false,
    });
    const gearDeclaration = seal(builder + "-gear-declaration", {
      schema:
        builder === "backstab"
          ? "kfc-rogue-feedback-gear-refinement-declaration.v1"
          : "kfc-rogue-retained-feedback-gear-refinement-declaration.v1",
      backend,
      sourceFeedback: { result: feedback, declaration: feedbackDeclaration, stable: true },
    });
    const gear = seal(builder + "-gear", {
      schema: "kfc-bounded-native-study-result.v1",
      identity: gearDeclaration.sha256,
      declaration: gearDeclaration,
      semantic: {
        evaluation: {
          schema: "kfc-rogue-feedback-gear-refinement.v1",
          builder,
          stable: true,
          settings: value,
          state,
          gear: value.player.equipment,
          policy,
          passes: [
            {
              accepted: false,
              stable: true,
              selected: { gear: value.player.equipment, metric: inspected },
              finalistSelection: [gearRow],
            },
          ],
          coreApplicability: closure,
          independentFinalValidation: false,
          publicationAllowed: false,
        },
      },
      publicationAllowed: false,
    });
    const source =
      builder === "backstab"
        ? seal("backstab-review", {
            schema: "kfc-rogue-bounded-core-review.v2",
            gearSource: { result: gear },
            closure,
          })
        : gear;
    return { builder, source, settingsSha256: hash(value), value, state, inspected };
  });
  const coreSources = cores.map(({ builder, source, settingsSha256 }) => ({
    builder,
    source,
    settingsSha256,
  }));
  const arms = cores.map((core) => ({
    name: core.builder + ":selected",
    coreBuilder: core.builder,
    source: core.source,
    settings: core.value,
    state: core.state,
    inspected: core.inspected,
  }));
  const experiment = {
    schema: "kfc-rogue-combat-frozen-validation-experiment.v1",
    backend,
    arms,
    iterations: 100000,
    inspectedSeedRanges: [
      { seed: 1337, iterations: 4000 },
      { seed: 77191, iterations: 10000 },
      { seed: 2247222508200000, iterations: 200000 },
    ],
    policy: "Unit-only frozen experiment, never game evidence.",
  };
  const validationSeedContext = hash(experiment),
    start = 100000000 + Number.parseInt(validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  const seeds = [start + (config.seedOffset ?? 0), start + 100000];
  const requestIds = seeds.flatMap((seed) =>
    arms.map((arm) => hash(input(arm.settings, arm.coreBuilder, 100000, seed))),
  );
  const plan = {
    ...experiment,
    validationSeedPolicy: "kfc-disjoint-rng-ranges.v1",
    validationSeedContext,
    seeds,
    requestIds,
    publicationAllowed: false,
  };
  const admission = (id: string): Record<string, unknown> => ({
    id,
    error: "",
    parties: 1,
    slots: 5,
    activePlayers: 1,
    priority: 1,
    prepull: 0,
    warnings: [],
  });
  const declaration = seal("validation-declaration", {
    schema: "kfc-rogue-combat-frozen-validation-declaration.v1",
    expectedPlayerClass: 6,
    backend,
    plan,
    coreSources,
    inspectedOrigins: arms.map((arm) => ({
      arm: arm.name,
      response: { ...arm.inspected, admission: admission(arm.inspected.id) },
    })),
    reservationPolicy: "kfc-rogue-combat-validation-reservation.v1",
  });
  const reservation = seal("reservation", {
    schema: "kfc-rogue-combat-validation-reservation.v1",
    identity: declaration.sha256,
    planSha256: hash(plan),
    seedContext: validationSeedContext,
    seeds,
    iterations: 100000,
    validationSeedPolicy: "kfc-disjoint-rng-ranges.v1",
  });
  const candidateDps = config.challengerDps ?? 90;
  const validation = seal("validation", {
    schema: "kfc-bounded-native-study-result.v1",
    identity: declaration.sha256,
    declaration,
    semantic: {
      evaluation: {
        schema: "kfc-rogue-combat-independent-validation.v1",
        status: "validated",
        passed: true,
        selected: arms[0]!.settings,
        selectedBuilder: "backstab",
        selectedDps: 100,
        selectedIterations: 200000,
        comparisons: [
          {
            arm: arms[1]!.name,
            challengerConfirmedBetter: false,
            selectedConfirmedBetter: true,
            uncertain: false,
            averageChallengerDpsDifference: candidateDps - 100,
          },
        ],
        records: seeds.flatMap((seed, range) =>
          arms.map((arm, index) => ({
            seed,
            arm: arm.name,
            metric: {
              id: requestIds[range * 2 + index],
              dps: index === 0 ? 100 : candidateDps,
              stdev: 1,
              iterations: 100000,
            },
          })),
        ),
        coreSources,
        reservation,
        retainedBuilderComparisonComplete: true,
        independentFinalValidation: true,
        publicationAllowed: false,
      },
    },
    publicationAllowed: false,
  });
  const sourceInput = input(arms[0]!.settings, "backstab", 10000, 77191),
    browserInput = { ...sourceInput, requestBase64: "unit-only-derived-browser-control" };
  const browserRequestId = hash(browserInput),
    browserMetric = {
      id: browserRequestId,
      dps: config.wasmDps ?? 100,
      stdev: 1,
      iterations: 10000,
    };
  const rawBrowser = seal("browser", {
    id: browserRequestId,
    playerClass: config.browserClass ?? 6,
    admission: admission(browserRequestId),
    error: "",
    activePlayers: 1,
    duration: 300,
    metric: browserMetric,
    resultSha256: hash("unit-only-result"),
  });
  const parity = seal("parity", {
    schema: "kfc-rogue-selected-parity-review.v1",
    status: "passed",
    sourceValidation: { result: validation, declaration },
    selectedArm: arms[0]!.name,
    selectedSettingsSha256: hash(arms[0]!.settings),
    prepared: {
      sourceInput,
      input: browserInput,
      sourceRequestId: hash(sourceInput),
      browserRequestId,
    },
    browser: {
      ...rawBrowser,
      byteSha256: config.browserBytesHash ?? hash("unit-only-browser-bytes"),
    },
    parity: {
      status: "passed",
      backend,
      sourceRequestId: hash(sourceInput),
      browserRequestId,
      native: arms[0]!.inspected,
      browser: browserMetric,
      nativeJobs: 0,
      browserJobs: 1,
      browserIterations: 10000,
      inspectedRange: true,
      absoluteDpsDifference: 0,
      absoluteStdevDifference: 0,
    },
    errors: [],
    publicationAllowed: false,
  });
  const warnings = ["Unit-only protocol fixture, not a game recommendation."];
  const build = seal("build", {
    schema: "kfc-rogue-combat-simulator-build.v1",
    status: "scenario-reviewed-local-export",
    profile: "rogue",
    variant: "combat",
    style: "combat-backstab",
    name: "Combat · Backstab · Standard enchants",
    faction: "Alliance",
    sourceRelease: release,
    revision: "unit-revision",
    dbSha256: db,
    nativeBinarySha256: backend.binarySha256,
    referenceDps: config.referenceDps ?? 100,
    validationIterations: 200000,
    settings: arms[0]!.settings,
    enchantPolicy: { provisionalEffectIds: [] },
    requiresProvisionalEnchantOptIn: false,
    evidence: { cores: coreSources, validation, validationDeclaration: declaration, parity },
    scope: {
      name: "bounded-combat-two-builder-independent-finalists.v1",
      gearStable: true,
      talentRotationPoisonStable: true,
      retainedBuilderComparisonComplete: true,
      independentValidation: true,
      exhaustiveRotationGridRequired: false,
      globalOptimalityProven: false,
      uncertainComparisons: [],
    },
    warnings,
    publicPromotion: false,
    browserHandoffRequired: true,
  });
  const approved = config.approved ?? true;
  const share = seal("share", {
    schema: "kfc-local-rogue-combat-build-share.v1",
    status: "reviewed-local",
    campaignIdentity: campaign,
    caseId: "rogue-combat-static",
    profile: "rogue",
    variant: "combat",
    style: "combat-backstab",
    sourceRelease: release,
    build,
    requiresProvisionalEnchantOptIn: false,
    link: `http://localhost:3017/forever-sim/${release}/rogue/#${"a".repeat(128)}`,
    combatSettingsSha256: hash("unit-normalization"),
    settingsNormalization: {
      schema: "kfc-level60-protobuf-combat-settings.v1",
      codecSha256: "1".repeat(64),
      scope: "Unit-only",
    },
    checked: {
      exactSelectedSetup: approved,
      actualRogueClass: approved,
      all17SlotsAndEnchants: approved,
      talentsRotationAndPoisons: approved,
      nativeWasmParityReused: approved,
      fullExportImportAndReload: approved,
      procConsentOffAfterImportAndReload: approved,
      previousDeliveriesUnchanged: approved,
      historicalCampaignUnchanged: approved,
      presentationUnchanged: approved,
    },
    warnings,
    nativeJobs: 0,
    browserCombatJobs: 0,
    publicPromotion: false,
  });
  return {
    share,
    options: {
      campaignIdentity: campaign,
      sourceRelease: release,
      revision: "unit-revision",
      databaseSha256: async (): Promise<string> => db,
      reference: async (ref): Promise<unknown> => {
        if (!records.has(ref.path)) throw new Error("Missing fixture evidence");
        return structuredClone(records.get(ref.path));
      },
      read: async (): Promise<unknown> => ({
        schema: "kfc-local-rogue-combat-delivery.v1",
        campaignIdentity: campaign,
        sourceRelease: release,
        share,
      }),
    },
  };
}

describe("Strict Combat Rogue delivery reader", () => {
  it("accepts both closed builders, exact requests, independent confirmation and approved full browser handoff", async () => {
    const f = fixture(),
      delivery = await readRogueCombatSimulatorDelivery(f.share, f.options);
    expect(delivery.review).toMatchObject({
      id: "rogue-combat-static",
      spec: "rogue/combat",
      status: "reviewed",
      referenceDps: 100,
      validationIterations: 200000,
      requiresProvisionalEnchantOptIn: false,
    });
    expect(delivery.build.scope.globalOptimalityProven).toBe(false);
    expect(delivery.review.href).toContain("/rogue/#");
  });
  it.each([
    { closed: false },
    { approved: false },
    { challengerDps: 101 },
    { referenceDps: 150 },
    { wasmDps: 101 },
    { browserClass: 9 },
    { browserBytesHash: "invalid" },
    { seedOffset: 1 },
    { differentRace: true },
  ])("rejects incomplete or contradictory resealed evidence %j", async (config) => {
    const f = fixture(config);
    await expect(readRogueCombatSimulatorDelivery(f.share, f.options)).rejects.toThrow();
  });
  it("rejects stale catalog/release identity and broken reference checksums", async () => {
    const f = fixture();
    await expect(
      readRogueCombatSimulatorDelivery(f.share, { ...f.options, sourceRelease: "0".repeat(24) }),
    ).rejects.toThrow("Stale Rogue share");
    await expect(
      readRogueCombatSimulatorDelivery(f.share, {
        ...f.options,
        databaseSha256: async (): Promise<string> => "0".repeat(64),
      }),
    ).rejects.toThrow("Stale Rogue model");
    await expect(
      readRogueCombatSimulatorDelivery({ ...f.share, sha256: "0".repeat(64) }, f.options),
    ).rejects.toThrow("checksum");
  });
  it("appends the new review without mutating historical cases and refuses ID collisions", async () => {
    const f = fixture();
    const previous: LocalSimulatorBuildReview = {
      id: "old-warrior",
      spec: "warrior/fury",
      faction: "horde",
      scenario: "conservative",
      stage: "reviewed",
      status: "reviewed",
      href: "/unchanged",
      referenceDps: 200,
      requiresProvisionalEnchantOptIn: false,
      warnings: [],
    };
    const cases = [previous],
      result = await appendRogueCombatSimulatorDelivery({ ...f.options, cases });
    expect(cases).toEqual([previous]);
    expect(result[0]).toBe(previous);
    expect(result).toHaveLength(2);
    await expect(
      appendRogueCombatSimulatorDelivery({ ...f.options, cases: result }),
    ).rejects.toThrow("historical case");
  });
  it("keeps existing reviews when there is no matching delivery", async () => {
    const f = fixture(),
      cases: readonly LocalSimulatorBuildReview[] = [];
    expect(
      await appendRogueCombatSimulatorDelivery({
        ...f.options,
        campaignIdentity: "0".repeat(64),
        cases,
      }),
    ).toBe(cases);
    expect(
      await appendRogueCombatSimulatorDelivery({
        ...f.options,
        cases,
        read: async (): Promise<never> => {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      }),
    ).toBe(cases);
  });
});
