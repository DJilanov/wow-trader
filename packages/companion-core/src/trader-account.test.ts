import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTraderPreferences,
  installTraderPreferences,
  startCompanionPairing,
  syncTraderAccount,
  traderAccountBase,
  TraderAccountRetryError,
} from "./trader-account.js";
import { compareReleaseVersions, checkCompanionRelease } from "./desktop-release.js";
import { traderWatchSchema } from "@wow-trader/contracts";
const directories: string[] = [];
afterEach(async (): Promise<void> => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
describe("private pairing and preferences", () => {
  it("only uses canonical HTTPS or an explicitly local endpoint", () => {
    expect(traderAccountBase(new URL("http://helper.kfcguild.online:1234/anything")).href).toBe(
      "https://kfcguild.online/tools/api/trader/",
    );
    expect(() => traderAccountBase(new URL("https://attacker.test"))).toThrow();
    expect(() => traderAccountBase(new URL("https://user:pass@kfcguild.online"))).toThrow();
  });
  it("rejects verification URLs from another origin before opening a browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            deviceCode: "a".repeat(43),
            userCode: "ABCD-2345",
            verificationUri: "https://attacker.test/tools/forever/trader/account?code=ABCD-2345",
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            intervalSeconds: 5,
          }),
        ),
    );
    await expect(startCompanionPairing(new URL("https://kfcguild.online"), "Test")).rejects.toThrow(
      "untrusted",
    );
  });
  it("returns retryable rate limiting without exposing the credential in the URL", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "999" } }));
    vi.stubGlobal("fetch", fetchMock);
    const secret = "wtc_" + "a".repeat(43);
    await expect(
      syncTraderAccount(new URL("https://kfcguild.online"), secret, {
        trades: [],
        watchChanges: [],
      }),
    ).rejects.toMatchObject({ name: "TraderAccountRetryError", retryAfterMilliseconds: 30000 });
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain(secret);
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      authorization: `Bearer ${secret}`,
    });
    expect(new TraderAccountRetryError(5000).message).not.toContain(secret);
  });
  it("writes escaped addon preferences without credentials and clears them on disconnect", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trader-account-"));
    directories.push(root);
    const watch = traderWatchSchema.parse({
      product: "wow_classic_beta",
      market: "EU|Realm|alliance",
      itemId: 1,
      name: 'Ore "special" \\ test',
      maximumBuyCopper: "6060",
    });
    await installTraderPreferences(root, [watch], ["trade-id"], ["change-id"]);
    const file = path.join(root, "Interface/AddOns/WowTraderCollector/AccountData.lua");
    const value = await readFile(file, "utf8");
    expect(value).toContain('maximumBuyCopper="6060"');
    expect(value).toContain('\\"special\\"');
    expect(value).not.toContain("Bearer");
    expect(value).not.toContain("wtc_");
    await clearTraderPreferences(root);
    expect(await readFile(file, "utf8")).toContain("connected=false");
    expect(await readFile(file, "utf8")).not.toContain("special");
  });
});
describe("manual verified release updates", () => {
  it("compares versions numerically and handles prereleases", () => {
    expect(compareReleaseVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareReleaseVersions("1.0.0", "1.0.0-alpha.1")).toBe(1);
    expect(compareReleaseVersions("1.0.0-alpha.10", "1.0.0-alpha.2")).toBe(1);
    expect(compareReleaseVersions("1.0.0", "1.0.0")).toBe(0);
    expect(() => compareReleaseVersions("latest", "1.0.0")).toThrow();
  });
  it("selects the matching architecture using a trusted immutable asset URL", async () => {
    const manifest = {
      schemaVersion: 1,
      version: "0.3.7",
      channel: "maintainer-alpha",
      publishedAt: new Date().toISOString(),
      collectorVersion: "0.14.0",
      supportedProducts: ["wow_classic_beta"],
      notes: [],
      assets: [
        {
          id: "macos-arm64-v0-3-7",
          label: "Apple Silicon",
          platform: "macos",
          architecture: "arm64",
          filename: "Companion.dmg",
          contentType: "application/x-apple-diskimage",
          byteSize: 100,
          sha256: "a".repeat(64),
          signed: false,
          recommended: true,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json(manifest)),
    );
    await expect(
      checkCompanionRelease(new URL("https://helper.kfcguild.online"), "0.3.6", "darwin", "arm64"),
    ).resolves.toMatchObject({
      available: true,
      signed: false,
      downloadUrl: "https://kfcguild.online/tools/downloads/companion/macos-arm64-v0-3-7",
      sha256: "a".repeat(64),
    });
    await expect(
      checkCompanionRelease(new URL("https://helper.kfcguild.online"), "0.3.6", "win32", "x64"),
    ).resolves.toMatchObject({ downloadUrl: null });
  });
});
