import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fireModelEntrySchema,
  readFreshFireSimulatorBuild,
  type FireModelEntry,
  type FireModelEvidenceReference,
} from "./forever-simulator-fresh-fire";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";

const raw: unknown = JSON.parse(
  gunzipSync(readFileSync(new URL("./fixtures/model-first-pass-fire.json.gz", import.meta.url)), {
    maxOutputLength: 64_000_000,
  }).toString("utf8"),
);
const saved = z
  .object({
    schema: z.literal("kfc-fire-delivery-fixture.v1"),
    sourceRelease: z.string(),
    revision: z.string(),
    databaseSha256: z.string(),
    entry: fireModelEntrySchema,
    documents: z.record(z.string(), z.unknown()),
  })
  .strict()
  .parse(raw);
interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: FireModelEntry;
  documents: Record<string, unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(value);
}
function fixture(): Fixture {
  return structuredClone({
    sourceRelease: saved.sourceRelease,
    revision: saved.revision,
    databaseSha256: saved.databaseSha256,
    entry: saved.entry,
    documents: saved.documents,
  });
}
function read(value: Fixture): ReturnType<typeof readFreshFireSimulatorBuild> {
  return readFreshFireSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (ref: FireModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Fire source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("current Greater20 Fire delivery", () => {
  it("replays the authentic V2 chain, two20k-range math and selected10k native/browser parity with exact current-backend origins, never old-model scalar relabelling", async () => {
    expect(hash(raw)).toBe("7dcfb6aec40f4b0139b6809386783b5ed9467e8bbc5b996519a2d3b490649b93");
    const value = fixture(),
      before = hash(value),
      build = await read(value);
    expect(build.referenceDps).toBe(650.0665533381781);
    expect(build.validationIterations).toBe(40000);
    expect(build.rotationGuidance.talents).toBe("18/31/2");
    expect(build.scope.previousModelNumericalReuse).toBe(false);
    expect(build.scope.anchorMeasuredOnDifferentEngine).toBe(false);
    expect(build.scope.currentModelGearSweeps).toBe(4);
    expect(build.scope.stateChanged).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.005161735247256847);
    expect(object(object(build.settings.player).consumes).manaRegenElixir).toBe(
      "GreaterMagebloodElixir",
    );
    expect(object(build.approval.originalAssessment).accepted).toBe(true);
    expect(hash(value)).toBe(before);
  });
  it("rejects another source, database, revision, public DPS or settings digest", async () => {
    for (const change of [
      (v: Fixture): void => {
        v.sourceRelease = "81d964b453f4e6abb50a81e7";
      },
      (v: Fixture): void => {
        v.databaseSha256 = "0".repeat(64);
      },
      (v: Fixture): void => {
        v.revision += "-changed";
      },
      (v: Fixture): void => {
        v.entry.referenceDps += 1;
      },
      (v: Fixture): void => {
        v.entry.settingsSha256 = "1".repeat(64);
      },
    ]) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
  });
  it.each(Object.keys(saved.documents).filter((path): boolean => !path.includes("/build-")))(
    "rejects altered genuine source %s",
    async (path: string): Promise<void> => {
      const value = fixture();
      value.documents[path] = { ...object(value.documents[path]), tampered: true };
      await expect(read(value)).rejects.toThrow(/checksum/);
    },
  );
  it("requires every genuine feedback, anchor, confirmation, reservation and parity source", async () => {
    const missing = fixture();
    expect(Object.keys(missing.documents)).toHaveLength(16);
    delete missing.documents[missing.entry.build.path];
    await expect(read(missing)).rejects.toThrow(/Missing genuine/);
  });
  it("does not accept a self-resealed export as a numerical review", async () => {
    const value = fixture(),
      build = object(value.documents[value.entry.build.path]),
      player = object(object(build.settings).player);
    player.consumes = { manaRegenElixir: "MagebloodPotion" };
    build.settings = { player };
    value.entry.build.sha256 = hash(build);
    await expect(read(value)).rejects.toThrow(/new delivery review/);
  });
  it("rejects missing, duplicate, changed or old-codec request frames", async () => {
    for (const change of [
      (v: Fixture): void => {
        v.entry.requestTemplates.pop();
      },
      (v: Fixture): void => {
        const row = v.entry.requestTemplates[0];
        if (!row) throw new Error("Missing actual frame");
        v.entry.requestTemplates[1] = { ...row };
      },
      (v: Fixture): void => {
        const row = v.entry.requestTemplates[0];
        if (!row) throw new Error("Missing actual frame");
        row.requestBase64 = "AAAA".repeat(100);
      },
    ]) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
  });
  it("validates reference paths at the boundary and never inspects Mage pointers for another class", async () => {
    for (const path of [
      "../optimization/result.json",
      "/optimization/result.json",
      "optimization/../result.json",
      "optimization/x\\result.json",
    ])
      expect(
        fireModelEntrySchema.safeParse({ ...saved.entry, build: { ...saved.entry.build, path } })
          .success,
      ).toBe(false);
    await expect(readSimulatorProfileModelUpdate("warrior", "/does-not-exist")).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("feral_druid", "/does-not-exist"),
    ).resolves.toBeNull();
  });
});
