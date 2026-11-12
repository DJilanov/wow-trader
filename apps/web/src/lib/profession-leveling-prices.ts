import { validateAuctionLots, type MarketPriceLevel } from "@wow-trader/market";
import type { LevelingItem } from "./profession-leveling-types";

export interface LevelingPurchase {
  readonly cost: bigint;
  readonly quantity: number;
}

const MAX_DEMAND = 20_000;
interface Book {
  readonly lots: readonly {
    readonly stack: number;
    readonly count: number;
    readonly cost: bigint;
  }[];
  readonly largest: number;
  readonly stock: number;
  readonly oversized: LevelingPurchase | null;
  capacity: number;
  quotes: readonly (LevelingPurchase | null)[];
}

export function createLevelingPricer(
  items: readonly LevelingItem[],
): (itemId: number, quantity: number) => LevelingPurchase | null {
  const books = new Map<number, Book>();
  for (const item of items) {
    const lots: { stack: number; count: number; cost: bigint }[] = [];
    let oversized: LevelingPurchase | null = null;
    for (const source of item.levels) {
      const level: MarketPriceLevel = {
        unitPriceCopper: BigInt(source.unitPriceCopper),
        quantity: source.quantity,
        listingCount: source.listingCount,
        ...(source.lots
          ? { lots: source.lots.map((lot) => ({ ...lot, buyoutCopper: BigInt(lot.buyoutCopper) })) }
          : {}),
      };
      if (!validateAuctionLots(level)) continue;
      for (const lot of level.lots ?? []) {
        if (lot.stackSize > MAX_DEMAND) {
          if (!oversized || lot.buyoutCopper < oversized.cost)
            oversized = { quantity: lot.stackSize, cost: lot.buyoutCopper };
        } else lots.push({ stack: lot.stackSize, count: lot.listingCount, cost: lot.buyoutCopper });
      }
    }
    books.set(item.id, {
      lots,
      oversized,
      largest: lots.reduce((max, lot) => Math.max(max, lot.stack), 1),
      stock: lots.reduce((sum, lot) => sum + lot.stack * lot.count, 0),
      capacity: 0,
      quotes: [],
    });
  }
  return (itemId: number, quantity: number): LevelingPurchase | null => {
    if (quantity === 0) return { cost: 0n, quantity: 0 };
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_DEMAND) return null;
    const book = books.get(itemId);
    if (!book || (quantity > book.stock && !book.oversized)) return null;
    if (quantity > book.capacity) {
      const capacity = Math.min(MAX_DEMAND, Math.max(128, quantity, book.capacity * 2));
      buildQuotes(book, capacity);
    }
    const quote = book.quotes[quantity] ?? null;
    return book.oversized && (!quote || book.oversized.cost < quote.cost) ? book.oversized : quote;
  };
}

function buildQuotes(book: Book, capacity: number): void {
  // Any cheapest cover overbuys by less than its largest stack: another stack could otherwise be removed.
  const cap = Math.min(book.stock, capacity + book.largest - 1);
  const costs: (bigint | undefined)[] = Array.from({ length: cap + 1 });
  costs[0] = 0n;
  for (const lot of book.lots) {
    let remaining = Math.min(lot.count, Math.floor(cap / lot.stack));
    for (let chunk = 1; remaining > 0; chunk *= 2) {
      const count = Math.min(chunk, remaining);
      remaining -= count;
      const units = lot.stack * count;
      const cost = lot.cost * BigInt(count);
      for (let quantity = cap; quantity >= units; quantity--) {
        const previous = costs[quantity - units];
        if (previous === undefined) continue;
        const next = previous + cost;
        if (costs[quantity] === undefined || next < costs[quantity]!) costs[quantity] = next;
      }
    }
  }
  const quotes: (LevelingPurchase | null)[] = Array.from({ length: capacity + 1 }, () => null);
  let best: LevelingPurchase | null = null;
  for (let quantity = cap; quantity > 0; quantity--) {
    const cost = costs[quantity];
    if (cost !== undefined && (!best || cost <= best.cost)) best = { quantity, cost };
    if (quantity <= capacity) quotes[quantity] = best;
  }
  book.quotes = quotes;
  book.capacity = capacity;
}
