import { describe, expect, it } from "vitest";
import { buildSharedGoldPlan, type GoldPlanCandidate } from "./gold-plan.js";
import { costWholeAuctionStacks } from "./auction-lots.js";
import type { MarketPriceLevel } from "./order-book-summary.js";
function book(stackSize = 5, listingCount = 2, buyoutCopper = 50n): MarketPriceLevel[] {
  return [
    {
      unitPriceCopper: (buyoutCopper + BigInt(stackSize) - 1n) / BigInt(stackSize),
      quantity: stackSize * listingCount,
      listingCount,
      lots: [{ stackSize, listingCount, buyoutCopper }],
    },
  ];
}
function craft(id = "a", overrides: Partial<GoldPlanCandidate> = {}): GoldPlanCandidate {
  return {
    id,
    name: id,
    kind: "auction_house",
    itemId: 2,
    expectedNetRevenueCopper: 100n,
    maximumExecutions: 2,
    inputs: [{ itemId: 1, quantity: 3 }],
    detail: "Craft on an alt",
    ...overrides,
  };
}
describe("whole-stack reagent acquisition", () => {
  it("chooses the cheapest complete covering auctions, without rounding a unit price", () => {
    const levels = [...book(5, 1, 49n), ...book(1, 10, 11n)];
    expect(costWholeAuctionStacks(levels, 4, 100n)).toMatchObject({ quantity: 4, costCopper: 44n });
    expect(costWholeAuctionStacks(levels, 5, 100n)).toMatchObject({ quantity: 5, costCopper: 49n });
    expect(costWholeAuctionStacks(book(), 1, 49n)).toBeNull();
  });
  it("does not invent stack sizes for legacy scans", () => {
    expect(
      costWholeAuctionStacks([{ unitPriceCopper: 1n, quantity: 10, listingCount: 2 }], 3, 100n),
    ).toBeNull();
  });
});
describe("a shared upfront gold plan", () => {
  it("uses leftover purchased materials in later actions, charging each auction once", () => {
    const plan = buildSharedGoldPlan({
      budgetCopper: 100n,
      candidates: [craft()],
      books: new Map([[1, book()]]),
      inventory: [],
    });
    expect(plan.actions).toHaveLength(2);
    expect(plan.spentCopper).toBe(100n);
    expect(plan.remainingCopper).toBe(0n);
    expect(plan.expectedProfitCopper).toBe(100n);
    expect(
      plan.actions
        .flatMap((row) => row.purchases.flatMap((purchase) => purchase.lots))
        .reduce((sum, lot) => sum + lot.listingCount, 0),
    ).toBe(2);
  });
  it("never reinvests forecast proceeds to fund a later purchase", () => {
    const plan = buildSharedGoldPlan({
      budgetCopper: 50n,
      candidates: [craft("a", { inputs: [{ itemId: 1, quantity: 5 }] })],
      books: new Map([[1, book()]]),
      inventory: [],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.spentCopper).toBe(50n);
  });
  it("values and consumes owned stock once across competing recipes", () => {
    const plan = buildSharedGoldPlan({
      budgetCopper: 0n,
      candidates: [craft("a"), craft("b")],
      books: new Map(),
      inventory: [{ itemId: 1, quantity: 3, opportunityValueCopper: 10n }],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.ownedMaterialValueCopper).toBe(30n);
    expect(plan.expectedProfitCopper).toBe(70n);
    expect(
      buildSharedGoldPlan({
        budgetCopper: 0n,
        candidates: [craft("a", { expectedNetRevenueCopper: 29n })],
        books: new Map(),
        inventory: [{ itemId: 1, quantity: 3, opportunityValueCopper: 10n }],
      }).actions,
    ).toHaveLength(0);
  });
  it("does not assign the same auction to a flip and a craft", () => {
    const flip = craft("flip", {
      inputs: [],
      purchases: [{ itemId: 1, lots: [{ stackSize: 5, listingCount: 1, buyoutCopper: 50n }] }],
      maximumExecutions: 1,
    });
    const plan = buildSharedGoldPlan({
      budgetCopper: 200n,
      candidates: [flip, craft("craft", { inputs: [{ itemId: 1, quantity: 5 }] })],
      books: new Map([[1, book(5, 1)]]),
      inventory: [],
    });
    expect(plan.actions).toHaveLength(1);
  });
  it("shares item sale caps across different recipes", () => {
    const options = {
      inputs: [{ itemId: 1, quantity: 1 }],
      outputCaps: [{ itemId: 2, quantity: 1, limit: 2 }],
    };
    const plan = buildSharedGoldPlan({
      budgetCopper: 100n,
      candidates: [craft("a", options), craft("b", options)],
      books: new Map([[1, book(1, 100, 1n)]]),
      inventory: [],
    });
    expect(plan.actions).toHaveLength(2);
  });
  it("cannot duplicate remaining stock when lot groups repeat", () => {
    const levels = book(1, 1, 1n);
    levels[0] = {
      ...levels[0]!,
      quantity: 2,
      listingCount: 2,
      lots: [...levels[0]!.lots!, ...levels[0]!.lots!],
    };
    const plan = buildSharedGoldPlan({
      budgetCopper: 100n,
      candidates: [craft("a", { inputs: [{ itemId: 1, quantity: 1 }], maximumExecutions: 5 })],
      books: new Map([[1, levels]]),
      inventory: [],
    });
    expect(plan.actions).toHaveLength(2);
  });
});
