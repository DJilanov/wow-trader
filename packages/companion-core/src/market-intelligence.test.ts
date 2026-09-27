import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { MarketIntelligencePack } from "@wow-trader/contracts";

import { installMarketIntelligence, serializeMarketIntelligence } from "./market-intelligence.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
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
});

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
