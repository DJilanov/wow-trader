import { describe, expect, it } from "vitest";

import { createMarketPriceSignal } from "./market-price-signal";

describe("createMarketPriceSignal", () => {
  it("keeps price guidance gated until six observations exist", () => {
    expect(createMarketPriceSignal([observation(0, 100n)])).toMatchObject({
      status: "collecting",
      observationCount: 1,
      minimumObservationCount: 6,
      label: "Collecting 1/6",
    });
  });

  it("classifies a material move above the robust normal price", () => {
    const signal = createMarketPriceSignal([
      observation(0, 100n),
      observation(1, 100n),
      observation(2, 100n),
      observation(3, 100n),
      observation(4, 100n),
      observation(5, 200n),
    ]);

    expect(signal.status).toBe("available");
    if (signal.status === "available") {
      expect(signal.label).toBe("Rising");
      expect(signal.observationCount).toBe(6);
      expect(signal.differenceFromNormal).toMatch(/^\+/);
    }
  });
});

function observation(index: number, price: bigint) {
  return {
    observedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 30)),
    completeness: 1,
    levels: [{ unitPriceCopper: price, quantity: 10, listingCount: 3 }],
  };
}
