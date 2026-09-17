export interface MarketPriceLevel {
  readonly unitPriceCopper: bigint;
  readonly quantity: number;
  readonly listingCount: number;
}

export interface OrderBookSummary {
  readonly minimumPriceCopper: bigint;
  readonly weightedTenthPercentilePriceCopper: bigint;
  readonly weightedMedianPriceCopper: bigint;
  readonly weightedNinetiethPercentilePriceCopper: bigint;
  readonly availableQuantity: number;
  readonly listingCount: number;
  readonly quantityWithinFivePercent: number;
  readonly quantityWithinTenPercent: number;
}

export function summarizeOrderBook(levels: readonly MarketPriceLevel[]): OrderBookSummary {
  if (levels.length === 0) throw new RangeError("An order book summary needs at least one level");
  const sorted = levels.map(validateLevel).sort(comparePrices);
  const availableQuantity = sorted.reduce((total, level) => total + level.quantity, 0);
  const listingCount = sorted.reduce((total, level) => total + level.listingCount, 0);
  if (!Number.isSafeInteger(availableQuantity) || !Number.isSafeInteger(listingCount)) {
    throw new RangeError("Order book totals exceed JavaScript's safe integer range");
  }

  const minimumPriceCopper = sorted[0]?.unitPriceCopper;
  if (minimumPriceCopper === undefined) throw new RangeError("Order book has no minimum price");

  return {
    minimumPriceCopper,
    weightedTenthPercentilePriceCopper: weightedPercentile(sorted, availableQuantity, 1_000),
    weightedMedianPriceCopper: weightedPercentile(sorted, availableQuantity, 5_000),
    weightedNinetiethPercentilePriceCopper: weightedPercentile(sorted, availableQuantity, 9_000),
    availableQuantity,
    listingCount,
    quantityWithinFivePercent: quantityAtOrBelow(sorted, minimumPriceCopper, 10_500),
    quantityWithinTenPercent: quantityAtOrBelow(sorted, minimumPriceCopper, 11_000),
  };
}

function weightedPercentile(
  levels: readonly MarketPriceLevel[],
  totalQuantity: number,
  percentileBasisPoints: number,
): bigint {
  const targetQuantity = Math.max(1, Math.ceil((totalQuantity * percentileBasisPoints) / 10_000));
  let observedQuantity = 0;
  for (const level of levels) {
    observedQuantity += level.quantity;
    if (observedQuantity >= targetQuantity) return level.unitPriceCopper;
  }
  throw new Error("Weighted percentile could not be resolved");
}

function quantityAtOrBelow(
  levels: readonly MarketPriceLevel[],
  minimumPriceCopper: bigint,
  thresholdBasisPoints: number,
): number {
  const scaledMinimum = minimumPriceCopper * BigInt(thresholdBasisPoints);
  return levels.reduce(
    (quantity, level) =>
      level.unitPriceCopper * 10_000n <= scaledMinimum ? quantity + level.quantity : quantity,
    0,
  );
}

function validateLevel(level: MarketPriceLevel): MarketPriceLevel {
  if (level.unitPriceCopper <= 0n) throw new RangeError("Market prices must be positive");
  if (!Number.isSafeInteger(level.quantity) || level.quantity <= 0) {
    throw new RangeError("Market quantity must be a positive safe integer");
  }
  if (!Number.isSafeInteger(level.listingCount) || level.listingCount <= 0) {
    throw new RangeError("Listing count must be a positive safe integer");
  }
  return { ...level };
}

function comparePrices(left: MarketPriceLevel, right: MarketPriceLevel): number {
  if (left.unitPriceCopper < right.unitPriceCopper) return -1;
  if (left.unitPriceCopper > right.unitPriceCopper) return 1;
  return 0;
}
