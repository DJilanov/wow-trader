import {
  getLatestMarketScanStatus,
  type MarketAuctionHouseType,
} from "../../../../lib/market-scan-status";
import { isSupportedClientProduct } from "../../../../lib/game-versions";

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
  const clientProduct = url.searchParams.get("product")?.trim();
  const realmId = url.searchParams.get("realm")?.trim();
  const auctionHouseType = url.searchParams.get("auctionHouseType")?.trim();
  if (
    !clientProduct ||
    !isSupportedClientProduct(clientProduct) ||
    !region ||
    !realmId ||
    !auctionHouseType ||
    !auctionHouseTypes.includes(auctionHouseType as MarketAuctionHouseType)
  ) {
    return Response.json({ error: "invalid_market" }, { status: 400 });
  }

  try {
    const scan = await getLatestMarketScanStatus({
      clientProduct,
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
