import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  afflictionModelEntrySchema,
  readFreshAfflictionSimulatorBuild,
  type AfflictionModelEntry,
  type AfflictionModelEvidenceReference,
} from "./forever-simulator-fresh-affliction";

const record = z.record(z.string(), z.unknown()),
  raw: unknown = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/model-first-pass-affliction.json.gz", import.meta.url)),
      { maxOutputLength: 64_000_000 },
    ).toString("utf8"),
  ),
  saved = z
    .object({
      schema: z.literal("kfc-affliction-delivery-fixture.v1"),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      entry: afflictionModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(raw);

interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: AfflictionModelEntry;
  documents: Record<string, unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function read(value: Fixture): ReturnType<typeof readFreshAfflictionSimulatorBuild> {
  return readFreshAfflictionSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (reference: AfflictionModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, reference.path))
        throw new Error("Missing genuine Affliction source: " + reference.path);
      return value.documents[reference.path];
    },
  });
}

describe("qualified full-raid Affliction delivery", () => {
  it("replays the authentic historical seed, full-buff gear/state feedback, fresh confirmation and selected native/WASM parity", async (): Promise<void> => {
    expect(hash(raw)).toBe("d4472f2d2bc383f80754a98fe58c6c87473f7cfc76018115a8c97d2c65d5f10c");
    const value = fixture(),
      before = hash(value),
      build = await read(value),
      player = record.parse(build.settings.player);
    expect(build.referenceDps).toBe(747.6164254231074);
    expect(build.validationIterations).toBe(40000);
    expect(build.rotationGuidance.talents).toBe("30/0/21");
    expect(build.rotationGuidance.activeDemon).toBe("Succubus");
    expect(build.rotationGuidance.sacrificedDemon).toBe("NoSummon");
    expect(build.rotationGuidance.prepull).toEqual([]);
    expect(build.scope.currentModelGearSweeps).toBe(3);
    expect(build.scope.closingFeedbackCompleted).toBe(true);
    expect(build.scope.previousModelNumericalReuse).toBe(false);
    expect(build.scope.gearApplicabilityRequired).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.006765857530814545);
    expect(record.parse(build.approval.originalAssessment).accepted).toBe(true);
    expect(record.parse(player.consumes).manaRegenElixir).toBe("GreaterMagebloodElixir");
    for (const [actual, required] of [
      [build.settings.raidBuffs, fullRaidDefaults.raid],
      [build.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const) {
      expect(actual).toMatchObject(required);
    }
    expect(hash(value)).toBe(before);
  });

  it("rejects foreign models and altered public DPS or settings", async (): Promise<void> => {
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
  });

  it.each(
    Object.keys(saved.documents).filter((path: string): boolean => !path.includes("/build-")),
  )("rejects altered source %s", async (path: string): Promise<void> => {
    const value = fixture();
    value.documents[path] = { ...record.parse(value.documents[path]), tampered: true };
    await expect(read(value)).rejects.toThrow(/checksum/);
  });

  it("requires the actual complete source chain and rejects a self-resealed export", async (): Promise<void> => {
    const missing = fixture();
    expect(Object.keys(missing.documents)).toHaveLength(16);
    delete missing.documents[missing.entry.build.path];
    await expect(read(missing)).rejects.toThrow(/Missing genuine/);
    const resealed = fixture(),
      build = record.parse(resealed.documents[resealed.entry.build.path]);
    build.settings = { player: { buffs: {} } };
    resealed.entry.build.sha256 = hash(build);
    await expect(read(resealed)).rejects.toThrow(/new delivery review/);
  });

  it("rejects missing, duplicated or changed actual wire templates", async (): Promise<void> => {
    for (const kind of ["missing", "duplicate", "changed"]) {
      const value = fixture(),
        row = value.entry.requestTemplates[0];
      if (!row) throw new Error("Missing genuine request template");
      if (kind === "missing") value.entry.requestTemplates.pop();
      else if (kind === "duplicate") value.entry.requestTemplates[1] = { ...row };
      else row.requestBase64 = "AAAA".repeat(100);
      await expect(read(value)).rejects.toThrow();
    }
  });

  it.each([
    "../optimization/result.json",
    "/optimization/result.json",
    "optimization/../result.json",
    "optimization/x\\result.json",
  ])("rejects unsafe reference %s", (path: string): void => {
    expect(
      afflictionModelEntrySchema.safeParse({
        ...saved.entry,
        build: { ...saved.entry.build, path },
      }).success,
    ).toBe(false);
  });
});
