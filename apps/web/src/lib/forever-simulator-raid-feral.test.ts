import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  raidFeralModelEntrySchema,
  readRaidFeralSimulatorBuild,
  type RaidFeralEvidenceReference,
  type RaidFeralModelEntry,
} from "./forever-simulator-raid-feral";

const saved = z
  .object({
    schema: z.literal("kfc-feral-raid-delivery-fixture.v1"),
    sourceRelease: z.string(),
    revision: z.string(),
    databaseSha256: z.string(),
    href: z.string(),
    entry: raidFeralModelEntrySchema,
    documents: z.record(z.string(), z.unknown()),
  })
  .strict()
  .parse(
    JSON.parse(
      gunzipSync(readFileSync(new URL("./fixtures/feral-raid-delivery.json.gz", import.meta.url)), {
        maxOutputLength: 64_000_000,
      }).toString("utf8"),
    ) as unknown,
  );
interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: RaidFeralModelEntry;
  documents: Record<string, unknown>;
}
function fixture(): Fixture {
  return structuredClone(saved);
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a mutable fixture object");
  return value as Record<string, unknown>;
}
function read(value: Fixture): ReturnType<typeof readRaidFeralSimulatorBuild> {
  return readRaidFeralSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (ref: RaidFeralEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Raid Feral source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}
describe("seven-buff A4 Feral delivery boundary", () => {
  it("replays genuine current state/applicability, fresh2x20k math and inspected10k browser parity without mutating saved settings", async () => {
    expect(hash(saved)).toBe("2faad048978a73e3e8b49e5adf32bcd0150b90ac2ab1672a34f94c4a076dbc66");
    const value = fixture(),
      before = hash(value),
      build = await read(value);
    expect(build.schema).toBe("kfc-raid-revalidated-prebis-build.v1");
    expect(build.referenceDps).toBe(752.0645151927594);
    expect(build.validationIterations).toBe(40000);
    expect(build.rotationGuidance.talents).toBe("9/32/10");
    expect(build.rotationGuidance.prepull).toEqual([]);
    expect(build.rotationGuidance.prepullBindings).toEqual([]);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.0069845687976534685);
    expect(build.scope.strictRetainedDominancePassed).toBe(false);
    expect(build.scope.fullCurrentPoolSweep).toBe(false);
    expect(build.publicPromotionAllowed).toBe(false);
    expect(Object.hasOwn(object(build.settings.encounter), "durationVariation")).toBe(false);
    expect(hash(value)).toBe(before);
    expect(createHash("sha256").update(saved.href).digest("hex")).toBe(saved.entry.hrefSha256);
  });
  it("rejects wrong engine, database, source revision, settings, public DPS or precision", async () => {
    for (const change of [
      (value: Fixture): void => {
        value.sourceRelease = "81d964b453f4e6abb50a81e7";
      },
      (value: Fixture): void => {
        value.databaseSha256 = "0".repeat(64);
      },
      (value: Fixture): void => {
        value.revision += "-changed";
      },
      (value: Fixture): void => {
        value.entry.referenceDps += 1;
      },
      (value: Fixture): void => {
        value.entry.settingsSha256 = "1".repeat(64);
      },
    ]) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
    expect(
      raidFeralModelEntrySchema.safeParse({ ...saved.entry, validationIterations: 10000 }).success,
    ).toBe(false);
  });
  it.each(Object.keys(saved.documents).filter((path): boolean => !path.includes("/build-")))(
    "rejects altered genuine source %s",
    async (path: string): Promise<void> => {
      const value = fixture();
      value.documents[path] = { ...object(value.documents[path]), tampered: true };
      await expect(read(value)).rejects.toThrow(/checksum/);
    },
  );
  it.each(Object.keys(saved.documents))(
    "requires genuine source %s",
    async (path: string): Promise<void> => {
      expect(Object.keys(saved.documents)).toHaveLength(13);
      const value = fixture();
      delete value.documents[path];
      await expect(read(value)).rejects.toThrow(/Missing genuine/);
    },
  );
  it("does not treat a resealed export as numerical review or let it discard an aura, change consumes or inflate validation", async () => {
    for (const change of [
      (build: Record<string, unknown>): void => {
        build.referenceDps = 9999;
      },
      (build: Record<string, unknown>): void => {
        object(object(build.settings).raidBuffs).moonkinAura = false;
      },
      (build: Record<string, unknown>): void => {
        object(object(build.settings).partyBuffs).windfuryTotem = false;
      },
      (build: Record<string, unknown>): void => {
        object(object(object(build.settings).player).consumes).manaRegenElixir = "MagebloodPotion";
      },
      (build: Record<string, unknown>): void => {
        object(build.scope).fullCurrentPoolSweep = true;
      },
      (build: Record<string, unknown>): void => {
        object(build.rotationGuidance).instruction = "Unmeasured rotation";
      },
    ]) {
      const value = fixture(),
        build = object(value.documents[value.entry.build.path]);
      change(build);
      expect(hash(build)).not.toBe(value.entry.build.sha256);
      value.entry.build.sha256 = hash(build);
      await expect(read(value)).rejects.toThrow();
    }
  });
  it("rejects missing, duplicate, changed and mislabelled mixed state/gear request templates", async () => {
    for (const change of [
      (value: Fixture): void => {
        value.entry.requestTemplates.pop();
      },
      (value: Fixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing actual frame");
        value.entry.requestTemplates[1] = { ...row };
      },
      (value: Fixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing actual frame");
        row.requestBase64 = "AAAA".repeat(100);
      },
      (value: Fixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing actual frame");
        row.requestSource = row.requestSource === "gear" ? "state" : "gear";
      },
    ]) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
  });
  it("rejects unsafe paths at the input boundary", () => {
    for (const path of [
      "../optimization/result.json",
      "/optimization/result.json",
      "optimization/../result.json",
      "optimization/x\\result.json",
      "optimization/x\0.json",
    ])
      expect(
        raidFeralModelEntrySchema.safeParse({
          ...saved.entry,
          build: { ...saved.entry.build, path },
        }).success,
      ).toBe(false);
  });
});
