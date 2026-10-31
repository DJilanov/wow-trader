import { summarizeOrderBook, type MarketPriceLevel } from "./order-book-summary.js";
import { selectAuctionLots, validateAuctionLots, type SelectedAuctionLot } from "./auction-lots.js";
import type { PriceIntelligence } from "./price-intelligence.js";

export const BUY_POLICY = {
  version: "conservative-whole-stack-buy-v2",
  maximumScanAgeMilliseconds: 60 * 60_000,
  minimumDiscountBasisPoints: 1_500,
  minimumReturnBasisPoints: 2_000,
  maximumSupplyShareBasisPoints: 1_000,
  maximumQuantity: 100,
} as const;

export type BuyOpportunityState = "opportunity" | "collecting" | "stale" | "wait" | "unavailable";

export interface BuyOpportunity {
  readonly state: BuyOpportunityState;
  readonly reason: string;
  readonly quantity: number;
  readonly maximumBuyPriceCopper: bigint | null;
  readonly targetResalePriceCopper: bigint | null;
  readonly buyCostCopper: bigint;
  readonly grossResaleCopper: bigint;
  readonly auctionFeeCopper: bigint;
  readonly netResaleCopper: bigint;
  readonly profitCopper: bigint;
  readonly returnBasisPoints: number;
  readonly auctionFeeBasisPoints: number | null;
  readonly lots: readonly SelectedAuctionLot[];
  readonly auctionCount: number;
}

export interface BuyOpportunityInput {
  readonly intelligence: PriceIntelligence;
  readonly levels: readonly MarketPriceLevel[];
  readonly observedAt: Date;
  readonly now: Date;
  readonly auctionHouseType: string;
  readonly maximumSpendCopper?: bigint;
  readonly maximumQuantity?: number;
  readonly maximumBuyPriceCopper?: bigint;
}

export function auctionHouseFeeBasisPoints(auctionHouseType: string): number | null {
  if (auctionHouseType === "neutral") return 1_500;
  if (["alliance", "horde", "region"].includes(auctionHouseType)) return 500;
  return null;
}

export function quoteBuyOpportunity(input: BuyOpportunityInput): BuyOpportunity {
  const fee = auctionHouseFeeBasisPoints(input.auctionHouseType);
  const empty: BuyOpportunity = {
    state: "unavailable",
    reason: "A known Auction House fee and usable prices are required.",
    quantity: 0,
    maximumBuyPriceCopper: null,
    targetResalePriceCopper: null,
    buyCostCopper: 0n,
    grossResaleCopper: 0n,
    auctionFeeCopper: 0n,
    netResaleCopper: 0n,
    profitCopper: 0n,
    returnBasisPoints: 0,
    auctionFeeBasisPoints: fee,
    lots: [],
    auctionCount: 0,
  };
  const age = input.now.getTime() - input.observedAt.getTime();
  if (!Number.isFinite(age) || age < -5 * 60_000 || age > BUY_POLICY.maximumScanAgeMilliseconds) {
    return {
      ...empty,
      state: "stale",
      reason: "Scan again: buy suggestions require prices less than one hour old.",
    };
  }
  if (input.intelligence.status === "collecting") {
    return {
      ...empty,
      state: "collecting",
      reason: `Collecting ${input.intelligence.observationCount}/${input.intelligence.minimumObservationCount} independent half-hour observations.`,
    };
  }
  if (fee === null || input.levels.length === 0) return empty;
  const book = summarizeOrderBook(input.levels);
  if (
    book.listingCount < 3 ||
    book.availableQuantity < Math.max(3, Math.floor(input.intelligence.normalQuantity * 0.25))
  ) {
    return { ...empty, reason: "There is too little current listed supply to size a buy." };
  }
  if (input.maximumSpendCopper !== undefined && input.maximumSpendCopper < 0n) {
    throw new RangeError("Buy budget must not be negative");
  }
  const maximumQuantity = input.maximumQuantity ?? BUY_POLICY.maximumQuantity;
  if (
    !Number.isSafeInteger(maximumQuantity) ||
    maximumQuantity < 1 ||
    maximumQuantity > BUY_POLICY.maximumQuantity
  ) {
    throw new RangeError("Buy quantity must be an integer from 1 to 100");
  }
  const intelligence = input.intelligence;
  const target = intelligence.lowerPriceCopper;
  const netUnit = target - divideUp(target * BigInt(fee), 10_000n);
  const roiLimit = (netUnit * 10_000n) / BigInt(10_000 + BUY_POLICY.minimumReturnBasisPoints);
  const discountLimit =
    (intelligence.normalPriceCopper * BigInt(10_000 - BUY_POLICY.minimumDiscountBasisPoints)) /
    10_000n;
  let ceiling = roiLimit < discountLimit ? roiLimit : discountLimit;
  if (input.maximumBuyPriceCopper !== undefined) {
    if (input.maximumBuyPriceCopper < 0n)
      throw new RangeError("Maximum buy price must not be negative");
    if (input.maximumBuyPriceCopper < ceiling) ceiling = input.maximumBuyPriceCopper;
  }
  const quoted = { ...empty, targetResalePriceCopper: target, maximumBuyPriceCopper: ceiling };
  if (!["normal", "bargain"].includes(intelligence.signal)) {
    return {
      ...quoted,
      state: "wait",
      reason:
        "Wait: falling, inflated, oversupplied or thin markets do not qualify for a buy suggestion.",
    };
  }
  if (intelligence.currentListingCount < 3 || ceiling <= 0n) return quoted;
  const cap = Math.min(
    maximumQuantity,
    Math.max(
      1,
      Math.floor((intelligence.normalQuantity * BUY_POLICY.maximumSupplyShareBasisPoints) / 10_000),
    ),
  );
  if (!input.levels.some(validateAuctionLots))
    return {
      ...quoted,
      reason:
        "Exact auction stacks are missing. Update the Collector and upload a fresh full scan.",
    };
  const selected = selectAuctionLots({
    levels: input.levels,
    maximumUnitPriceCopper: ceiling,
    maximumQuantity: cap,
    targetResalePriceCopper: target,
    feeBasisPoints: fee,
    ...(input.maximumSpendCopper !== undefined
      ? { maximumSpendCopper: input.maximumSpendCopper }
      : {}),
  });
  const quantity = selected.quantity;
  const cost = selected.costCopper;
  if (quantity === 0) {
    return {
      ...quoted,
      state: "wait",
      reason: "No whole auction stack fits the buy ceiling, quantity cap and budget.",
    };
  }
  const gross = target * BigInt(quantity);
  const auctionFee = divideUp(gross * BigInt(fee), 10_000n);
  const net = gross - auctionFee;
  const profit = net - cost;
  const returnBasisPoints = (profit * 10_000n) / cost;
  if (returnBasisPoints > BigInt(Number.MAX_SAFE_INTEGER))
    return {
      ...quoted,
      state: "unavailable",
      reason: "The price spread exceeds safe sizing limits.",
    };
  return {
    ...quoted,
    state: "opportunity",
    reason:
      "Whole auction stacks fit your limits. Recheck their availability in game before buying.",
    quantity,
    buyCostCopper: cost,
    grossResaleCopper: gross,
    auctionFeeCopper: auctionFee,
    netResaleCopper: net,
    profitCopper: profit,
    returnBasisPoints: Number(returnBasisPoints),
    lots: selected.lots,
    auctionCount: selected.lots.reduce((sum, lot) => sum + lot.listingCount, 0),
  };
}

function divideUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
