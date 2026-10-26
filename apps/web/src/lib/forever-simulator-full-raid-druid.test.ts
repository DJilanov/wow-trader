import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createReviewedFullRaidDruidBuildReader,
  type FullRaidDruidBuildOptions,
} from "./forever-simulator-full-raid-druid";
import {
  fullRaidDruidBuildEntrySchema,
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidBuildReferenceSchema,
  type FullRaidDruidBuildEntry,
  type FullRaidDruidBuildPins,
  type ReviewedFullRaidDruidBuild,
} from "./forever-simulator-full-raid-druid-schema";

const record = z.record(z.string(), z.unknown());
const fixture = z
  .object({
    schema: z.literal("kfc-full-raid-druid-build-reader-unit-contract.v1"),
    unitContractOnly: z.literal(true),
    numericalEvidence: z.literal(false),
    completedAdmissionMocked: z.literal(true),
    model: z.object({
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
    }),
    pins: fullRaidDruidBuildPinsSchema,
    builds: z
      .array(z.object({ build: record, reference: fullRaidDruidBuildReferenceSchema }))
      .length(2),
  })
  .passthrough()
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/druid-full-raid-contract.v1.json.gz", import.meta.url)),
        { maxOutputLength: 1_000_000 },
      ).toString("utf8"),
    ),
  );

interface TestContext {
  build: Record<string, unknown>;
  entry: FullRaidDruidBuildEntry;
  pins: FullRaidDruidBuildPins;
  options: FullRaidDruidBuildOptions;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected fixture object");
  return value as Record<string, unknown>;
}
function context(index = 0): TestContext {
  const row = fixture.builds[index];
  if (!row) throw new Error("Missing Druid contract fixture");
  const build = structuredClone(row.build),
    value: TestContext = {
      build,
      entry: fullRaidDruidBuildEntrySchema.parse({
        id: build.id,
        profile: build.profile,
        build: row.reference,
        settingsSha256: build.settingsSha256,
        referenceDps: build.referenceDps,
        validationIterations: build.validationIterations,
      }),
      pins: structuredClone(fixture.pins),
      options: {
        ...fixture.model,
        reference: async (reference): Promise<unknown> => {
          if (reference.path !== value.entry.build.path) throw new Error("Unexpected fixture read");
          return value.build;
        },
      },
    };
  return value;
}
function resealForSemanticContract(value: TestContext): void {
  const digest = hash(value.build),
    variant = z.enum(["feral", "balance"]).parse(value.build.variant);
  value.entry.build = {
    path:
      "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/exports/build-" +
      variant +
      "-" +
      digest.slice(0, 16) +
      ".json",
    sha256: digest,
  };
  value.pins.builds[value.entry.id] = digest;
}
const read = (value: TestContext): Promise<ReviewedFullRaidDruidBuild> =>
  createReviewedFullRaidDruidBuildReader(value.pins)(value.entry, value.options);

describe("full-raid Druid build-reader contract", (): void => {
  it.each([0, 1])(
    "preserves exact baseline setting/action bytes for spec %i without granting UI admission",
    async (index): Promise<void> => {
      const value = context(index),
        build = await read(value);
      expect(fixture.numericalEvidence).toBe(false);
      expect(fixture.completedAdmissionMocked).toBe(true);
      expect(build).toEqual(value.build);
      expect(hash(build)).toBe(value.pins.builds[value.entry.id]);
      expect(build.referenceDps).toBe(1); // Explicit parser sentinel, never a measured result.
      expect(build.browserHandoffRequired).toBe(true);
      expect(build.publicationAllowed).toBe(false);
      expect(build.scope.bossDebuffOverflowQualified).toBe(false);
      expect(build.rotationGuidance.priorityBindings).toHaveLength(
        build.settings.player.rotation.priorityList.length,
      );
    },
  );

  it("keeps the two specs, professions, range and all guidance distinct", async (): Promise<void> => {
    const builds = await Promise.all([read(context(0)), read(context(1))]);
    expect(builds.map((build) => build.profile)).toEqual(["feral_druid", "balance_druid"]);
    expect(builds.map((build) => build.settings.player.profession2)).toEqual([
      "Leatherworking",
      "Tailoring",
    ]);
    expect(builds.map((build) => build.settings.player.distanceFromTarget)).toEqual([5, 30]);
    expect(builds[0]?.rotationGuidance.instruction).toContain("Cat Form");
    expect(builds[1]?.rotationGuidance.instruction).toContain("Moonkin Form");
  });

  it.each(["gear", "talents", "rotation", "consumes", "score", "guide", "margin", "owner"])(
    "rejects changed %s against unchanged independently supplied pins",
    async (field): Promise<void> => {
      const value = context(),
        settings = object(value.build.settings),
        player = object(settings.player);
      if (field === "gear") object(player.equipment).items = [];
      if (field === "talents") player.talentsString = "";
      if (field === "rotation") object(player.rotation).priorityList = [];
      if (field === "consumes") player.consumes = {};
      if (field === "score") value.build.referenceDps = 9999;
      if (field === "guide") object(value.build.rotationGuidance).priorities = [];
      if (field === "margin") value.build.originalOnePercentAccepted = false;
      if (field === "owner") object(object(value.build.evidence).supervisor).runId = "different";
      await expect(read(value)).rejects.toThrow("checksum changed");
    },
  );

  it.each([
    "coverage",
    "action",
    "source",
    "correction",
    "confirmation",
    "owner",
    "samples",
    "overflow",
    "publication",
  ])(
    "rejects source-breaking %s even with test-only rehashed build pins",
    async (field): Promise<void> => {
      const value = context(),
        evidence = object(value.build.evidence),
        guide = object(value.build.rotationGuidance);
      if (field === "coverage")
        object(object(value.build.scope).freshConfirmationCoverage).sourceOrigins = 99;
      if (field === "action") {
        const bindings = z.array(record).parse(guide.priorityBindings);
        if (!bindings[0]) throw new Error("Missing first action binding");
        bindings[0].actionSha256 = "0".repeat(64);
        guide.priorityBindings = bindings;
      }
      if (field === "source") guide.sourceSettingsSha256 = "0".repeat(64);
      if (field === "correction") object(evidence.correction).byteSha256 = "0".repeat(64);
      if (field === "confirmation") object(evidence.confirmation).byteSha256 = "0".repeat(64);
      if (field === "owner") object(evidence.supervisor).runSha256 = "0".repeat(64);
      if (field === "samples") value.build.validationIterations = 39999;
      if (field === "overflow") object(value.build.scope).bossDebuffOverflowQualified = true;
      if (field === "publication") value.build.publicationAllowed = true;
      resealForSemanticContract(value);
      await expect(read(value)).rejects.toThrow();
    },
  );

  it("preserves separate approved 2% and unsuccessful original 1% assessments", async (): Promise<void> => {
    const value = context();
    value.build.originalOnePercentAccepted = false;
    resealForSemanticContract(value);
    const build = await read(value);
    expect(build.approvedTwoPercentAccepted).toBe(true);
    expect(build.originalOnePercentAccepted).toBe(false);
  });

  it.each([
    [0, "ConjuredRogueThistleTea", true],
    [0, "ConjuredThistleTea", false],
    [1, "ConjuredRogueThistleTea", false],
  ] as const)(
    "checks the source-admitted tea protocol for spec %i and enum %s",
    async (index, conjured, accepted): Promise<void> => {
      const value = context(index),
        settings = object(value.build.settings),
        player = object(settings.player),
        consumes = object(player.consumes),
        state = object(value.build.state),
        guide = object(value.build.rotationGuidance);
      consumes.defaultConjured = conjured;
      state.conjured = "tea";
      guide.conjured = "tea";
      guide.selectedConsumes = structuredClone(consumes);
      object(guide.consumeSummary).conjured = "Thistle Tea";
      guide.stateSha256 = hash(state);
      guide.consumesSha256 = hash(consumes);
      value.build.settingsSha256 = hash(settings);
      guide.sourceSettingsSha256 = value.build.settingsSha256;
      value.entry.settingsSha256 = z.string().parse(value.build.settingsSha256);
      resealForSemanticContract(value);
      if (accepted) expect((await read(value)).rotationGuidance.conjured).toBe("tea");
      else await expect(read(value)).rejects.toThrow("conjured resource");
    },
  );

  it.each(["sourceRelease", "revision", "databaseSha256"] as const)(
    "rejects a different runtime %s",
    async (field): Promise<void> => {
      const value = context();
      await expect(
        createReviewedFullRaidDruidBuildReader(value.pins)(value.entry, {
          ...value.options,
          [field]: "foreign",
        }),
      ).rejects.toThrow("reviewed setup");
    },
  );

  it("captures pin values independently of later caller mutation", async (): Promise<void> => {
    const value = context(),
      reader = createReviewedFullRaidDruidBuildReader(value.pins);
    value.pins.builds[value.entry.id] = "0".repeat(64);
    expect((await reader(value.entry, value.options)).id).toBe(value.entry.id);
  });

  it.each([
    "../build.json",
    "https://example.invalid/build.json",
    "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/exports/../build.json",
  ])("rejects foreign reference %s before storage reads", async (path): Promise<void> => {
    const value = context();
    let reads = 0;
    await expect(
      createReviewedFullRaidDruidBuildReader(value.pins)(
        {
          ...value.entry,
          build: { ...value.entry.build, path },
        },
        {
          ...value.options,
          reference: async (): Promise<unknown> => {
            reads += 1;
            return value.build;
          },
        },
      ),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  });

  it("rejects crossed spec/profile entries before storage reads", async (): Promise<void> => {
    const value = context();
    await expect(
      createReviewedFullRaidDruidBuildReader(value.pins)(
        { ...value.entry, profile: "balance_druid" },
        {
          ...value.options,
          reference: async (): Promise<unknown> => {
            throw new Error("Storage must not be read");
          },
        },
      ),
    ).rejects.toThrow();
  });
});
