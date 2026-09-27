import { describe, expect, it } from "vitest";

import { createMarketOpportunityHistory } from "./market-opportunity-history";
import { createMarketPriceSignal } from "./market-price-signal";

describe("createMarketOpportunityHistory", () => {
  it("aligns output and reagent observations and applies the Auction House fee", () => {
    const result = createMarketOpportunityHistory({
      auctionHouseCutBasisPoints: 500,
      inputs: [{ itemId: 20, quantity: 2 }],
      outputs: [
        {
          itemId: 10,
          name: "Finished item",
          expectedQuantity: { numerator: 1n, denominator: 1n },
        },
      ],
      primaryOutputItemId: 10,
      signalsByItem: new Map([
        [10, signal([10_000n, 12_000n])],
        [20, signal([2_000n, 3_000n])],
      ]),
    });

    expect(result?.points[1]).toMatchObject({
      unitAskCopper: "12000",
      grossRevenueCopper: "12000",
      netRevenueCopper: "11400",
      reagentCostCopper: "6000",
      profitCopper: "5400",
      missingInputCount: 0,
      missingOutputCount: 0,
    });
  });

  it("does not invent economics when a reagent was absent from the same scan", () => {
    const result = createMarketOpportunityHistory({
      auctionHouseCutBasisPoints: 1_500,
      inputs: [{ itemId: 20, quantity: 1 }],
      outputs: [
        {
          itemId: 10,
          name: "Finished item",
          expectedQuantity: { numerator: 1n, denominator: 1n },
        },
      ],
      primaryOutputItemId: 10,
      signalsByItem: new Map([
        [10, signal([10_000n, 12_000n])],
        [20, signal([2_000n])],
      ]),
    });

    expect(result?.points[1]).toMatchObject({
      netRevenueCopper: "10200",
      reagentCostCopper: null,
      profitCopper: null,
      missingInputCount: 1,
    });
  });

  it("withholds historical profit when listed reagent supply cannot fill one craft", () => {
    const result = createMarketOpportunityHistory({
      auctionHouseCutBasisPoints: 500,
      inputs: [{ itemId: 20, quantity: 4 }],
      outputs: [
        {
          itemId: 10,
          name: "Finished item",
          expectedQuantity: { numerator: 1n, denominator: 1n },
        },
      ],
      primaryOutputItemId: 10,
      signalsByItem: new Map([
        [10, signal([10_000n])],
        [20, signal([2_000n], 3)],
      ]),
    });

    expect(result?.points[0]).toMatchObject({
      reagentCostCopper: null,
      profitCopper: null,
      missingInputCount: 1,
    });
  });
});

function signal(prices: readonly bigint[], quantity = 10) {
  return createMarketPriceSignal(
    prices.map((price, index) => ({
      observedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 30)),
      completeness: 1,
      levels: [{ unitPriceCopper: price, quantity, listingCount: 3 }],
    })),
  );
}
