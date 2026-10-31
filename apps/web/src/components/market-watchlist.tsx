"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { traderWatchSchema } from "@wow-trader/contracts";
import {
  clearSyncedTraderWatches,
  importSyncedTraderWatches,
  saveSyncedTraderWatch,
  useSyncedTraderWatches,
} from "../lib/trader-watch-sync";
import { withHelperBasePath } from "../lib/site-path";
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
  connected: boolean;
  busy: boolean;
  localItems: readonly WatchedMarketItem[];
  importLocal: () => void;
} {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const synced = useSyncedTraderWatches();
  const localItems = parseMarketWatchlist(raw);
  const items = synced.connected ? synced.items : localItems;
  const [error, setError] = useState("");
  function write(next: readonly WatchedMarketItem[]): void {
    localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(MARKET_WATCHLIST_CHANGED));
    setError("");
  }
  function toggle(item: WatchedMarketItem): void {
    if (synced.connected) {
      const existing = items?.find(
        (entry) => watchedMarketItemKey(entry) === watchedMarketItemKey(item),
      );
      void saveSyncedTraderWatch(
        traderWatchSchema.parse(existing ?? item),
        Boolean(existing),
      ).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "The watch could not be saved."),
      );
      return;
    }
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
    if (synced.connected) {
      void clearSyncedTraderWatches().catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Some watches could not be removed."),
      );
      return;
    }
    try {
      write([]);
    } catch {
      setError("Browser storage is unavailable. No watchlist was changed.");
    }
  }
  function importLocal(): void {
    void importSyncedTraderWatches(localItems ?? []).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Browser watches could not be imported."),
    );
  }
  return {
    items,
    error: error || synced.error,
    toggle,
    clear,
    busy: synced.busy || !synced.loaded,
    connected: synced.connected,
    localItems: localItems ?? [],
    importLocal,
  };
}

export function MarketWatchButton({
  item,
}: {
  readonly item: WatchedMarketItem;
}): React.JSX.Element {
  const { items, error, toggle, busy } = useMarketWatchlist();
  const selected =
    items?.some((entry) => watchedMarketItemKey(entry) === watchedMarketItemKey(item)) ?? false;
  return (
    <div className="market-watch-control">
      <button type="button" disabled={busy} aria-pressed={selected} onClick={() => toggle(item)}>
        {selected ? "Unwatch item" : "Watch item"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

export function MarketWatchlist(): React.JSX.Element {
  const { items, error, toggle, clear, connected, localItems, importLocal, busy } =
    useMarketWatchlist();
  return (
    <details className="market-watchlist">
      <summary>Watched items ({items?.length ?? 0})</summary>
      <p className="muted">
        {connected
          ? "Synced privately with your account. Companion loads your targets into the addon after synchronization and /reload."
          : "Saved in this browser. Sign in to synchronize watches with Companion and the addon."}{" "}
        Check scan age before using a quote. No trades are automated.
      </p>
      {!connected ? (
        <Link href={withHelperBasePath("/forever/trader/account")}>
          Connect your Trader account →
        </Link>
      ) : (
        <>
          <Link href={withHelperBasePath("/forever/trader/account")}>
            Edit buy limits and alert settings →
          </Link>
          {localItems.length ? (
            <button type="button" disabled={busy} onClick={importLocal}>
              Import {localItems.length} browser watches
            </button>
          ) : null}
        </>
      )}
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
                disabled={busy}
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
        <button type="button" disabled={busy} onClick={clear}>
          Clear watchlist
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </details>
  );
}
