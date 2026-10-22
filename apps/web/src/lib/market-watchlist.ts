import { z } from "zod";
import { withHelperBasePath } from "./site-path";

export const MARKET_WATCHLIST_KEY = "wow-trader-market-watchlist-v1";
export const MARKET_WATCHLIST_CHANGED = "wow-trader-market-watchlist-changed";
const watchedItemSchema = z
  .object({
    product: z.enum(["wow_classic_beta", "wow_anniversary"]),
    market: z
      .string()
      .max(200)
      .regex(/^[A-Z]{2,10}\|[A-Za-z0-9 _.'-]{1,120}\|(alliance|horde|neutral|region|unknown)$/),
    itemId: z.number().int().positive().max(100000000),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(
        (value) =>
          [...value].every(
            (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        "Control characters are not allowed.",
      ),
  })
  .strict();

export type WatchedMarketItem = z.infer<typeof watchedItemSchema>;

export function parseMarketWatchlist(raw: string | null): readonly WatchedMarketItem[] | null {
  if (raw === null) return [];
  if (raw.length > 40000) return null;
  try {
    const parsed = z.array(watchedItemSchema).max(50).safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const seen = new Set<string>();
    return parsed.data.filter((item) => {
      const key = watchedMarketItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return null;
  }
}

export function watchedMarketItemKey(item: WatchedMarketItem): string {
  return `${item.product}:${item.market}:${item.itemId}`;
}

export function toggleMarketWatchlist(
  items: readonly WatchedMarketItem[],
  item: WatchedMarketItem,
): readonly WatchedMarketItem[] {
  const validated = watchedItemSchema.parse(item);
  const key = watchedMarketItemKey(validated);
  if (items.some((entry) => watchedMarketItemKey(entry) === key))
    return items.filter((entry) => watchedMarketItemKey(entry) !== key);
  if (items.length >= 50)
    throw new Error("The watchlist holds up to 50 items. Remove an item first.");
  return [...items, validated];
}

export function watchedMarketItemHref(item: WatchedMarketItem): string {
  return `${withHelperBasePath(`/${item.product === "wow_classic_beta" ? "forever" : "tbc"}/trader`)}?${new URLSearchParams({ mode: "items", market: item.market, q: String(item.itemId) })}`;
}
