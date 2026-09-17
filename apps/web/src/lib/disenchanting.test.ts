import { describe, expect, it } from "vitest";

import { getDisenchantDistribution } from "./disenchanting.js";

describe("getDisenchantDistribution", () => {
  it("models a high-level uncommon armor distribution", () => {
    const result = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 4,
      quality: 2,
      itemLevel: 100,
    });

    expect(result?.requiredEnchantingSkill).toBe(275);
    expect(expectedQuantity(result, 22_445)).toEqual({ numerator: 21n, denominator: 8n });
    expect(expectedQuantity(result, 22_446)).toEqual({ numerator: 33n, denominator: 100n });
    expect(expectedQuantity(result, 22_449)).toEqual({ numerator: 3n, denominator: 100n });
  });

  it("uses the essence-heavy weapon distribution", () => {
    const result = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 2,
      quality: 2,
      itemLevel: 100,
    });

    expect(expectedQuantity(result, 22_445)).toEqual({ numerator: 77n, denominator: 100n });
    expect(expectedQuantity(result, 22_446)).toEqual({ numerator: 9n, denominator: 8n });
    expect(expectedQuantity(result, 22_449)).toEqual({ numerator: 3n, denominator: 100n });
  });

  it("includes the rare crystal chance from a blue item", () => {
    const result = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 4,
      quality: 3,
      itemLevel: 100,
    });

    expect(expectedQuantity(result, 22_449)).toEqual({ numerator: 199n, denominator: 200n });
    expect(expectedQuantity(result, 22_450)).toEqual({ numerator: 1n, denominator: 200n });
  });

  it("keeps TBC epic weapon and armor distributions distinct", () => {
    const armor = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 4,
      quality: 4,
      itemLevel: 70,
    });
    const weapon = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 2,
      quality: 4,
      itemLevel: 70,
    });

    expect(expectedQuantity(armor, 20_725)).toEqual({ numerator: 3n, denominator: 2n });
    expect(expectedQuantity(weapon, 20_725)).toEqual({ numerator: 5n, denominator: 3n });
  });

  it("uses exact thirds for high-level epic Void Crystals", () => {
    const result = getDisenchantDistribution("wow_anniversary", 69_795, {
      classId: 4,
      quality: 4,
      itemLevel: 105,
    });

    expect(result?.requiredEnchantingSkill).toBe(300);
    expect(expectedQuantity(result, 22_450)).toEqual({ numerator: 5n, denominator: 3n });
  });

  it("rejects unsupported builds, item classes, qualities, and table gaps", () => {
    expect(
      getDisenchantDistribution("wow_anniversary", 69_794, {
        classId: 4,
        quality: 2,
        itemLevel: 100,
      }),
    ).toBeNull();
    expect(
      getDisenchantDistribution("wow_anniversary", 69_795, {
        classId: 0,
        quality: 2,
        itemLevel: 100,
      }),
    ).toBeNull();
    expect(
      getDisenchantDistribution("wow_anniversary", 69_795, {
        classId: 4,
        quality: 1,
        itemLevel: 100,
      }),
    ).toBeNull();
    expect(
      getDisenchantDistribution("wow_anniversary", 69_795, {
        classId: 4,
        quality: 4,
        itemLevel: 90,
      }),
    ).toBeNull();
  });
});

function expectedQuantity(
  distribution: ReturnType<typeof getDisenchantDistribution>,
  materialItemId: number,
): { readonly numerator: bigint; readonly denominator: bigint } | undefined {
  return distribution?.expectedMaterials.find(
    (material) => material.materialItemId === materialItemId,
  )?.expectedQuantity;
}
