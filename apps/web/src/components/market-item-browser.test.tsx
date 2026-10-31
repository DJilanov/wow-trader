import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { analyzePriceHistory, quoteBuyOpportunity } from "@wow-trader/market";
import { MarketItemBrowser } from "./market-item-browser";
import { formatBuyOpportunity, type MarketItemBrowserData } from "../lib/market-item-browser-data";
import { createMarketPriceSignal } from "../lib/market-price-signal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const now = new Date("2026-10-31T12:00:00Z");
const history = Array.from({ length: 11 }, (_, index) => ({
  observedAt: new Date(now.getTime() - (10 - index) * 1_800_000),
  priceCopper: index < 8 ? 10_000n : 7_000n,
  availableQuantity: 100,
  listingCount: 5,
  completeness: 1,
}));
const buy = quoteBuyOpportunity({
  intelligence: analyzePriceHistory(history),
  now,
  observedAt: now,
  auctionHouseType: "alliance",
  levels: [{ unitPriceCopper: 7000n, quantity: 100, listingCount: 5 }],
});
const data: MarketItemBrowserData = {
  rows: [
    {
      itemId: 2770,
      name: "Copper Ore",
      iconFileDataId: null,
      quality: 1,
      minimumAsk: "70s",
      representativeAsk: "70s",
      medianAsk: "70s",
      upperAsk: "70s",
      availableQuantity: 100,
      listingCount: 5,
      quantityWithinFivePercent: 100,
      quantityWithinTenPercent: 100,
      vendorSellPrice: "1c",
      vendorProfit: null,
      normalPrice: "1g",
      normalRange: "95s–1g 5s",
      differenceFromNormal: "-30%",
      confidence: "65%",
      signal: createMarketPriceSignal(
        history.map((row) => ({
          observedAt: row.observedAt,
          completeness: row.completeness,
          levels: [
            {
              unitPriceCopper: row.priceCopper,
              quantity: row.availableQuantity,
              listingCount: row.listingCount,
            },
          ],
        })),
      ),
      verdict: {
        kind: "good_deal",
        tone: "positive",
        label: "Good deal",
        guidance: "Below normal.",
      },
      buy: formatBuyOpportunity(buy),
    },
  ],
  suggestions: [],
  totalCount: 60,
  page: 1,
  pageSize: 30,
  sort: "deal",
  filter: "buy",
  materialsOnly: true,
  budget: "1.25",
  quantityLimit: 10,
  scannedAt: now.toISOString(),
};

function render(value: MarketItemBrowserData): string {
  return renderToStaticMarkup(
    createElement(MarketItemBrowser, {
      basePath: "/forever/trader",
      clientProduct: "wow_classic_beta",
      data: value,
      encyclopediaItemPath: "/forever/encyclopedia/items",
      market: "EU|TestRealm|alliance",
      query: "",
      preservedParameters: [],
    }),
  );
}

describe("market buying guidance", () => {
  it("exposes real sizing, fees, conditional profit and accessible controls", () => {
    const html = render(data);
    for (const text of [
      "Buy opportunity",
      "Maximum buy / unit",
      "Target resale / unit",
      "Total purchase cost",
      "AH sale cut (5%)",
      "Profit before deposits",
      "Budget per item (gold)",
      "Maximum units",
      "Materials only",
      "Budgets apply to each item separately",
    ])
      expect(html).toContain(text);
    expect(html).toContain("10 units");
    expect(html).toContain("2g 02s 50c");
  });
  it("preserves all buying filters across pagination", () => {
    const html = render(data);
    for (const parameter of [
      "itemFilter=buy",
      "itemKind=materials",
      "buyBudget=1.25",
      "buyQuantity=10",
      "page=2",
    ])
      expect(html).toContain(parameter);
  });
  it("explains why an empty buying result does not imply the market is broken", () => {
    const html = render({ ...data, rows: [], totalCount: 0 });
    expect(html).toContain(
      "No purchase currently meets the history, freshness, discount and return requirements",
    );
    expect(html).not.toContain("Buying plan for Copper Ore");
  });
});
