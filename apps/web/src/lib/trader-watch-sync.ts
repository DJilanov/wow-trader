"use client";

import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { traderWatchSchema, type TraderWatch } from "@wow-trader/contracts";
import { withHelperBasePath } from "./site-path";

interface WatchState {
  readonly loaded: boolean;
  readonly connected: boolean;
  readonly busy: boolean;
  readonly items: readonly TraderWatch[];
  readonly fingerprint: string | null;
  readonly error: string;
}
const initial: WatchState = {
  loaded: false,
  connected: false,
  busy: false,
  items: [],
  fingerprint: null,
  error: "",
};
let state = initial,
  pending: Promise<void> | null = null,
  lastLoaded = 0;
let queue = Promise.resolve();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const responseSchema = z.object({
  items: z.array(traderWatchSchema).max(50),
  accountFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
function publish(next: WatchState): void {
  state = next;
  for (const notify of listeners) notify();
}
function enqueue(operation: () => Promise<void>): Promise<void> {
  const task = queue.then(operation);
  queue = task.catch(() => undefined);
  return task;
}
async function load(): Promise<void> {
  const response = await fetch(withHelperBasePath("/api/trader/watches"), { cache: "no-store" });
  if (response.status === 401) {
    publish({ ...initial, loaded: true });
  } else {
    if (!response.ok)
      throw new Error("Account watches could not be refreshed. Retry before changing the list.");
    const parsed = responseSchema.parse(await response.json());
    publish({
      loaded: true,
      connected: true,
      busy: false,
      items: parsed.items,
      fingerprint: parsed.accountFingerprint,
      error: "",
    });
  }
  lastLoaded = Date.now();
}
export async function refreshTraderWatches(force = false): Promise<void> {
  if (pending) return pending;
  if (!force && Date.now() - lastLoaded < 60_000) return;
  pending = enqueue(async (): Promise<void> => {
    try {
      await load();
    } catch {
      publish({
        ...state,
        loaded: true,
        busy: false,
        error: "Watch synchronization is temporarily unavailable. Your saved list is unchanged.",
      });
    }
  }).finally(() => {
    pending = null;
  });
  return pending;
}
async function mutate(action: string, method: string, value: unknown): Promise<void> {
  const fingerprint = state.fingerprint;
  if (!state.connected || !fingerprint)
    throw new Error("Sign in and reload the watchlist before syncing changes.");
  publish({ ...state, busy: true, error: "" });
  return enqueue(async (): Promise<void> => {
    try {
      if (state.fingerprint !== fingerprint)
        throw new Error("Your sign-in changed. Reload the watchlist before editing it.");
      const response = await fetch(withHelperBasePath("/api/trader/" + action), {
        method,
        headers: { "content-type": "application/json", "x-trader-account": fingerprint },
        body: JSON.stringify(value),
      });
      if (!response.ok) {
        await load();
        throw new Error(
          response.status === 409
            ? "The signed-in account or watch limit changed. Review the list and retry."
            : "The watch could not be saved. Please retry.",
        );
      }
      const parsed = responseSchema.parse(await response.json());
      if (parsed.accountFingerprint !== fingerprint)
        throw new Error("The signed-in account changed. Reload this page.");
      publish({
        loaded: true,
        connected: true,
        busy: false,
        items: parsed.items,
        fingerprint,
        error: "",
      });
    } catch (error: unknown) {
      publish({
        ...state,
        busy: false,
        error: error instanceof Error ? error.message : "Watch synchronization failed.",
      });
      throw error;
    }
  });
}
export async function saveSyncedTraderWatch(item: TraderWatch, remove = false): Promise<void> {
  await mutate("watches", remove ? "DELETE" : "POST", traderWatchSchema.parse(item));
}
export async function importSyncedTraderWatches(items: readonly unknown[]): Promise<void> {
  await mutate("watches/import", "POST", z.array(traderWatchSchema).max(50).parse(items));
}
export async function clearSyncedTraderWatches(): Promise<void> {
  await mutate("watches/clear", "POST", {});
}
function focus(): void {
  void refreshTraderWatches();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", focus);
    timer = setInterval(focus, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("focus", focus);
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export function useSyncedTraderWatches(): WatchState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
  useEffect(() => {
    void refreshTraderWatches();
  }, []);
  return current;
}
