import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidRogueBuildEntrySchema,
  readReviewedFullRaidRogueBuild,
  verifiedFullRaidRogueDelivery,
  type FullRaidRogueBuildEntry,
  type FullRaidRogueBuildOptions,
} from "./forever-simulator-full-raid-rogue";

const record = z.record(z.string(), z.unknown()),
  fixture = z
    .object({
      schema: z.literal("kfc-reviewed-full-raid-rogue-build-fixture.v1"),
      builds: z.array(z.object({ reference: record, build: record }).strict()).length(3),
    })
    .passthrough()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(new URL("./fixtures/rogue-full-raid-builds.v1.json.gz", import.meta.url)),
          { maxOutputLength: 1_000_000 },
        ).toString("utf8"),
      ),
    );

interface TestContext {
  entry: FullRaidRogueBuildEntry;
  build: Record<string, unknown>;
  options: FullRaidRogueBuildOptions;
}
function context(index = 0): TestContext {
  const row = fixture.builds[index];
  if (!row) throw new Error("Missing reviewed Rogue fixture");
  const build = structuredClone(row.build),
    entry = fullRaidRogueBuildEntrySchema.parse({
      id: build.id,
      profile: "rogue",
      build: row.reference,
      settingsSha256: build.settingsSha256,
      referenceDps: build.referenceDps,
      validationIterations: build.validationIterations,
    });
  return {
    entry,
    build,
    options: {
      sourceRelease: verifiedFullRaidRogueDelivery.sourceRelease,
      revision: z.string().parse(build.revision),
      databaseSha256: verifiedFullRaidRogueDelivery.databaseSha256,
      reference: async (reference): Promise<unknown> => {
        if (reference.path !== row.reference.path) throw new Error("Unexpected evidence read");
        return build;
      },
    },
  };
}

describe("reviewed full-raid Rogue build reader", (): void => {
  it.each([0, 1, 2])(
    "reads exact actual primary %i while keeping browser delivery pending",
    async (index): Promise<void> => {
      const value = context(index),
        build = await readReviewedFullRaidRogueBuild(value.entry, value.options);
      expect(build).toEqual(value.build);
      expect(createHash("sha256").update(JSON.stringify(build)).digest("hex")).toBe(
        value.entry.build.sha256,
      );
      expect(createHash("sha256").update(JSON.stringify(build.settings)).digest("hex")).toBe(
        value.entry.settingsSha256,
      );
      expect(build.validationIterations).toBe(40000);
      expect(build.approvedTwoPercentAccepted && build.originalOnePercentAccepted).toBe(true);
      expect(build.browserHandoffRequired).toBe(true);
      expect(build.publicationAllowed).toBe(false);
      expect(build.scope.bossDebuffOverflowQualified).toBe(false);
      expect(build.rotationGuidance.priorityBindings).toHaveLength(
        build.settings.player.rotation.priorityList.length,
      );
    },
  );

  it("preserves the real Combat pre-pull cooldown and each spec's different talent allocation", async (): Promise<void> => {
    const builds = await Promise.all(
      [0, 1, 2].map(
        async (index): Promise<Awaited<ReturnType<typeof readReviewedFullRaidRogueBuild>>> => {
          const value = context(index);
          return readReviewedFullRaidRogueBuild(value.entry, value.options);
        },
      ),
    );
    expect(builds.map((build) => build.rotationGuidance.talents)).toEqual([
      [16, 33, 2],
      [30, 21, 0],
      [30, 0, 21],
    ]);
    expect(builds[0]?.rotationGuidance.prepull[0]).toContain(
      "1 second before the pull: Use Blade Flurry",
    );
    expect(builds[1]?.rotationGuidance.prepull).toEqual([]);
    expect(builds[2]?.rotationGuidance.prepull).toEqual([]);
  });

  it.each([
    "gear",
    "talents",
    "rotation",
    "consumes",
    "professions",
    "score",
    "guide",
    "margin",
    "overflow",
    "publication",
  ])(
    "rejects changed %s even if an incoming document claims acceptance",
    async (field): Promise<void> => {
      const value = context(),
        settings = record.parse(value.build.settings),
        player = record.parse(settings.player);
      if (field === "gear") player.equipment = { ...record.parse(player.equipment), items: [] };
      if (field === "talents") player.talentsString = "";
      if (field === "rotation")
        player.rotation = { ...record.parse(player.rotation), priorityList: [] };
      if (field === "consumes") player.consumes = {};
      if (field === "professions") player.profession1 = "Tailoring";
      if (field === "score") value.build.referenceDps = 9999;
      if (field === "guide")
        value.build.rotationGuidance = {
          ...record.parse(value.build.rotationGuidance),
          prepull: [],
        };
      if (field === "margin") value.build.originalOnePercentAccepted = false;
      if (field === "overflow")
        value.build.scope = {
          ...record.parse(value.build.scope),
          bossDebuffOverflowQualified: true,
        };
      if (field === "publication") value.build.publicationAllowed = true;
      settings.player = player;
      value.build.settings = settings;
      await expect(readReviewedFullRaidRogueBuild(value.entry, value.options)).rejects.toThrow(
        "checksum changed",
      );
    },
  );

  it.each(["sourceRelease", "revision", "databaseSha256"] as const)(
    "rejects a different runtime %s",
    async (field): Promise<void> => {
      const value = context();
      await expect(
        readReviewedFullRaidRogueBuild(value.entry, { ...value.options, [field]: "foreign" }),
      ).rejects.toThrow("exact reviewed setup or model");
    },
  );

  it.each(["id", "settingsSha256", "referenceDps"] as const)(
    "rejects a changed library entry %s",
    async (field): Promise<void> => {
      const value = context(),
        entry = {
          ...value.entry,
          [field]:
            field === "id"
              ? "rogue-mutilate-static"
              : field === "referenceDps"
                ? 1
                : "a".repeat(64),
        };
      await expect(readReviewedFullRaidRogueBuild(entry, value.options)).rejects.toThrow();
    },
  );

  it.each([
    "../../build.json",
    "artifacts/forever-simulator/optimization/rogue-full-raid-v2/../build.json",
    "https://example.invalid/build.json",
  ])("rejects an unsafe evidence path %s before I/O", async (path): Promise<void> => {
    const value = context();
    let calls = 0;
    await expect(
      readReviewedFullRaidRogueBuild(
        { ...value.entry, build: { ...value.entry.build, path } },
        {
          ...value.options,
          reference: async (): Promise<unknown> => {
            calls++;
            return value.build;
          },
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("requires another review for any replacement export instead of trusting its self-reported digest", async (): Promise<void> => {
    const value = context();
    await expect(
      readReviewedFullRaidRogueBuild(
        { ...value.entry, build: { ...value.entry.build, sha256: "a".repeat(64) } },
        value.options,
      ),
    ).rejects.toThrow("independently reviewed primaries");
  });
});
