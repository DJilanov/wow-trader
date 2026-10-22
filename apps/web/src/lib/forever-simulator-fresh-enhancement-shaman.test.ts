import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  enhancementShamanModelEntrySchema,
  enhancementShamanModelEvidenceReferenceSchema,
  readFreshEnhancementShamanSimulatorBuild,
  verifiedEnhancementShamanDelivery,
  type EnhancementShamanModelEntry,
  type EnhancementShamanModelEvidenceReference,
  type EnhancementShamanModelBuildOptions,
} from "./forever-simulator-fresh-enhancement-shaman";

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

function inaccessibleSource(): {
  options: EnhancementShamanModelBuildOptions;
  reads: () => number;
} {
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

describe("Enhancement delivery boundary", () => {
  it("the actual qualified Elemental sibling cannot authorize itself as EnhancementShaman", async (): Promise<void> => {
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
      readFreshEnhancementShamanSimulatorBuild(sibling.entry, source.options),
    ).rejects.toThrow(/shaman-enhancement-static/);
    expect(source.reads()).toBe(0);
  });

  it("rejects the genuine independently qualified Smite build without reading or relabelling its data", async (): Promise<void> => {
    const source = inaccessibleSource();
    await expect(
      readFreshEnhancementShamanSimulatorBuild(genuineForeignFixture.entry, source.options),
    ).rejects.toThrow();
    expect(source.reads()).toBe(0);
  });

  it("changing a genuine foreign entry's class labels cannot authorize its export hash", async (): Promise<void> => {
    const source = inaccessibleSource(),
      entry = {
        ...structuredClone(genuineForeignFixture.entry),
        id: "shaman-enhancement-static",
        profile: "enhancement_shaman",
      };
    await expect(readFreshEnhancementShamanSimulatorBuild(entry, source.options)).rejects.toThrow(
      "Unreviewed Enhancement export",
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
        enhancementShamanModelEvidenceReferenceSchema.safeParse({ path, sha256: "a".repeat(64) })
          .success,
      ).toBe(false);
  });

  it("accepts the actual completed-feedback evidence location as a reference, not as a qualified build", async (): Promise<void> => {
    const reference = {
      path: "artifacts/forever-simulator/optimization/bounded-native-studies/0c6d7bc3698fab970542ff444f4b5b395097795caa48e6419b986826a2282b88/completed.json",
      sha256: "4fa77f7172ebf3a3b6fce4108ba36d9444b8f2b17bae1c4cef0af930dfa38924",
    };
    expect(enhancementShamanModelEvidenceReferenceSchema.safeParse(reference).success).toBe(true);
    const source = inaccessibleSource();
    await expect(
      readFreshEnhancementShamanSimulatorBuild(reference, source.options),
    ).rejects.toThrow();
    expect(source.reads()).toBe(0);
  });
});

const record = z.record(z.string(), z.unknown()),
  genuine = z
    .object({
      schema: z.literal("kfc-enhancement-shaman-delivery-fixture.v1"),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      reviewedBuildSha256: z.string(),
      entry: enhancementShamanModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(
            new URL("./fixtures/model-first-pass-enhancement-shaman.json.gz", import.meta.url),
          ),
          { maxOutputLength: 64_000_000 },
        ).toString("utf8"),
      ),
    );

interface QualifiedFixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: EnhancementShamanModelEntry;
  documents: Record<string, unknown>;
}

interface QualifiedMutation {
  name: string;
  mutate: (value: QualifiedFixture) => void;
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
): ReturnType<typeof readFreshEnhancementShamanSimulatorBuild> {
  return readFreshEnhancementShamanSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reviewedBuildSha256: verifiedEnhancementShamanDelivery.buildSha256,
    reference: async (ref: EnhancementShamanModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Enhancement source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("qualified full-raid Enhancement delivery", () => {
  it("reads the actual all-slot feedback, fresh 40k confirmation, raw-plan reservation and selected native/WASM parity", async (): Promise<void> => {
    expect(genuine.reviewedBuildSha256).toBe(verifiedEnhancementShamanDelivery.buildSha256);
    const value = qualifiedFixture(),
      before = hash(value),
      build = await readQualified(value),
      player = record.parse(build.settings.player);
    expect(build.name).toBe("Enhancement · pre-raid tested");
    expect(build.referenceDps).toBe(739.4162761173707);
    expect(build.validationIterations).toBe(40000);
    expect(player.talentsString).toBe("550103101-053030031005102251-04");
    expect(player.distanceFromTarget).toBe(5);
    expect(record.parse(player.enhancementShaman).options).toEqual({
      mainHandImbue: "RockbiterImbue",
    });
    expect(record.parse(player.consumes)).toMatchObject({
      manaRegenElixir: "GreaterMagebloodElixir",
      mainHandImbue: "ShadowOil",
      food: "FoodGrilledSquid",
    });
    expect(build.rotationGuidance.talents).toBe("16/31/4");
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
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.008437721772052681);
    expect(build.scope.originalStrictAssessmentAccepted).toBe(true);
    expect(build.scope.globalOptimalityProven).toBe(false);
    expect(build.scope.livePvpAccessVerified).toBe(false);
    expect(build.scope.provisionalStormTotem).toBe(true);
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

  it.each<QualifiedMutation>([
    {
      name: "source release",
      mutate: (value: QualifiedFixture): void => {
        value.sourceRelease = "0".repeat(24);
      },
    },
    {
      name: "revision",
      mutate: (value: QualifiedFixture): void => {
        value.revision += "-changed";
      },
    },
    {
      name: "database checksum",
      mutate: (value: QualifiedFixture): void => {
        value.databaseSha256 = "0".repeat(64);
      },
    },
    {
      name: "public DPS",
      mutate: (value: QualifiedFixture): void => {
        value.entry.referenceDps += 1;
      },
    },
    {
      name: "settings checksum",
      mutate: (value: QualifiedFixture): void => {
        value.entry.settingsSha256 = "0".repeat(64);
      },
    },
    {
      name: "missing wire template",
      mutate: (value: QualifiedFixture): void => {
        value.entry.requestTemplates.pop();
      },
    },
    {
      name: "duplicate wire template",
      mutate: (value: QualifiedFixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing genuine wire template");
        value.entry.requestTemplates[1] = { ...row };
      },
    },
    {
      name: "changed wire template",
      mutate: (value: QualifiedFixture): void => {
        const row = value.entry.requestTemplates[0];
        if (!row) throw new Error("Missing genuine wire template");
        row.requestBase64 = "AAAA".repeat(100);
      },
    },
  ])("rejects $name", async ({ mutate }: QualifiedMutation): Promise<void> => {
    const value = qualifiedFixture();
    mutate(value);
    await expect(readQualified(value)).rejects.toThrow();
  });
});
