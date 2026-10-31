import { and, eq, sql } from "drizzle-orm";
import {
  MARKET_HISTORY_POLICY,
  resolveMarketHistoryBuilds,
  type PriceHistoryObservation,
} from "@wow-trader/market";

import type { WowTraderDatabase } from "./client.js";
import { marketHistoryLinks } from "./schema.js";

export interface MarketHistoryScope {
  readonly clientProduct: string;
  readonly clientBuild: number;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: "alliance" | "horde" | "neutral" | "region" | "unknown";
}

export interface MarketHistory {
  readonly builds: readonly number[];
  readonly revision: string;
  readonly byItem: ReadonlyMap<number, readonly PriceHistoryObservation[]>;
}

export async function loadMarketHistory(
  database: Pick<WowTraderDatabase, "select" | "execute">,
  scope: MarketHistoryScope,
  asOf: Date,
  scanId: string,
  itemIds?: readonly number[],
): Promise<MarketHistory> {
  if (itemIds?.length === 0)
    return { builds: [scope.clientBuild], revision: "empty", byItem: new Map() };
  const cutoff = new Date(asOf.getTime() - MARKET_HISTORY_POLICY.maximumAgeMilliseconds);
  const links = await database
    .select()
    .from(marketHistoryLinks)
    .where(
      and(
        eq(marketHistoryLinks.clientProduct, scope.clientProduct),
        eq(marketHistoryLinks.region, scope.region),
        eq(marketHistoryLinks.realmId, scope.realmId),
        eq(marketHistoryLinks.auctionHouseType, scope.auctionHouseType),
      ),
    );
  const builds = resolveMarketHistoryBuilds(scope.clientBuild, cutoff, links);
  const buildCondition = sql.join(
    [...builds].map(
      ([build, since]) =>
        sql`(s.client_build = ${build} AND s.completed_at >= ${since.toISOString()}::timestamptz)`,
    ),
    sql` OR `,
  );
  const itemCondition = itemIds
    ? sql`AND o.item_id IN (${sql.join(
        itemIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const rows = await database.execute<{
    item_id: number;
    observed_at: string;
    price_copper: string;
    available_quantity: number;
    listing_count: number;
    completeness: number;
  }>(sql`
    WITH ranked AS (
      SELECT o.item_id, s.completed_at::text AS observed_at,
        o.tenth_percentile_price_copper::text AS price_copper,
        o.available_quantity, o.listing_count, s.completeness,
        row_number() OVER (PARTITION BY o.item_id, floor(extract(epoch FROM s.completed_at) / 1800)
          ORDER BY s.completed_at DESC, s.completeness DESC, s.scan_id DESC) AS position
      FROM market_item_observation o
      JOIN market_scan s ON s.scan_id = o.scan_id
      JOIN raw_upload r ON r.payload_id = s.payload_id
      JOIN market_item_observation current_item ON current_item.scan_id = ${scanId}::uuid
        AND current_item.item_id = o.item_id AND current_item.market_key = o.item_id::text
      WHERE r.client_product = ${scope.clientProduct} AND s.region = ${scope.region}
        AND s.realm_id = ${scope.realmId} AND s.auction_house_type = ${scope.auctionHouseType}
        AND s.quality_accepted AND s.completeness >= 0.98 AND s.completed_at <= ${asOf.toISOString()}::timestamptz
        AND (${buildCondition}) AND o.market_key = o.item_id::text ${itemCondition}
        AND (s.client_build = ${scope.clientBuild} OR EXISTS (
          SELECT 1 FROM game_build old_build
          JOIN item_version old_item ON old_item.build_id = old_build.id AND old_item.item_id = o.item_id
          JOIN game_build current_build ON current_build.product = old_build.product
            AND current_build.build_number = ${scope.clientBuild} AND current_build.locale = old_build.locale
            AND current_build.status = 'published'
          JOIN item_version current_version ON current_version.build_id = current_build.id
            AND current_version.item_id = o.item_id
          WHERE old_build.product = ${scope.clientProduct} AND old_build.build_number = s.client_build
            AND (to_jsonb(old_item) - 'build_id') = (to_jsonb(current_version) - 'build_id')
        ))
    ) SELECT item_id, observed_at, price_copper, available_quantity, listing_count, completeness
      FROM ranked WHERE position = 1 ORDER BY item_id, observed_at
  `);
  const byItem = new Map<number, PriceHistoryObservation[]>();
  for (const row of rows) {
    const group = byItem.get(row.item_id) ?? [];
    group.push({
      observedAt: new Date(row.observed_at),
      priceCopper: BigInt(row.price_copper),
      availableQuantity: row.available_quantity,
      listingCount: row.listing_count,
      completeness: row.completeness,
    });
    byItem.set(row.item_id, group);
  }
  for (const [id, history] of byItem)
    byItem.set(id, history.slice(-MARKET_HISTORY_POLICY.maximumObservationCount));
  return {
    builds: [...builds.keys()].sort((a, b) => a - b),
    revision: JSON.stringify(
      [...builds].sort(([a], [b]) => a - b).map(([build, since]) => [build, since.toISOString()]),
    ),
    byItem,
  };
}
