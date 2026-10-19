import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import saved from "./fixtures/hunter-first-pass-delivery.json";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { createPracticalSimulatorDeliveryReader } from "./forever-simulator-practical-reviews";
import {
  appendHunterBeastMasterySimulatorDelivery,
  readHunterBeastMasterySimulatorDelivery,
  hunterBeastMasteryDeliveryDefinition,
} from "./forever-simulator-hunter-reviews";

interface MutableReference {
  path: string;
  sha256: string;
}
interface Fixture {
  readonly share: MutableReference;
  readonly documents: Map<string, unknown>;
  readonly reads: string[];
  readonly options: Parameters<typeof readHunterBeastMasterySimulatorDelivery>[1];
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
      documents.set("hunter-beast-mastery-first-pass-delivery.json", {
        schema: "kfc-local-hunter-beast-mastery-first-pass-delivery.v1",
        campaignIdentity: saved.campaignIdentity,
        sourceRelease: saved.sourceRelease,
        share,
        ...changes,
      });
    },
  };
}

describe("Hunter Beast Mastery practical first-pass delivery", () => {
  it("authenticates the real11-frame/33-origin handoff, preserves its exact build andsix-priority introduction, and leaves sources untouched", async () => {
    const value = fixture(),
      before = hash([...value.documents]);
    const delivery = await readHunterBeastMasterySimulatorDelivery(value.share, value.options);
    expect(hash(delivery.build)).toBe(saved.build.sha256);
    expect(delivery.review.id).toBe("hunter-beast-mastery-static");
    expect(delivery.review.validationIterations).toBe(40000);
    expect(delivery.review.referenceDps).toBe(863.5544911736677);
    expect(delivery.review.rotationGuidance?.priorities).toHaveLength(6);
    expect(delivery.review.rotationGuidance?.instruction).toContain("first available action");
    expect(delivery.build.scope.gearGloballyConverged).toBe(false);
    expect(delivery.build.scope.globalOptimalityProven).toBe(false);
    expect(delivery.build.publicPromotion).toBe(false);
    expect(hash([...value.documents])).toBe(before);
    expect(value.reads).toHaveLength(8);
    expect(value.reads.some((path) => path.endsWith("result-866764c45125cafd.json"))).toBe(false);
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
        readHunterBeastMasterySimulatorDelivery(value.share, { ...value.options, ...change }),
      ).rejects.toThrow(/Stale/);
    }
  });

  it("checks evidence checksums even when transport returns a changed document", async () => {
    const value = fixture();
    value.buildDocument.referenceDps = 9999;
    await expect(
      readHunterBeastMasterySimulatorDelivery(value.share, value.options),
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
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
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
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
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
        objectAt(value.shareDocument, "nativeOrigins", 11, "journal").imported = true;
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
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
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
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
    for (const field of ["instruction", "priorityBindings"]) {
      const value = fixture();
      objectAt(value.buildDocument, "rotationGuidance")[field] = field === "instruction" ? "" : [];
      value.resealBuild();
      await expect(
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("rejects external build links and traversal before reading escaped evidence", async () => {
    const value = fixture();
    value.shareDocument.link = "https://example.invalid/rogue#" + "A".repeat(100);
    value.resealShare();
    await expect(
      readHunterBeastMasterySimulatorDelivery(value.share, value.options),
    ).rejects.toThrow(/link/);
    const escaped = fixture();
    await expect(
      readHunterBeastMasterySimulatorDelivery(
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
    expect(await appendHunterBeastMasterySimulatorDelivery({ ...value.options, cases })).toBe(
      cases,
    );
    value.installPointer({ campaignIdentity: "0".repeat(64) });
    expect(await appendHunterBeastMasterySimulatorDelivery({ ...value.options, cases })).toBe(
      cases,
    );
  });

  it("appends the actual reviewed build without changing existing defaults and rejects duplicate cases", async () => {
    const value = fixture();
    value.installPointer();
    const delivery = await readHunterBeastMasterySimulatorDelivery(value.share, value.options),
      combat: LocalSimulatorBuildReview = {
        ...delivery.review,
        id: "rogue-combat-static",
        spec: "rogue/combat",
      },
      cases = [combat];
    const result = await appendHunterBeastMasterySimulatorDelivery({ ...value.options, cases });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(combat);
    expect(result[1]?.id).toBe("hunter-beast-mastery-static");
    expect(cases).toHaveLength(1);
    await expect(
      appendHunterBeastMasterySimulatorDelivery({ ...value.options, cases: result }),
    ).rejects.toThrow(/existing case/);
  });
});

describe("Hunter-specific shared-reader hooks", () => {
  it("snapshots class contracts so another registration cannot change an existing reader", async () => {
    const definition = {
      ...hunterBeastMasteryDeliveryDefinition,
      schemas: { ...hunterBeastMasteryDeliveryDefinition.schemas },
      allowedEmptySlots: [...hunterBeastMasteryDeliveryDefinition.allowedEmptySlots],
    };
    const reader = createPracticalSimulatorDeliveryReader(definition);
    definition.profile = "rogue";
    definition.playerClass = 6;
    definition.schemas.build = "not-the-admitted-build";
    definition.allowedEmptySlots.push(0);
    const value = fixture(),
      delivery = await reader.read(value.share, value.options);
    expect(delivery.review.spec).toBe("hunter/beast_mastery");
    expect(hash(delivery.build)).toBe(saved.build.sha256);
  });
  it("preserves the real pet/ammo, all enchant bindings and prepull guidance", async () => {
    const value = fixture(),
      delivery = await readHunterBeastMasterySimulatorDelivery(value.share, value.options);
    const guide = objectAt(delivery.build, "rotationGuidance");
    expect(guide.petType).toBe("Raptor");
    expect(guide.prepull).toHaveLength(1);
    expect(guide.instruction).toContain("Aspect of the Hawk 10 seconds");
    expect(delivery.review.rotationGuidance?.instruction).toContain("Raptor");
    expect(delivery.build.scope.initialGearSweeps).toBe(2);
    expect(delivery.build.scope.correctionGearSweeps).toBe(1);
  });

  it("rejects wrong pet/speed/ammo, omitted prepull and invented enchant descriptions", async () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (v) => {
        objectAt(v.buildDocument, "settings", "player", "hunter", "options").petType = "Bat";
      },
      (v) => {
        objectAt(v.buildDocument, "settings", "player", "hunter", "options").petAttackSpeed = "Two";
      },
      (v) => {
        objectAt(v.buildDocument, "settings", "player", "hunter", "options").ammo = "Invented";
      },
      (v) => {
        objectAt(v.buildDocument, "rotationGuidance").petType = "Cat";
      },
      (v) => {
        objectAt(v.buildDocument, "rotationGuidance").prepull = [];
      },
      (v) => {
        objectAt(v.buildDocument, "rotationGuidance", "prepullBindings", 0).actionSha256 =
          "0".repeat(64);
      },
      (v) => {
        objectAt(v.buildDocument, "enchants", 0).effectId = 1900;
      },
      (v) => {
        objectAt(v.buildDocument, "enchants", 0).status = "provisional";
      },
      (v) => {
        objectAt(v.buildDocument, "scope").correctionGearSweeps = 2;
      },
    ];
    for (const change of changes) {
      const value = fixture();
      change(value);
      value.resealBuild();
      await expect(
        readHunterBeastMasterySimulatorDelivery(value.share, value.options),
      ).rejects.toThrow();
    }
  });

  it("the class hooks themselves reject cross-pet state and instruction swaps without relying on a checksum failure", async () => {
    const value = fixture(),
      delivery = await readHunterBeastMasterySimulatorDelivery(value.share, value.options);
    const player = objectAt(value.buildDocument, "settings", "player");
    expect(() =>
      hunterBeastMasteryDeliveryDefinition.validateArm(
        {
          talentsString: player.talentsString,
          petType: "Cat",
          rotationPolicy: {
            name: "multi-shot",
            hawk: "maintain",
            sting: true,
            shot: "multi",
            arcaneMana: 15,
          },
        },
        player,
      ),
    ).toThrow(/pet/);
    const guide = structuredClone(delivery.build.rotationGuidance);
    objectAt(guide).petType = "Cat";
    expect(() => hunterBeastMasteryDeliveryDefinition.validateGuidance(guide, player)).toThrow(
      /pet/,
    );
    expect(() =>
      hunterBeastMasteryDeliveryDefinition.validateParity(
        { petType: "Cat" },
        { petType: "Cat" },
        player,
      ),
    ).toThrow(/pet/);
  });
});
