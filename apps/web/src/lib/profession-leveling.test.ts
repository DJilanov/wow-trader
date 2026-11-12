import { describe, expect, it } from "vitest";
import { buildProfessionLevelingPlan, skillUpChance } from "./profession-leveling";
import { isPurchasableRecipePattern, readRecipeSkillBands } from "./profession-leveling-catalog";
import { createLevelingPricer } from "./profession-leveling-prices";
import {
  copperToGold,
  goldToCopper,
  professionLevelingOptionsSchema,
} from "./profession-leveling-settings";
import type {
  LevelingItem,
  LevelingRecipe,
  ProfessionLevelingOptions,
} from "./profession-leveling-types";

function item(id: number, copper = 100, quantity = 100, stack = 1): LevelingItem {
  return {
    id,
    name: `Material ${id}`,
    levels: [
      {
        unitPriceCopper: String(copper),
        quantity,
        listingCount: quantity / stack,
        lots: [
          {
            stackSize: stack,
            buyoutCopper: String(copper * stack),
            listingCount: quantity / stack,
          },
        ],
      },
    ],
  };
}
function recipe(id: number, overrides: Partial<LevelingRecipe> = {}): LevelingRecipe {
  return {
    id,
    name: `Recipe ${id}`,
    requiredSkill: 1,
    yellowSkill: 20,
    graySkill: 40,
    skillUps: 1,
    inputs: [{ itemId: 1, quantity: 1 }],
    output: null,
    acquisition: [{ label: "Trainer", costCopper: "0" }],
    restriction: null,
    ...overrides,
  };
}
const options: ProfessionLevelingOptions = {
  from: 1,
  to: 6,
  playerLevel: 60,
  mode: "orange",
  knownRecipeIds: [],
  recipeCosts: {},
};

describe("profession leveling including recipe acquisition", () => {
  it("rejects an expensive pattern despite its cheaper reagents", () => {
    const expensive = recipe(1, {
      inputs: [{ itemId: 2, quantity: 1 }],
      acquisition: [{ label: "Pattern", itemId: 3, costCopper: "0" }],
    });
    const plan = buildProfessionLevelingPlan(
      { recipes: [expensive, recipe(2)], items: [item(1), item(2, 1), item(3, 5_000)] },
      options,
    );
    expect(plan.status).toBe("complete");
    expect(plan.totalCopper).toBe("500");
    expect(plan.steps.map((step) => step.recipeId)).toEqual([2]);
  });
  it("charges the recipe once, and amortizes it over enough crafts", () => {
    const cheapCraft = recipe(1, {
      inputs: [{ itemId: 2, quantity: 1 }],
      acquisition: [{ label: "Pattern", itemId: 3, costCopper: "0" }],
    });
    const plan = buildProfessionLevelingPlan(
      { recipes: [cheapCraft, recipe(2)], items: [item(1), item(2, 1), item(3, 200)] },
      options,
    );
    expect(plan.totalCopper).toBe("205");
    expect(plan.recipeCopper).toBe("200");
    expect(plan.shopping.find((row) => row.itemId === 3)?.needed).toBe(1);
    expect(plan.steps[0]?.crafts).toBe(5);
  });
  it("does not charge for already learned recipes", () => {
    const plan = buildProfessionLevelingPlan(
      { recipes: [recipe(1, { acquisition: [] })], items: [item(1)] },
      { ...options, knownRecipeIds: [1] },
    );
    expect(plan.status).toBe("complete");
    expect(plan.recipeCopper).toBe("0");
  });
  it("excludes unknown acquisition prices instead of treating them as free", () => {
    const plan = buildProfessionLevelingPlan(
      { recipes: [recipe(1, { acquisition: [] })], items: [item(1)] },
      options,
    );
    expect(plan.status).toBe("partial");
    expect(plan.reached).toBe(1);
    expect(plan.excluded).toBe(1);
  });
  it("does not interpret a missing learning requirement as skill one", () => {
    const data = { recipes: [recipe(1, { requiredSkillKnown: false })], items: [item(1)] };
    expect(buildProfessionLevelingPlan(data, options).reached).toBe(1);
    expect(buildProfessionLevelingPlan(data, { ...options, knownRecipeIds: [1] }).reached).toBe(6);
    expect(buildProfessionLevelingPlan(data, { ...options, recipeSkills: { 1: 4 } }).reached).toBe(
      1,
    );
    expect(buildProfessionLevelingPlan(data, { ...options, recipeSkills: { 1: 1 } }).reached).toBe(
      6,
    );
    const captured = { recipes: [recipe(1, { requiredSkill: 4 })], items: [item(1)] };
    expect(
      buildProfessionLevelingPlan(captured, { ...options, recipeSkills: { 1: 1 } }).reached,
    ).toBe(1);
  });
  it("supports an explicit user-provided one-time training cost, including zero", () => {
    const data = { recipes: [recipe(1, { acquisition: [] })], items: [item(1)] };
    expect(
      buildProfessionLevelingPlan(data, { ...options, recipeCosts: { 1: "350" } }).totalCopper,
    ).toBe("850");
    expect(
      buildProfessionLevelingPlan(data, { ...options, recipeCosts: { 1: "0" } }).totalCopper,
    ).toBe("500");
  });
  it("buys whole stacks once across the route, retaining overbuy", () => {
    const plan = buildProfessionLevelingPlan(
      { recipes: [recipe(1)], items: [item(1, 100, 100, 20)] },
      options,
    );
    expect(plan.totalCopper).toBe("2000");
    expect(plan.shopping[0]).toMatchObject({ needed: 5, purchased: 20 });
  });
  it("shares finite depth between recipes rather than reusing the cheapest supply", () => {
    const plan = buildProfessionLevelingPlan(
      {
        recipes: [recipe(1, { yellowSkill: 3 }), recipe(2, { requiredSkill: 3 })],
        items: [item(1, 100, 4)],
      },
      options,
    );
    expect(plan.status).toBe("partial");
    expect(plan.reached).toBe(5);
    expect(plan.totalCopper).toBe("400");
  });
  it("retains a trainer fee once when switching away and returning to a recipe", () => {
    const data = {
      recipes: [
        recipe(1, { acquisition: [{ label: "Trainer", costCopper: "300" }] }),
        recipe(2, { requiredSkill: 3, yellowSkill: 4, inputs: [{ itemId: 2, quantity: 1 }] }),
      ],
      items: [item(1), item(2, 1)],
    };
    const plan = buildProfessionLevelingPlan(data, options);
    expect(plan.steps.map((step) => step.recipeId)).toEqual([1, 2, 1]);
    expect(plan.recipeCopper).toBe("300");
    expect(plan.totalCopper).toBe("701");
  });
  it("uses a crafted intermediate only after it has been produced", () => {
    const data = {
      recipes: [
        recipe(1, { yellowSkill: 3, output: { itemId: 2, quantity: 1 } }),
        recipe(2, { requiredSkill: 3, inputs: [{ itemId: 2, quantity: 1 }] }),
      ],
      items: [item(1), item(2, 1_000)],
    };
    const plan = buildProfessionLevelingPlan(data, { ...options, to: 5 });
    expect(plan.status).toBe("complete");
    expect(plan.totalCopper).toBe("200");
    expect(plan.shopping.map((row) => row.itemId)).toEqual([1]);
  });
  it("does not use a future output to pay for its own inputs", () => {
    const plan = buildProfessionLevelingPlan(
      {
        recipes: [
          recipe(1, { inputs: [{ itemId: 2, quantity: 1 }], output: { itemId: 2, quantity: 2 } }),
        ],
        items: [],
      },
      options,
    );
    expect(plan.reached).toBe(1);
  });
  it("respects character level requirements for training", () => {
    const data = {
      recipes: [
        recipe(1, { acquisition: [{ label: "Trainer", costCopper: "0", requiredLevel: 35 }] }),
      ],
      items: [item(1)],
    };
    expect(buildProfessionLevelingPlan(data, { ...options, playerLevel: 20 }).reached).toBe(1);
    expect(buildProfessionLevelingPlan(data, { ...options, playerLevel: 35 }).status).toBe(
      "complete",
    );
  });
  it("supports multi-point skill gains without claiming an extra craft", () => {
    const plan = buildProfessionLevelingPlan(
      { recipes: [recipe(1, { skillUps: 3 })], items: [item(1)] },
      options,
    );
    expect(plan.totalCopper).toBe("200");
    expect(plan.steps[0]?.crafts).toBe(2);
  });
  it("cannot use a gray recipe; yellow/green planning remains an explicit estimate", () => {
    const row = recipe(1, { yellowSkill: 2, graySkill: 6 });
    expect(skillUpChance(row, 1, "orange")).toBe(1);
    expect(skillUpChance(row, 2, "orange")).toBe(0);
    expect(skillUpChance(row, 4, "expected")).toBe(0.5);
    expect(skillUpChance(row, 6, "expected")).toBe(0);
    const plan = buildProfessionLevelingPlan(
      { recipes: [row], items: [item(1)] },
      { ...options, from: 4, to: 5, mode: "expected" },
    );
    expect(plan.steps[0]?.crafts).toBe(2);
  });
  it("returns a partial route for a gap, without fabricating zero-cost crafts", () => {
    const plan = buildProfessionLevelingPlan(
      { recipes: [recipe(1, { yellowSkill: 3 })], items: [item(1)] },
      options,
    );
    expect(plan.reached).toBe(3);
    expect(plan.status).toBe("partial");
    expect(plan.totalCopper).toBe("200");
  });
  it("validates bounds and returns an empty plan for an already reached target", () => {
    expect(() =>
      buildProfessionLevelingPlan({ recipes: [], items: [] }, { ...options, from: 0 }),
    ).toThrow(RangeError);
    expect(
      buildProfessionLevelingPlan({ recipes: [], items: [] }, { ...options, to: 1 }),
    ).toMatchObject({ reached: 1, status: "complete", totalCopper: "0" });
  });
});

describe("profession price and data boundaries", () => {
  it("does not recommend applied scrolls or locked recipe purchases as universal unlocks", () => {
    const pattern = {
      classId: 9,
      binding: 0,
      ability: null,
      faction: null,
      reputation: 0,
      classMask: -1,
      raceMask: [-1, -1],
    };
    expect(isPurchasableRecipePattern(pattern)).toBe(true);
    for (const restriction of [
      { classId: 0 },
      { binding: 1 },
      { ability: 123 },
      { faction: 72 },
      { reputation: 1 },
      { classMask: 4 },
      { raceMask: [1277, 0] },
    ])
      expect(isPurchasableRecipePattern({ ...pattern, ...restriction })).toBe(false);
  });
  it("matches exhaustive whole-stack acquisition costs on mixed small books", () => {
    for (let count = 1; count <= 5; count++) {
      const lots = [
        { stackSize: 2, listingCount: count, buyoutCopper: "5" },
        { stackSize: 3, listingCount: 3, buyoutCopper: "9" },
      ];
      const price = createLevelingPricer([
        {
          id: 1,
          name: "Mixed stacks",
          levels: [
            { unitPriceCopper: "3", quantity: 2 * count + 9, listingCount: count + 3, lots },
          ],
        },
      ]);
      for (let needed = 1; needed <= 2 * count + 10; needed++) {
        let best: bigint | null = null;
        for (let a = 0; a <= count; a++)
          for (let b = 0; b <= 3; b++) {
            if (a * 2 + b * 3 < needed) continue;
            const cost = BigInt(a * 5 + b * 9);
            if (best === null || cost < best) best = cost;
          }
        expect(price(1, needed)?.cost ?? null).toBe(best);
      }
    }
  });
  it("does not invent stack evidence or permit item variants to subsidize a base item", () => {
    const price = createLevelingPricer([
      { ...item(1), levels: [{ ...item(1).levels[0]!, lots: null }] },
    ]);
    expect(price(1, 1)).toBeNull();
    expect(price(999, 1)).toBeNull();
  });
  it("consumes whole stacks without reusing lots across large quantity batches", () => {
    const price = createLevelingPricer([item(1, 2, 1_500, 20)]);
    expect(price(1, 1_400)).toEqual({ cost: 2_800n, quantity: 1_400 });
    expect(price(1, 1_501)).toBeNull();
  });
  it("keeps money exact and rejects invalid cost input", () => {
    expect(goldToCopper("2.5001")).toBe("25001");
    expect(copperToGold("25001")).toBe("2.5001");
    expect(copperToGold("9007199254740993")).toBe("900719925474.0993");
    expect(goldToCopper("0")).toBe("0");
    for (const invalid of ["-1", "1e6", "NaN", "2.12345", ""])
      expect(goldToCopper(invalid)).toBeNull();
    expect(professionLevelingOptionsSchema.safeParse({ ...options, to: 0 }).success).toBe(false);
  });
  it("reads captured skill bands, rejecting missing or conflicting values", () => {
    const ability = {
      MinSkillLineRank: 1,
      TrivialSkillLineRankLow: 40,
      TrivialSkillLineRankHigh: 70,
      NumSkillUps: 1,
      RaceMasks: [0, 0],
      ClassMask: 0,
    };
    expect(readRecipeSkillBands({ skillLineAbility: ability }, 1)).toEqual({
      required: 1,
      yellow: 40,
      gray: 70,
      skillUps: 1,
      restricted: false,
      requirementKnown: true,
    });
    expect(readRecipeSkillBands({}, 1)).toBeNull();
    expect(
      readRecipeSkillBands({ skillLineAbility: { ...ability, TrivialSkillLineRankLow: 80 } }, 1),
    ).toBeNull();
    expect(
      readRecipeSkillBands({ skillLineAbility: { ...ability, ClassMask: 4 } }, 1)?.restricted,
    ).toBe(true);
  });
});
