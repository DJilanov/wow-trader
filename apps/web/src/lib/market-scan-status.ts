import { marketScans, rawUploads } from "@wow-trader/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "./database";
import type { SupportedClientProduct } from "./game-versions";

export type MarketAuctionHouseType = "alliance" | "horde" | "neutral" | "region" | "unknown";

export interface MarketScanSelector {
  readonly clientProduct: SupportedClientProduct;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: MarketAuctionHouseType;
}

export async function getLatestMarketScanStatus(
  selector: MarketScanSelector,
): Promise<{ readonly scanId: string; readonly completedAt: Date } | null> {
  const database = getDatabase();
  const [scan] = await database
    .select({ scanId: marketScans.scanId, completedAt: marketScans.completedAt })
    .from(marketScans)
    .where(
      and(
        eq(marketScans.region, selector.region),
        eq(marketScans.realmId, selector.realmId),
        eq(marketScans.auctionHouseType, selector.auctionHouseType),
        eq(marketScans.qualityAccepted, true),
        inArray(
          marketScans.payloadId,
          database
            .select({ payloadId: rawUploads.payloadId })
            .from(rawUploads)
            .where(eq(rawUploads.clientProduct, selector.clientProduct)),
        ),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(1);

  return scan ?? null;
}
