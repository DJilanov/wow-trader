import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  frostModelEntrySchema,
  readFreshFrostSimulatorBuild,
  type FrostModelEntry,
  type FrostModelEvidenceReference,
} from "./forever-simulator-fresh-frost";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";

const raw: unknown = JSON.parse(
  gunzipSync(readFileSync(new URL("./fixtures/model-first-pass-frost.json.gz", import.meta.url)), {
    maxOutputLength: 64_000_000,
  }).toString("utf8"),
);
const saved = z
  .object({
    schema: z.literal("kfc-frost-delivery-fixture.v1"),
    sourceRelease: z.string(),
    revision: z.string(),
    databaseSha256: z.string(),
    entry: frostModelEntrySchema,
    documents: z.record(z.string(), z.unknown()),
  })
  .strict()
  .parse(raw);
interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: FrostModelEntry;
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
function read(value: Fixture): ReturnType<typeof readFreshFrostSimulatorBuild> {
  return readFreshFrostSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (ref: FrostModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Frost source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("current Greater20 Frost delivery", () => {
  it("replays the authentic V2 chain, two20k-range math and selected10k native/browser parity without rewriting the old anchor", async () => {
    expect(hash(raw)).toBe("3184f3ce932d3501ce2d6a071a68cedc5f0e1ca49afd5c006f0da85ec048b0f1");
    const value = fixture(),
      before = hash(value),
      build = await read(value);
    expect(build.referenceDps).toBe(572.1653473953593);
    expect(build.validationIterations).toBe(40000);
    expect(build.rotationGuidance.talents).toBe("17/0/34");
    expect(build.scope.previousModelNumericalReuse).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.00837465689370398);
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
    expect(Object.keys(missing.documents)).toHaveLength(13);
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
        frostModelEntrySchema.safeParse({ ...saved.entry, build: { ...saved.entry.build, path } })
          .success,
      ).toBe(false);
    await expect(readSimulatorProfileModelUpdate("warrior", "/does-not-exist")).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("feral_druid", "/does-not-exist"),
    ).resolves.toBeNull();
  });
});
