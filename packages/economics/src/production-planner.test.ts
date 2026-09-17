import { describe, expect, it } from "vitest";

import {
  createProductionPlanner,
  isTimeGatedCraft,
  type PriceLevel,
  type ProductionRecipe,
} from "./index.js";

describe("isTimeGatedCraft", () => {
  it("detects direct and shared cooldowns", () => {
    expect(isTimeGatedCraft(1, 0)).toBe(true);
    expect(isTimeGatedCraft(0, 1)).toBe(true);
    expect(isTimeGatedCraft(0, 0)).toBe(false);
  });
});

describe("createProductionPlanner", () => {
  it("replaces an overpriced intermediate with a cross-profession craft", () => {
    const productionPlanner = buildPlanner(
      [
        recipe({
          recipeSpellId: 17_181,
          recipeName: "Enchanted Leather",
          professionSlug: "enchanting",
          outputItemId: 12_810,
          inputs: [
            { itemId: 8_170, quantity: 1 },
            { itemId: 16_202, quantity: 1 },
          ],
        }),
      ],
      new Map([
        [8_170, [{ unitPriceCopper: 1_679n, quantity: 10 }]],
        [16_202, [{ unitPriceCopper: 12_154n, quantity: 10 }]],
        [12_810, [{ unitPriceCopper: 14_953n, quantity: 10 }]],
      ]),
    );

    const result = productionPlanner.plan({
      requirements: [{ itemId: 12_810, quantity: 10 }],
      consumerProfessionSlug: "leatherworking",
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(138_330n);
    expect(result.directPurchaseCostCopper).toBe(149_530n);
    expect(result.savingsVsDirectPurchaseCopper).toBe(11_200n);
    expect(result.craftSteps).toHaveLength(1);
    expect(result.craftSteps[0]?.crafts).toBe(10);
    expect(result.crossProfessionTransferCount).toBe(1);
  });

  it("keeps buying an intermediate when its AH depth is cheaper", () => {
    const result = buildPlanner(
      [recipe({ outputItemId: 30, inputs: [{ itemId: 10, quantity: 2 }] })],
      new Map([
        [10, [{ unitPriceCopper: 100n, quantity: 10 }]],
        [30, [{ unitPriceCopper: 150n, quantity: 5 }]],
      ]),
    ).plan({ requirements: [{ itemId: 30, quantity: 1 }] });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(150n);
    expect(result.craftSteps).toEqual([]);
  });

  it("can supply an unlisted intermediate from listed raw materials", () => {
    const result = buildPlanner(
      [recipe({ outputItemId: 30, inputs: [{ itemId: 10, quantity: 2 }] })],
      new Map([[10, [{ unitPriceCopper: 100n, quantity: 2 }]]]),
    ).plan({ requirements: [{ itemId: 30, quantity: 1 }] });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.directPurchaseCostCopper).toBeNull();
    expect(result.totalCostCopper).toBe(200n);
    expect(result.craftSteps).toHaveLength(1);
  });

  it("chains multiple recipes and preserves integer leftovers", () => {
    const result = buildPlanner(
      [
        recipe({
          recipeSpellId: 2,
          recipeName: "Intermediate",
          professionSlug: "enchanting",
          outputItemId: 20,
          guaranteedOutputQuantity: 2,
          inputs: [{ itemId: 10, quantity: 1 }],
        }),
        recipe({
          recipeSpellId: 3,
          recipeName: "Component",
          professionSlug: "engineering",
          outputItemId: 30,
          inputs: [{ itemId: 20, quantity: 3 }],
        }),
      ],
      new Map([
        [10, [{ unitPriceCopper: 50n, quantity: 10 }]],
        [20, [{ unitPriceCopper: 500n, quantity: 10 }]],
        [30, [{ unitPriceCopper: 5_000n, quantity: 10 }]],
      ]),
    ).plan({ requirements: [{ itemId: 30, quantity: 1 }] });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(100n);
    expect(result.craftSteps.map((step) => step.recipeSpellId)).toEqual([2, 3]);
    expect(result.craftSteps[0]?.leftoverQuantity).toBe(1);
  });

  it("aggregates shared leaf demand before consuming AH depth", () => {
    const result = buildPlanner(
      [
        recipe({ outputItemId: 20, inputs: [{ itemId: 10, quantity: 1 }] }),
        recipe({ recipeSpellId: 2, outputItemId: 30, inputs: [{ itemId: 10, quantity: 1 }] }),
      ],
      new Map([
        [10, [level(100n, 1), level(1_000n, 1)]],
        [20, [level(2_000n, 1)]],
        [30, [level(2_000n, 1)]],
      ]),
    ).plan({
      requirements: [
        { itemId: 20, quantity: 1 },
        { itemId: 30, quantity: 1 },
      ],
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(1_100n);
    expect(result.purchases).toHaveLength(1);
    expect(result.purchases[0]?.quantity).toBe(2);
  });

  it("always excludes direct and shared cooldown recipes", () => {
    const result = buildPlanner(
      [
        recipe({
          outputItemId: 20,
          cooldownMs: 86_400_000,
          inputs: [{ itemId: 10, quantity: 1 }],
        }),
        recipe({
          recipeSpellId: 2,
          outputItemId: 30,
          categoryCooldownMs: 72_000_000,
          inputs: [{ itemId: 10, quantity: 1 }],
        }),
      ],
      new Map([
        [10, [level(1n, 1)]],
        [20, [level(100n, 1)]],
        [30, [level(200n, 1)]],
      ]),
    ).plan({
      requirements: [
        { itemId: 20, quantity: 1 },
        { itemId: 30, quantity: 1 },
      ],
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(300n);
    expect(result.craftSteps).toEqual([]);
  });

  it("honors known-recipe eligibility", () => {
    const result = createProductionPlanner({
      recipes: [recipe({ recipeSpellId: 77, outputItemId: 20 })],
      priceLevelsByItem: new Map([
        [10, [level(1n, 1)]],
        [20, [level(100n, 1)]],
      ]),
      allowedRecipeSpellIds: new Set(),
    }).plan({ requirements: [{ itemId: 20, quantity: 1 }] });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(100n);
  });

  it("does not require a learned profession recipe for an item-use conversion", () => {
    const result = createProductionPlanner({
      recipes: [recipe({ kind: "item_use", recipeSpellId: 28_100, outputItemId: 20 })],
      priceLevelsByItem: new Map([
        [10, [level(1n, 1)]],
        [20, [level(100n, 1)]],
      ]),
      allowedRecipeSpellIds: new Set(),
    }).plan({
      requirements: [{ itemId: 20, quantity: 1 }],
      consumerProfessionSlug: "leatherworking",
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(1n);
    expect(result.craftSteps[0]?.kind).toBe("item_use");
    expect(result.crossProfessionTransferCount).toBe(0);
  });

  it("terminates reversible conversions and ignores stateful self loops", () => {
    const result = buildPlanner(
      [
        recipe({
          recipeSpellId: 28_022,
          outputItemId: 22_449,
          inputs: [{ itemId: 22_448, quantity: 3 }],
        }),
        recipe({
          recipeSpellId: 42_615,
          outputItemId: 22_448,
          guaranteedOutputQuantity: 3,
          inputs: [{ itemId: 22_449, quantity: 1 }],
        }),
        recipe({
          recipeSpellId: 13_240,
          outputItemId: 10_577,
          inputs: [{ itemId: 10_577, quantity: 1 }],
        }),
      ],
      new Map([
        [22_448, [level(100n, 3)]],
        [22_449, [level(500n, 1)]],
        [10_577, [level(900n, 1)]],
      ]),
    ).plan({
      requirements: [
        { itemId: 22_449, quantity: 1 },
        { itemId: 10_577, quantity: 1 },
      ],
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;
    expect(result.totalCostCopper).toBe(1_200n);
    expect(result.craftSteps.map((step) => step.recipeSpellId)).toEqual([28_022]);
  });
});

function buildPlanner(
  recipes: readonly ProductionRecipe[],
  priceLevelsByItem: ReadonlyMap<number, readonly PriceLevel[]>,
) {
  return createProductionPlanner({ recipes, priceLevelsByItem });
}

function level(unitPriceCopper: bigint, quantity: number): PriceLevel {
  return { unitPriceCopper, quantity };
}

function recipe(values: {
  readonly kind?: ProductionRecipe["kind"];
  readonly recipeSpellId?: number;
  readonly recipeName?: string;
  readonly professionSlug?: string;
  readonly outputItemId: number;
  readonly guaranteedOutputQuantity?: number;
  readonly inputs?: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly cooldownMs?: number;
  readonly categoryCooldownMs?: number;
}): ProductionRecipe {
  return {
    kind: values.kind ?? "profession",
    recipeSpellId: values.recipeSpellId ?? 1,
    recipeName: values.recipeName ?? "Recipe",
    professionSlug: values.professionSlug ?? "alchemy",
    professionName: values.professionSlug ?? "Alchemy",
    requiredSkillRank: 1,
    cooldownMs: values.cooldownMs ?? 0,
    categoryCooldownMs: values.categoryCooldownMs ?? 0,
    inputs: values.inputs ?? [{ itemId: 10, quantity: 1 }],
    outputItemId: values.outputItemId,
    outputName: `Item ${values.outputItemId}`,
    guaranteedOutputQuantity: values.guaranteedOutputQuantity ?? 1,
  };
}
