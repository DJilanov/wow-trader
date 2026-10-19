import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import saved from "./fixtures/model-first-pass-marksmanship.json";
import {
  readSimulatorModelFirstPassBuild,
  simulatorModelFirstPassEntrySchema,
  type ModelFirstPassReference,
  type SimulatorModelFirstPassEntry,
} from "./forever-simulator-model-first-pass";

interface Fixture {
  entry: SimulatorModelFirstPassEntry;
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  documents: Record<string, unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected actual fixture object");
  return value as Record<string, unknown>;
}
function fixture(): Fixture {
  return {
    entry: simulatorModelFirstPassEntrySchema.parse(structuredClone(saved.entry)),
    sourceRelease: saved.sourceRelease,
    revision: saved.revision,
    databaseSha256: saved.databaseSha256,
    documents: structuredClone(saved.documents),
  };
}
function read(value: Fixture): ReturnType<typeof readSimulatorModelFirstPassBuild> {
  return readSimulatorModelFirstPassBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (ref: ModelFirstPassReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Unknown fixture reference: " + ref.path);
      return value.documents[ref.path];
    },
  });
}
function resealBuild(value: Fixture, change: (build: Record<string, unknown>) => void): void {
  const build = object(value.documents[value.entry.build.path]);
  change(build);
  const sha256 = hash(build);
  const path = value.entry.build.path.replace(
    /build-[a-f0-9]{16}\.json$/,
    `build-${sha256.slice(0, 16)}.json`,
  );
  value.documents[path] = build;
  value.entry.build = { path, sha256 };
}

describe("corrected-model first-pass publication reader", () => {
  it("authenticates the actual MM40k result, frozen12-arm frames, preserved1% history and selected10k native/WASM parity", async () => {
    expect(hash(saved)).toBe("9c76441ed63c34a9fca0374fa9c81c5eb3dad2549e50078016898159ff7323cd");
    const value = fixture();
    const before = hash(value);
    const build = await read(value);
    expect(build.referenceDps).toBe(853.2199466184707);
    expect(build.validationIterations).toBe(40000);
    expect(build.approval.accepted).toBe(true);
    expect(object(build.approval.originalAssessment).accepted).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.010290092038065444);
    expect(build.modelPolicy).toBe("ignore-item-bonuses");
    expect(build.publicPromotion).toBe(false);
    expect(build.browserHandoffRequired).toBe(true);
    expect(hash(value)).toBe(before);
  });

  it("rejects another model/database/revision, publication DPS or selected-settings identity", async () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        value.sourceRelease = "0".repeat(24);
      },
      (value) => {
        value.databaseSha256 = "0".repeat(64);
      },
      (value) => {
        value.revision = "foreign";
      },
      (value) => {
        value.entry.referenceDps += 10;
      },
      (value) => {
        value.entry.settingsSha256 = "0".repeat(64);
      },
    ];
    for (const change of changes) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
  });

  it("rejects changed, missing or duplicate request frames even when their entry is otherwise correctly resealed", async () => {
    for (const mode of ["changed", "missing", "duplicate"]) {
      const value = fixture();
      const first = value.entry.requestTemplates[0];
      if (!first) throw new Error("Missing genuine selected frame");
      if (mode === "changed") first.requestBase64 += "AAAA";
      if (mode === "missing") value.entry.requestTemplates.pop();
      if (mode === "duplicate") value.entry.requestTemplates[1] = structuredClone(first);
      await expect(read(value)).rejects.toThrow(/frame|wire|template|inspected/i);
    }
  });

  it("rejects correctly resealed build claims that contradict source scope, selected state, guide, precision or consent", async () => {
    const changes: readonly ((build: Record<string, unknown>) => void)[] = [
      (build) => {
        object(build.scope).globalOptimalityProven = true;
      },
      (build) => {
        object(build.scope).maximumRetainedGapFraction = 0.03;
      },
      (build) => {
        object(build.scope).originalStrictAssessmentAccepted = true;
      },
      (build) => {
        object(build.rotationGuidance).instruction = "Invented rotation";
      },
      (build) => {
        object(build.state).petType = "Raptor";
      },
      (build) => {
        build.validationIterations = 100000;
      },
      (build) => {
        build.requiresProvisionalEnchantOptIn = true;
      },
    ];
    for (const change of changes) {
      const value = fixture();
      resealBuild(value, change);
      await expect(read(value)).rejects.toThrow();
    }
  });

  it("rejects source checksum mutations and a correctly resealed native parity lie", async () => {
    const corrupt = fixture();
    object(corrupt.documents[corrupt.entry.build.path]).referenceDps = 1;
    await expect(read(corrupt)).rejects.toThrow(/checksum/);
    const value = fixture();
    resealBuild(value, (build): void => {
      const evidence = object(build.evidence);
      const ref = object(evidence.parity);
      const path = String(ref.path);
      const parity = object(value.documents[path]);
      object(parity.native).dps = 1;
      evidence.parity = { path, sha256: hash(parity) };
    });
    await expect(read(value)).rejects.toThrow(/genuine selected10k/);
  });

  it("refuses escaping evidence paths before any read", async () => {
    const value = fixture();
    value.entry.build.path = "optimization/../../private.json";
    let reads = 0;
    await expect(
      readSimulatorModelFirstPassBuild(value.entry, {
        sourceRelease: value.sourceRelease,
        revision: value.revision,
        databaseSha256: value.databaseSha256,
        reference: async (): Promise<unknown> => {
          reads++;
          return {};
        },
      }),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  });
});
