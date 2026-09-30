import {
  gameBuilds,
  itemVersions,
  marketItemObservations,
  marketItemSignals,
  marketScans,
  rawUploads,
} from "@wow-trader/db";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "./database";
import { formatCopper } from "./format";
import type { SupportedClientProduct } from "./game-versions";
import { createMarketPriceSignal, type MarketPriceSignal } from "./market-price-signal";

export type MarketItemSort = "deal" | "discount" | "price-low" | "price-high" | "supply" | "name";

export interface MarketItemDealVerdict {
  readonly kind:
    | "vendor_arbitrage"
    | "good_deal"
    | "below_normal"
    | "normal"
    | "rising"
    | "falling"
    | "spike_risk"
    | "too_thin"
    | "collecting";
  readonly tone: "positive" | "neutral" | "warning" | "negative" | "collecting";
  readonly label: string;
  readonly guidance: string;
}

export interface MarketItemBrowserRow {
  readonly itemId: number;
  readonly name: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly minimumAsk: string;
  readonly representativeAsk: string;
  readonly medianAsk: string;
  readonly upperAsk: string;
  readonly availableQuantity: number;
  readonly listingCount: number;
  readonly quantityWithinFivePercent: number;
  readonly quantityWithinTenPercent: number;
  readonly vendorSellPrice: string | null;
  readonly vendorProfit: string | null;
  readonly normalPrice: string | null;
  readonly normalRange: string | null;
  readonly differenceFromNormal: string | null;
  readonly confidence: string | null;
  readonly signal: MarketPriceSignal;
  readonly verdict: MarketItemDealVerdict;
}

export interface MarketItemBrowserData {
  readonly rows: readonly MarketItemBrowserRow[];
  readonly suggestions: readonly string[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: MarketItemSort;
}

export interface MarketItemBrowserFilters {
  readonly clientProduct: SupportedClientProduct;
  readonly market: string;
  readonly query?: string;
  readonly sort?: MarketItemSort;
  readonly page?: number;
  readonly pageSize?: number;
}

const MAX_QUERY_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export async function getMarketItemBrowser(
  filters: MarketItemBrowserFilters,
): Promise<MarketItemBrowserData> {
  const database = getDatabase();
  const selector = parseMarket(filters.market);
  const query = normalizeQuery(filters.query ?? "");
  const sort = filters.sort ?? "deal";
  const pageSize = normalizePageSize(filters.pageSize);
  const requestedPage = normalizePage(filters.page);

  const [scan] = await database
    .select({
      scanId: marketScans.scanId,
      clientBuild: marketScans.clientBuild,
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
      completedAt: marketScans.completedAt,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(
      and(
        eq(rawUploads.clientProduct, filters.clientProduct),
        eq(marketScans.qualityAccepted, true),
        eq(marketScans.region, selector.region),
        eq(marketScans.realmId, selector.realmId),
        eq(marketScans.auctionHouseType, selector.auctionHouseType),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(1);
  if (!scan) return emptyBrowser(sort, requestedPage, pageSize);

  const [build] = await database
    .select({ id: gameBuilds.id })
    .from(gameBuilds)
    .where(
      and(
        eq(gameBuilds.product, filters.clientProduct),
        eq(gameBuilds.buildNumber, scan.clientBuild),
        eq(gameBuilds.status, "published"),
      ),
    )
    .orderBy(desc(gameBuilds.publishedAt))
    .limit(1);
  if (!build) return emptyBrowser(sort, requestedPage, pageSize);

  const canonicalMarket = sql`${marketItemObservations.marketKey} = ${marketItemObservations.itemId}::text`;
  const searchCondition = marketItemSearchCondition(query);
  const itemCondition = and(
    eq(marketItemObservations.scanId, scan.scanId),
    canonicalMarket,
    searchCondition,
  );
  const signalJoin = and(
    eq(marketItemSignals.clientProduct, filters.clientProduct),
    eq(marketItemSignals.clientBuild, scan.clientBuild),
    eq(marketItemSignals.region, scan.region),
    eq(marketItemSignals.realmId, scan.realmId),
    eq(marketItemSignals.auctionHouseType, scan.auctionHouseType),
    eq(marketItemSignals.itemId, marketItemObservations.itemId),
  );

  const [countRows, suggestionRows] = await Promise.all([
    database
      .select({ value: count() })
      .from(marketItemObservations)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, build.id),
          eq(itemVersions.itemId, marketItemObservations.itemId),
        ),
      )
      .where(itemCondition),
    database
      .select({ name: itemVersions.name })
      .from(marketItemObservations)
      .innerJoin(
        itemVersions,
        and(
          eq(itemVersions.buildId, build.id),
          eq(itemVersions.itemId, marketItemObservations.itemId),
        ),
      )
      .where(itemCondition)
      .orderBy(asc(itemVersions.name))
      .limit(query ? 80 : 200),
  ]);
  const totalCount = countRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);

  const rows = await database
    .select({
      itemId: marketItemObservations.itemId,
      name: itemVersions.name,
      iconFileDataId: itemVersions.iconFileDataId,
      quality: itemVersions.quality,
      sellPriceCopper: itemVersions.sellPriceCopper,
      minimumPriceCopper: marketItemObservations.minimumPriceCopper,
      representativePriceCopper: marketItemObservations.tenthPercentilePriceCopper,
      medianPriceCopper: marketItemObservations.medianPriceCopper,
      upperPriceCopper: marketItemObservations.ninetiethPercentilePriceCopper,
      availableQuantity: marketItemObservations.availableQuantity,
      listingCount: marketItemObservations.listingCount,
      quantityWithinFivePercent: marketItemObservations.quantityWithinFivePercent,
      quantityWithinTenPercent: marketItemObservations.quantityWithinTenPercent,
    })
    .from(marketItemObservations)
    .innerJoin(
      itemVersions,
      and(
        eq(itemVersions.buildId, build.id),
        eq(itemVersions.itemId, marketItemObservations.itemId),
      ),
    )
    .leftJoin(marketItemSignals, signalJoin)
    .where(itemCondition)
    .orderBy(...marketItemOrder(sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const itemIds = rows.map((row) => row.itemId);
  const historyScans =
    itemIds.length === 0
      ? []
      : await database
          .select({
            scanId: marketScans.scanId,
            completedAt: marketScans.completedAt,
            completeness: marketScans.completeness,
          })
          .from(marketScans)
          .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
          .where(
            and(
              eq(rawUploads.clientProduct, filters.clientProduct),
              eq(marketScans.qualityAccepted, true),
              eq(marketScans.clientBuild, scan.clientBuild),
              eq(marketScans.region, scan.region),
              eq(marketScans.realmId, scan.realmId),
              eq(marketScans.auctionHouseType, scan.auctionHouseType),
            ),
          )
          .orderBy(desc(marketScans.completedAt))
          .limit(1_440);
  const historicalObservations =
    itemIds.length === 0 || historyScans.length === 0
      ? []
      : await database
          .select({
            scanId: marketItemObservations.scanId,
            itemId: marketItemObservations.itemId,
            priceCopper: marketItemObservations.tenthPercentilePriceCopper,
            availableQuantity: marketItemObservations.availableQuantity,
            listingCount: marketItemObservations.listingCount,
          })
          .from(marketItemObservations)
          .where(
            and(
              inArray(
                marketItemObservations.scanId,
                historyScans.map((historyScan) => historyScan.scanId),
              ),
              inArray(marketItemObservations.itemId, itemIds),
              sql`${marketItemObservations.marketKey} = ${marketItemObservations.itemId}::text`,
            ),
          );
  const signals = createSignals(itemIds, historyScans, historicalObservations);

  return {
    rows: rows.map((row) => formatRow(row, signals.get(row.itemId) ?? createMarketPriceSignal([]))),
    suggestions: suggestionRows.map((row) => row.name),
    totalCount,
    page,
    pageSize,
    sort,
  };
}

export function classifyMarketItemDeal(input: {
  readonly minimumAskCopper: bigint;
  readonly vendorSellPriceCopper: bigint;
  readonly signal: MarketPriceSignal;
}): MarketItemDealVerdict {
  if (input.vendorSellPriceCopper > input.minimumAskCopper) {
    return {
      kind: "vendor_arbitrage",
      tone: "positive",
      label: "Vendor arbitrage",
      guidance:
        "The cheapest listing is below the vendor sell price. Verify the listed quantity before buying.",
    };
  }
  if (input.signal.status === "collecting") {
    return {
      kind: "collecting",
      tone: "collecting",
      label: input.signal.label,
      guidance: `Need ${input.signal.minimumObservationCount} independent half-hour observations before calling this price good or bad.`,
    };
  }
  const verdicts: Record<
    Exclude<MarketPriceSignal, { readonly status: "collecting" }>["kind"],
    MarketItemDealVerdict
  > = {
    bargain: {
      kind: "good_deal",
      tone: "positive",
      label: "Good deal",
      guidance: "The representative ask is below the robust normal range with usable supply.",
    },
    oversupplied: {
      kind: "below_normal",
      tone: "positive",
      label: "Below normal",
      guidance:
        "Price is low with heavy listed supply. Buyers have leverage, but it may fall further.",
    },
    normal: {
      kind: "normal",
      tone: "neutral",
      label: "Fair price",
      guidance: "The representative ask sits inside its robust historical range.",
    },
    rising: {
      kind: "rising",
      tone: "warning",
      label: "Rising",
      guidance: "The ask is above normal and moving upward. Avoid chasing without a specific need.",
    },
    falling: {
      kind: "falling",
      tone: "warning",
      label: "Falling",
      guidance: "The ask is below normal but still falling. Waiting may produce a better entry.",
    },
    spike_risk: {
      kind: "spike_risk",
      tone: "negative",
      label: "Spike risk",
      guidance:
        "The ask is above normal with thin supply. This is a poor time to chase the listing.",
    },
    too_thin: {
      kind: "too_thin",
      tone: "warning",
      label: "Too thin",
      guidance: "There is too little listed supply for a reliable buy or sell conclusion.",
    },
  };
  return verdicts[input.signal.kind];
}

function formatRow(
  row: {
    readonly itemId: number;
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly sellPriceCopper: bigint;
    readonly minimumPriceCopper: bigint;
    readonly representativePriceCopper: bigint;
    readonly medianPriceCopper: bigint;
    readonly upperPriceCopper: bigint;
    readonly availableQuantity: number;
    readonly listingCount: number;
    readonly quantityWithinFivePercent: number;
    readonly quantityWithinTenPercent: number;
  },
  signal: MarketPriceSignal,
): MarketItemBrowserRow {
  const vendorProfitCopper = row.sellPriceCopper - row.minimumPriceCopper;
  return {
    itemId: row.itemId,
    name: row.name,
    iconFileDataId: row.iconFileDataId,
    quality: row.quality,
    minimumAsk: formatCopper(row.minimumPriceCopper),
    representativeAsk: formatCopper(row.representativePriceCopper),
    medianAsk: formatCopper(row.medianPriceCopper),
    upperAsk: formatCopper(row.upperPriceCopper),
    availableQuantity: row.availableQuantity,
    listingCount: row.listingCount,
    quantityWithinFivePercent: row.quantityWithinFivePercent,
    quantityWithinTenPercent: row.quantityWithinTenPercent,
    vendorSellPrice: row.sellPriceCopper > 0n ? formatCopper(row.sellPriceCopper) : null,
    vendorProfit: vendorProfitCopper > 0n ? formatCopper(vendorProfitCopper) : null,
    normalPrice: signal.status === "available" ? signal.normalPrice : null,
    normalRange: signal.status === "available" ? signal.normalRange : null,
    differenceFromNormal: signal.status === "available" ? signal.differenceFromNormal : null,
    confidence: signal.status === "available" ? signal.confidence : null,
    signal,
    verdict: classifyMarketItemDeal({
      minimumAskCopper: row.minimumPriceCopper,
      vendorSellPriceCopper: row.sellPriceCopper,
      signal,
    }),
  };
}

function createSignals(
  itemIds: readonly number[],
  scans: readonly {
    readonly scanId: string;
    readonly completedAt: Date;
    readonly completeness: number;
  }[],
  observations: readonly {
    readonly scanId: string;
    readonly itemId: number;
    readonly priceCopper: bigint;
    readonly availableQuantity: number;
    readonly listingCount: number;
  }[],
): Map<number, MarketPriceSignal> {
  const observationsByItem = new Map<number, Array<(typeof observations)[number]>>();
  for (const observation of observations) {
    const group = observationsByItem.get(observation.itemId);
    if (group) group.push(observation);
    else observationsByItem.set(observation.itemId, [observation]);
  }
  const scansById = new Map(scans.map((scan) => [scan.scanId, scan]));
  return new Map(
    itemIds.map((itemId) => [
      itemId,
      createMarketPriceSignal(
        (observationsByItem.get(itemId) ?? []).flatMap((observation) => {
          const scan = scansById.get(observation.scanId);
          return scan
            ? [
                {
                  observedAt: scan.completedAt,
                  completeness: scan.completeness,
                  levels: [
                    {
                      unitPriceCopper: observation.priceCopper,
                      quantity: observation.availableQuantity,
                      listingCount: observation.listingCount,
                    },
                  ],
                },
              ]
            : [];
        }),
      ),
    ]),
  );
}

function marketItemOrder(sort: MarketItemSort): readonly SQL[] {
  if (sort === "discount") {
    return [
      asc(sql`coalesce(${marketItemSignals.differenceBasisPoints}, 9223372036854775807)`),
      desc(marketItemObservations.availableQuantity),
      asc(itemVersions.name),
    ];
  }
  if (sort === "price-low") {
    return [asc(marketItemObservations.tenthPercentilePriceCopper), asc(itemVersions.name)];
  }
  if (sort === "price-high") {
    return [desc(marketItemObservations.tenthPercentilePriceCopper), asc(itemVersions.name)];
  }
  if (sort === "supply") {
    return [desc(marketItemObservations.availableQuantity), asc(itemVersions.name)];
  }
  if (sort === "name") return [asc(itemVersions.name)];
  return [
    desc(
      sql`case when ${itemVersions.sellPriceCopper} > ${marketItemObservations.minimumPriceCopper} then ${itemVersions.sellPriceCopper} - ${marketItemObservations.minimumPriceCopper} else 0 end`,
    ),
    asc(sql`case ${marketItemSignals.signal}
      when 'bargain' then 0
      when 'oversupplied' then 1
      when 'normal' then 2
      when 'falling' then 3
      when 'rising' then 4
      when 'too_thin' then 5
      when 'spike_risk' then 6
      else 7 end`),
    asc(sql`coalesce(${marketItemSignals.differenceBasisPoints}, 9223372036854775807)`),
    desc(marketItemObservations.availableQuantity),
    asc(itemVersions.name),
  ];
}

function marketItemSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const numericItemId = Number(query);
  const nameCondition = ilike(itemVersions.name, `%${escapeLike(query)}%`);
  return Number.isSafeInteger(numericItemId) && numericItemId > 0
    ? or(eq(marketItemObservations.itemId, numericItemId), nameCondition)
    : nameCondition;
}

function parseMarket(value: string): {
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: "alliance" | "horde" | "neutral" | "region" | "unknown";
} {
  const [region, realmId, auctionHouseType] = value.split("|");
  if (!region || !realmId || !isAuctionHouseType(auctionHouseType)) {
    throw new Error("A valid market is required for Auction House item search");
  }
  return { region, realmId, auctionHouseType };
}

function isAuctionHouseType(
  value: string | undefined,
): value is "alliance" | "horde" | "neutral" | "region" | "unknown" {
  return (
    value === "alliance" ||
    value === "horde" ||
    value === "neutral" ||
    value === "region" ||
    value === "unknown"
  );
}

function normalizeQuery(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizePage(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function normalizePageSize(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

function emptyBrowser(sort: MarketItemSort, page: number, pageSize: number): MarketItemBrowserData {
  return { rows: [], suggestions: [], totalCount: 0, page, pageSize, sort };
}
