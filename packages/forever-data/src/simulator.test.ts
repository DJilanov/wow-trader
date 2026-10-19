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
  it("accepts a disclosed item-skill policy without loosening other manifest fields", () => {
    const itemWeaponSkillPolicy = {
      schema: "kfc-item-weapon-skills.v1",
      mode: "ignore-item-bonuses",
      basis: "owner-directed-model-assumption",
      notice: "Synthetic unit-test policy only; not server verification.",
      changes: [{ id: 18392, name: "Distracting Dagger", previousWeaponSkills: [0, 0, 0, 0, 6] }],
    };
    expect(
      simulatorManifestSchema.parse({ ...legacy, itemWeaponSkillPolicy }).itemWeaponSkillPolicy,
    ).toEqual(itemWeaponSkillPolicy);
    for (const changed of [
      { mode: "delete-items" },
      { basis: "server-verified" },
      { unknown: true },
      { changes: [{ id: 18392, previousWeaponSkills: [NaN] }] },
    ])
      expect(
        simulatorManifestSchema.safeParse({
          ...legacy,
          itemWeaponSkillPolicy: { ...itemWeaponSkillPolicy, ...changed },
        }).success,
      ).toBe(false);
    expect(
      simulatorManifestSchema.safeParse({ ...legacy, unknownManifestProperty: true }).success,
    ).toBe(false);
  });
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
