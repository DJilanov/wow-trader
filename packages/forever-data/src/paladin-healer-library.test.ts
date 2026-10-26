import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealerLibraryCandidateSchema,
  type PaladinHealerLibraryCandidate,
} from "./paladin-healer-library.js";

const bytes = readFileSync(
  new URL(
    "../../../infra/simulator/fixtures/paladin-healing-library-source.v1.json.gz",
    import.meta.url,
  ),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "6fdd0739773860ac0260149a125bd9742726a96f31f22b8018e9d45c569299e5",
);
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healing-library-fixture.v1"),
    library: z.unknown(),
    newNumericalRequests: z.literal(0),
    publicationAllowed: z.literal(false),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const library = paladinHealerLibraryCandidateSchema.parse(fixture.library);
const copy = (): PaladinHealerLibraryCandidate => structuredClone(library);
const checksum = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("Paladin healer library candidate contract", () => {
  it("accepts every actual group, configuration, workload and item without dropping data", () => {
    expect(library).toBe(fixture.library);
    expect(library.groups).toHaveLength(18);
    expect(library.configurations).toHaveLength(504);
    expect(library.workloads).toHaveLength(330);
    expect(library.catalog).toHaveLength(2243);
    expect(JSON.stringify(library)).toBe(JSON.stringify(fixture.library));
  });

  it("preserves every original workload and complete numerical request identity", () => {
    for (const workload of library.workloads) expect(checksum(workload.frame)).toBe(workload.id);
    for (const configuration of library.configurations) {
      expect(
        checksum({
          runtimeSha256: library.model.runtimeSha256,
          requestBase64: configuration.job.requestBase64,
          workloadSha256: configuration.workloadId,
          detail: false,
        }),
      ).toBe(configuration.sourceEvidence.requestKeys[0]);
    }
  });

  it("retains actual mana-elixir, potion, resource-order and Vigil priority fields", () => {
    expect(new Set(library.configurations.map((entry) => entry.option.resourceOrder))).toEqual(
      new Set(["as-declared", "rune-last"]),
    );
    expect(library.configurations.every((entry) => entry.option.manaRegenElixir === 2)).toBe(true);
    expect(library.configurations.every((entry) => entry.option.consumes.defaultPotion > 0)).toBe(
      true,
    );
    expect(
      library.workloads.filter((entry) =>
        entry.frame.priorities.some(
          (priority) => priority.maintainVigil !== undefined || priority.requireVigil !== undefined,
        ),
      ),
    ).toHaveLength(83);
  });

  it("rejects unknown fields in the library and internal context state", () => {
    expect(
      paladinHealerLibraryCandidateSchema.safeParse({ ...library, unexpected: true }).success,
    ).toBe(false);
    const value = copy();
    const first = value.groups[0];
    if (!first) throw new Error("Missing actual group");
    value.groups[0] = { ...first, context: { ...first.context, ...{ currentIds: {} } } };
    expect(paladinHealerLibraryCandidateSchema.safeParse(value).success).toBe(false);
  });

  it("rejects unknown scenario links and duplicate configurations", () => {
    const missing = copy();
    const first = missing.configurations[0];
    if (!first) throw new Error("Missing actual configuration");
    first.workloadId = "0".repeat(64);
    expect(paladinHealerLibraryCandidateSchema.safeParse(missing).success).toBe(false);
    const duplicate = copy();
    const original = duplicate.configurations[0];
    if (!original) throw new Error("Missing actual configuration");
    duplicate.configurations[1] = original;
    expect(paladinHealerLibraryCandidateSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects another race or profession inheriting a measured result", () => {
    const value = copy();
    const first = value.groups[0];
    if (!first) throw new Error("Missing actual group");
    first.context.raceId = 8;
    expect(paladinHealerLibraryCandidateSchema.safeParse(value).success).toBe(false);
    const professions = {
      ...library,
      groups: library.groups.map((entry, index) =>
        index === 0 ? { ...entry, context: { ...entry.context, professions: [4, 8] } } : entry,
      ),
    };
    expect(paladinHealerLibraryCandidateSchema.safeParse(professions).success).toBe(false);
  });

  it("rejects missing selected items and mismatched source identities", () => {
    const value = copy();
    const first = value.configurations[0];
    if (!first) throw new Error("Missing actual configuration");
    const selectedId = first.option.gear.items[0]?.id;
    value.catalog = value.catalog.filter((entry) => entry.item.id !== selectedId);
    expect(paladinHealerLibraryCandidateSchema.safeParse(value).success).toBe(false);
    const mismatch = copy();
    const config = mismatch.configurations[0];
    if (!config) throw new Error("Missing actual configuration");
    config.sourceEvidence.optionId = "0".repeat(64);
    expect(paladinHealerLibraryCandidateSchema.safeParse(mismatch).success).toBe(false);
  });

  it("rejects changed reference averages, iterations and nonfinite measurements", () => {
    const value = copy();
    const first = value.configurations[0];
    if (!first) throw new Error("Missing actual configuration");
    first.reference.hps += 1;
    expect(paladinHealerLibraryCandidateSchema.safeParse(value).success).toBe(false);
    const iterations = copy();
    const reference = iterations.configurations[0]?.reference;
    if (!reference) throw new Error("Missing actual reference");
    reference.iterations += 1;
    expect(paladinHealerLibraryCandidateSchema.safeParse(iterations).success).toBe(false);
    const nonfinite = copy();
    const measurement = nonfinite.configurations[0]?.reference.summaries[0];
    if (!measurement) throw new Error("Missing actual summary");
    measurement.hps = NaN;
    expect(paladinHealerLibraryCandidateSchema.safeParse(nonfinite).success).toBe(false);
  });

  it("reports malformed source JSON as a validation issue rather than throwing", () => {
    const value = copy();
    const first = value.configurations[0];
    if (!first) throw new Error("Missing actual configuration");
    first.sourceCaseKey = "invalid-json";
    first.sourceEvidence.caseKey = first.sourceCaseKey;
    const result = paladinHealerLibraryCandidateSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) => issue.message === "Invalid source case identity"),
      ).toBe(true);
  });

  it("retains duplicate-sample rejection even when source and reference rounds are both edited", () => {
    const value = copy();
    const first = value.configurations[0];
    const seed = first?.reference.rounds[0]?.seed;
    if (!first || !seed || !first.reference.rounds[1] || !first.sourceEvidence.rounds[1])
      throw new Error("Missing actual rounds");
    first.reference.rounds[1].seed = seed;
    first.sourceEvidence.rounds[1].seed = seed;
    expect(paladinHealerLibraryCandidateSchema.safeParse(value).success).toBe(false);
  });

  it("does not grant five-minute, spread, full-class or website qualification", () => {
    for (const invalid of [
      { ...library, publicationAllowed: true },
      { ...library, websiteAdmissionComplete: true },
      { ...library, fullClassQualified: true },
      { ...library, scope: { ...library.scope, durationSeconds: 300 } },
      { ...library, scope: { ...library.scope, layout: "spread" } },
    ])
      expect(paladinHealerLibraryCandidateSchema.safeParse(invalid).success).toBe(false);
  });
});
