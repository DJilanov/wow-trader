import { afterEach, describe, expect, it, vi } from "vitest";
import { traderWatchSchema } from "@wow-trader/contracts";
const item = traderWatchSchema.parse({
  product: "wow_classic_beta",
  market: "EU|Realm|alliance",
  itemId: 1,
  name: "Ore",
});
const fingerprint = "a".repeat(64);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("account watch synchronization", () => {
  it("deduplicates parallel list loads and clears the list with one atomic operation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) =>
        Response.json({ items: init?.method ? [] : [item], accountFingerprint: fingerprint }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const store = await import("./trader-watch-sync");
    await Promise.all([store.refreshTraderWatches(true), store.refreshTraderWatches(true)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await store.clearSyncedTraderWatches();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toBe("/tools/api/trader/watches/clear");
    expect(fetchMock.mock.calls[1]![1]?.headers).toMatchObject({ "x-trader-account": fingerprint });
  });
  it("serializes mutations so slower responses cannot restore removed items", async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        order.push("save");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      if (init?.method === "DELETE") order.push("remove");
      return Response.json({
        items: init?.method === "DELETE" ? [] : [item],
        accountFingerprint: fingerprint,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = await import("./trader-watch-sync");
    await store.refreshTraderWatches(true);
    const save = store.saveSyncedTraderWatch(item),
      remove = store.saveSyncedTraderWatch(item, true);
    await vi.waitFor(() => expect(order).toEqual(["save"]));
    release?.();
    await Promise.all([save, remove]);
    expect(order).toEqual(["save", "remove"]);
  });
  it("refreshes after account mismatch and never replays the change into the other account", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], accountFingerprint: fingerprint }))
      .mockResolvedValueOnce(Response.json({ error: "account_changed" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ items: [], accountFingerprint: "b".repeat(64) }));
    vi.stubGlobal("fetch", fetchMock);
    const store = await import("./trader-watch-sync");
    await store.refreshTraderWatches(true);
    await expect(store.saveSyncedTraderWatch(item)).rejects.toThrow("signed-in account");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
