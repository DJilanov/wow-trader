import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appendFirstPassSimulatorDeliveries,
  readFirstPassSimulatorDelivery,
} from "./forever-simulator-first-pass-reviews";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const release = "a".repeat(24),
  campaignIdentity = "b".repeat(64),
  dbSha256 = "c".repeat(64);
interface FixtureOptions {
  readonly closed?: boolean;
  readonly challengerDps?: number;
  readonly validationDps?: number;
  readonly parityDps?: number;
  readonly approved?: boolean;
  readonly href?: string;
  readonly seedOffset?: number;
}
function fixture(config: FixtureOptions = {}): {
  readonly records: Map<string, unknown>;
  readonly share: { readonly path: string; readonly sha256: string };
  readonly options: Parameters<typeof readFirstPassSimulatorDelivery>[1];
} {
  const records = new Map<string, unknown>();
  const seal = (
    name: string,
    value: unknown,
  ): { readonly path: string; readonly sha256: string } => {
    const path = `synthetic-unit-test-only/${name}.json`;
    records.set(path, value);
    return { path, sha256: hash(value) };
  };
  const settings = {
    player: {
      equipment: {
        items: Array.from({ length: 17 }, (_, slot) => (slot === 15 ? {} : { id: slot + 100 })),
      },
      talentsString: "synthetic-talents",
      rotation: { priorityList: [{ action: { castSpell: { spellId: { spellId: 1 } } } }] },
      consumes: { mainHandImbue: "DenseSharpeningStone" },
    },
    encounter: { duration: 300 },
  };
  const backend = {
    kind: "admitted-native.v1",
    binarySha256: "d".repeat(64),
    compiledDatabaseSha256: dbSha256,
    runnerSourceSha256: "e".repeat(64),
    codecSha256: "f".repeat(64),
  };
  const sourceFeedback = seal("source-feedback", { synthetic: true });
  const coreDeclaration = seal("core-declaration", {
    schema: "kfc-two-hand-fury-bounded-core-declaration.v1",
    backend,
    sourceFeedback,
  });
  const core = seal("core", {
    schema: "kfc-bounded-native-study-result.v1",
    identity: coreDeclaration.sha256,
    declaration: coreDeclaration,
    semantic: {
      evaluation: {
        schema: "kfc-two-hand-fury-bounded-core-loop.v1",
        closed: config.closed ?? true,
        settings,
        gearEvidence: {
          stable: true,
          settings,
          gear: settings.player.equipment,
          policy: { finalistSeed: 77191 },
        },
        feedbackEvidence: {
          stable: true,
          settings,
          talentsString: settings.player.talentsString,
          rotation: settings.player.rotation,
        },
        independentFinalValidation: false,
        publicationAllowed: false,
      },
    },
    publicationAllowed: false,
  });
  const input = (
    value: typeof settings,
    iterations: number,
    seed: number,
  ): Record<string, unknown> => ({
    requestBase64: "synthetic-request-not-executed",
    gear: value.player.equipment.items,
    talentsString: value.player.talentsString,
    rotation: value.player.rotation,
    iterations,
    seed,
    detail: false,
  });
  const item = structuredClone(settings);
  item.player.equipment.items[0] = { id: 999 };
  const talent = structuredClone(settings);
  talent.player.talentsString = "synthetic-alternative";
  const arms = [
    { name: "selected", settings },
    { name: "item-challenger", settings: item },
    { name: "talent-challenger", settings: talent },
  ].map((arm, index) => ({
    ...arm,
    inspected: {
      id: hash(input(arm.settings, 10000, 77191)),
      dps: 900 - index,
      stdev: 2,
      iterations: 10000,
    },
  }));
  const experiment = {
    schema: "kfc-two-hand-fury-frozen-validation-experiment.v1",
    source: core,
    arms,
    iterations: 100000,
    policy: "Synthetic fixture only, no game measurements.",
  };
  const validationSeedContext = hash(experiment),
    start = 100000000 + Number.parseInt(validationSeedContext.slice(0, 8), 16) * 1000000 + 200000;
  const seeds = [start + (config.seedOffset ?? 0), start + 100000];
  const plan = {
    ...experiment,
    validationSeedPolicy: "kfc-disjoint-rng-ranges.v1",
    validationSeedContext,
    seeds,
    scope: "Synthetic unit-test fixture only.",
  };
  const validationDeclaration = seal("validation-declaration", {
    schema: "kfc-two-hand-fury-frozen-validation-declaration.v1",
    sourceCore: core,
    backend,
    templates: [
      { imbue: "DenseSharpeningStone", requestBase64: "synthetic-request-not-executed" },
      { imbue: "DenseWeightstone", requestBase64: "synthetic-blunt-request-not-executed" },
    ],
    plan,
  });
  const checkedRecords = seeds.flatMap((seed) =>
    arms.map((arm, index) => ({
      seed,
      arm: arm.name,
      metric: {
        id: hash(input(arm.settings, 100000, seed)),
        dps: index === 1 ? (config.challengerDps ?? 898) : 900 - index,
        stdev: 2,
        iterations: 100000,
      },
    })),
  );
  const validation = seal("validation", {
    schema: "kfc-bounded-native-study-result.v1",
    identity: validationDeclaration.sha256,
    declaration: validationDeclaration,
    semantic: {
      evaluation: {
        schema: "kfc-two-hand-fury-independent-validation.v1",
        status: "first-pass-validated",
        passed: true,
        selected: settings,
        selectedDps: config.validationDps ?? 900,
        selectedIterations: 200000,
        records: checkedRecords,
        comparisons: arms.slice(1).map((arm, index) => ({
          arm: arm.name,
          challengerConfirmedBetter: false,
          selectedConfirmedBetter: true,
          uncertain: false,
          averageChallengerDpsDifference: index === 0 ? (config.challengerDps ?? 898) - 900 : -2,
        })),
        independentFinalValidation: true,
        publicationAllowed: false,
      },
    },
    publicationAllowed: false,
  });
  const parityInput = input(settings, 10000, 77191),
    native = { id: hash(parityInput), dps: 900, stdev: 2, iterations: 10000 };
  const parity = seal("parity", {
    schema: "kfc-two-hand-fury-feedback-native-wasm-parity.v1",
    status: "passed",
    source: sourceFeedback,
    backend,
    input: parityInput,
    native: { ...native, admission: { error: "", activePlayers: 1, warnings: [] } },
    browser: {
      ...native,
      id: hash("synthetic-derived-browser-request"),
      dps: config.parityDps ?? 900,
    },
    errors: [],
    nativeJobs: 0,
    browserJobs: 1,
  });
  const warnings = [
    "Synthetic unit-test fixtures, never real player recommendations or measurements.",
  ];
  const build = seal("build", {
    schema: "kfc-first-pass-simulator-build.v1",
    status: "scenario-reviewed-local-export",
    profile: "warrior",
    variant: "fury",
    style: "two-hand-fury",
    name: "Two-hand Fury · Standard enchants",
    faction: "Horde",
    sourceRelease: release,
    revision: "synthetic-revision",
    dbSha256,
    nativeBinarySha256: backend.binarySha256,
    referenceDps: 900,
    validationIterations: 200000,
    settings,
    enchantPolicy: { provisionalEffectIds: [] },
    requiresProvisionalEnchantOptIn: false,
    evidence: { core, coreDeclaration, validation, validationDeclaration, parity },
    scope: {
      name: "bounded-first-pass-with-independent-finalists.v1",
      gearStable: true,
      talentRotationStable: true,
      independentValidation: true,
      exhaustiveRotationGridRequired: false,
      globalOptimalityProven: false,
    },
    warnings,
    publicPromotion: false,
    browserHandoffRequired: true,
  });
  const share = seal("share", {
    schema: "kfc-local-first-pass-build-share.v1",
    status: "reviewed-local",
    campaignIdentity,
    caseId: "two-hand-fury-static",
    sourceRelease: release,
    build,
    requiresProvisionalEnchantOptIn: false,
    link: config.href ?? `http://localhost:3017/forever-sim/${release}/warrior/#${"A".repeat(80)}`,
    combatSettingsSha256: hash(settings),
    settingsNormalization: {
      schema: "kfc-level60-protobuf-combat-settings.v1",
      codecSha256: hash("synthetic-normalizer"),
      scope: "Synthetic normalization fixture only.",
    },
    checked: {
      exactSelectedSetup: config.approved ?? true,
      all17SlotsAndEnchants: true,
      nativeWasmParityReused: true,
      fullExportImportAndReload: true,
      procConsentOffAfterImportAndReload: true,
      previousDeliveryUnchanged: true,
      historicalCampaignUnchanged: true,
    },
    warnings,
    nativeJobs: 0,
    browserCombatJobs: 0,
    publicPromotion: false,
  });
  records.set("first-pass-deliveries.json", {
    schema: "kfc-local-first-pass-deliveries.v1",
    campaignIdentity,
    sourceRelease: release,
    cases: { "two-hand-fury-static": share },
  });
  const get = async (path: string): Promise<unknown> => {
    if (!records.has(path))
      throw Object.assign(new Error("Missing synthetic fixture"), { code: "ENOENT" });
    return records.get(path);
  };
  return {
    records,
    share,
    options: {
      campaignIdentity,
      sourceRelease: release,
      revision: "synthetic-revision",
      read: get,
      reference: (ref) => get(ref.path),
      databaseSha256: async () => dbSha256,
    },
  };
}

describe("first-pass simulator deliveries", () => {
  it("requires the genuine new contract and returns a distinct two-hand label and actual precision", async () => {
    const value = fixture(),
      result = await readFirstPassSimulatorDelivery(value.share, value.options);
    expect(result.review).toMatchObject({
      id: "two-hand-fury-static",
      displayName: "Two-hand Fury · Standard enchants",
      validationIterations: 200000,
      referenceDps: 900,
      requiresProvisionalEnchantOptIn: false,
    });
    expect(result.build.scope.globalOptimalityProven).toBe(false);
  });
  it("appends without manufacturing or replacing a historical campaign case", async () => {
    const value = fixture();
    const historical = {
      id: "arms-test",
      spec: "warrior/arms",
      faction: "alliance",
      scenario: "conservative",
      stage: "reviewed",
      status: "reviewed" as const,
      href: null,
      referenceDps: 800,
      requiresProvisionalEnchantOptIn: false,
      warnings: [],
    };
    const result = await appendFirstPassSimulatorDeliveries({
      ...value.options,
      cases: [historical],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(historical);
    await expect(
      appendFirstPassSimulatorDeliveries({
        ...value.options,
        cases: [{ ...historical, id: "two-hand-fury-static" }],
      }),
    ).rejects.toThrow(/overwrite/);
  });
  it("leaves old installations alone when the optional pointer is absent or stale", async () => {
    const value = fixture(),
      cases: [] = [];
    value.records.delete("first-pass-deliveries.json");
    expect(await appendFirstPassSimulatorDeliveries({ ...value.options, cases })).toBe(cases);
    const stale = fixture();
    expect(
      await appendFirstPassSimulatorDeliveries({
        ...stale.options,
        sourceRelease: "f".repeat(24),
        cases,
      }),
    ).toBe(cases);
  });
  it.each([
    { closed: false },
    { challengerDps: 905 },
    { validationDps: 901 },
    { parityDps: 901 },
    { approved: false },
    { seedOffset: 1 },
  ])("rejects resealed incomplete or contradictory evidence: %j", async (config) => {
    const value = fixture(config);
    await expect(readFirstPassSimulatorDelivery(value.share, value.options)).rejects.toThrow();
  });
  it("rejects stale catalog, revision, campaign and unsealed evidence", async () => {
    const value = fixture();
    for (const options of [
      { ...value.options, revision: "different" },
      { ...value.options, campaignIdentity: "f".repeat(64) },
      { ...value.options, databaseSha256: async () => "f".repeat(64) },
    ])
      await expect(readFirstPassSimulatorDelivery(value.share, options)).rejects.toThrow();
    value.records.set(value.share.path, { synthetic: "tampered" });
    await expect(readFirstPassSimulatorDelivery(value.share, value.options)).rejects.toThrow(
      /checksum/,
    );
  });
  it.each([
    "https://example.com",
    "http://user:password@localhost:3017",
    "http://localhost:3017/other",
  ])("rejects a nonlocal or unexpected share destination: %s", async (prefix) => {
    const value = fixture({ href: `${prefix}#${"A".repeat(100)}` });
    await expect(readFirstPassSimulatorDelivery(value.share, value.options)).rejects.toThrow();
  });
});
