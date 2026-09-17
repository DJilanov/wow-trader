import { describe, expect, it } from "vitest";

import {
  adaptCatalogToBis,
  catalogResistanceKey,
  catalogStatKey,
  inventoryTypeSlots,
  type CatalogItemRow,
  type CatalogToBisInput,
} from "./catalog-adapter.js";

describe("catalog to BiS adapter", () => {
  it("maps client facts without converting client visibility into verified availability", () => {
    const result = adaptCatalogToBis(
      input([
        item(1, {
          inventoryType: 17,
          allowableClassMask: 1,
          allowableRaceMask: [5],
          requiredSkillId: 164,
          requiredSkillRank: 375,
          requiredAbilityId: 9788,
          minimumFactionId: 932,
          minimumReputation: 7,
          itemSetId: 100,
          limitCategoryId: 7,
          maxCount: 1,
          delayMs: 3_600,
          availabilityState: "client_only",
        }),
      ]),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      slots: ["mainHand"],
      blocksSlots: ["offHand"],
      allowedClassIds: [1],
      allowedRaceIds: [1, 3],
      requiredProfessionId: 164,
      requiredProfessionSpecializationId: null,
      requiredProficiencyIds: [44],
      requiredAbilityIds: [9788],
      requiredSkillId: 164,
      requiredSkillRank: 375,
      requiredReputation: { factionId: 932, minimumRank: 7 },
      availability: "unknown",
      uniqueGroupId: 7,
      uniqueGroupMaximum: 1,
      maximumEquipped: 1,
      setId: 100,
      stats: { strength: 12, armor: 100 },
      weapon: {
        delayMs: 3_600,
        damages: [{ school: 0, minimum: 100, maximum: 200 }],
      },
      socketTypes: [2, 4],
    });
    expect(result.setBonuses).toEqual([{ setId: 100, threshold: 2, spellId: 9_001 }]);
    expect(result.candidateCoverage).toBe("partial");
    expect(result.diagnostics.unknownAvailabilityItemCount).toBe(1);
  });

  it("keeps paired slots reusable and enforces client unique counts", () => {
    const result = adaptCatalogToBis(
      input([
        item(2, { inventoryType: 11, maxCount: 0, availabilityState: "observed" }),
        item(3, { inventoryType: 12, maxCount: 1, availabilityState: "disabled" }),
        item(4, { inventoryType: 0 }),
      ]),
    );

    expect(result.items[0]).toMatchObject({
      slots: ["finger1", "finger2"],
      maximumEquipped: 2,
      availability: "available",
    });
    expect(result.items[1]).toMatchObject({
      slots: ["trinket1", "trinket2"],
      maximumEquipped: 1,
      availability: "unavailable",
    });
    expect(result.diagnostics).toMatchObject({
      inputItemCount: 3,
      adaptedItemCount: 2,
      nonEquippableItemCount: 1,
      disabledItemCount: 1,
    });
  });

  it("preserves unknown stat and resistance IDs under stable keys", () => {
    const value = input([item(5, { inventoryType: 1 })]);
    const result = adaptCatalogToBis({
      ...value,
      stats: [{ itemId: 5, statType: 999, value: 7 }],
      resistances: [{ itemId: 5, school: 99, value: 3 }],
    });

    expect(catalogStatKey(999)).toBe("statType:999");
    expect(catalogResistanceKey(99)).toBe("resistanceSchool:99");
    expect(result.items[0]?.stats).toEqual({ "statType:999": 7, "resistanceSchool:99": 3 });
    expect(result.diagnostics.unknownStatTypeIds).toEqual([999]);
    expect(result.diagnostics.unknownResistanceSchoolIds).toEqual([99]);
  });

  it("maps every supported inventory type to legal optimizer slots", () => {
    expect(inventoryTypeSlots(13)).toEqual(["mainHand", "offHand"]);
    expect(inventoryTypeSlots(23)).toEqual(["offHand"]);
    expect(inventoryTypeSlots(28)).toEqual(["ranged"]);
    expect(inventoryTypeSlots(4)).toEqual([]);
  });
});

function input(items: readonly CatalogItemRow[]): CatalogToBisInput {
  return {
    build: { product: "wow_anniversary", buildNumber: 69_795, phase: null },
    candidateCoverage: "partial",
    items,
    stats: [{ itemId: 1, statType: 4, value: 12 }],
    damages: [{ itemId: 1, damageType: 0, minimum: 100, maximum: 200 }],
    resistances: [{ itemId: 1, school: 0, value: 100 }],
    sockets: [
      { itemId: 1, socketType: 2 },
      { itemId: 1, socketType: 4 },
    ],
    itemEffects: [
      { itemId: 1, spellId: 8_001 },
      { itemId: 1, spellId: 8_001 },
    ],
    setEffects: [
      { itemSetId: 100, threshold: 2, spellId: 9_001 },
      { itemSetId: 100, threshold: 2, spellId: 9_001 },
    ],
    limitCategories: [{ limitCategoryId: 7, quantity: 1 }],
    subclasses: [{ classId: 2, subclassId: 0, prerequisiteProficiency: 44 }],
    classIds: [1, 2, 3],
    raceIds: [1, 2, 3, 4],
    professionSkillLineIds: [164],
  };
}

function item(itemId: number, overrides: Partial<CatalogItemRow> = {}): CatalogItemRow {
  return {
    itemId,
    name: `Item ${itemId}`,
    quality: 4,
    itemLevel: 100,
    iconFileDataId: null,
    classId: 2,
    subclassId: 0,
    inventoryType: 1,
    requiredLevel: 70,
    requiredSkillId: null,
    requiredSkillRank: 0,
    requiredAbilityId: null,
    minimumFactionId: null,
    minimumReputation: 0,
    allowableClassMask: -1,
    allowableRaceMask: [-1, -1],
    maxCount: 0,
    delayMs: 0,
    itemSetId: null,
    limitCategoryId: null,
    availabilityState: null,
    availableFromPhase: null,
    availableThroughPhase: null,
    ...overrides,
  };
}
