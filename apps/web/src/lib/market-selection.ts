import type { MarketAuctionHouseType } from "./market-scan-status";

export type MarketFaction = "alliance" | "horde";

interface MarketIdentity {
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: string;
}

export function parseMarketFaction(value: string | undefined): MarketFaction | undefined {
  return value === "alliance" || value === "horde" ? value : undefined;
}

export function parseAuctionHouseType(
  value: string | undefined,
): MarketAuctionHouseType | undefined {
  return value === "alliance" ||
    value === "horde" ||
    value === "neutral" ||
    value === "region" ||
    value === "unknown"
    ? value
    : undefined;
}

export function marketSelectionValue(market: MarketIdentity): string {
  return `${market.region}|${market.realmId}|${market.auctionHouseType}`;
}

export function selectMarketScan<T extends MarketIdentity>(
  newestFirst: readonly T[],
  requestedMarket?: string,
  faction?: MarketFaction,
): T | null {
  return (
    newestFirst.find(
      (scan) =>
        (!faction || scan.auctionHouseType === faction) &&
        (!requestedMarket || marketSelectionValue(scan) === requestedMarket),
    ) ?? null
  );
}
