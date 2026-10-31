import { describe, expect, it } from "vitest";
import { auctionPriceLevelSchema, traderTradeSchema, traderWatchSchema } from "./index.js";
describe("Trader data boundaries", () => {
  it("validates the complete quantity and exact rounded stack price", () => {
    const level = {
      unitPriceCopper: "10",
      quantity: 5,
      listingCount: 1,
      lots: [{ stackSize: 5, buyoutCopper: "49", listingCount: 1 }],
    };
    expect(auctionPriceLevelSchema.safeParse(level).success).toBe(true);
    expect(auctionPriceLevelSchema.safeParse({ ...level, quantity: 4 }).success).toBe(false);
    expect(auctionPriceLevelSchema.safeParse({ ...level, unitPriceCopper: "9" }).success).toBe(
      false,
    );
  });
  it("defaults conservative watch limits and rejects unsafe names and market scopes", () => {
    const item = {
      product: "wow_classic_beta",
      market: "EU|Realm|alliance",
      itemId: 1,
      name: "Ore",
    };
    expect(traderWatchSchema.parse(item)).toMatchObject({
      maximumBuyCopper: null,
      maximumUnits: 100,
      cooldownMinutes: 60,
    });
    expect(traderWatchSchema.safeParse({ ...item, name: "Ore\nscript" }).success).toBe(false);
    expect(traderWatchSchema.safeParse({ ...item, market: "../../other" }).success).toBe(false);
  });
  it("cannot save a fee larger than an actual sale or a future receipt", () => {
    const event = {
      eventId: "440532b2-b976-45df-8cb3-ddfa7a00e81a",
      sourceKey: "manual:test",
      product: "wow_classic_beta",
      clientBuild: 70707,
      market: "EU|Realm|alliance",
      characterName: "Crafter",
      itemId: 1,
      itemName: "Ore",
      quantity: 1,
      kind: "sale",
      amountCopper: "100",
      auctionFeeCopper: "5",
      depositCopper: null,
      occurredAt: "2026-10-30T12:00:00Z",
      evidence: "manual",
    };
    expect(traderTradeSchema.safeParse(event).success).toBe(true);
    expect(traderTradeSchema.safeParse({ ...event, auctionFeeCopper: "101" }).success).toBe(false);
    expect(
      traderTradeSchema.safeParse({
        ...event,
        occurredAt: new Date(Date.now() + 600000).toISOString(),
      }).success,
    ).toBe(false);
  });
});
