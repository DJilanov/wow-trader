import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  encodeHealerTalents,
  healerGearProblem,
  healerLibrarySchema,
  healerTalentProblem,
  healingResultSchema,
  priestHealingItemPolicySchema,
} from "./healing-simulator.js";

const source: unknown = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/healer-library.v1.json.gz", import.meta.url)),
  ).toString(),
);
const library = healerLibrarySchema.parse(source);

describe("Priest healing library contracts", () => {
  it("requires owned ring defaults and their explicit use to agree on version two", () => {
    const current = structuredClone(library);
    current.itemEffectsVersion = 2;
    for (const build of current.builds)
      build.workload.itemEffectsPolicy = {
        schema: "kfc-priest-item-effects-policy.v1",
        id: "heart-client-literal",
        dormantHeartProcChance: 1,
        dormantHeartHealingEvents: "completed-casts",
      };
    expect(healerLibrarySchema.safeParse(current).success).toBe(true);
    const ring = current.items.find(
      (item) => item.slots.includes(10) && item.faction === null && item.questChoices.length === 0,
    )!;
    current.items.push({ ...ring, id: 13143 });
    current.builds[0]!.gear[10] = { id: 13143 };
    expect(healerLibrarySchema.safeParse(current).success).toBe(false);
    current.builds[0]!.workload.cooldowns.push({
      spellId: 17252,
      minimumMissingMana: 22,
      requireHealingDemand: true,
    });
    expect(healerLibrarySchema.safeParse(current).success).toBe(true);
    current.builds[0]!.gear[10] = { id: 0 };
    expect(healerLibrarySchema.safeParse(current).success).toBe(false);
    expect(healerLibrarySchema.safeParse({ ...current, itemEffectsVersion: 3 }).success).toBe(
      false,
    );
  });

  it("validates explicit Heart policy values and preserves older libraries", () => {
    expect(library.itemEffectsVersion).toBeUndefined();
    const policy = {
      schema: "kfc-priest-item-effects-policy.v1",
      id: "heart-client-literal",
      dormantHeartProcChance: 1,
      dormantHeartHealingEvents: "completed-casts",
    };
    expect(priestHealingItemPolicySchema.parse(policy)).toEqual(policy);
    for (const chance of [null, Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])
      expect(
        priestHealingItemPolicySchema.safeParse({ ...policy, dormantHeartProcChance: chance })
          .success,
      ).toBe(false);
    expect(priestHealingItemPolicySchema.safeParse({ ...policy, extra: 1 }).success).toBe(false);
    expect(
      priestHealingItemPolicySchema.safeParse({ ...policy, dormantHeartHealingEvents: "periodic" })
        .success,
    ).toBe(false);
  });

  it("requires an upgraded model and complete paired references for Heart-off scenarios", () => {
    const upgraded = structuredClone(library);
    upgraded.itemEffectsVersion = 1;
    upgraded.rankPolicies.push(
      ...library.rankPolicies.map((policy) => ({ ...policy, id: policy.id + "-heart-zero" })),
    );
    for (const build of upgraded.builds) {
      build.workload.itemEffectsPolicy = {
        schema: "kfc-priest-item-effects-policy.v1",
        id: "heart-client-literal",
        dormantHeartProcChance: 1,
        dormantHeartHealingEvents: "completed-casts",
      };
      build.references.push(
        ...build.references.map((reference) => ({
          ...reference,
          policyId: reference.policyId + "-heart-zero",
        })),
      );
    }
    expect(healerLibrarySchema.safeParse(upgraded).success).toBe(true);
    const unsupported = structuredClone(upgraded);
    delete unsupported.itemEffectsVersion;
    expect(healerLibrarySchema.safeParse(unsupported).success).toBe(false);
    const unsupportedPolicy = structuredClone(library);
    unsupportedPolicy.builds[0]!.workload.itemEffectsPolicy =
      upgraded.builds[0]!.workload.itemEffectsPolicy;
    expect(healerLibrarySchema.safeParse(unsupportedPolicy).success).toBe(false);
    const mismatched = structuredClone(upgraded);
    mismatched.rankPolicies[7]!.fullScalingGap += 1;
    expect(healerLibrarySchema.safeParse(mismatched).success).toBe(false);
    upgraded.builds[0]!.references.pop();
    expect(healerLibrarySchema.safeParse(upgraded).success).toBe(false);
    const duplicateReference = structuredClone(library);
    duplicateReference.builds[0]!.references[1] = duplicateReference.builds[0]!.references[0]!;
    expect(healerLibrarySchema.safeParse(duplicateReference).success).toBe(false);
  });

  it("accepts an actual selected build with its client talents, enchants and seven scaling cases", () => {
    const build = library.builds[0]!;
    expect(healerTalentProblem(library.talents, build.fields, true)).toBeNull();
    expect(encodeHealerTalents(library.talents, build.fields)).toBe(build.talentsString);
    expect(healerGearProblem(build.gear, library.items, "Horde")).toBeNull();
    expect(build.references).toHaveLength(7);
    expect(build.references.every((reference) => reference.iterations === 512)).toBe(true);
    expect(library.items.find((item) => item.id === 272681)?.stats).toContainEqual({
      label: "Healing power",
      value: 176,
    });
  });

  it("rejects duplicated or missing build identity and unknown equipped data", () => {
    const duplicate = structuredClone(library);
    duplicate.builds.push(duplicate.builds[0]!);
    expect(healerLibrarySchema.safeParse(duplicate).success).toBe(false);
    const missing = structuredClone(library);
    missing.items = missing.items.filter((item) => item.id !== missing.builds[0]!.gear[0]!.id);
    expect(healerLibrarySchema.safeParse(missing).success).toBe(false);
  });

  it("enforces faction, slot, enchant, unique and complete hand constraints", () => {
    const gear = structuredClone(library.builds[0]!.gear);
    gear[0]!.enchant = 999999;
    expect(healerGearProblem(gear, library.items, "Horde")).toContain("enchant");
    const unique = library.items.find(
      (item) => item.unique && !item.faction && item.slots.includes(10),
    )!;
    gear[0] = { ...library.builds[0]!.gear[0]! };
    gear[10] = { id: unique.id };
    gear[11] = { id: unique.id };
    expect(healerGearProblem(gear, library.items, "Horde")).toContain("unique");
    const twoHanded = library.items.find((item) => item.twoHanded)!;
    gear[11] = { ...library.builds[0]!.gear[11]! };
    gear[14] = { id: twoHanded.id };
    expect(healerGearProblem(gear, library.items, "Horde")).toContain("two-handed");
    gear[15] = { id: 0 };
    expect(healerGearProblem(gear, library.items, "Horde")).toBeNull();
    const alliance = library.items.find((item) => item.faction === "Alliance")!;
    gear[alliance.slots[0]!] = { id: alliance.id };
    expect(healerGearProblem(gear, library.items, "Horde")).toContain("unavailable");
  });

  it("rejects unknown talents, overspending and broken tier prerequisites", () => {
    const fields = library.builds[0]!.fields;
    expect(healerTalentProblem(library.talents, { ...fields, inventedTalent: 1 }, false)).toContain(
      "another model",
    );
    const capstone = library.talents
      .flatMap((tree) => tree.talents)
      .find((talent) => talent.row > 0)!;
    expect(healerTalentProblem(library.talents, { [capstone.field]: 1 }, false)).toContain(
      "earlier tiers",
    );
    expect(healerTalentProblem(library.talents, {}, true)).toContain("51");
  });

  it("rejects fabricated qualification and inconsistent healing accounting", () => {
    const result = {
      schema: "kfc-healing-workload-result.v1",
      name: "contract-control",
      iterations: 128,
      survivalRate: 1,
      manaRemainingMean: 100,
      missingHealthSecondsMean: 200,
      finalMissingHealthMean: 20,
      manaBlockedSecondsMean: 0,
      plannedIncomingPostMitigationDamage: 1000,
      deliveredIncomingDamageMean: 1000,
      hps: 100,
      hpsStdev: 1,
      rawHps: 110,
      effectiveHealingHps: 90,
      overhealingHps: 20,
      absorbedHps: 10,
      rankScaling: library.rankPolicies[0],
      classQualified: false,
      publicationAllowed: false,
    };
    expect(healingResultSchema.safeParse(result).success).toBe(true);
    expect(healingResultSchema.safeParse({ ...result, absorbedHps: 50 }).success).toBe(false);
    expect(healingResultSchema.safeParse({ ...result, classQualified: true }).success).toBe(false);
  });
});
