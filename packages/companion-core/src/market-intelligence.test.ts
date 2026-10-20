import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketIntelligencePack } from "@wow-trader/contracts";

import type { CollectorScan } from "./collector-schema.js";
import {
  downloadMarketIntelligence,
  installMarketIntelligence,
  serializeMarketIntelligence,
} from "./market-intelligence.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("market intelligence addon data", () => {
  it("escapes names and preserves copper values as exact strings", () => {
    const output = serializeMarketIntelligence(pack('Pattern: "Moon"\\Star'));
    expect(output).toContain('name = "Pattern: \\"Moon\\"\\\\Star"');
    expect(output).toContain('current = "9007199254740993"');
    expect(output).toContain('signal = "spike_risk"');
  });

  it("installs the generated file inside the collector addon", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wow-trader-market-pack-"));
    temporaryDirectories.push(root);
    const installed = await installMarketIntelligence(root, pack("Arcane Crystal"));
    expect(installed).toBe(
      path.join(root, "Interface", "AddOns", "WowTraderCollector", "MarketData.lua"),
    );
    await expect(readFile(installed, "utf8")).resolves.toContain("WOW_TRADER_MARKET_DATA");
  });

  it("treats an exact-market 404 as optional unavailable data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: "not_found",
            message: "No market intelligence exists for this exact market",
          },
          { status: 404 },
        ),
      ),
    );

    await expect(
      downloadMarketIntelligence(new URL("https://helper.example.test"), "test-key", scan()),
    ).resolves.toBeNull();
  });

  it("still rejects non-404 market API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: "internal_error", message: "Try again" }, { status: 500 }),
        ),
    );

    await expect(
      downloadMarketIntelligence(new URL("https://helper.example.test"), "test-key", scan()),
    ).rejects.toThrow("Market intelligence download failed: Try again");
  });

  it("does not hide a missing route as optional market availability", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: "Not Found", message: "Route GET:/v1/market-intelligence not found" },
            { status: 404 },
          ),
        ),
    );

    await expect(
      downloadMarketIntelligence(new URL("https://helper.example.test"), "test-key", scan()),
    ).rejects.toThrow("Route GET:/v1/market-intelligence not found");
  });
});

function scan(): CollectorScan {
  return {
    scanId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
    addonVersion: "0.12.0",
    clientProduct: "wow_classic_beta",
    clientBuild: 70450,
    locale: "enUS",
    region: "EU",
    realmId: "ClassicBetaPvP",
    auctionHouseType: "horde",
    capturedAt: 1_792_309_600,
    completedAt: 1_792_309_610,
    completeness: 1,
    itemSnapshots: [],
  };
}

function pack(name: string): MarketIntelligencePack {
  return {
    schemaVersion: "market-intelligence.v1",
    modelVersion: "robust-market-signal-v1",
    clientProduct: "wow_anniversary",
    clientBuild: 69795,
    region: "EU",
    realmId: "Spineshatter",
    auctionHouseType: "horde",
    generatedAt: "2026-09-27T08:00:00.000Z",
    sourceScanAt: "2026-09-27T08:00:00.000Z",
    items: [
      {
        itemId: 123,
        name,
        signal: "spike_risk",
        observationCount: 48,
        minimumObservationCount: 6,
        currentPriceCopper: "9007199254740993",
        normalPriceCopper: "10000",
        lowerPriceCopper: "9000",
        upperPriceCopper: "11000",
        differenceBasisPoints: 2500,
        currentQuantity: 2,
        normalQuantity: 20,
        supplyRatioBasisPoints: 1000,
        currentListingCount: 1,
        confidenceBasisPoints: 8000,
        direction: "up",
      },
    ],
  };
}
