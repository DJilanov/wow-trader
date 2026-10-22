"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { reportToolUsage } from "../lib/tool-usage";
import {
  MARKET_WATCHLIST_CHANGED,
  MARKET_WATCHLIST_KEY,
  parseMarketWatchlist,
  toggleMarketWatchlist,
  watchedMarketItemHref,
  watchedMarketItemKey,
  type WatchedMarketItem,
} from "../lib/market-watchlist";

function subscribe(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(MARKET_WATCHLIST_CHANGED, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(MARKET_WATCHLIST_CHANGED, notify);
  };
}
function snapshot(): string | null {
  try {
    return localStorage.getItem(MARKET_WATCHLIST_KEY);
  } catch {
    return "storage-unavailable";
  }
}
function serverSnapshot(): null {
  return null;
}

function useMarketWatchlist(): {
  items: readonly WatchedMarketItem[] | null;
  error: string;
  toggle: (item: WatchedMarketItem) => void;
  clear: () => void;
} {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const items = parseMarketWatchlist(raw);
  const [error, setError] = useState("");
  function write(next: readonly WatchedMarketItem[]): void {
    localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(MARKET_WATCHLIST_CHANGED));
    setError("");
  }
  function toggle(item: WatchedMarketItem): void {
    try {
      if (!items)
        throw new Error("The saved watchlist cannot be read. Clear it before adding another item.");
      const wasWatched = items.some(
        (entry) => watchedMarketItemKey(entry) === watchedMarketItemKey(item),
      );
      write(toggleMarketWatchlist(items, item));
      if (!wasWatched)
        reportToolUsage(
          "market_item_watched",
          item.product === "wow_classic_beta" ? "forever" : "tbc",
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Browser storage is unavailable.");
    }
  }
  function clear(): void {
    try {
      write([]);
    } catch {
      setError("Browser storage is unavailable. No watchlist was changed.");
    }
  }
  return { items, error, toggle, clear };
}

export function MarketWatchButton({
  item,
}: {
  readonly item: WatchedMarketItem;
}): React.JSX.Element {
  const { items, error, toggle } = useMarketWatchlist();
  const selected =
    items?.some((entry) => watchedMarketItemKey(entry) === watchedMarketItemKey(item)) ?? false;
  return (
    <div className="market-watch-control">
      <button type="button" aria-pressed={selected} onClick={() => toggle(item)}>
        {selected ? "Unwatch item" : "Watch item"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

export function MarketWatchlist(): React.JSX.Element {
  const { items, error, toggle, clear } = useMarketWatchlist();
  return (
    <details className="market-watchlist">
      <summary>Watched items ({items?.length ?? 0})</summary>
      <p className="muted">
        Saved only in this browser. No automatic alerts or trades. Check each market's scan age
        before using a quote.
      </p>
      {!items ? (
        <p role="alert">
          The saved watchlist is unavailable or invalid. Clear it to start again; blocked browser
          storage must be enabled before saving.
        </p>
      ) : items.length ? (
        <ul>
          {items.map((item) => (
            <li key={watchedMarketItemKey(item)}>
              <div>
                <Link href={watchedMarketItemHref(item)}>{item.name}</Link>
                <small>
                  {item.product === "wow_classic_beta" ? "Forever" : "TBC"} /{" "}
                  {item.market.split("|").join(" / ")}
                </small>
              </div>
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-label={`Remove ${item.name} from ${item.market}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No watched items yet.</p>
      )}
      {!items || items.length > 0 ? (
        <button type="button" onClick={clear}>
          Clear watchlist
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </details>
  );
}
