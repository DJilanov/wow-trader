import { describe, expect, it } from "vitest";

import { createMarketPriceSignal } from "./market-price-signal";
import { classifyMarketItemDeal } from "./market-item-browser-data";

describe("classifyMarketItemDeal", () => {
  it("prioritizes deterministic vendor arbitrage", () => {
    expect(
      classifyMarketItemDeal({
        minimumAskCopper: 90n,
        vendorSellPriceCopper: 100n,
        signal: createMarketPriceSignal([]),
      }),
    ).toMatchObject({ kind: "vendor_arbitrage", label: "Vendor arbitrage" });
  });

  it("keeps good or bad guidance locked while evidence is collecting", () => {
    expect(
      classifyMarketItemDeal({
        minimumAskCopper: 100n,
        vendorSellPriceCopper: 0n,
        signal: createMarketPriceSignal([observation(100n)]),
      }),
    ).toMatchObject({ kind: "collecting", tone: "collecting" });
  });

  it("labels a supported below-normal ask as a good deal", () => {
    const signal = createMarketPriceSignal([
      observation(1_000n, 0),
      observation(1_000n, 1),
      observation(1_000n, 2),
      observation(1_000n, 3),
      observation(1_000n, 4),
      observation(800n, 5),
      observation(800n, 6),
      observation(800n, 7),
    ]);
    expect(signal).toMatchObject({ status: "available", kind: "bargain" });
    expect(
      classifyMarketItemDeal({
        minimumAskCopper: 800n,
        vendorSellPriceCopper: 0n,
        signal,
      }),
    ).toMatchObject({ kind: "good_deal", label: "Good deal" });
  });
});

function observation(priceCopper: bigint, offset = 0) {
  return {
    observedAt: new Date(Date.UTC(2026, 0, 1, 0, offset * 30)),
    completeness: 1,
    levels: [{ unitPriceCopper: priceCopper, quantity: 20, listingCount: 5 }],
  };
}
