import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidHunterBuildEntrySchema,
  readReviewedFullRaidHunterBuild,
  verifiedFullRaidHunterDelivery,
  type FullRaidHunterBuildEntry,
  type FullRaidHunterBuildOptions,
} from "./forever-simulator-full-raid-hunter";

const record = z.record(z.string(), z.unknown()),
  fixture = z
    .object({
      schema: z.literal("kfc-reviewed-full-raid-hunter-build-fixture.v1"),
      builds: z.array(z.object({ reference: record, build: record }).strict()).length(3),
    })
    .passthrough()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(new URL("./fixtures/hunter-full-raid-builds.v1.json.gz", import.meta.url)),
          { maxOutputLength: 1_000_000 },
        ).toString("utf8"),
      ),
    );

interface TestContext {
  entry: FullRaidHunterBuildEntry;
  build: Record<string, unknown>;
  options: FullRaidHunterBuildOptions;
}
function context(index = 0): TestContext {
  const row = fixture.builds[index];
  if (!row) throw new Error("Missing reviewed Hunter fixture");
  const build = structuredClone(row.build),
    entry = fullRaidHunterBuildEntrySchema.parse({
      id: build.id,
      profile: "hunter",
      build: row.reference,
      settingsSha256: build.settingsSha256,
      referenceDps: build.referenceDps,
      validationIterations: build.validationIterations,
    });
  return {
    entry,
    build,
    options: {
      sourceRelease: verifiedFullRaidHunterDelivery.sourceRelease,
      revision: z.string().parse(build.revision),
      databaseSha256: verifiedFullRaidHunterDelivery.databaseSha256,
      reference: async (reference): Promise<unknown> => {
        if (reference.path !== row.reference.path) throw new Error("Unexpected evidence read");
        return build;
      },
    },
  };
}

describe("reviewed full-raid Hunter build reader", (): void => {
  it.each([0, 1, 2])(
    "reads exact actual primary %i while keeping browser delivery pending",
    async (index): Promise<void> => {
      const value = context(index),
        build = await readReviewedFullRaidHunterBuild(value.entry, value.options);
      expect(build).toEqual(value.build);
      expect(createHash("sha256").update(JSON.stringify(build)).digest("hex")).toBe(
        value.entry.build.sha256,
      );
      expect(createHash("sha256").update(JSON.stringify(build.settings)).digest("hex")).toBe(
        value.entry.settingsSha256,
      );
      expect(build.validationIterations).toBe([360000, 400000, 400000][index]);
      expect(build.approvedTwoPercentAccepted && build.originalOnePercentAccepted).toBe(true);
      expect(build.browserHandoffRequired).toBe(true);
      expect(build.publicationAllowed).toBe(false);
      expect(build.scope.bossDebuffOverflowQualified).toBe(false);
      expect(build.rotationGuidance.priorityBindings).toHaveLength(
        build.settings.player.rotation.priorityList.length,
      );
    },
  );

  it("preserves all talent strings, pet/ammo choices and the three Survival pre-pull actions", async (): Promise<void> => {
    const builds = await Promise.all(
      [0, 1, 2].map(
        async (index): Promise<Awaited<ReturnType<typeof readReviewedFullRaidHunterBuild>>> => {
          const value = context(index);
          return readReviewedFullRaidHunterBuild(value.entry, value.options);
        },
      ),
    );
    expect(builds.map((build) => build.rotationGuidance.talents)).toEqual([
      "31/20/0",
      "7/40/4",
      "16/4/31",
    ]);
    expect(builds.map((build) => build.rotationGuidance.prepull.length)).toEqual([1, 1, 3]);
    expect(builds.map((build) => build.rotationGuidance.petType)).toEqual(["Raptor", "Cat", "Cat"]);
    expect(builds.map((build) => build.rotationGuidance.selectedAmmo)).toEqual([
      "ThoriumShells",
      "ThoriumShells",
      "ThoriumHeadedArrow",
    ]);
    expect(builds[2]?.rotationGuidance.prepull[2]).toContain("Hunter's Mark");
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
    "pet",
    "ammo",
    "samples",
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
      if (field === "samples") value.build.validationIterations = 40000;
      if (field === "pet" || field === "ammo") {
        const hunter = record.parse(player.hunter),
          options = record.parse(hunter.options);
        hunter.options = {
          ...options,
          [field === "pet" ? "petType" : "ammo"]:
            field === "pet" ? "PetNone" : "ThoriumHeadedArrow",
        };
        player.hunter = hunter;
      }
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
      await expect(readReviewedFullRaidHunterBuild(value.entry, value.options)).rejects.toThrow(
        "checksum changed",
      );
    },
  );

  it.each(["sourceRelease", "revision", "databaseSha256"] as const)(
    "rejects a different runtime %s",
    async (field): Promise<void> => {
      const value = context();
      await expect(
        readReviewedFullRaidHunterBuild(value.entry, { ...value.options, [field]: "foreign" }),
      ).rejects.toThrow("reviewed setup");
    },
  );

  it.each(["id", "settingsSha256", "referenceDps", "validationIterations"] as const)(
    "rejects a changed library entry %s",
    async (field): Promise<void> => {
      const value = context(),
        entry = {
          ...value.entry,
          [field]:
            field === "id"
              ? "hunter-marksmanship-static"
              : field === "referenceDps"
                ? 1
                : field === "validationIterations"
                  ? 40000
                  : "a".repeat(64),
        };
      await expect(readReviewedFullRaidHunterBuild(entry, value.options)).rejects.toThrow();
    },
  );

  it.each([
    "../../build.json",
    "artifacts/forever-simulator/optimization/hunter-full-raid-v2/../build.json",
    "https://example.invalid/build.json",
  ])("rejects an unsafe evidence path %s before I/O", async (path): Promise<void> => {
    const value = context();
    let calls = 0;
    await expect(
      readReviewedFullRaidHunterBuild(
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
      readReviewedFullRaidHunterBuild(
        { ...value.entry, build: { ...value.entry.build, sha256: "a".repeat(64) } },
        value.options,
      ),
    ).rejects.toThrow("independently reviewed primary");
  });
});
