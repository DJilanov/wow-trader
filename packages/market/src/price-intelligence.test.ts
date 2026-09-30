import { describe, expect, it } from "vitest";

import { analyzePriceHistory, bucketObservations } from "./price-intelligence.js";

describe("price intelligence", () => {
  it("deduplicates one market observation per half-hour bucket by quality", () => {
    const observations = [
      observation("2026-09-27T10:01:00Z", 100, 10, 5, 0.9),
      observation("2026-09-27T10:20:00Z", 110, 11, 6, 1),
      observation("2026-09-27T10:25:00Z", 120, 12, 7, 0.8),
    ];
    expect(bucketObservations(observations)).toEqual([observations[1]]);
  });

  it("withholds a signal until six independent buckets exist", () => {
    const result = analyzePriceHistory(series([100, 100, 101, 99, 100]));
    expect(result).toEqual({
      status: "collecting",
      observationCount: 5,
      minimumObservationCount: 6,
    });
  });

  it("separates a low-supply price spike from a sustained rising market", () => {
    const spike = analyzePriceHistory(
      series([100, 101, 99, 100, 100, 220], { finalQuantity: 1, finalListings: 1 }),
    );
    expect(spike).toMatchObject({ status: "available", signal: "spike_risk" });

    const rising = analyzePriceHistory(series([100, 100, 100, 120, 145, 180]));
    expect(rising).toMatchObject({ status: "available", signal: "rising", direction: "up" });
  });

  it("distinguishes oversupply from an ordinary bargain", () => {
    const oversupplied = analyzePriceHistory(
      series([100, 100, 101, 99, 100, 50], { finalQuantity: 40 }),
    );
    expect(oversupplied).toMatchObject({ status: "available", signal: "oversupplied" });

    const bargain = analyzePriceHistory(series([100, 100, 101, 99, 100, 80]));
    expect(bargain).toMatchObject({ status: "available", signal: "bargain" });
  });

  it("preserves an extreme listing delta beyond the PostgreSQL 32-bit integer range", () => {
    const result = analyzePriceHistory(
      series([100, 100, 100, 100, 100, 99_999_990_000], {
        finalQuantity: 2,
        finalListings: 2,
      }),
    );

    expect(result).toMatchObject({
      status: "available",
      signal: "spike_risk",
      differenceBasisPoints: 9_999_998_990_000,
    });
  });
});

function series(
  prices: readonly number[],
  options: { readonly finalQuantity?: number; readonly finalListings?: number } = {},
) {
  return prices.map((price, index) =>
    observation(
      new Date(Date.UTC(2026, 8, 27, 0, index * 30)).toISOString(),
      price,
      index === prices.length - 1 ? (options.finalQuantity ?? 10) : 10,
      index === prices.length - 1 ? (options.finalListings ?? 5) : 5,
      1,
    ),
  );
}

function observation(
  observedAt: string,
  price: number,
  availableQuantity: number,
  listingCount: number,
  completeness: number,
) {
  return {
    observedAt: new Date(observedAt),
    priceCopper: BigInt(price),
    availableQuantity,
    listingCount,
    completeness,
  } as const;
}
