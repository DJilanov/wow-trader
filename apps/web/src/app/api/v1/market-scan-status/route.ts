import {
  getLatestMarketScanStatus,
  type MarketAuctionHouseType,
} from "../../../../lib/market-scan-status";

export const dynamic = "force-dynamic";

const auctionHouseTypes: readonly MarketAuctionHouseType[] = [
  "alliance",
  "horde",
  "neutral",
  "region",
  "unknown",
];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const region = url.searchParams.get("region")?.trim();
  const realmId = url.searchParams.get("realm")?.trim();
  const auctionHouseType = url.searchParams.get("auctionHouseType")?.trim();
  if (
    !region ||
    !realmId ||
    !auctionHouseType ||
    !auctionHouseTypes.includes(auctionHouseType as MarketAuctionHouseType)
  ) {
    return Response.json({ error: "invalid_market" }, { status: 400 });
  }

  try {
    const scan = await getLatestMarketScanStatus({
      region,
      realmId,
      auctionHouseType: auctionHouseType as MarketAuctionHouseType,
    });
    return Response.json({
      scanId: scan?.scanId ?? null,
      completedAt: scan?.completedAt.toISOString() ?? null,
    });
  } catch {
    return Response.json({ error: "data_unavailable" }, { status: 503 });
  }
}
