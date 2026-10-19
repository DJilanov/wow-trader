import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appendMutilateFirstPassSimulatorDelivery,
  readMutilateFirstPassSimulatorDelivery,
} from "./forever-simulator-mutilate-reviews";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
interface Reference {
  readonly path: string;
  readonly sha256: string;
}
interface FixtureOptions {
  readonly gain?: number;
  readonly wasmClass?: number;
  readonly wasmDps?: number;
  readonly rawNativeDps?: number;
  readonly strictPassed?: boolean;
  readonly globalOptimality?: boolean;
  readonly closed?: boolean;
  readonly referenceDps?: number;
  readonly exported?: boolean;
  readonly wrongBackend?: boolean;
  readonly missingSlot?: boolean;
  readonly wrongGuidance?: boolean;
  readonly wrongSourceRole?: boolean;
  readonly badRequestId?: boolean;
}
interface Fixture {
  readonly share: Reference;
  readonly options: Parameters<typeof readMutilateFirstPassSimulatorDelivery>[1];
}

function fixture(config: FixtureOptions = {}): Fixture {
  // Synthetic parser/transport fixtures only: never sent to an engine or published as research.
  const documents = new Map<string, unknown>();
  const seal = (name: string, value: unknown): Reference => {
    const path = `unit-only/mutilate-${name}.json`;
    documents.set(path, value);
    return { path, sha256: hash(value) };
  };
  const sourceRelease = "a".repeat(24),
    campaignIdentity = "b".repeat(64),
    databaseSha256 = "c".repeat(64);
  const backend = {
    kind: "admitted-native.v1",
    binarySha256: "d".repeat(64),
    compiledDatabaseSha256: databaseSha256,
    runnerSourceSha256: "e".repeat(64),
    codecSha256: "f".repeat(64),
  };
  const poisons = { mainHandPoison: "InstantPoison", offHandPoison: "DeadlyPoison" };
  const settings = (
    family: number,
  ): {
    player: {
      class: string;
      level: number;
      equipment: { items: { id: number }[] };
      talentsString: string;
      rotation: Record<string, unknown>;
      rogue: { options: typeof poisons };
      foreverTier1Bonuses: boolean;
      enableItemSwap: boolean;
    };
  } => ({
    player: {
      class: "ClassRogue",
      level: 60,
      equipment: { items: Array.from({ length: 17 }, (_, index) => ({ id: index + 1 })) },
      talentsString: "unit-talents-" + family,
      rotation: { unitOnly: family },
      rogue: { options: poisons },
      foreverTier1Bonuses: false,
      enableItemSwap: false,
    },
  });
  const input = (
    value: ReturnType<typeof settings>,
    requestBase64: string,
  ): Record<string, unknown> => ({
    requestBase64,
    gear: value.player.equipment.items,
    talentsString: value.player.talentsString,
    rotation: value.player.rotation,
    iterations: 10000,
    seed: 77191,
    detail: false,
  });
  const sources = [0, 1].map((wantedVenom) => {
    const value = settings(wantedVenom),
      inspected = {
        id: hash(input(value, "unit-native-" + wantedVenom)),
        dps: 100.1 - wantedVenom,
        stdev: 1,
        iterations: 10000,
      };
    const state = {
      talentsString: value.player.talentsString,
      rotationOptions: { builder: "mutilate" },
      poisons,
    };
    const closure = {
      schema: wantedVenom
        ? "kfc-rogue-mutilate-retained-venom-selected-gear-applicability.v1"
        : "kfc-rogue-mutilate-core-applicability.v1",
      variant: "mutilate",
      closed: config.closed ?? true,
      settings: value,
      state,
      inspectedMetric: inspected,
      gearStable: true,
      feedbackStable: true,
      gearCoverage: {
        candidateIdsBySlot: value.player.equipment.items.map((item, slot) => [
          config.missingSlot && slot === 1 ? 99 : item.id,
        ]),
        groups: Array.from({ length: 27 }, (_, group) => ({
          name: "unit-group-" + group,
          proposals: 1,
        })),
        finalistAudit: [
          { candidateId: hash(value), requestId: inspected.id, gain: 0, threshold: 1 },
        ],
      },
      feedbackCoverage: {
        finalistAudit: [
          { candidateId: hash(state), requestId: inspected.id, gain: 0, threshold: 1 },
        ],
      },
      independentFinalValidation: false,
      publicationAllowed: false,
    };
    const gearDeclaration = {
      schema: wantedVenom
        ? "kfc-rogue-mutilate-retained-venom-selected-gear-declaration.v1"
        : "kfc-rogue-mutilate-feedback-gear-refinement-declaration.v1",
      backend: config.wrongBackend ? { ...backend, binarySha256: "0".repeat(64) } : backend,
    };
    const gearResult = {
      schema: "kfc-bounded-native-study-result.v1",
      identity: hash(gearDeclaration),
      declaration: seal("gear-declaration-" + wantedVenom, gearDeclaration),
      semantic: { evaluation: { coreApplicability: closure } },
      publicationAllowed: false,
    };
    const gearReference = seal("gear-result-" + wantedVenom, gearResult);
    const source = wantedVenom
      ? gearReference
      : seal("primary-core", {
          schema: config.wrongSourceRole
            ? "kfc-rogue-bounded-core-review.v2"
            : "kfc-rogue-mutilate-core-review.v1",
          assessment: closure,
          gearSource: { result: gearReference },
          publicationAllowed: false,
        });
    return {
      family: wantedVenom ? "venom-1" : "venom-0",
      wantedVenom,
      source,
      settings: value,
      state,
      inspected,
    };
  });
  const coreReferences = sources.map(({ family, wantedVenom, source, settings: value }) => ({
    family,
    wantedVenom,
    source,
    settingsSha256: hash(value),
  }));
  const arms = sources.map((source) => ({
    name: source.family + ":selected",
    coreFamily: source.family,
    wantedVenom: source.wantedVenom,
    source: source.source,
    settings: source.settings,
    state: source.state,
    inspected: source.inspected,
  }));
  const experiment = {
    schema: "kfc-rogue-mutilate-frozen-validation-experiment.v1",
    backend,
    arms,
    iterations: 100000,
    inspectedSeedRanges: [
      { seed: 1337, iterations: 2000 },
      { seed: 77191, iterations: 10000 },
      { seed: 200000, iterations: 100000 },
    ],
  };
  const seeds = [1000000, 2000000];
  const requestIds = seeds.flatMap((seed) => arms.map((arm) => hash({ unitOnly: arm.name, seed })));
  const plan = {
    ...experiment,
    validationSeedPolicy: "kfc-disjoint-rng-ranges.v1",
    validationSeedContext: hash(experiment),
    seeds,
    requestIds,
    publicationAllowed: false,
  };
  const declaration = {
    schema: "kfc-rogue-mutilate-frozen-validation-declaration.v1",
    expectedPlayerClass: 6,
    variant: "mutilate",
    sourceRole: "mutilate-closed-venom-families",
    backend,
    plan,
    coreSources: coreReferences,
    reservationPolicy: "kfc-rogue-mutilate-validation-reservation.v1",
  };
  const records = seeds.flatMap((seed, range) =>
    arms.map((arm, index) => ({
      seed,
      arm: arm.name,
      metric: {
        id: config.badRequestId && index === 0 ? "0".repeat(64) : requestIds[range * 2 + index],
        dps: 100 + (index ? (config.gain ?? 0.2) : 0),
        stdev: 1,
        iterations: 100000,
      },
    })),
  );
  const ranges = seeds.map((seed, range) => {
    const baseline = records[range * 2]!.metric,
      candidate = records[range * 2 + 1]!.metric;
    return {
      seed,
      baseline: { dps: baseline.dps, stdev: 1, iterations: 100000 },
      candidate: { dps: candidate.dps, stdev: 1, iterations: 100000 },
      difference: candidate.dps - baseline.dps,
      threshold: Math.max(0.001, 3 * Math.sqrt(2 / 100000)),
    };
  });
  const challengerConfirmedBetter = ranges.every((row) => row.difference > row.threshold),
    selectedConfirmedBetter = ranges.every((row) => -row.difference > row.threshold),
    uncertain = !challengerConfirmedBetter && !selectedConfirmedBetter;
  const strictPassed = !challengerConfirmedBetter;
  const strictStatus = challengerConfirmedBetter
    ? "challenger-confirmed-needs-new-feedback"
    : uncertain
      ? "validated-with-near-ties"
      : "validated";
  const comparison = {
    arm: arms[1]!.name,
    challengerConfirmedBetter,
    selectedConfirmedBetter,
    uncertain,
    averageChallengerDpsDifference: ranges.reduce((sum, row) => sum + row.difference, 0) / 2,
    comparisons: ranges,
  };
  const validation = {
    schema: "kfc-rogue-mutilate-independent-validation.v1",
    status: strictStatus,
    passed: config.strictPassed ?? strictPassed,
    selected: arms[0]!.settings,
    selectedFamily: "venom-0",
    selectedDps: 100,
    selectedIterations: 200000,
    comparisons: [comparison],
    records,
    coreSources: coreReferences,
    retainedVenomComparisonComplete: true,
    independentFinalValidation: true,
    publicationAllowed: false,
  };
  const declarationReference = seal("declaration", declaration);
  const result = seal("result", {
    schema: "kfc-bounded-native-study-result.v1",
    identity: hash(declaration),
    declaration: declarationReference,
    semantic: { evaluation: validation },
    publicationAllowed: false,
  });
  const completion = seal("completion", {
    schema: "kfc-bounded-native-study-completion.v1",
    identity: hash(declaration),
    result,
    publicationAllowed: false,
  });
  const gap = {
    arm: arms[1]!.name,
    confirmedBetter: challengerConfirmedBetter,
    averageDpsDifference: comparison.averageChallengerDpsDifference,
    relativeMeanGain: comparison.averageChallengerDpsDifference / 100,
    conservativeGapFraction: Math.max(
      0,
      ...ranges.map((row) => (row.difference + row.threshold) / row.baseline.dps),
    ),
  };
  const assessment = seal("assessment", {
    schema: "kfc-rogue-mutilate-practical-first-pass.v1",
    status: "accepted-with-disclosed-nearby-gains",
    profile: "rogue",
    variant: "mutilate",
    selectedArm: arms[0]!.name,
    selectedSettingsSha256: hash(arms[0]!.settings),
    referenceDps: 100,
    validationIterations: 200000,
    strictValidationPassed: strictPassed,
    strictValidationStatus: strictStatus,
    maximumRetainedGapFraction: 0.01,
    largestConservativeRetainedGapFraction: gap.conservativeGapFraction,
    retainedGaps: [gap],
    selectionChanged: false,
    globalOptimalityProven: false,
    deeperOptimizationDeferred: true,
    publicationAllowed: false,
    scope: "Unit-only bounded practical first pass; no actual research.",
  });
  const sourceInput = input(arms[0]!.settings, "unit-native-0"),
    browserInput = input(arms[0]!.settings, "unit-browser-0"),
    browserId = hash(browserInput);
  const nativeMetric = arms[0]!.inspected;
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
  const wasmMetric = { ...nativeMetric, id: browserId, dps: config.wasmDps ?? nativeMetric.dps };
  const wasm = seal("wasm", {
    id: browserId,
    playerClass: config.wasmClass ?? 6,
    admission: admission(browserId),
    error: "",
    activePlayers: 1,
    duration: 300,
    metric: wasmMetric,
    resultSha256: hash({ unitOnly: true }),
  });
  const parity = seal("parity", {
    schema: "kfc-rogue-mutilate-first-pass-parity.v1",
    status: "passed",
    sourceValidation: { completion, result, declaration: declarationReference },
    firstPass: assessment,
    selectedSettingsSha256: hash(arms[0]!.settings),
    prepared: {
      playerClass: 6,
      sourceInput,
      input: browserInput,
      sourceRequestId: hash(sourceInput),
      browserRequestId: browserId,
    },
    nativeOrigin: {
      arm: arms[0]!.name,
      response: {
        ...nativeMetric,
        dps: config.rawNativeDps ?? nativeMetric.dps,
        admission: admission(nativeMetric.id),
      },
    },
    browser: wasm,
    parity: {
      status: "passed",
      backend,
      sourceRequestId: hash(sourceInput),
      browserRequestId: browserId,
      native: nativeMetric,
      browser: wasmMetric,
    },
    errors: [],
    publicationAllowed: false,
  });
  const buildValue = {
    schema: "kfc-rogue-mutilate-first-pass-build.v1",
    status: "scenario-reviewed-local-export",
    profile: "rogue",
    variant: "mutilate",
    style: "mutilate",
    name: "Mutilate · first-pass tested",
    sourceRelease,
    revision: "unit-revision",
    dbSha256: databaseSha256,
    nativeBinarySha256: backend.binarySha256,
    faction: "Alliance",
    referenceDps: config.referenceDps ?? 100,
    validationIterations: 200000,
    settings: arms[0]!.settings,
    enchantPolicy: { provisionalEffectIds: [] },
    requiresProvisionalEnchantOptIn: false,
    evidence: {
      cores: coreReferences,
      validation: result,
      validationDeclaration: declarationReference,
      firstPass: assessment,
      parity,
    },
    scope: {
      name: "bounded-mutilate-practical-first-pass.v1",
      gearStable: true,
      talentRotationPoisonStable: true,
      retainedVenomComparisonComplete: true,
      independentIncumbentMeasurement: true,
      strictOptimalityCheckPassed: strictPassed,
      maximumRetainedGapFraction: 0.01,
      globalOptimalityProven: config.globalOptimality ?? false,
      exhaustiveRotationGridRequired: false,
      deeperOptimizationDeferred: true,
    },
    rotationGuidance: {
      schema: "kfc-rogue-mutilate-rotation-guidance.v1",
      rotationSha256: config.wrongGuidance
        ? "0".repeat(64)
        : hash(arms[0]!.settings.player.rotation),
      talents: "30/21/0",
      poisons,
      scenario: "Unit-only scenario",
      priorities: Array.from({ length: 5 }, (_, index) => "Unit-only instruction " + index),
      caveats: ["Unit-only fixture, never published"],
    },
    warnings: ["Unit fixture, not real research"],
    publicPromotion: false,
    browserHandoffRequired: true,
  };
  const build = seal("build", buildValue);
  const share = seal("share", {
    schema: "kfc-local-rogue-mutilate-first-pass-share.v1",
    status: "reviewed-local",
    campaignIdentity,
    caseId: "rogue-mutilate-static",
    profile: "rogue",
    variant: "mutilate",
    sourceRelease,
    build,
    requiresProvisionalEnchantOptIn: false,
    link: `http://localhost:3017/forever-sim/${sourceRelease}/rogue/#${"A".repeat(100)}`,
    combatSettingsSha256: hash({ unitOnly: true }),
    settingsNormalization: {
      schema: "kfc-level60-protobuf-combat-settings.v1",
      codecSha256: backend.codecSha256,
      scope: "Unit-only normalization",
    },
    checked: {
      exactSelectedSetup: true,
      actualRogueClass: true,
      all17SlotsAndEnchants: true,
      talentsRotationAndPoisons: true,
      nativeWasmParity: true,
      fullExportImportAndReload: config.exported ?? true,
      procConsentOffAfterImportAndReload: true,
      previousDeliveriesUnchanged: true,
      historicalCampaignUnchanged: true,
      presentationUnchanged: true,
    },
    warnings: buildValue.warnings,
    errors: [],
    nativeJobs: 0,
    browserCombatJobs: 0,
    publicPromotion: false,
  });
  const missing = (): never => {
    throw Object.assign(new Error("Missing unit document"), { code: "ENOENT" });
  };
  return {
    share,
    options: {
      campaignIdentity,
      sourceRelease,
      revision: "unit-revision",
      databaseSha256: async (): Promise<string> => databaseSha256,
      reference: async (ref): Promise<unknown> =>
        documents.has(ref.path) ? documents.get(ref.path) : missing(),
      read: async (path): Promise<unknown> =>
        path === "rogue-mutilate-first-pass-delivery.json"
          ? {
              schema: "kfc-local-mutilate-first-pass-delivery.v1",
              campaignIdentity,
              sourceRelease,
              share,
            }
          : missing(),
    },
  };
}

describe("practical Mutilate first-pass delivery", () => {
  it("accepts disclosed tiny gains without relabelling the failed strict optimum check", async () => {
    const value = fixture(),
      delivered = await readMutilateFirstPassSimulatorDelivery(value.share, value.options);
    expect(delivered.review.status).toBe("reviewed");
    expect(delivered.review.spec).toBe("rogue/mutilate");
    expect(delivered.review.referenceDps).toBe(100);
    expect(delivered.review.rotationGuidance?.talents).toBe("30/21/0");
    expect(delivered.review.rotationGuidance?.priorities).toHaveLength(5);
    expect(delivered.build.scope.strictOptimalityCheckPassed).toBe(false);
    expect(delivered.build.scope.globalOptimalityProven).toBe(false);
  });
  it.each([0, -1])(
    "preserves genuine strict-success/near-tie verdicts for gain %s",
    async (gain) => {
      const value = fixture({ gain });
      const delivered = await readMutilateFirstPassSimulatorDelivery(value.share, value.options);
      expect(delivered.build.scope.strictOptimalityCheckPassed).toBe(true);
      expect(delivered.build.scope.globalOptimalityProven).toBe(false);
    },
  );
  it.each<FixtureOptions>([
    { gain: 2 },
    { wasmClass: 9 },
    { wasmDps: 101 },
    { rawNativeDps: 101 },
    { strictPassed: true },
    { globalOptimality: true },
    { closed: false },
    { referenceDps: 101 },
    { exported: false },
    { wrongBackend: true },
    { missingSlot: true },
    { wrongGuidance: true },
    { wrongSourceRole: true },
    { badRequestId: true },
  ])("rejects changed resealed evidence %j", async (config) => {
    const value = fixture(config);
    await expect(
      readMutilateFirstPassSimulatorDelivery(value.share, value.options),
    ).rejects.toThrow();
  });
  it("rejects stale model/campaign references and checksum changes", async () => {
    const value = fixture();
    await expect(
      readMutilateFirstPassSimulatorDelivery(
        { ...value.share, sha256: "0".repeat(64) },
        value.options,
      ),
    ).rejects.toThrow(/checksum/);
    await expect(
      readMutilateFirstPassSimulatorDelivery(value.share, {
        ...value.options,
        campaignIdentity: "0".repeat(64),
      }),
    ).rejects.toThrow(/Stale/);
    await expect(
      readMutilateFirstPassSimulatorDelivery(value.share, {
        ...value.options,
        databaseSha256: async (): Promise<string> => "0".repeat(64),
      }),
    ).rejects.toThrow(/Stale/);
  });
  it("appends without replacing existing deliveries and leaves absent/stale pointers alone", async () => {
    const value = fixture(),
      cases = await appendMutilateFirstPassSimulatorDelivery({ ...value.options, cases: [] });
    expect(cases).toHaveLength(1);
    await expect(
      appendMutilateFirstPassSimulatorDelivery({ ...value.options, cases }),
    ).rejects.toThrow(/cannot replace/);
    expect(
      await appendMutilateFirstPassSimulatorDelivery({
        ...value.options,
        sourceRelease: "0".repeat(24),
        cases,
      }),
    ).toBe(cases);
    expect(
      await appendMutilateFirstPassSimulatorDelivery({
        ...value.options,
        cases,
        read: async (): Promise<unknown> => {
          throw Object.assign(new Error("Missing"), { code: "ENOENT" });
        },
      }),
    ).toBe(cases);
  });
});
