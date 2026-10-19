import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import saved from "./fixtures/subtlety-first-pass-delivery.json";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import {
  appendSubtletyFirstPassSimulatorDelivery,
  readSubtletyFirstPassSimulatorDelivery,
} from "./forever-simulator-subtlety-reviews";

interface MutableReference {
  path: string;
  sha256: string;
}
interface Fixture {
  readonly share: MutableReference;
  readonly documents: Map<string, unknown>;
  readonly reads: string[];
  readonly options: Parameters<typeof readSubtletyFirstPassSimulatorDelivery>[1];
  readonly shareDocument: Record<string, unknown>;
  readonly buildDocument: Record<string, unknown>;
  readonly resealShare: () => void;
  readonly resealBuild: () => void;
  readonly installPointer: (changes?: Readonly<Record<string, unknown>>) => void;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function objectAt(root: unknown, ...path: readonly (string | number)[]): Record<string, unknown> {
  let value = root;
  for (const part of path) {
    if (typeof part === "number" && Array.isArray(value)) value = value[part];
    else if (typeof part === "string" && isObject(value)) value = value[part];
    else throw new Error("Missing fixture node: " + path.join("/"));
  }
  if (!isObject(value)) throw new Error("Fixture node is not an object: " + path.join("/"));
  return value;
}

function fixture(): Fixture {
  // Genuine immutable evidence copied from the completed handoff; never dispatched to an engine.
  const original: Readonly<Record<string, unknown>> = saved.documents;
  const documents = new Map<string, unknown>(Object.entries(structuredClone(original))),
    share = structuredClone(saved.share),
    reads: string[] = [];
  const shareDocument = objectAt(documents.get(share.path)),
    buildDocument = objectAt(documents.get(saved.build.path));
  function resealShare(): void {
    share.sha256 = hash(shareDocument);
  }
  function resealBuild(): void {
    objectAt(shareDocument, "build").sha256 = hash(buildDocument);
    resealShare();
  }
  async function read(path: string, maximumBytes = 4_000_000): Promise<unknown> {
    reads.push(path);
    const value = documents.get(path);
    if (value === undefined)
      throw Object.assign(new Error("Missing fixture: " + path), { code: "ENOENT" });
    if (JSON.stringify(value).length > maximumBytes)
      throw new Error("Fixture exceeds requested bound");
    return value;
  }
  return {
    share,
    documents,
    reads,
    shareDocument,
    buildDocument,
    resealShare,
    resealBuild,
    options: {
      campaignIdentity: saved.campaignIdentity,
      sourceRelease: saved.sourceRelease,
      revision: saved.revision,
      read,
      // The adapter must check hashes itself, not trust a permissive transport fixture.
      reference: async (ref, maximumBytes): Promise<unknown> => read(ref.path, maximumBytes),
      databaseSha256: async (): Promise<string> => saved.databaseSha256,
    },
    installPointer: (changes = {}): void => {
      documents.set("rogue-subtlety-first-pass-delivery.json", {
        schema: "kfc-local-subtlety-first-pass-delivery.v1",
        campaignIdentity: saved.campaignIdentity,
        sourceRelease: saved.sourceRelease,
        share,
        ...changes,
      });
    },
  };
}

describe("Subtlety practical first-pass delivery", () => {
  it("authenticates the real8-frame/24-origin handoff, preserves its exact build and14-priority introduction, and leaves sources untouched", async () => {
    const value = fixture(),
      before = hash([...value.documents]);
    const delivery = await readSubtletyFirstPassSimulatorDelivery(value.share, value.options);
    expect(hash(delivery.build)).toBe(saved.build.sha256);
    expect(delivery.review.id).toBe("rogue-subtlety-static");
    expect(delivery.review.validationIterations).toBe(40000);
    expect(delivery.review.referenceDps).toBe(629.2026287993656);
    expect(delivery.review.rotationGuidance?.priorities).toHaveLength(14);
    expect(delivery.review.rotationGuidance?.instruction).toContain("first available action");
    expect(delivery.build.scope.gearGloballyConverged).toBe(false);
    expect(delivery.build.scope.globalOptimalityProven).toBe(false);
    expect(delivery.build.publicPromotion).toBe(false);
    expect(hash([...value.documents])).toBe(before);
    expect(value.reads).toHaveLength(8);
    expect(value.reads.some((path) => path.endsWith("result-2af874d6e31bc8f5.json"))).toBe(false);
  });

  it("refuses stale campaigns, source releases, revisions and catalog hashes", async () => {
    for (const change of [
      { campaignIdentity: "0".repeat(64) },
      { sourceRelease: "0".repeat(24) },
      { revision: "wrong-revision" },
      { databaseSha256: async (): Promise<string> => "0".repeat(64) },
    ]) {
      const value = fixture();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, { ...value.options, ...change }),
      ).rejects.toThrow(/Stale/);
    }
  });

  it("checks evidence checksums even when transport returns a changed document", async () => {
    const value = fixture();
    value.buildDocument.referenceDps = 9999;
    await expect(
      readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
    ).rejects.toThrow(/checksum/);
  });

  it("refuses resealed class/gear/precision/proc/global-convergence or unmeasured-selection changes", async () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        objectAt(value.buildDocument, "settings", "player").class = "ClassWarrior";
      },
      (value) => {
        objectAt(value.buildDocument, "settings", "player").foreverTier1Bonuses = true;
      },
      (value) => {
        objectAt(value.buildDocument, "settings", "player", "equipment", "items", 0).id = 16863;
      },
      (value) => {
        value.buildDocument.validationIterations = 200000;
      },
      (value) => {
        value.buildDocument.referenceDps = 9999;
      },
      (value) => {
        objectAt(value.buildDocument, "scope").gearGloballyConverged = true;
      },
      (value) => {
        objectAt(value.buildDocument, "scope").deeperOptimizationDeferred = false;
      },
      (value) => {
        objectAt(value.buildDocument, "enchantPolicy").provisionalEffectIds = [1900];
      },
    ];
    for (const change of changes) {
      const value = fixture();
      change(value);
      value.resealBuild();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("rejects lost, reordered, re-sampled or substituted original request frames", async () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        value.shareDocument.requestFrames = [];
      },
      (value) => {
        objectAt(value.shareDocument, "requestFrames", 0, "inspectedInput").iterations = 100000;
      },
      (value) => {
        objectAt(value.shareDocument, "requestFrames", 0, "inspectedInput").requestBase64 = "AQ==";
      },
      (value) => {
        objectAt(value.shareDocument, "requestFrames", 0, "inspectedInput").seed = 1337;
      },
      (value) => {
        objectAt(value.shareDocument, "requestFrames", 0).arm = "talent-best";
      },
    ];
    for (const change of changes) {
      const value = fixture();
      change(value);
      value.resealShare();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("refuses invented scalars, imported-as-fresh evidence, missing admissions or a changed journal byte identity", async () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        value.shareDocument.nativeOrigins = [];
      },
      (value) => {
        objectAt(value.shareDocument, "nativeOrigins", 0, "response").dps = 9999;
      },
      (value) => {
        objectAt(value.shareDocument, "nativeOrigins", 8, "journal").imported = true;
      },
      (value) => {
        objectAt(value.shareDocument, "nativeOrigins", 0, "response", "admission").error =
          "not admitted";
      },
      (value) => {
        objectAt(value.shareDocument, "nativeOrigins", 0, "journal").byteSha256 = "0".repeat(64);
      },
      (value) => {
        objectAt(value.shareDocument, "nativeOrigins", 0, "response").iterations = 20000;
      },
    ];
    for (const change of changes) {
      const value = fixture();
      change(value);
      value.resealShare();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("requires the genuine rotation introduction/action bindings and the completed no-auto-sim/proc-off handoff", async () => {
    for (const field of [
      "fullExportImportAndReload",
      "noAutomaticSimulation",
      "procConsentOffAfterImportAndReload",
      "nativeWasmParityReused",
    ]) {
      const value = fixture();
      objectAt(value.shareDocument, "checked")[field] = false;
      value.resealShare();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
    for (const field of ["instruction", "priorityBindings"]) {
      const value = fixture();
      objectAt(value.buildDocument, "rotationGuidance")[field] = field === "instruction" ? "" : [];
      value.resealBuild();
      await expect(
        readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("rejects external build links and traversal before reading escaped evidence", async () => {
    const value = fixture();
    value.shareDocument.link = "https://example.invalid/rogue#" + "A".repeat(100);
    value.resealShare();
    await expect(
      readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
    ).rejects.toThrow(/link/);
    const escaped = fixture();
    await expect(
      readSubtletyFirstPassSimulatorDelivery(
        {
          path: "artifacts/forever-simulator/optimization/../../secrets.json",
          sha256: "0".repeat(64),
        },
        escaped.options,
      ),
    ).rejects.toThrow();
    expect(escaped.reads).toHaveLength(0);
  });

  it("keeps existing cases when the optional pointer is missing or stale", async () => {
    const value = fixture(),
      cases: readonly LocalSimulatorBuildReview[] = [];
    expect(await appendSubtletyFirstPassSimulatorDelivery({ ...value.options, cases })).toBe(cases);
    value.installPointer({ campaignIdentity: "0".repeat(64) });
    expect(await appendSubtletyFirstPassSimulatorDelivery({ ...value.options, cases })).toBe(cases);
  });

  it("appends the actual reviewed build without changing existing defaults and rejects duplicate cases", async () => {
    const value = fixture();
    value.installPointer();
    const delivery = await readSubtletyFirstPassSimulatorDelivery(value.share, value.options),
      combat: LocalSimulatorBuildReview = {
        ...delivery.review,
        id: "rogue-combat-static",
        spec: "rogue/combat",
      },
      cases = [combat];
    const result = await appendSubtletyFirstPassSimulatorDelivery({ ...value.options, cases });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(combat);
    expect(result[1]?.id).toBe("rogue-subtlety-static");
    expect(cases).toHaveLength(1);
    await expect(
      appendSubtletyFirstPassSimulatorDelivery({ ...value.options, cases: result }),
    ).rejects.toThrow(/existing case/);
  });
});
