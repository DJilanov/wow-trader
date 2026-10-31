import {
  auctionPriceLevels,
  loadMarketHistory,
  gameBuilds,
  itemVersions,
  marketItemObservations,
  marketItemSignals,
  marketScans,
  rawUploads,
} from "@wow-trader/db";
import {
  BUY_POLICY,
  analyzePriceHistory,
  quoteBuyOpportunity,
  auctionHouseFeeBasisPoints,
  type BuyOpportunity,
} from "@wow-trader/market";
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
    | "collecting"
    | "stale";
  readonly tone: "positive" | "neutral" | "warning" | "negative" | "collecting";
  readonly label: string;
  readonly guidance: string;
}

export interface MarketItemBrowserRow {
  readonly itemId: number;
  readonly name: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly catalogVerified?: boolean;
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
  readonly buy: FormattedBuyOpportunity;
}

export interface FormattedBuyOpportunity {
  readonly state: BuyOpportunity["state"];
  readonly reason: string;
  readonly quantity: number;
  readonly maximumBuyPrice: string | null;
  readonly targetResalePrice: string | null;
  readonly buyCost: string;
  readonly auctionFee: string;
  readonly profit: string;
  readonly returnPercent: string;
  readonly feePercent: string | null;
}

export interface MarketItemBrowserData {
  readonly rows: readonly MarketItemBrowserRow[];
  readonly suggestions: readonly string[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: MarketItemSort;
  readonly filter?: "all" | "buy";
  readonly materialsOnly?: boolean;
  readonly budget?: string;
  readonly quantityLimit?: number;
  readonly scannedAt?: string;
  readonly budgetError?: string;
}

export interface MarketItemBrowserFilters {
  readonly clientProduct: SupportedClientProduct;
  readonly market: string;
  readonly query?: string;
  readonly sort?: MarketItemSort;
  readonly page?: number;
  readonly pageSize?: number;
  readonly filter?: "all" | "buy";
  readonly materialsOnly?: boolean;
  readonly budget?: string;
  readonly quantityLimit?: number;
}

const MAX_QUERY_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const GOLD_BUDGET_PATTERN = /^\d{1,9}(?:\.\d{1,4})?$/;

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
    .orderBy(desc(marketScans.completedAt), desc(marketScans.scanId))
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
  const catalogJoin = build
    ? and(
        eq(itemVersions.buildId, build.id),
        eq(itemVersions.itemId, marketItemObservations.itemId),
      )
    : sql`false`;

  const canonicalMarket = sql`${marketItemObservations.marketKey} = ${marketItemObservations.itemId}::text`;
  const searchCondition = marketItemSearchCondition(query);
  const signalJoin = and(
    eq(marketItemSignals.clientProduct, filters.clientProduct),
    eq(marketItemSignals.clientBuild, scan.clientBuild),
    eq(marketItemSignals.region, scan.region),
    eq(marketItemSignals.realmId, scan.realmId),
    eq(marketItemSignals.auctionHouseType, scan.auctionHouseType),
    eq(marketItemSignals.itemId, marketItemObservations.itemId),
    eq(marketItemSignals.asOfScanId, scan.scanId),
  );
  const now = new Date();
  const eligible = eligibleBuyCondition(
    scan.auctionHouseType,
    scan.completedAt,
    now,
    parseBuyBudget(filters.budget),
  );
  const itemCondition = and(
    eq(marketItemObservations.scanId, scan.scanId),
    canonicalMarket,
    searchCondition,
    filters.filter === "buy" ? eligible : undefined,
    filters.materialsOnly
      ? inArray(
          sql<number>`coalesce(${itemVersions.classId}, ${marketItemObservations.itemClassId})`,
          [3, 5, 7],
        )
      : undefined,
  );

  const [countRows, suggestionRows] = await Promise.all([
    database
      .select({ value: count() })
      .from(marketItemObservations)
      .leftJoin(itemVersions, catalogJoin)
      .leftJoin(marketItemSignals, signalJoin)
      .where(itemCondition),
    database
      .select({ name: marketItemName() })
      .from(marketItemObservations)
      .leftJoin(itemVersions, catalogJoin)
      .leftJoin(marketItemSignals, signalJoin)
      .where(itemCondition)
      .orderBy(asc(marketItemName()))
      .limit(query ? 80 : 200),
  ]);
  const totalCount = countRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);

  const rows = await database
    .select({
      itemId: marketItemObservations.itemId,
      name: marketItemName(),
      iconFileDataId: itemVersions.iconFileDataId,
      quality: sql<number>`coalesce(${itemVersions.quality}, 1)`.mapWith(Number),
      catalogVerified: sql<boolean>`${itemVersions.itemId} IS NOT NULL`,
      sellPriceCopper: sql<bigint>`coalesce(${itemVersions.sellPriceCopper}, 0)`.mapWith(BigInt),
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
    .leftJoin(itemVersions, catalogJoin)
    .leftJoin(marketItemSignals, signalJoin)
    .where(itemCondition)
    .orderBy(...marketItemOrder(sort, eligible, scan.auctionHouseType))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const itemIds = rows.map((row) => row.itemId);
  const [history, depth] = await Promise.all([
    loadMarketHistory(
      database,
      { clientProduct: filters.clientProduct, ...scan },
      scan.completedAt,
      scan.scanId,
      itemIds,
    ),
    itemIds.length === 0
      ? []
      : database
          .select({
            itemId: auctionPriceLevels.itemId,
            unitPriceCopper: auctionPriceLevels.unitPriceCopper,
            quantity: auctionPriceLevels.quantity,
            listingCount: auctionPriceLevels.listingCount,
          })
          .from(auctionPriceLevels)
          .where(
            and(
              eq(auctionPriceLevels.scanId, scan.scanId),
              inArray(auctionPriceLevels.itemId, itemIds),
              sql`${auctionPriceLevels.marketKey} = ${auctionPriceLevels.itemId}::text`,
            ),
          ),
  ]);
  const signals = new Map(
    itemIds.map((id) => [
      id,
      createMarketPriceSignal(
        (history.byItem.get(id) ?? []).map((observation) => ({
          observedAt: observation.observedAt,
          completeness: observation.completeness,
          levels: [
            {
              unitPriceCopper: observation.priceCopper,
              quantity: observation.availableQuantity,
              listingCount: observation.listingCount,
            },
          ],
        })),
      ),
    ]),
  );
  const byItem = new Map<number, typeof depth>();
  for (const level of depth) {
    const levels = byItem.get(level.itemId) ?? [];
    levels.push(level);
    byItem.set(level.itemId, levels);
  }
  const buys = new Map(
    itemIds.map((id) => [
      id,
      quoteBuyOpportunity({
        intelligence: analyzePriceHistory(history.byItem.get(id) ?? []),
        levels: byItem.get(id) ?? [],
        observedAt: scan.completedAt,
        now,
        auctionHouseType: scan.auctionHouseType,
        ...(parseBuyBudget(filters.budget) !== undefined
          ? { maximumSpendCopper: parseBuyBudget(filters.budget)! }
          : {}),
        maximumQuantity: filters.quantityLimit ?? BUY_POLICY.maximumQuantity,
      }),
    ]),
  );

  return {
    rows: rows.map((row) =>
      formatRow(row, signals.get(row.itemId) ?? createMarketPriceSignal([]), buys.get(row.itemId)!),
    ),
    suggestions: suggestionRows.map((row) => row.name),
    totalCount,
    page,
    pageSize,
    sort,
    filter: filters.filter ?? "all",
    materialsOnly: filters.materialsOnly ?? false,
    budget: filters.budget ?? "",
    quantityLimit: filters.quantityLimit ?? BUY_POLICY.maximumQuantity,
    scannedAt: scan.completedAt.toISOString(),
    ...(filters.budget?.trim() && !GOLD_BUDGET_PATTERN.test(filters.budget)
      ? {
          budgetError:
            "Enter a nonnegative gold amount with at most four decimal places. Buying is locked until the budget is valid.",
        }
      : {}),
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
    readonly catalogVerified: boolean;
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
  buy: BuyOpportunity,
): MarketItemBrowserRow {
  const vendorProfitCopper = row.sellPriceCopper - row.minimumPriceCopper;
  return {
    itemId: row.itemId,
    name: row.name,
    iconFileDataId: row.iconFileDataId,
    quality: row.quality,
    catalogVerified: row.catalogVerified,
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
    buy: formatBuyOpportunity(buy),
    verdict:
      buy.state === "stale"
        ? { kind: "stale", tone: "warning", label: "Stale scan", guidance: buy.reason }
        : classifyMarketItemDeal({
            minimumAskCopper: row.minimumPriceCopper,
            vendorSellPriceCopper: row.sellPriceCopper,
            signal,
          }),
  };
}

export function parseBuyBudget(value: string | undefined): bigint | undefined {
  if (!value?.trim()) return undefined;
  if (!GOLD_BUDGET_PATTERN.test(value)) return 0n;
  const [gold = "0", fraction = ""] = value.split(".");
  return BigInt(gold) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}

export function formatBuyOpportunity(buy: BuyOpportunity): FormattedBuyOpportunity {
  return {
    state: buy.state,
    reason: buy.reason,
    quantity: buy.quantity,
    maximumBuyPrice:
      buy.maximumBuyPriceCopper === null ? null : formatCopper(buy.maximumBuyPriceCopper),
    targetResalePrice:
      buy.targetResalePriceCopper === null ? null : formatCopper(buy.targetResalePriceCopper),
    buyCost: formatCopper(buy.buyCostCopper),
    auctionFee: formatCopper(buy.auctionFeeCopper),
    profit: formatCopper(buy.profitCopper),
    returnPercent: `${(buy.returnBasisPoints / 100).toFixed(1)}%`,
    feePercent: buy.auctionFeeBasisPoints === null ? null : `${buy.auctionFeeBasisPoints / 100}%`,
  };
}

function eligibleBuyCondition(
  auctionHouseType: string,
  observedAt: Date,
  now: Date,
  budget: bigint | undefined,
): SQL {
  const fee = auctionHouseFeeBasisPoints(auctionHouseType);
  const age = now.getTime() - observedAt.getTime();
  if (fee === null || age > BUY_POLICY.maximumScanAgeMilliseconds || age < -300_000)
    return sql`false`;
  const net = sql`(${marketItemSignals.lowerPriceCopper} - ceil(${marketItemSignals.lowerPriceCopper}::numeric * ${fee} / 10000))`;
  return sql`${marketItemSignals.signal} IN ('normal', 'bargain') AND ${marketItemSignals.observationCount} >= 6
    AND ${marketItemSignals.currentListingCount} >= 3 AND ${marketItemSignals.normalPriceCopper} > 0
    AND ${marketItemObservations.minimumPriceCopper} <= LEAST(floor(${net} * 10000 / ${10000 + BUY_POLICY.minimumReturnBasisPoints}), floor(${marketItemSignals.normalPriceCopper}::numeric * ${10000 - BUY_POLICY.minimumDiscountBasisPoints} / 10000))
    ${budget === undefined ? sql`` : sql`AND ${marketItemObservations.minimumPriceCopper} <= ${String(budget)}::bigint`}`;
}

function marketItemOrder(
  sort: MarketItemSort,
  eligible: SQL,
  auctionHouseType: string,
): readonly SQL[] {
  if (sort === "discount") {
    return [
      asc(sql`coalesce(${marketItemSignals.differenceBasisPoints}, 9223372036854775807)`),
      desc(marketItemObservations.availableQuantity),
      asc(marketItemName()),
    ];
  }
  if (sort === "price-low") {
    return [asc(marketItemObservations.tenthPercentilePriceCopper), asc(marketItemName())];
  }
  if (sort === "price-high") {
    return [desc(marketItemObservations.tenthPercentilePriceCopper), asc(marketItemName())];
  }
  if (sort === "supply") {
    return [desc(marketItemObservations.availableQuantity), asc(marketItemName())];
  }
  if (sort === "name") return [asc(marketItemName())];
  return [
    desc(sql`CASE WHEN ${eligible} THEN 1 ELSE 0 END`),
    desc(
      sql`CASE WHEN ${eligible} THEN (${marketItemSignals.lowerPriceCopper}::numeric * ${auctionHouseType === "neutral" ? 8500 : 9500} / 10000 - ${marketItemObservations.minimumPriceCopper}) / GREATEST(1, ${marketItemObservations.minimumPriceCopper}) ELSE 0 END`,
    ),
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
    asc(marketItemName()),
  ];
}

function marketItemName(): SQL<string> {
  return sql<string>`coalesce(${itemVersions.name}, ${marketItemObservations.itemName}, 'Item ' || ${marketItemObservations.itemId}::text)`;
}

function marketItemSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const numericItemId = Number(query);
  const nameCondition = ilike(marketItemName(), `%${escapeLike(query)}%`);
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
