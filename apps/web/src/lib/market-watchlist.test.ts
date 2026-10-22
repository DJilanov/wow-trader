import { describe, expect, it } from "vitest";
import {
  parseMarketWatchlist,
  toggleMarketWatchlist,
  watchedMarketItemHref,
  type WatchedMarketItem,
} from "./market-watchlist";

const item: WatchedMarketItem = {
  product: "wow_classic_beta",
  market: "GLOBAL|ClassicBetaPvP|alliance",
  itemId: 2447,
  name: "Peacebloom",
};
describe("opt-in local market watchlists", () => {
  it("keeps editions and faction markets separate and supports removal", () => {
    const items = toggleMarketWatchlist(toggleMarketWatchlist([], item), {
      ...item,
      market: "GLOBAL|ClassicBetaPvP|horde",
    });
    expect(items).toHaveLength(2);
    expect(toggleMarketWatchlist(items, item)).toEqual([
      { ...item, market: "GLOBAL|ClassicBetaPvP|horde" },
    ]);
    expect(parseMarketWatchlist(JSON.stringify(items))).toEqual(items);
    expect(watchedMarketItemHref(item)).toBe(
      "/tools/forever/trader?mode=items&market=GLOBAL%7CClassicBetaPvP%7Calliance&q=2447",
    );
    expect(watchedMarketItemHref({ ...item, product: "wow_anniversary" })).toContain(
      "/tools/tbc/trader?",
    );
  });
  it("bounds storage, rejects unsafe identities and does not turn missing data into a price", () => {
    expect(parseMarketWatchlist(null)).toEqual([]);
    for (const raw of [
      "not-json",
      "[]".repeat(30000),
      JSON.stringify([{ ...item, market: "https://evil.test" }]),
      JSON.stringify([{ ...item, token: "private" }]),
    ])
      expect(parseMarketWatchlist(raw)).toBeNull();
    const full = Array.from({ length: 50 }, (_, index) => ({ ...item, itemId: index + 1 }));
    expect(() => toggleMarketWatchlist(full, item)).toThrow(/50 items/);
    expect(toggleMarketWatchlist(full, full[0]!)).toHaveLength(49);
    expect(parseMarketWatchlist(JSON.stringify([item, item]))).toEqual([item]);
    expect(Object.keys(item).sort()).toEqual(["itemId", "market", "name", "product"]);
  });
});
