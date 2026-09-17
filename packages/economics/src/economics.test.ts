import { describe, expect, it } from "vitest";

import {
  calculateCraftingOpportunity,
  calculatePricedCraftingOpportunity,
  consumeOrderBook,
  createFraction,
} from "./index.js";

describe("consumeOrderBook", () => {
  it("uses the cheapest available levels without mutating input", () => {
    const levels = [
      { unitPriceCopper: 120n, quantity: 2 },
      { unitPriceCopper: 100n, quantity: 2 },
    ] as const;

    const result = consumeOrderBook(levels, 3);

    expect(result.totalCostCopper).toBe(320n);
    expect(result.fulfilledQuantity).toBe(3);
    expect(result.unfilledQuantity).toBe(0);
    expect(result.highestUnitPriceCopper).toBe(120n);
    expect(levels[0]?.unitPriceCopper).toBe(120n);
  });

  it("reports insufficient market depth", () => {
    const result = consumeOrderBook([{ unitPriceCopper: 100n, quantity: 2 }], 5);

    expect(result.fulfilledQuantity).toBe(2);
    expect(result.unfilledQuantity).toBe(3);
  });
});

describe("calculateCraftingOpportunity", () => {
  it("calculates depth-aware expected profit with fees and cooldown value", () => {
    const result = calculateCraftingOpportunity({
      crafts: 1,
      inputs: [
        {
          itemId: 12808,
          quantity: 3,
          priceLevels: [
            { unitPriceCopper: 100n, quantity: 2 },
            { unitPriceCopper: 120n, quantity: 2 },
          ],
        },
      ],
      outputs: [
        {
          itemId: 7080,
          expectedQuantity: createFraction(1n, 1n),
          expectedUnitPriceCopper: 1_000n,
          fillRateBasisPoints: 9_000,
        },
      ],
      auctionHouseCutBasisPoints: 500,
      fixedCostCopper: 20n,
      listingDepositCopper: 100n,
      expectedDepositLossCopper: 10n,
      cooldownOpportunityCostCopper: 50n,
    });

    expect(result.viable).toBe(true);
    if (!result.viable) return;

    expect(result.reagentCostCopper).toBe(320n);
    expect(result.expectedGrossRevenueCopper).toBe(900n);
    expect(result.expectedAuctionHouseCutCopper).toBe(45n);
    expect(result.expectedProfitCopper).toBe(455n);
    expect(result.capitalRequiredCopper).toBe(440n);
    expect(result.returnOnCapitalBasisPoints).toBe(10_340n);
  });

  it("does not calculate a profit when required inputs cannot be acquired", () => {
    const result = calculateCraftingOpportunity({
      crafts: 2,
      inputs: [
        {
          itemId: 12808,
          quantity: 2,
          priceLevels: [{ unitPriceCopper: 100n, quantity: 3 }],
        },
      ],
      outputs: [
        {
          itemId: 7080,
          expectedQuantity: createFraction(1n, 1n),
          expectedUnitPriceCopper: 1_000n,
          fillRateBasisPoints: 10_000,
        },
      ],
      auctionHouseCutBasisPoints: 500,
      fixedCostCopper: 0n,
      listingDepositCopper: 0n,
      expectedDepositLossCopper: 0n,
      cooldownOpportunityCostCopper: 0n,
    });

    expect(result.viable).toBe(false);
    expect(result.unfilledInputs).toEqual([
      { itemId: 12808, requestedQuantity: 4, availableQuantity: 3 },
    ]);
  });
});

describe("calculatePricedCraftingOpportunity", () => {
  it("uses a preplanned cross-profession reagent cost without adding internal AH fees", () => {
    const acquisition = consumeOrderBook([{ unitPriceCopper: 100n, quantity: 2 }], 2);
    const result = calculatePricedCraftingOpportunity({
      crafts: 1,
      reagentCostCopper: 200n,
      acquisitionByItem: new Map([[10, acquisition]]),
      outputs: [
        {
          itemId: 20,
          expectedQuantity: createFraction(1n, 1n),
          expectedUnitPriceCopper: 1_000n,
          fillRateBasisPoints: 10_000,
        },
      ],
      auctionHouseCutBasisPoints: 500,
      fixedCostCopper: 0n,
      listingDepositCopper: 0n,
      expectedDepositLossCopper: 0n,
      cooldownOpportunityCostCopper: 0n,
    });

    expect(result.reagentCostCopper).toBe(200n);
    expect(result.expectedAuctionHouseCutCopper).toBe(50n);
    expect(result.expectedProfitCopper).toBe(750n);
  });
});
