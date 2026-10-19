import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyBoundedLocalSimulatorDeliveries,
  type BoundedDeliveryOptions,
} from "./forever-simulator-bounded-reviews";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

interface Ref {
  readonly path: string;
  readonly sha256: string;
}
interface BuildFixture {
  schema: string;
  sourceRelease: string;
  revision: string;
  dbSha256: string;
  referenceDps: number;
  requiresProvisionalEnchantOptIn: boolean;
  publicPromotion: boolean;
  settings: Record<string, unknown>;
  scope: { exhaustiveRotationGridRequired: boolean; globalOptimalityProven: boolean };
  evidence: { closing: Ref; baseline: Ref; accessories: Ref; parity: Ref };
}
interface ShareFixture {
  caseId: string;
  sourceRelease: string;
  campaignIdentity: string;
  build: Ref;
  supersedesExport: Ref;
  link: string;
  requiresProvisionalEnchantOptIn: boolean;
  combatSettingsSha256: string;
  checked: { procConsentOffAfterImportAndReload: boolean; fullExportImportAndReload: boolean };
}
interface PointerFixture {
  schema: string;
  sourceRelease: string;
  campaignIdentity: string;
  cases: Record<string, { supersedesExportSha256: string; share: Ref }>;
}
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function syntheticEvidence(): {
  readonly records: Map<string, unknown>;
  readonly sharePath: string;
  readonly share: ShareFixture;
  readonly build: BuildFixture;
} {
  const records = new Map<string, unknown>();
  const record = (name: string, value: unknown): Ref => {
    const path = `synthetic-unit-only/${name}.json`;
    records.set(path, value);
    return { path, sha256: hash(value) };
  };
  const release = "e".repeat(24),
    revision = "synthetic-revision",
    dbSha256 = "c".repeat(64),
    binarySha256 = "d".repeat(64);
  const gear = { items: Array.from({ length: 17 }, (_, index) => ({ id: 100 + index })) };
  const rotation = {
    type: "TypeAPL",
    priorityList: [{ action: { castSpell: { spellId: { spellId: 23894 } } } }],
  };
  const settings = {
    player: { equipment: gear, talentsString: "synthetic-talents", rotation, race: "RaceOrc" },
    settings: { faction: "Horde" },
    encounter: { duration: 300 },
  };
  const request = {
    requestBase64: "synthetic-request-never-executed",
    gear: gear.items,
    talentsString: settings.player.talentsString,
    rotation,
    iterations: 25,
    seed: 1337,
    detail: false,
  };
  const id = hash(request),
    metric = { id, dps: 900, stdev: 2, iterations: 25 };
  const parity = record("parity", {
    request,
    native: metric,
    wasm: {
      requestSha256: id,
      error: "",
      activePlayers: 1,
      metric,
      admission: {
        id,
        error: "",
        parties: 1,
        slots: 5,
        activePlayers: 1,
        priority: 1,
        prepull: 0,
        warnings: [],
      },
    },
  });
  const baseline = record("baseline", {
    schema: "kfc-optimization-baseline.v1",
    profile: "warrior",
    variant: "fury",
    sourceRelease: release,
    revision,
    dbSha256,
    requestBase64: request.requestBase64,
    settings,
  });
  const search = record("search", {
    schema: "kfc-current-spearing-talent-feedback.v2",
    selected: { talents: settings.player.talentsString, resolvedRotation: rotation },
    parityRecords: [parity],
  });
  const talents = record("talents", {
    schema: "kfc-readonly-corrected-spearing-talent-review.v1",
    status: "passed-corrected-talent-feedback-needs-gear-adapter",
    source: search,
  });
  const evaluation = {
    schema: "synthetic-evaluation",
    requiresFeedback: false,
    selectedGear: gear,
  };
  const selectedResult = record("selected-result", {
    schema: "kfc-selected-fury-context-result.v1",
    status: "selected-context-no-confirmed-challenger",
    evaluation,
  });
  const selectedReplay = record("selected-replay", {
    schema: "kfc-selected-fury-context-replay.v1",
    status: "passed-selected-context-no-confirmed-challenger",
    evaluationSha256: hash(evaluation),
  });
  const selectedContext = record("selected-completion", {
    schema: "kfc-selected-fury-context-completion.v1",
    result: selectedResult,
    replay: selectedReplay,
  });
  const closing = record("closing", {
    schema: "kfc-corrected-spearing-closing-talent-applicability.v2",
    status: "unchanged-context-talent-feedback-reused",
    closedCoreLoop: true,
    publicationAllowed: false,
    references: { baseline, search, talentReplay: talents },
    selected: { gear, talents: settings.player.talentsString, rotation },
    selectedContextSupplement: { completion: selectedContext },
    context: {
      backend: { kind: "admitted-native.v1", binarySha256, compiledDatabaseSha256: dbSha256 },
    },
    observations: Array.from({ length: 4 }, (_, index) => ({
      role: "baseline",
      dps: 900,
      stdev: 2,
      iterations: 100000,
      input: { ...request, iterations: 100000, seed: 100000000 + index * 100000 },
    })),
    representedIterations: 400000,
    referenceDps: 900,
  });
  const cases = ["trinkets", "rings"].map((kind) =>
    record(kind, {
      schema: "kfc-spearing-accessory-result.v2",
      status: "no-confirmed-challenger",
      kind,
      incumbent: { gear },
    }),
  );
  const accessoryResult = record("accessory-result", {
    schema: "kfc-corrected-spearing-accessory-cohort-result.v1",
    status: "no-confirmed-accessory-challenger-needs-rotation",
    closing,
    cases,
  });
  const accessoryReplay = record("accessory-replay", {
    schema: "kfc-spearing-accessory-replay.v1",
    status: "passed-no-confirmed-accessory-challenger",
    nativeJobs: 0,
    sourceCacheWrites: 0,
  });
  const accessories = record("accessories", {
    schema: "kfc-corrected-spearing-accessory-completion.v1",
    status: "no-confirmed-accessory-challenger-needs-rotation",
    result: accessoryResult,
    replay: accessoryReplay,
  });
  const warnings = ["Synthetic unit-test fixture only; not measured game evidence."];
  const build = {
    schema: "kfc-bounded-spearing-build.v1",
    status: "scenario-reviewed-local-export",
    profile: "warrior",
    variant: "fury",
    sourceRelease: release,
    revision,
    dbSha256,
    nativeBinarySha256: binarySha256,
    referenceDps: 900,
    validationIterations: 400000,
    settings,
    enchantPolicy: { provisionalEffectIds: [1900] },
    requiresProvisionalEnchantOptIn: true,
    evidence: {
      closing,
      baseline,
      talents,
      selectedContext,
      accessories,
      accessoryResult,
      accessoryReplay,
      parity,
    },
    scope: {
      name: "bounded-reviewed-talent-apl-and-all-slot-feedback.v1",
      exhaustiveRotationGridRequired: false,
      globalOptimalityProven: false,
    },
    warnings,
    publicPromotion: false,
    browserHandoffRequired: true,
  };
  const buildReference = record("build", build),
    supersedesExport = record("old-export", { schema: "synthetic-reviewed-predecessor" });
  const share = {
    schema: "kfc-local-bounded-build-share.v1",
    status: "reviewed-local",
    campaignIdentity: "b".repeat(64),
    caseId: "fury-procs",
    sourceRelease: release,
    build: buildReference,
    supersedesExport,
    requiresProvisionalEnchantOptIn: true,
    link: `http://localhost:3017/forever-sim/${release}/warrior#${"A".repeat(80)}`,
    combatSettingsSha256: hash({ player: settings.player, encounter: settings.encounter }),
    checked: {
      exactSelectedSetup: true,
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
  };
  const shareReference = record("share", share);
  return { records, sharePath: shareReference.path, share, build };
}
const graph = syntheticEvidence(),
  cache = graph.records;
async function saved(path: string, maximumBytes = 8_000_000): Promise<unknown> {
  if (!cache.has(path)) throw new Error("Missing synthetic test reference");
  if (JSON.stringify(cache.get(path)).length > maximumBytes)
    throw new Error("Test evidence exceeds production bound");
  return cache.get(path);
}
const sharePath = graph.sharePath,
  shareValue = graph.share,
  buildValue = graph.build;

function fixture(): {
  options: BoundedDeliveryOptions;
  pointer: PointerFixture;
  share: ShareFixture;
  build: BuildFixture;
  seal: () => void;
  missing: Set<string>;
} {
  const share = structuredClone(shareValue),
    build = structuredClone(buildValue),
    missing = new Set<string>();
  const overrides = new Map<string, unknown>([
    [sharePath, share],
    [share.build.path, build],
  ]);
  const pointer: PointerFixture = {
    schema: "kfc-local-bounded-deliveries.v1",
    campaignIdentity: share.campaignIdentity,
    sourceRelease: share.sourceRelease,
    cases: {
      [share.caseId]: {
        supersedesExportSha256: share.supersedesExport.sha256,
        share: { path: sharePath, sha256: hash(share) },
      },
    },
  };
  const previous: LocalSimulatorBuildReview = {
    id: share.caseId,
    spec: "warrior/fury",
    faction: "horde",
    scenario: "provisional-procs",
    stage: "calculations reviewed",
    status: "reviewed",
    href: "/prior-reviewed-build",
    referenceDps: 800,
    requiresProvisionalEnchantOptIn: true,
    warnings: [],
  };
  const read = async (path: string, maximumBytes: number): Promise<unknown> => {
    if (missing.has(path))
      throw Object.assign(new Error("Test missing evidence"), { code: "ENOENT" });
    if (path === "bounded-deliveries.json") return pointer;
    return overrides.has(path) ? overrides.get(path) : saved(path, maximumBytes);
  };
  const options: BoundedDeliveryOptions = {
    cases: [previous],
    predecessors: new Map([[share.caseId, share.supersedesExport.sha256]]),
    campaignIdentity: share.campaignIdentity,
    sourceRelease: share.sourceRelease,
    revision: build.revision,
    read,
    reference: async (ref: Ref, maximumBytes = 8_000_000): Promise<unknown> => {
      const value = await read(ref.path, maximumBytes);
      if (hash(value) !== ref.sha256) throw new Error("Test evidence hash mismatch");
      return value;
    },
    databaseSha256: async () => buildValue.dbSha256,
  };
  const seal = (): void => {
    share.build = { ...share.build, sha256: hash(build) };
    pointer.cases[share.caseId]!.share = { path: sharePath, sha256: hash(share) };
  };
  return { options, pointer, share, build, seal, missing };
}

describe("bounded local simulator delivery", () => {
  it("accepts a complete bounded fixture without requiring exhaustive research or changing consent", async () => {
    const value = fixture(),
      rows = await applyBoundedLocalSimulatorDeliveries(value.options);
    expect(rows[0]).toMatchObject({
      status: "reviewed",
      stage: "bounded calculations reviewed",
      referenceDps: 900,
      requiresProvisionalEnchantOptIn: true,
    });
    expect(rows[0]?.href).toBe(new URL(shareValue.link).pathname + new URL(shareValue.link).hash);
    expect(value.options.cases[0]?.href).toBe("/prior-reviewed-build");
  });
  it("keeps the prior result when the optional pointer is missing or belongs to another release/campaign", async () => {
    const absent = fixture();
    absent.missing.add("bounded-deliveries.json");
    expect(await applyBoundedLocalSimulatorDeliveries(absent.options)).toBe(absent.options.cases);
    for (const field of ["sourceRelease", "campaignIdentity"] as const) {
      const value = fixture();
      value.pointer[field] = "f".repeat(field === "sourceRelease" ? 24 : 64);
      expect(await applyBoundedLocalSimulatorDeliveries(value.options)).toBe(value.options.cases);
    }
  });
  it("rejects stale predecessors, unfinished cases and unrelated specs rather than approving them", async () => {
    for (const changes of [
      { status: "waiting" as const },
      { spec: "warrior/arms" },
      { scenario: "conservative" },
      { faction: "alliance" },
    ]) {
      const value = fixture();
      await expect(
        applyBoundedLocalSimulatorDeliveries({
          ...value.options,
          cases: [{ ...value.options.cases[0]!, ...changes }],
        }),
      ).rejects.toThrow();
    }
    const value = fixture();
    value.pointer.cases[value.share.caseId]!.supersedesExportSha256 = "0".repeat(64);
    await expect(applyBoundedLocalSimulatorDeliveries(value.options)).rejects.toThrow(
      /predecessor/,
    );
  });
  it("rejects rehashed wrong models, benchmarks, global claims and consent", async () => {
    for (const mutate of [
      (build: BuildFixture): void => {
        build.dbSha256 = "0".repeat(64);
      },
      (build: BuildFixture): void => {
        build.revision = "wrong";
      },
      (build: BuildFixture): void => {
        build.referenceDps += 100;
      },
      (build: BuildFixture): void => {
        build.requiresProvisionalEnchantOptIn = false;
      },
      (build: BuildFixture): void => {
        build.scope.globalOptimalityProven = true;
      },
      (build: BuildFixture): void => {
        build.publicPromotion = true;
      },
    ]) {
      const value = fixture();
      mutate(value.build);
      value.seal();
      await expect(applyBoundedLocalSimulatorDeliveries(value.options)).rejects.toThrow();
    }
  });
  it("rejects rehashed selected gear/settings changes even when the share settings digest is updated", async () => {
    const value = fixture();
    const player = structuredClone(value.build.settings.player) as {
      equipment: { items: { id: number }[] };
    };
    player.equipment.items[0]!.id = 1;
    value.build.settings.player = player;
    value.share.combatSettingsSha256 = hash(
      Object.fromEntries(
        ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
          .filter((key) => value.build.settings[key] !== undefined)
          .map((key) => [key, value.build.settings[key]]),
      ),
    );
    value.seal();
    await expect(applyBoundedLocalSimulatorDeliveries(value.options)).rejects.toThrow(
      /selected setup/,
    );
  });
  it("rejects missing/corrupt current evidence rather than silently falling back to the old build", async () => {
    const missing = fixture();
    missing.missing.add(missing.build.evidence.closing.path);
    await expect(applyBoundedLocalSimulatorDeliveries(missing.options)).rejects.toThrow(
      /missing evidence/,
    );
    const corrupt = fixture();
    corrupt.build.referenceDps += 1;
    await expect(applyBoundedLocalSimulatorDeliveries(corrupt.options)).rejects.toThrow(
      /hash mismatch/,
    );
  });
  it("requires real import/reload/consent checks and loopback-only links", async () => {
    for (const mutate of [
      (share: ShareFixture): void => {
        share.checked.fullExportImportAndReload = false;
      },
      (share: ShareFixture): void => {
        share.checked.procConsentOffAfterImportAndReload = false;
      },
      (share: ShareFixture): void => {
        share.link = share.link.replace("http://localhost:3017", "https://example.com");
      },
      (share: ShareFixture): void => {
        share.requiresProvisionalEnchantOptIn = false;
      },
    ]) {
      const value = fixture();
      mutate(value.share);
      value.seal();
      await expect(applyBoundedLocalSimulatorDeliveries(value.options)).rejects.toThrow();
    }
  });
});
