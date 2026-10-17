import { describe, expect, it } from "vitest";
import { SIMULATOR_REVISION, SIMULATOR_SPECS, simulatorManifestSchema } from "./simulator.js";

const legacy = {
  schema: "kfc-forever-simulator.v1",
  release: "a".repeat(24),
  upstream: "https://github.com/gunba/wow-forever-sim",
  revision: SIMULATOR_REVISION,
  preparedAt: "2026-10-16T00:00:00Z",
  itemCount: 1928,
  excludedModeledItems: 939,
  pages: SIMULATOR_SPECS.map((spec) => spec.page),
  files: {},
  dataProvenance: "pinned-upstream-forever-data",
  mechanicsStatus: "beta_model",
};

describe("simulator manifest provenance compatibility", () => {
  it("accepts previous immutable releases for rollback", () => {
    expect(simulatorManifestSchema.safeParse(legacy).success).toBe(true);
  });
  it("accepts explicitly labelled Classic references with reconciled counts", () => {
    expect(
      simulatorManifestSchema.parse({
        ...legacy,
        itemCount: 2565,
        currentItemCount: 1928,
        provisionalItemCount: 637,
        dataProvenance: "pinned-forever-with-labelled-classic-pre-raid-references",
      }).provisionalItemCount,
    ).toBe(637);
  });
  it("rejects missing, partial or inconsistent provenance counts", () => {
    for (const fields of [
      { dataProvenance: "pinned-forever-with-labelled-classic-pre-raid-references" },
      { currentItemCount: 1928 },
      { currentItemCount: 1928, provisionalItemCount: 637 },
      { dataProvenance: "unverified" },
    ])
      expect(simulatorManifestSchema.safeParse({ ...legacy, ...fields }).success).toBe(false);
  });
});
