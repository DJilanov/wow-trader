import { describe, expect, it } from "vitest";
import { buildProfessionLevelingPlan } from "./profession-leveling";
import {
  createLevelingRecoveryPricer,
  quoteLevelingRecoveries,
} from "./profession-leveling-recovery";
import { professionLevelingOptionsSchema } from "./profession-leveling-settings";
import type {
  LevelingItem,
  LevelingRecipe,
  ProfessionLevelingOptions,
} from "./profession-leveling-types";

const options: ProfessionLevelingOptions = {
  from: 221,
  to: 223,
  playerLevel: 60,
  mode: "orange",
  knownRecipeIds: [],
  recipeCosts: {},
};
function item(id: number, price: number, vendor = 0, de?: number, binding = 2): LevelingItem {
  return {
    id,
    name: `Item ${id}`,
    levels: price
      ? [
          {
            unitPriceCopper: String(price),
            quantity: 100,
            listingCount: 100,
            lots: [{ stackSize: 1, listingCount: 100, buyoutCopper: String(price) }],
          },
        ]
      : [],
    recovery: {
      vendorCopper: String(vendor),
      binding,
      disenchant:
        de === undefined
          ? null
          : { numerator: String(de), denominator: "1", requiredSkill: 25, evidence: "Reference" },
    },
  };
}
function recipe(id: number, input: number, output: number): LevelingRecipe {
  return {
    id,
    name: `Recipe ${id}`,
    requiredSkill: 221,
    yellowSkill: 230,
    graySkill: 250,
    skillUps: 1,
    inputs: [{ itemId: input, quantity: 1 }],
    output: { itemId: output, quantity: 1 },
    acquisition: [{ label: "Trainer", costCopper: "10" }],
    restriction: null,
  };
}

describe("universal net-cost leveling", () => {
  it("chooses higher upfront cost when vendor proceeds make it cheaper overall, including the learning fee once", () => {
    const data = {
      recipes: [recipe(1, 10, 20), recipe(2, 11, 21)],
      items: [item(10, 100), item(11, 150), item(20, 0, 1), item(21, 0, 100)],
    };
    const plan = buildProfessionLevelingPlan(data, options);
    expect(plan.steps.map((step) => step.recipeId)).toEqual([2]);
    expect(plan).toMatchObject({
      totalCopper: "310",
      recipeCopper: "10",
      recoveryCopper: "200",
      netCopper: "110",
    });
    expect(
      buildProfessionLevelingPlan(data, { ...options, recoveryMode: "none" }).steps[0]?.recipeId,
    ).toBe(1);
  });
  it("compares disenchant skill, access to bound crafts and the service fee with vendor value", () => {
    const data = {
      recipes: [recipe(1, 10, 20), recipe(2, 11, 21)],
      items: [item(10, 100), item(11, 150), item(20, 0, 10), item(21, 0, 20, 200, 1)],
    };
    const best = {
      ...options,
      recoveryMode: "best" as const,
      enchantingSkill: 25,
      disenchantAccess: "self" as const,
    };
    const plan = buildProfessionLevelingPlan(data, best);
    expect(plan.netCopper).toBe("-90");
    expect(plan.recoveries?.[0]?.method).toBe("disenchant");
    for (const change of [
      { enchantingSkill: 24 },
      { disenchantAccess: "other" as const },
      { disenchantFeeCopper: "180" },
    ]) {
      expect(buildProfessionLevelingPlan(data, { ...best, ...change }).steps[0]?.recipeId).toBe(1);
    }
  });
  it("never credits crafted intermediates consumed by a later step or purchased overstock", () => {
    const first = { ...recipe(1, 10, 20), yellowSkill: 222, graySkill: 222 };
    const second = { ...recipe(2, 20, 21), requiredSkill: 222 };
    const source = item(10, 100, 900);
    const data = {
      recipes: [first, second],
      items: [
        {
          ...source,
          levels: [
            {
              unitPriceCopper: "100",
              quantity: 20,
              listingCount: 1,
              lots: [{ stackSize: 20, listingCount: 1, buyoutCopper: "2000" }],
            },
          ],
        },
        item(20, 0, 500),
        item(21, 0, 200),
      ],
    };
    const plan = buildProfessionLevelingPlan(data, options);
    expect(plan).toMatchObject({ totalCopper: "2020", recoveryCopper: "200", netCopper: "1820" });
    expect(plan.recoveries?.map((row) => row.itemId)).toEqual([21]);
    expect(plan.shopping[0]?.purchased).toBe(20);
  });
  it("reconciles a recipe that consumes its own output one step at a time", () => {
    const self = recipe(1, 20, 20);
    const plan = buildProfessionLevelingPlan(
      { recipes: [self], items: [item(20, 100, 50)] },
      options,
    );
    expect(plan).toMatchObject({ totalCopper: "110", recoveryCopper: "50", netCopper: "60" });
    expect(plan.steps[0]?.crafts).toBe(2);
    expect(plan.recoveries?.[0]?.quantity).toBe(1);
  });
  it("keeps exact fractional copper until the aggregate and makes recovery rows reconcile", () => {
    const items = [item(20, 0, 0, 0), item(21, 0, 0, 0)].map((row) => ({
      ...row,
      recovery: {
        ...row.recovery!,
        disenchant: { numerator: "3", denominator: "5", requiredSkill: 1, evidence: "Reference" },
      },
    }));
    const price = createLevelingRecoveryPricer(items, {
      ...options,
      recoveryMode: "best",
      enchantingSkill: 1,
    });
    const quote = quoteLevelingRecoveries(
      new Map([
        [21, 1],
        [20, 1],
      ]),
      new Map(items.map((row) => [row.id, row])),
      price,
    );
    expect(quote.total).toBe(1n);
    expect(quote.lines.reduce((sum, row) => sum + BigInt(row.valueCopper), 0n)).toBe(1n);
    expect(quote.lines.find((row) => row.itemId === 20)?.valueCopper).toBe("1");
  });
  it("migrates saved settings safely to vendor recovery and validates disenchant controls", () => {
    expect(professionLevelingOptionsSchema.parse(options)).toMatchObject({
      recoveryMode: "vendor",
      enchantingSkill: 1,
      disenchantAccess: "other",
    });
    expect(
      professionLevelingOptionsSchema.safeParse({ ...options, enchantingSkill: 301 }).success,
    ).toBe(false);
    expect(
      professionLevelingOptionsSchema.safeParse({ ...options, disenchantFeeCopper: "-1" }).success,
    ).toBe(false);
  });
});
