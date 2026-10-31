import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultCompanionService } from "./service.js";
const directories: string[] = [];
const changeId = "440532b2-b976-45df-8cb3-ddfa7a00e81a";
const credential = "wtc_" + "a".repeat(43);
const saved = `WOW_TRADER_SAVED = { schemaVersion=1, installationId="test-installation-account", scans={}, watchChanges={
  { changeId="${changeId}", action="watch", item={product="wow_classic_beta",market="EU|Realm|alliance",itemId=1,name="Ore"} }
} }`;
afterEach(async (): Promise<void> => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function setup(): Promise<{ root: string; statePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "trader-private-service-"));
  directories.push(root);
  const file = path.join(root, "WTF/Account/100#1/SavedVariables/WowTraderCollector.lua");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, saved);
  return { root, statePath: path.join(root, "state.json") };
}
function response(): Response {
  return Response.json({
    tradesAccepted: 0,
    watchChangesAccepted: [changeId],
    watches: [],
    generatedAt: new Date().toISOString(),
  });
}
describe("private account reconciliation", () => {
  it("persists acknowledgements across restart, without replaying watch changes", async () => {
    const { root, statePath } = await setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      endpoint: new URL("https://kfcguild.online"),
      statePath,
      products: [
        {
          id: "forever",
          kind: "forever" as const,
          label: "Forever",
          rootPath: root,
          enabled: true,
        },
      ],
      apiKey: credential,
      automaticUploads: false,
    };
    for (let index = 0; index < 2; index++) {
      const service = new DefaultCompanionService(options);
      await service.start();
      await service.checkNow();
      await service.stop();
    }
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).watchChanges).toHaveLength(1);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).watchChanges).toHaveLength(0);
    expect(
      await readFile(
        path.join(root, "Interface/AddOns/WowTraderCollector/AccountData.lua"),
        "utf8",
      ),
    ).toContain(changeId);
  });
  it("keeps private sync failures visible and allows a manual retry", async () => {
    const { root, statePath } = await setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const service = new DefaultCompanionService({
      endpoint: new URL("https://kfcguild.online"),
      statePath,
      products: [
        { id: "forever", kind: "forever", label: "Forever", rootPath: root, enabled: true },
      ],
      apiKey: credential,
      automaticUploads: false,
    });
    await service.start();
    expect((await service.checkNow()).phase).toBe("error");
    expect((await service.checkNow()).phase).toBe("up_to_date");
    await service.setCredential(null);
    expect(
      await readFile(
        path.join(root, "Interface/AddOns/WowTraderCollector/AccountData.lua"),
        "utf8",
      ),
    ).toContain("connected=false");
    await service.stop();
  });
  it("refreshes private preferences on unchanged files without reuploading market data", async () => {
    vi.useFakeTimers();
    const { root, statePath } = await setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const service = new DefaultCompanionService({
      endpoint: new URL("https://kfcguild.online"),
      statePath,
      products: [
        { id: "forever", kind: "forever", label: "Forever", rootPath: root, enabled: true },
      ],
      apiKey: credential,
      automaticUploads: true,
      pollIntervalMilliseconds: 500,
    });
    await service.start();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(61000);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.every((call) => String(call[0]).endsWith("/api/trader/sync"))).toBe(
      true,
    );
    await service.stop();
  });
});
