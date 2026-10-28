import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseShamanHealerCatalogPayload,
  parseShamanHealerGroupPayload,
  shamanHealerConsumesSchema,
  shamanHealerGroupPayloadSchema,
  shamanHealerLibraryIndexSchema,
} from "./shaman-healer-library.js";

const bytes = readFileSync(new URL("./fixtures/shaman-healer-library.v1.json.gz", import.meta.url));
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "aa0f38d0c2daa41b120920176ed88101dda93a9df43b2b7445c7119fe59b6bee",
);
const fixture = z
  .object({
    schema: z.literal("kfc-shaman-healer-library-fixture.v1"),
    index: z.unknown(),
    payload: z.unknown(),
    catalog: z.unknown(),
    sourceReview: z.object({ path: z.string(), byteSha256: z.string().length(64) }),
    noNewSimulationsExecuted: z.literal(true),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const index = shamanHealerLibraryIndexSchema.parse(fixture.index);
const payload = parseShamanHealerGroupPayload(index, fixture.payload);
const catalog = parseShamanHealerCatalogPayload(index, fixture.catalog);

describe("Shaman independently measured library", () => {
  it("retains the five-race library and a legal Dwarf default without borrowing Horde gear", () => {
    const bytes = readFileSync(
      new URL("./fixtures/shaman-healer-library.v2.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "48878c4f2391b017c779f16ea405ec03077ed5d59e3c1424407d34a343d8a2fb",
    );
    const actual = z
      .object({
        schema: z.literal("kfc-shaman-healer-library-fixture.v1"),
        index: z.unknown(),
        payload: z.unknown(),
        catalog: z.unknown(),
        sourceReviews: z
          .array(z.object({ path: z.string(), byteSha256: z.string().length(64) }))
          .length(2),
        noNewSimulationsExecuted: z.literal(true),
        publicationAllowed: z.literal(false),
      })
      .strict()
      .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
    const index = shamanHealerLibraryIndexSchema.parse(actual.index);
    const payload = parseShamanHealerGroupPayload(index, actual.payload);
    const catalog = parseShamanHealerCatalogPayload(index, actual.catalog);
    expect(index).toEqual(actual.index);
    expect(payload).toEqual(actual.payload);
    expect(catalog).toEqual(actual.catalog);
    expect(index.groups).toHaveLength(45);
    expect(index.groups.flatMap((entry) => entry.group.configurationIds)).toHaveLength(198);
    expect(
      [...new Set(index.groups.map((entry) => entry.group.race))].sort((a, b) => a - b),
    ).toEqual([1, 5, 6, 7, 10]);
    expect(payload.group.race).toBe(1);
    expect(payload.group.profileId).toBe("1-4-11");
    expect(payload.group.id).toBe(index.defaultGroupId);
    expect(payload.configurations).toHaveLength(2);
    for (const config of payload.configurations) {
      expect(config.gear.some((item) => item.id === 18471)).toBe(false);
      for (const item of config.gear)
        if (item.id)
          expect(
            catalog.catalog.find((entry) => entry.item.id === item.id)?.availableProfileIds,
          ).toContain("1-4-11");
    }
  });

  it("retains actual group, catalog and four-batch reference data without dropping fields", () => {
    expect(index).toEqual(fixture.index);
    expect(payload).toEqual(fixture.payload);
    expect(catalog).toEqual(fixture.catalog);
    expect(index.groups).toHaveLength(9);
    expect(index.groups.flatMap((entry) => entry.group.configurationIds)).toHaveLength(126);
    expect(payload.configurations).toHaveLength(14);
    expect(catalog.catalog).toHaveLength(2025);
    expect(payload.group.id).toBe(index.defaultGroupId);
    expect(payload.configurations.every((entry) => entry.evidence.results.length === 4)).toBe(true);
    expect(payload.configurations.every((entry) => entry.evidence.observedPractical2Percent)).toBe(
      true,
    );
    expect(
      payload.configurations.find((entry) => entry.id === payload.group.defaultConfigurationId)
        ?.scenarioId,
    ).toBe("unscaled-reference.per-five-reference");
    expect(fixture.sourceReview.byteSha256).toBe(
      "82257c76004ce35acfe29d07a7013af6d63a8d890633c35e232ceae28836c4d2",
    );
  });

  it("keeps different mechanics references paired with their own full builds", () => {
    for (const entry of payload.configurations) {
      expect(entry.scenarioId).toBe(
        entry.job.workload.workload.rankScaling!.id + "." + entry.job.workload.mp5Model,
      );
      expect(new Set(entry.evidence.rounds.map((round) => round.seed)).size).toBe(4);
      expect(entry.evidence.rounds.reduce((sum, round) => sum + round.iterations, 0)).toBe(1024);
      expect(Object.values(entry.fields).reduce((sum, points) => sum + points, 0)).toBe(51);
      expect(entry.evidence.results.every((result) => result.survivalRate === 1)).toBe(true);
    }
  });

  it("rejects borrowed performance for changed gear, talents, race or workload profile", () => {
    for (const change of ["gear", "talents", "race", "profile", "runtime"] as const) {
      const changed = structuredClone(payload),
        config = changed.configurations[0]!;
      if (change === "gear")
        config.gear[0] = {
          id: catalog.catalog.find((entry) => entry.item.id !== config.gear[0]!.id)!.item.id,
        };
      if (change === "talents") config.fields = {};
      if (change === "race") config.race = 1;
      if (change === "profile") config.profileId = "1-4-11";
      if (change === "runtime") config.job.workload.runtimeIdentity = "a".repeat(64);
      expect(shamanHealerGroupPayloadSchema.safeParse(changed).success, change).toBe(false);
    }
  });

  it("rejects reduced or inflated evidence and false publication flags", () => {
    for (const change of [
      "survival",
      "seed",
      "iterations",
      "margin",
      "damage",
      "publication",
    ] as const) {
      const changed = structuredClone(payload),
        config = changed.configurations[0]!;
      if (change === "survival") config.evidence.results[0]!.survivalRate = 0.99;
      if (change === "seed") config.evidence.rounds[0]!.seed = config.evidence.rounds[1]!.seed;
      if (change === "iterations") config.evidence.rounds[0]!.iterations = 1;
      if (change === "margin") config.evidence.largestComparison95Upper = 0.03;
      if (change === "damage")
        config.evidence.results[0]!.plannedIncomingPostMitigationDamage += 10;
      const input: unknown =
        change === "publication" ? { ...changed, publicationAllowed: true } : changed;
      expect(shamanHealerGroupPayloadSchema.safeParse(input).success, change).toBe(false);
    }
  });

  it("rejects missing configurations, wrong groups and another model's catalog", () => {
    const duplicate = structuredClone(payload);
    duplicate.configurations[1] = duplicate.configurations[0]!;
    expect(shamanHealerGroupPayloadSchema.safeParse(duplicate).success).toBe(false);
    expect(() => parseShamanHealerGroupPayload({ ...index, groups: [] }, payload)).toThrow();
    expect(() =>
      parseShamanHealerCatalogPayload(index, { ...catalog, modelIdentity: "a".repeat(64) }),
    ).toThrow();
    expect(() =>
      parseShamanHealerCatalogPayload(index, { ...catalog, runtimeIdentity: "a".repeat(64) }),
    ).toThrow();
    expect(
      shamanHealerLibraryIndexSchema.safeParse({
        ...index,
        groups: [index.groups[0], index.groups[0]],
      }).success,
    ).toBe(false);
    expect(
      shamanHealerLibraryIndexSchema.safeParse({
        ...index,
        catalog: { ...index.catalog, file: "../catalog.json" },
      }).success,
    ).toBe(false);
    expect(shamanHealerLibraryIndexSchema.safeParse({ ...index, undocumented: true }).success).toBe(
      false,
    );
  });

  it("retains nonraid Blasted Lands buffs and rejects raid Zanza and unsupported consume fields", () => {
    for (const entry of payload.configurations)
      expect(shamanHealerConsumesSchema.parse(entry.consumes)).toEqual(entry.consumes);
    for (const input of [
      { zanzaBuff: 1 },
      { food: 5 },
      { manaRegenElixir: 1 },
      { flask: 5 },
      { mainHandImbue: 17 },
      { healthElixir: Number.NaN },
      { miscConsumes: { raptorPunch: true, undocumented: true } },
      { powerInfusions: 1 },
    ])
      expect(shamanHealerConsumesSchema.safeParse(input).success).toBe(false);
  });
});
