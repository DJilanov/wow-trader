import type { AuctionLot, MarketPriceLevel } from "./order-book-summary.js";

export interface SelectedAuctionLot extends AuctionLot {
  readonly listingCount: number;
}

export interface AuctionLotSelection {
  readonly quantity: number;
  readonly costCopper: bigint;
  readonly lots: readonly SelectedAuctionLot[];
}

export function validateAuctionLots(level: MarketPriceLevel): boolean {
  if (!level.lots?.length) return false;
  let quantity = 0;
  let listings = 0;
  for (const lot of level.lots) {
    if (
      !Number.isSafeInteger(lot.stackSize) ||
      lot.stackSize < 1 ||
      !Number.isSafeInteger(lot.listingCount) ||
      lot.listingCount < 1 ||
      lot.buyoutCopper <= 0n ||
      (lot.buyoutCopper + BigInt(lot.stackSize) - 1n) / BigInt(lot.stackSize) !==
        level.unitPriceCopper
    )
      throw new RangeError("Auction lot does not match its price level");
    quantity += lot.stackSize * lot.listingCount;
    listings += lot.listingCount;
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity !== level.quantity ||
    listings !== level.listingCount
  )
    throw new RangeError("Auction lots do not match the level's quantity and listing count");
  return true;
}

export function selectAuctionLots(input: {
  readonly levels: readonly MarketPriceLevel[];
  readonly maximumUnitPriceCopper: bigint;
  readonly maximumQuantity: number;
  readonly maximumSpendCopper?: bigint;
  readonly targetResalePriceCopper: bigint;
  readonly feeBasisPoints: number;
  readonly minimumQuantity?: number;
}): AuctionLotSelection {
  const cap = input.maximumQuantity;
  if (
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > (input.minimumQuantity === undefined ? 100 : 2_000)
  )
    throw new RangeError("Invalid auction lot cap");
  if (
    (input.minimumQuantity !== undefined &&
      (!Number.isInteger(input.minimumQuantity) ||
        input.minimumQuantity < 1 ||
        input.minimumQuantity > cap)) ||
    (input.maximumSpendCopper !== undefined && input.maximumSpendCopper < 0n) ||
    !Number.isInteger(input.feeBasisPoints) ||
    input.feeBasisPoints < 0 ||
    input.feeBasisPoints > 10_000
  )
    throw new RangeError("Invalid auction lot limits");
  const options: (AuctionLotSelection | undefined)[] = Array.from({ length: cap + 1 });
  options[0] = { quantity: 0, costCopper: 0n, lots: [] };
  for (const level of input.levels) {
    if (!validateAuctionLots(level) || level.unitPriceCopper > input.maximumUnitPriceCopper)
      continue;
    for (const lot of level.lots ?? []) {
      let remaining = Math.min(lot.listingCount, Math.floor(cap / lot.stackSize));
      for (let chunk = 1; remaining > 0; chunk *= 2) {
        const count = Math.min(chunk, remaining);
        remaining -= count;
        const units = lot.stackSize * count;
        const cost = lot.buyoutCopper * BigInt(count);
        for (let quantity = cap; quantity >= units; quantity--) {
          const previous = options[quantity - units];
          if (!previous) continue;
          const nextCost = previous.costCopper + cost;
          if (input.maximumSpendCopper !== undefined && nextCost > input.maximumSpendCopper)
            continue;
          if (options[quantity] && options[quantity]!.costCopper <= nextCost) continue;
          options[quantity] = {
            quantity,
            costCopper: nextCost,
            lots: [...previous.lots, { ...lot, listingCount: count }],
          };
        }
      }
    }
  }
  let best = options[0]!;
  let bestProfit = 0n;
  for (const option of options) {
    if (!option || option.quantity === 0) continue;
    if (input.minimumQuantity !== undefined) {
      if (
        option.quantity >= input.minimumQuantity &&
        (best.quantity === 0 || option.costCopper < best.costCopper)
      )
        best = option;
      continue;
    }
    const gross = input.targetResalePriceCopper * BigInt(option.quantity);
    const profit =
      gross - (gross * BigInt(input.feeBasisPoints) + 9_999n) / 10_000n - option.costCopper;
    if (profit > bestProfit || (profit === bestProfit && option.costCopper < best.costCopper)) {
      best = option;
      bestProfit = profit;
    }
  }
  const groups = new Map<string, SelectedAuctionLot>();
  for (const lot of best.lots) {
    const key = `${lot.stackSize}:${lot.buyoutCopper}`;
    groups.set(key, {
      ...lot,
      listingCount: lot.listingCount + (groups.get(key)?.listingCount ?? 0),
    });
  }
  return { ...best, lots: [...groups.values()] };
}

export function costWholeAuctionStacks(
  levels: readonly MarketPriceLevel[],
  quantity: number,
  budget: bigint,
): AuctionLotSelection | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000 || budget < 0n)
    return null;
  const sizes = levels.flatMap((level) => level.lots?.map((lot) => lot.stackSize) ?? []);
  if (sizes.length === 0) return null;
  const largest = sizes.reduce((maximum, size) => Math.max(maximum, size), 1);
  const selected = selectAuctionLots({
    levels,
    maximumQuantity: Math.min(2_000, quantity + largest - 1),
    maximumUnitPriceCopper: 9_223_372_036_854_775_807n,
    maximumSpendCopper: budget,
    minimumQuantity: quantity,
    targetResalePriceCopper: 0n,
    feeBasisPoints: 0,
  });
  return selected.quantity >= quantity ? selected : null;
}
