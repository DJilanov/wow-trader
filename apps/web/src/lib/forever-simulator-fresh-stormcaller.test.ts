import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  stormcallerModelEntrySchema,
  stormcallerModelEvidenceReferenceSchema,
  readFreshStormcallerSimulatorBuild,
  verifiedStormcallerDelivery,
  type StormcallerModelEntry,
  type StormcallerModelEvidenceReference,
  type StormcallerModelBuildOptions,
} from "./forever-simulator-fresh-stormcaller";

const genuineForeignFixture = z
  .object({ entry: z.record(z.string(), z.unknown()) })
  .passthrough()
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/model-first-pass-smite-priest.json.gz", import.meta.url)),
        { maxOutputLength: 64_000_000 },
      ).toString("utf8"),
    ),
  );

function inaccessibleSource(): { options: StormcallerModelBuildOptions; reads: () => number } {
  let reads = 0;
  return {
    options: {
      sourceRelease: "137f6ec1ba5757af03c5bb95",
      revision: "untrusted-input-must-not-reach-source-reading",
      databaseSha256: "c777db42c835aa55b07ac4cd4f42baf962150544426b92b27a4dcd27d595bbd6",
      reviewedBuildSha256: "0".repeat(64),
      reference: async (): Promise<never> => {
        reads++;
        throw new Error("Unexpected unqualified source read");
      },
    },
    reads: (): number => reads,
  };
}

describe("Stormcaller delivery boundary", () => {
  it("the actual qualified Elemental sibling cannot authorize itself as Stormcaller", async (): Promise<void> => {
    const sibling = z
        .object({ entry: z.record(z.string(), z.unknown()) })
        .passthrough()
        .parse(
          JSON.parse(
            gunzipSync(
              readFileSync(
                new URL("./fixtures/model-first-pass-elemental-shaman.json.gz", import.meta.url),
              ),
              { maxOutputLength: 64_000_000 },
            ).toString("utf8"),
          ),
        ),
      build = z.object({ sha256: z.string() }).passthrough().parse(sibling.entry.build),
      source = inaccessibleSource();
    source.options = { ...source.options, reviewedBuildSha256: build.sha256 };
    await expect(
      readFreshStormcallerSimulatorBuild(
        {
          ...sibling.entry,
          id: "shaman-stormcaller-static",
        },
        source.options,
      ),
    ).rejects.toThrow(/independent delivery review/);
    expect(source.reads()).toBe(0);
  });

  it("rejects the genuine independently qualified Smite build without reading or relabelling its data", async (): Promise<void> => {
    const source = inaccessibleSource();
    await expect(
      readFreshStormcallerSimulatorBuild(genuineForeignFixture.entry, source.options),
    ).rejects.toThrow();
    expect(source.reads()).toBe(0);
  });

  it("changing a genuine foreign entry's class labels cannot authorize its export hash", async (): Promise<void> => {
    const source = inaccessibleSource(),
      entry = {
        ...structuredClone(genuineForeignFixture.entry),
        id: "shaman-stormcaller-static",
        profile: "elemental_shaman",
      };
    await expect(readFreshStormcallerSimulatorBuild(entry, source.options)).rejects.toThrow(
      "Unreviewed Stormcaller export",
    );
    expect(source.reads()).toBe(0);
  });

  it("rejects traversal, absolute paths, null bytes and non-JSON evidence locations", (): void => {
    for (const path of [
      "/etc/passwd",
      "optimization/../private.json",
      "optimization\\private.json",
      "optimization/private\0.json",
      "optimization/raw.ndjson",
    ])
      expect(
        stormcallerModelEvidenceReferenceSchema.safeParse({ path, sha256: "a".repeat(64) }).success,
      ).toBe(false);
  });

  it("accepts the actual completed-feedback evidence location as a reference, not as a qualified build", async (): Promise<void> => {
    const reference = {
      path: "artifacts/forever-simulator/optimization/bounded-native-studies/dfbaa4c0c63f565fcffa5344690eaa520a1b4ca18091406fe72d4c40651546e8/completed.json",
      sha256: "f2a85ec1f3b196446b2dbf0ae5685a02fcb5d437fabbf1f3b167f1dffa1b640e",
    };
    expect(stormcallerModelEvidenceReferenceSchema.safeParse(reference).success).toBe(true);
    const source = inaccessibleSource();
    await expect(readFreshStormcallerSimulatorBuild(reference, source.options)).rejects.toThrow();
    expect(source.reads()).toBe(0);
  });
});

const record = z.record(z.string(), z.unknown()),
  genuine = z
    .object({
      schema: z.literal("kfc-stormcaller-delivery-fixture.v1"),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      reviewedBuildSha256: z.string(),
      entry: stormcallerModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(new URL("./fixtures/model-first-pass-stormcaller.json.gz", import.meta.url)),
          { maxOutputLength: 64_000_000 },
        ).toString("utf8"),
      ),
    );

interface QualifiedFixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: StormcallerModelEntry;
  documents: Record<string, unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function qualifiedFixture(): QualifiedFixture {
  return structuredClone({
    sourceRelease: genuine.sourceRelease,
    revision: genuine.revision,
    databaseSha256: genuine.databaseSha256,
    entry: genuine.entry,
    documents: genuine.documents,
  });
}

function readQualified(
  value: QualifiedFixture,
): ReturnType<typeof readFreshStormcallerSimulatorBuild> {
  return readFreshStormcallerSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reviewedBuildSha256: verifiedStormcallerDelivery.buildSha256,
    reference: async (ref: StormcallerModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Stormcaller source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("qualified full-raid Stormcaller delivery", () => {
  it("reads the actual all-slot feedback, fresh 40k confirmation, raw-plan reservation and selected native/WASM parity", async (): Promise<void> => {
    expect(genuine.reviewedBuildSha256).toBe(verifiedStormcallerDelivery.buildSha256);
    const value = qualifiedFixture(),
      before = hash(value),
      build = await readQualified(value),
      player = record.parse(build.settings.player);
    expect(build.name).toBe("Stormcaller melee-weave · pre-raid tested");
    expect(build.referenceDps).toBe(563.1360101550861);
    expect(build.validationIterations).toBe(40000);
    expect(player.talentsString).toBe("553233100000033-0550300110041021");
    expect(player.distanceFromTarget).toBe(5);
    expect(record.parse(player.elementalShaman).options).toEqual({
      mainHandImbue: "RockbiterImbue",
    });
    expect(record.parse(player.consumes)).toMatchObject({
      manaRegenElixir: "GreaterMagebloodElixir",
      mainHandImbue: "ShadowOil",
      food: "FoodNightfinSoup",
    });
    expect(build.rotationGuidance.talents).toBe("28/23/0");
    expect(build.rotationGuidance.priorities).toHaveLength(8);
    expect(build.rotationGuidance.prepull).toHaveLength(0);
    expect(build.rotationGuidance.instruction).toContain("Water Shield is not part");
    expect(
      build.rotationGuidance.caveats.some((text): boolean => text.includes("additional threat")),
    ).toBe(true);
    expect(build.scope.currentModelGearSweeps).toBe(5);
    expect(build.scope.feedbackCycles).toBe(2);
    expect(build.scope.fixedPointWithinDeclaredPolicy).toBe(true);
    expect(build.scope.gearApplicabilityRequired).toBe(false);
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.005161258155834358);
    expect(build.scope.originalStrictAssessmentAccepted).toBe(true);
    expect(build.scope.globalOptimalityProven).toBe(false);
    expect(build.scope.livePvpAccessVerified).toBe(false);
    for (const [actual, required] of [
      [build.settings.raidBuffs, fullRaidDefaults.raid],
      [build.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const)
      expect(actual).toMatchObject(required);
    expect(record.parse(build.settings.debuffs).stormstrike).not.toBe(true);
    expect(hash(value)).toBe(before);
  });

  it.each(Object.keys(genuine.documents))(
    "rejects a changed genuine evidence document: %s",
    async (path: string): Promise<void> => {
      const value = qualifiedFixture();
      value.documents[path] = { ...record.parse(value.documents[path]), changed: true };
      await expect(readQualified(value)).rejects.toThrow(/checksum/);
    },
  );

  it("rejects missing source and correctly self-resealed replacement builds", async (): Promise<void> => {
    const missing = qualifiedFixture();
    delete missing.documents[missing.entry.build.path];
    await expect(readQualified(missing)).rejects.toThrow(/Missing genuine/);
    const resealed = qualifiedFixture(),
      build = record.parse(resealed.documents[resealed.entry.build.path]);
    build.settings = { player: { buffs: {} } };
    resealed.entry.build.sha256 = hash(build);
    await expect(readQualified(resealed)).rejects.toThrow(/independent delivery review/);
  });

  it("rejects changed models, public results, settings and actual wire templates", async (): Promise<void> => {
    for (const mutate of [
      (value: QualifiedFixture): void => {
        value.sourceRelease = "0".repeat(24);
      },
      (value: QualifiedFixture): void => {
        value.revision += "-changed";
      },
      (value: QualifiedFixture): void => {
        value.databaseSha256 = "0".repeat(64);
      },
      (value: QualifiedFixture): void => {
        value.entry.referenceDps += 1;
      },
      (value: QualifiedFixture): void => {
        value.entry.settingsSha256 = "0".repeat(64);
      },
      (value: QualifiedFixture): void => {
        value.entry.requestTemplates.pop();
      },
      (value: QualifiedFixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing genuine wire template");
        value.entry.requestTemplates[1] = { ...row };
      },
      (value: QualifiedFixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing genuine wire template");
        row.requestBase64 = "AAAA".repeat(100);
      },
    ]) {
      const value = qualifiedFixture();
      mutate(value);
      await expect(readQualified(value)).rejects.toThrow();
    }
  });
});
