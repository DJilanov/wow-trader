import { describe, expect, it } from "vitest";
import { analyzePriceHistory, type PriceHistoryObservation } from "./price-intelligence.js";
import {
  auctionHouseFeeBasisPoints,
  quoteBuyOpportunity,
  type BuyOpportunityInput,
} from "./buy-opportunity.js";

const now = new Date("2026-10-31T12:00:00Z");
const history: readonly PriceHistoryObservation[] = Array.from({ length: 11 }, (_, index) => ({
  observedAt: new Date(now.getTime() - (10 - index) * 1_800_000),
  priceCopper: index < 8 ? 10_000n : 7_000n,
  availableQuantity: 100,
  listingCount: 5,
  completeness: 1,
}));

function input(overrides: Partial<BuyOpportunityInput> = {}): BuyOpportunityInput {
  return {
    intelligence: analyzePriceHistory(history),
    observedAt: now,
    now,
    auctionHouseType: "alliance",
    levels: [{ unitPriceCopper: 7_000n, quantity: 100, listingCount: 5 }],
    ...overrides,
  };
}

describe("buy opportunities", () => {
  it("quotes the lower historical band, exact depth and sale cut", () => {
    expect(quoteBuyOpportunity(input())).toMatchObject({
      state: "opportunity",
      quantity: 10,
      maximumBuyPriceCopper: 7_520n,
      targetResalePriceCopper: 9_500n,
      buyCostCopper: 70_000n,
      grossResaleCopper: 95_000n,
      auctionFeeCopper: 4_750n,
      netResaleCopper: 90_250n,
      profitCopper: 20_250n,
      returnBasisPoints: 2_892,
    });
  });
  it("stops before expensive depth and respects the budget", () => {
    const levels = [
      { unitPriceCopper: 7_000n, quantity: 3, listingCount: 1 },
      { unitPriceCopper: 7_500n, quantity: 4, listingCount: 2 },
      { unitPriceCopper: 8_000n, quantity: 93, listingCount: 5 },
    ];
    expect(quoteBuyOpportunity(input({ levels }))).toMatchObject({
      quantity: 7,
      buyCostCopper: 51_000n,
    });
    expect(quoteBuyOpportunity(input({ levels, maximumSpendCopper: 30_000n }))).toMatchObject({
      quantity: 4,
      buyCostCopper: 28_500n,
    });
    expect(quoteBuyOpportunity(input({ maximumSpendCopper: 0n }))).toMatchObject({
      state: "wait",
      quantity: 0,
    });
  });
  it("applies the neutral AH cut and rounds fees conservatively", () => {
    expect(auctionHouseFeeBasisPoints("neutral")).toBe(1500);
    expect(quoteBuyOpportunity(input({ auctionHouseType: "neutral" }))).toMatchObject({
      state: "wait",
      maximumBuyPriceCopper: 6_729n,
    });
    expect(
      quoteBuyOpportunity(
        input({
          auctionHouseType: "neutral",
          levels: [{ unitPriceCopper: 6000n, quantity: 100, listingCount: 5 }],
        }),
      ),
    ).toMatchObject({ state: "opportunity", auctionFeeCopper: 14_250n, profitCopper: 20_750n });
  });
  it("locks stale, future, unknown-fee and insufficient-history recommendations", () => {
    expect(
      quoteBuyOpportunity(input({ observedAt: new Date(now.getTime() - 3_600_001) })),
    ).toMatchObject({ state: "stale", quantity: 0 });
    expect(
      quoteBuyOpportunity(input({ observedAt: new Date(now.getTime() + 300_001) })),
    ).toMatchObject({ state: "stale" });
    expect(quoteBuyOpportunity(input({ auctionHouseType: "unknown" }))).toMatchObject({
      state: "unavailable",
    });
    expect(
      quoteBuyOpportunity(input({ intelligence: analyzePriceHistory(history.slice(-5)) })),
    ).toMatchObject({ state: "collecting" });
  });
  it("withholds buys in falling, oversupplied and thin markets", () => {
    expect(
      quoteBuyOpportunity(
        input({ levels: [{ unitPriceCopper: 7000n, quantity: 1, listingCount: 1 }] }),
      ),
    ).toMatchObject({ state: "unavailable", quantity: 0 });
    const available = analyzePriceHistory(history);
    if (available.status !== "available") throw new Error("Fixture needs history");
    for (const signal of ["falling", "oversupplied", "too_thin", "spike_risk", "rising"] as const) {
      expect(quoteBuyOpportunity(input({ intelligence: { ...available, signal } }))).toMatchObject({
        state: "wait",
        quantity: 0,
      });
    }
    expect(
      quoteBuyOpportunity(input({ intelligence: { ...available, currentListingCount: 2 } })),
    ).toMatchObject({ state: "unavailable" });
  });
  it("accepts a cheap individual offer inside an otherwise normal, supported market", () => {
    const available = analyzePriceHistory(history.map((row) => ({ ...row, priceCopper: 10_000n })));
    expect(quoteBuyOpportunity(input({ intelligence: available }))).toMatchObject({
      state: "opportunity",
      quantity: 10,
    });
  });
  it("validates sizing and never mutates price levels", () => {
    const levels = Object.freeze([
      Object.freeze({ unitPriceCopper: 7000n, quantity: 100, listingCount: 5 }),
    ]);
    expect(quoteBuyOpportunity(input({ levels, maximumQuantity: 2 }))).toMatchObject({
      quantity: 2,
    });
    expect(() => quoteBuyOpportunity(input({ maximumQuantity: 101 }))).toThrow(RangeError);
    expect(() => quoteBuyOpportunity(input({ maximumSpendCopper: -1n }))).toThrow(RangeError);
  });
});
