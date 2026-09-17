import { describe, expect, it } from "vitest";

import { backtestPriceBaseline, forecastPrice, summarizeOrderBook } from "./index.js";

describe("summarizeOrderBook", () => {
  it("preserves actionable depth instead of reporting only the minimum", () => {
    const result = summarizeOrderBook([
      { unitPriceCopper: 110n, quantity: 5, listingCount: 2 },
      { unitPriceCopper: 100n, quantity: 2, listingCount: 1 },
      { unitPriceCopper: 105n, quantity: 3, listingCount: 1 },
    ]);

    expect(result).toEqual({
      minimumPriceCopper: 100n,
      weightedTenthPercentilePriceCopper: 100n,
      weightedMedianPriceCopper: 105n,
      weightedNinetiethPercentilePriceCopper: 110n,
      availableQuantity: 10,
      listingCount: 4,
      quantityWithinFivePercent: 5,
      quantityWithinTenPercent: 10,
    });
  });

  it("does not let one tiny undercut define the robust sell-side anchor", () => {
    const result = summarizeOrderBook([
      { unitPriceCopper: 1n, quantity: 1, listingCount: 1 },
      { unitPriceCopper: 1_000n, quantity: 19, listingCount: 8 },
    ]);

    expect(result.minimumPriceCopper).toBe(1n);
    expect(result.weightedTenthPercentilePriceCopper).toBe(1_000n);
  });
});

describe("forecastPrice", () => {
  it("requires a useful history before returning a range", () => {
    const forecast = forecastPrice(observations([100n, 110n]), 30 * 60_000);
    expect(forecast).toEqual({
      status: "insufficient_data",
      observationCount: 2,
      minimumObservationCount: 6,
    });
  });

  it("uses robust dispersion so one outlier does not dominate the range", () => {
    const forecast = forecastPrice(
      observations([100n, 102n, 101n, 103n, 10_000n, 102n, 104n, 103n]),
      30 * 60_000,
    );
    expect(forecast.status).toBe("available");
    if (forecast.status !== "available") return;

    expect(forecast.rollingMedianCopper).toBe(102n);
    expect(forecast.medianAbsoluteDeviationCopper).toBe(1n);
    expect(forecast.pointPriceCopper).toBeLessThan(120n);
    expect(forecast.dataConfidenceBasisPoints).toBeLessThanOrEqual(8_000);
  });
});

describe("backtestPriceBaseline", () => {
  it("uses walk-forward windows and exposes the naive comparison", () => {
    const result = backtestPriceBaseline(
      observations([100n, 102n, 101n, 103n, 102n, 104n, 103n, 105n]),
      4,
    );

    expect(result?.predictionCount).toBe(4);
    expect(typeof result?.beatsNaiveAbsoluteError).toBe("boolean");
    expect(result?.directionAccuracyBasisPoints).toBeGreaterThanOrEqual(0);
  });
});

function observations(prices: readonly bigint[]) {
  return prices.map((priceCopper, index) => ({
    observedAt: new Date(Date.UTC(2026, 8, 15, 0, index * 30)),
    priceCopper,
    availableQuantity: 20 + index,
    completeness: 1,
  }));
}
