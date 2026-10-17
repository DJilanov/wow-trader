import { getLatestMarketScanStatus } from "../../../../lib/market-scan-status";
import { isSupportedClientProduct } from "../../../../lib/game-versions";
import { parseAuctionHouseType } from "../../../../lib/market-selection";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const region = url.searchParams.get("region")?.trim();
  const clientProduct = url.searchParams.get("product")?.trim();
  const realmId = url.searchParams.get("realm")?.trim();
  const auctionHouseType = parseAuctionHouseType(url.searchParams.get("auctionHouseType")?.trim());
  if (
    !clientProduct ||
    !isSupportedClientProduct(clientProduct) ||
    Boolean(region) !== Boolean(realmId) ||
    (region?.length ?? 0) > 8 ||
    (realmId?.length ?? 0) > 128 ||
    !auctionHouseType ||
    (url.searchParams.has("region") && !region) ||
    (url.searchParams.has("realm") && !realmId)
  ) {
    return Response.json({ error: "invalid_market" }, { status: 400, headers });
  }

  try {
    const scan = await getLatestMarketScanStatus({
      clientProduct,
      ...(region && realmId ? { region, realmId } : {}),
      auctionHouseType,
    });
    return Response.json(
      { scanId: scan?.scanId ?? null, completedAt: scan?.completedAt.toISOString() ?? null },
      { headers },
    );
  } catch {
    return Response.json({ error: "data_unavailable" }, { status: 503, headers });
  }
}
