import { describe, expect, it } from "vitest";
import type { ClientDisenchantEvidence } from "@wow-trader/catalog";
import { getLevelingItemRecovery } from "./profession-leveling-item-values";

const evidence: ClientDisenchantEvidence = {
  manifest: {
    schemaVersion: "catalog-snapshot-manifest.v4",
    product: "wow_classic_beta",
    clientVersion: "1.60.1.70938",
    buildNumber: 70938,
    buildKey: "a".repeat(32),
    cdnKey: "b".repeat(32),
    locale: "enUS",
    extractedAt: "2026-11-13T00:00:00Z",
    hotfix: { status: "applied", sha256: "c".repeat(64) },
    definitions: { source: "wowdev/WoWDBDefs", revision: "d".repeat(40) },
    extractor: { name: "wow-trader-extractor", version: "0.6.1", revision: null },
    rawTables: {},
    normalizedArtifacts: {},
  },
  rules: [
    {
      id: 1,
      Class: 4,
      Quality: 2,
      MinLevel: 16,
      MaxLevel: 25,
      SkillRequired: 0,
      Subclass: -1,
      ExpansionID: -2,
    },
  ],
  sha256: "e".repeat(64),
};
const item = {
  itemId: 2865,
  classId: 4,
  subclassId: 3,
  quality: 2,
  itemLevel: 21,
  binding: 2,
  vendorSellCopper: 962n,
  rawRecord: { itemSparse: { Flags: [0, 0], ExpansionID: 0 } },
};
const prices = new Map([
  [10940, { priceCopper: 10_000n, quantity: 50 }],
  [10998, { priceCopper: 10_000n, quantity: 50 }],
  [10978, { priceCopper: 10_000n, quantity: 50 }],
]);

describe("build-aware profession output values", () => {
  it("requires 50 units of every resale material and keeps vendor fallback below that depth", () => {
    const thin = new Map(prices);
    thin.set(10940, { priceCopper: 1_000_000n, quantity: 49 });
    expect(getLevelingItemRecovery(item, evidence, thin, "alliance").disenchant).toBeNull();
    thin.set(10940, { priceCopper: 1_000_000n, quantity: 50 });
    expect(getLevelingItemRecovery(item, evidence, thin, "alliance").disenchant).not.toBeNull();
  });
  it("uses complete Classic distributions after exactly one AH cut, matching the addon", () => {
    const value = getLevelingItemRecovery(item, evidence, prices, "alliance");
    expect(value.vendorCopper).toBe("962");
    const de = value.disenchant!;
    expect(BigInt(de.numerator) / BigInt(de.denominator)).toBe(38_712n);
    expect(de.requiredSkill).toBe(0);
    expect(de.evidence).toContain("70938");
    const neutral = getLevelingItemRecovery(item, evidence, prices, "neutral").disenchant!;
    expect(BigInt(neutral.numerator) / BigInt(neutral.denominator)).toBe(34_637n);
  });
  it("falls back to vendor for missing prices, evidence, special loot or client exclusions", () => {
    expect(getLevelingItemRecovery(item, evidence, new Map(), "alliance").disenchant).toBeNull();
    expect(getLevelingItemRecovery(item, null, prices, "alliance").disenchant).toBeNull();
    expect(getLevelingItemRecovery(item, evidence, prices, "unknown").disenchant).toBeNull();
    for (const flags of [
      [32768, 0],
      [0, 0x40000000],
    ])
      expect(
        getLevelingItemRecovery(
          { ...item, rawRecord: { itemSparse: { Flags: flags, ExpansionID: 0 } } },
          evidence,
          prices,
          "alliance",
        ).disenchant,
      ).toBeNull();
  });
  it("does not misapply a Classic distribution to uncertain weapon brackets or Outland levels", () => {
    const weapon = { ...item, classId: 2 };
    const rules = { ...evidence, rules: [{ ...evidence.rules[0]!, Class: 2 }] };
    expect(getLevelingItemRecovery(weapon, rules, prices, "alliance").disenchant).toBeNull();
    expect(
      getLevelingItemRecovery(
        { ...item, itemLevel: 120 },
        { ...evidence, rules: [{ ...evidence.rules[0]!, MinLevel: 100, MaxLevel: 130 }] },
        prices,
        "alliance",
      ).disenchant,
    ).toBeNull();
  });
});
