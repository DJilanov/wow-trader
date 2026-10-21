import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  shadowPriestModelEntrySchema,
  readFreshShadowPriestSimulatorBuild,
  type ShadowPriestModelEntry,
  type ShadowPriestModelEvidenceReference,
} from "./forever-simulator-fresh-shadow-priest";

const record = z.record(z.string(), z.unknown()),
  raw: unknown = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/model-first-pass-shadow-priest.json.gz", import.meta.url)),
      { maxOutputLength: 64_000_000 },
    ).toString("utf8"),
  ),
  saved = z
    .object({
      schema: z.literal("kfc-shadow-priest-delivery-fixture.v1"),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      entry: shadowPriestModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(raw);

interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: ShadowPriestModelEntry;
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

function read(value: Fixture): ReturnType<typeof readFreshShadowPriestSimulatorBuild> {
  return readFreshShadowPriestSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (reference: ShadowPriestModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, reference.path))
        throw new Error("Missing genuine Shadow Priest source: " + reference.path);
      return value.documents[reference.path];
    },
  });
}

describe("qualified full-raid Shadow Priest delivery", () => {
  it("replays the authentic historical seed, full-buff gear/state feedback, fresh confirmation and selected native/WASM parity", async (): Promise<void> => {
    expect(hash(raw)).toBe("d5d931dc6fb3b6851a45286ad77d559bc150720dfbef14ccf28433326150d9f4");
    const value = fixture(),
      before = hash(value),
      build = await read(value),
      player = record.parse(build.settings.player);
    expect(build.referenceDps).toBe(759.3133717239346);
    expect(build.validationIterations).toBe(40000);
    expect(build.rotationGuidance.talents).toBe("18/0/33");
    expect(build.rotationGuidance.prepull).toHaveLength(1);
    expect(build.rotationGuidance.prepull[0]).toContain("1.5 seconds");
    expect(
      build.rotationGuidance.caveats.some((text: string): boolean =>
        text.includes("outside healing"),
      ),
    ).toBe(true);
    expect(player.channelClipDelayMs).toBe(100);
    expect(record.parse(player.shadowPriest).options).toEqual({ armor: "InnerFire" });
    expect(build.scope.currentModelGearSweeps).toBe(2);
    expect(build.scope.closingFeedbackCompleted).toBe(true);
    expect(build.scope.previousModelNumericalReuse).toBe(false);
    expect(build.scope.gearApplicabilityRequired).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.005913647418345656);
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
    expect(Object.keys(missing.documents)).toHaveLength(17);
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
      shadowPriestModelEntrySchema.safeParse({
        ...saved.entry,
        build: { ...saved.entry.build, path },
      }).success,
    ).toBe(false);
  });
});
