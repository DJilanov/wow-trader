import { describe, expect, it } from "vitest";

import { evaluateWorkspaceRecipe, type WorkspaceRecipeCandidate } from "./workspace.js";

describe("evaluateWorkspaceRecipe", () => {
  it("compares a robust AH quote with the deterministic vendor route", () => {
    const [auctionHouse, vendor] = evaluateWorkspaceRecipe(candidate(), 500);

    expect(auctionHouse?.route).toBe("auction_house");
    expect(auctionHouse?.result.reagentCostCopper).toBe(300n);
    expect(auctionHouse?.outputs[0]?.unitValueCopper).toBe(2_000n);
    expect(auctionHouse?.result.expectedProfitCopper).toBe(1_600n);
    expect(vendor?.route).toBe("vendor");
    expect(vendor?.result.expectedProfitCopper).toBe(1_400n);
  });

  it("returns no route when the reagent order book cannot fill one craft", () => {
    const value = candidate();
    const result = evaluateWorkspaceRecipe(
      {
        ...value,
        inputs: [{ ...value.inputs[0]!, quantity: 4 }],
      },
      500,
    );

    expect(result).toEqual([]);
  });

  it("allows vendor value when an output has no AH listing", () => {
    const value = candidate();
    const result = evaluateWorkspaceRecipe(
      {
        ...value,
        outputs: [{ ...value.outputs[0]!, priceLevels: [] }],
      },
      500,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.route).toBe("vendor");
  });

  it("withholds an AH quote supported by fewer than three listings", () => {
    const value = candidate();
    const result = evaluateWorkspaceRecipe(
      {
        ...value,
        outputs: [
          {
            ...value.outputs[0]!,
            priceLevels: [{ unitPriceCopper: 10_000n, quantity: 1, listingCount: 1 }],
          },
        ],
      },
      500,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.route).toBe("vendor");
  });

  it("values every possible disenchant material from supported AH quotes", () => {
    const value = candidate();
    const result = evaluateWorkspaceRecipe(
      {
        ...value,
        outputs: [
          {
            ...value.outputs[0]!,
            disenchant: {
              requiredEnchantingSkill: 275,
              modelVersion: "tbc-disenchant-table-v1",
              evidence: "Static test distribution.",
              materials: [
                {
                  itemId: 22_445,
                  name: "Arcane Dust",
                  iconFileDataId: 300,
                  quality: 1,
                  expectedQuantity: { numerator: 3n, denominator: 2n },
                  priceLevels: [{ unitPriceCopper: 2_000n, quantity: 3, listingCount: 3 }],
                },
              ],
            },
          },
        ],
      },
      500,
    );

    const disenchant = result.find((evaluation) => evaluation.route === "disenchant");
    expect(disenchant?.outputs[0]?.name).toBe("Arcane Dust");
    expect(disenchant?.result.expectedProfitCopper).toBe(2_550n);
    expect(disenchant?.requiredEnchantingSkill).toBe(275);
  });

  it("withholds disenchant value if any possible material has no market quote", () => {
    const value = candidate();
    const result = evaluateWorkspaceRecipe(
      {
        ...value,
        outputs: [
          {
            ...value.outputs[0]!,
            disenchant: {
              requiredEnchantingSkill: 275,
              modelVersion: "tbc-disenchant-table-v1",
              evidence: "Static test distribution.",
              materials: [
                {
                  itemId: 22_445,
                  name: "Arcane Dust",
                  iconFileDataId: 300,
                  quality: 1,
                  expectedQuantity: { numerator: 3n, denominator: 2n },
                  priceLevels: [],
                },
              ],
            },
          },
        ],
      },
      500,
    );

    expect(result.some((evaluation) => evaluation.route === "disenchant")).toBe(false);
  });

  it("uses a recursive material plan and exposes its savings and craft steps", () => {
    const acquisition = {
      requestedQuantity: 1,
      fulfilledQuantity: 1,
      unfilledQuantity: 0,
      totalCostCopper: 100n,
      averageUnitPriceCopper: 100n,
      highestUnitPriceCopper: 100n,
      consumedLevels: [{ unitPriceCopper: 100n, quantity: 1, quantityTaken: 1, costCopper: 100n }],
    } as const;
    const result = evaluateWorkspaceRecipe(candidate(), 500, {
      totalCostCopper: 100n,
      directPurchaseCostCopper: 300n,
      savingsVsDirectPurchaseCopper: 200n,
      purchases: [
        {
          itemId: 9,
          name: "Raw Reagent",
          iconFileDataId: 90,
          quality: 1,
          quantity: 1,
          acquisition,
        },
      ],
      craftSteps: [
        {
          kind: "profession",
          recipeSpellId: 2,
          recipeName: "Intermediate",
          professionSlug: "enchanting",
          professionName: "Enchanting",
          requiredSkillRank: 250,
          crafts: 1,
          inputs: [{ itemId: 9, quantity: 1 }],
          outputItemId: 10,
          outputName: "Intermediate Reagent",
          outputQuantity: 2,
          requiredOutputQuantity: 2,
          leftoverQuantity: 0,
        },
      ],
      crossProfessionTransferCount: 1,
    });

    expect(result[0]?.result.reagentCostCopper).toBe(100n);
    expect(result[0]?.directReagentCostCopper).toBe(300n);
    expect(result[0]?.networkSavingsCopper).toBe(200n);
    expect(result[0]?.inputs[0]?.name).toBe("Raw Reagent");
    expect(result[0]?.craftSteps[0]?.recipeName).toBe("Intermediate");
  });
});

function candidate(): WorkspaceRecipeCandidate {
  return {
    recipeSpellId: 1,
    recipeName: "Test Recipe",
    professionName: "Alchemy",
    professionSlug: "alchemy",
    requiredSkillRank: 1,
    cooldownMs: 0,
    categoryCooldownMs: 0,
    outputKind: "item",
    inputs: [
      {
        itemId: 10,
        name: "Reagent",
        quantity: 2,
        iconFileDataId: 100,
        quality: 1,
        priceLevels: [
          { unitPriceCopper: 100n, quantity: 1 },
          { unitPriceCopper: 200n, quantity: 2 },
        ],
      },
    ],
    outputs: [
      {
        itemId: 20,
        name: "Result",
        classId: 0,
        subclassId: 1,
        iconFileDataId: 200,
        quality: 1,
        itemLevel: 1,
        minimumQuantity: 1,
        maximumQuantity: 1,
        expectedQuantity: { numerator: 1n, denominator: 1n },
        vendorSellPriceCopper: 1_700n,
        priceLevels: [
          { unitPriceCopper: 1_000n, quantity: 1, listingCount: 1 },
          { unitPriceCopper: 2_000n, quantity: 19, listingCount: 8 },
        ],
        disenchant: null,
      },
    ],
  };
}
