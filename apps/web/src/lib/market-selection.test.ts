import { describe, expect, it } from "vitest";

import {
  marketSelectionValue,
  parseAuctionHouseType,
  parseMarketFaction,
  selectMarketScan,
} from "./market-selection";

const alliance = {
  region: "UNKNOWN",
  realmId: "ClassicBetaPvP",
  auctionHouseType: "alliance",
  scanId: "alliance-scan",
};
const horde = { ...alliance, auctionHouseType: "horde", scanId: "horde-scan" };

describe("exact Auction House selection", () => {
  it("keeps both factions distinct and selects a matching scan even when the other is newer", () => {
    expect(selectMarketScan([alliance, horde], undefined, "horde")).toEqual(horde);
    expect(selectMarketScan([horde, alliance], undefined, "alliance")).toEqual(alliance);
    expect(marketSelectionValue(alliance)).not.toBe(marketSelectionValue(horde));
  });

  it("never substitutes Alliance for missing Horde data", () => {
    expect(selectMarketScan([alliance], undefined, "horde")).toBeNull();
    expect(selectMarketScan([alliance], marketSelectionValue(horde))).toBeNull();
  });

  it("does not silently replace a requested region, realm, faction or unavailable market", () => {
    for (const requested of [
      "EU|ClassicBetaPvP|alliance",
      "UNKNOWN|OtherRealm|alliance",
      "malformed",
    ])
      expect(selectMarketScan([alliance, horde], requested)).toBeNull();
    expect(selectMarketScan([alliance, horde], marketSelectionValue(alliance), "horde")).toBeNull();
  });

  it("preserves latest-market behavior only when no specific scope was requested", () => {
    expect(selectMarketScan([horde, alliance])).toEqual(horde);
    expect(selectMarketScan([])).toBeNull();
  });

  it("accepts only supported faction and Auction House types", () => {
    expect(parseMarketFaction("horde")).toBe("horde");
    expect(parseMarketFaction("alliance")).toBe("alliance");
    expect(parseMarketFaction("neutral")).toBeUndefined();
    expect(parseAuctionHouseType("neutral")).toBe("neutral");
    expect(parseAuctionHouseType("invalid")).toBeUndefined();
    expect(parseAuctionHouseType(undefined)).toBeUndefined();
  });
});
