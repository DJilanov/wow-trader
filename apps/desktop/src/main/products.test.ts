import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createProductConfiguration,
  defaultProductCandidates,
  inspectProduct,
  installCollector,
} from "./products.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("collector addon installation", () => {
  it("installs the verified packaged addon atomically", async () => {
    const rootPath = await temporaryDirectory();
    const product = createProductConfiguration("forever", rootPath);
    const sourceDirectory = path.resolve(import.meta.dirname, "../../../addon/WowTraderCollector");
    const collectorSource = await readFile(path.join(sourceDirectory, "Collector.lua"), "utf8");
    const uiSource = await readFile(path.join(sourceDirectory, "UI.lua"), "utf8");
    const tocSource = await readFile(path.join(sourceDirectory, "WowTraderCollector.toc"), "utf8");

    expect(collectorSource).toContain('marketFrame:RegisterEvent("ADDON_LOADED")');
    expect(collectorSource).toContain("C_AuctionHouse.ReplicateItems");
    expect(collectorSource).toContain('marketFrame:RegisterEvent("REPLICATE_ITEM_LIST_UPDATE")');
    expect(collectorSource).toContain("Auctionator.FullScan.Events.ScanComplete");
    expect(collectorSource).toContain(
      "world diagnostics are not included in this market-only collector",
    );
    expect(collectorSource).not.toContain('RegisterEvent("QUEST_');
    expect(collectorSource).not.toContain('RegisterEvent("NAME_PLATE_UNIT_ADDED")');
    expect(collectorSource).not.toContain("UnitHealth");
    expect(collectorSource).not.toContain("WOW_TRADER_FOREVER");
    expect(uiSource).toContain('CreateFrame("Frame", "WoWTraderScannerFrame", UIParent)');
    expect(uiSource).toContain('CreateFrame("Button", "LibDBIcon10_WowTraderCollector", Minimap)');
    expect(uiSource).toContain("function Addon.ShowMinimapButton()");
    expect(uiSource).toContain('"Start scan"');
    expect(uiSource).toContain('"Save & Reload"');
    expect(uiSource).toContain('"Recent saved scans"');
    expect(tocSource).toContain("MarketData.lua\nCollector.lua\nUI.lua");

    await installCollector(product, sourceDirectory);

    const installedToc = path.join(
      rootPath,
      "Interface/AddOns/WowTraderCollector/WowTraderCollector.toc",
    );
    expect(await readFile(installedToc, "utf8")).toContain("## Version: 0.10.0");
    const installedFiles = await readdir(
      path.join(rootPath, "Interface/AddOns/WowTraderCollector"),
    );
    expect(installedFiles.sort()).toEqual([
      "Collector.lua",
      "MarketData.lua",
      "UI.lua",
      "WowTraderCollector.toc",
    ]);
    const installedMarketData = path.join(
      rootPath,
      "Interface/AddOns/WowTraderCollector/MarketData.lua",
    );
    await writeFile(
      installedMarketData,
      "WOW_TRADER_MARKET_DATA = { schemaVersion = 1 }\n",
      "utf8",
    );
    await installCollector(product, sourceDirectory);
    await expect(readFile(installedMarketData, "utf8")).resolves.toContain("schemaVersion = 1");
    await expect(inspectProduct(product)).resolves.toMatchObject({
      collectorHealth: "ready",
      collectorVersion: "0.10.0",
      collectorFileCount: 0,
      scannerProvider: "native",
      scannerReady: true,
      auctionatorInstalled: false,
    });
  });

  it("refuses a collector whose packaged checksum is not trusted", async () => {
    const rootPath = await temporaryDirectory();
    const sourceDirectory = await temporaryDirectory();
    await writeFile(path.join(sourceDirectory, "Collector.lua"), "modified", "utf8");
    await writeFile(path.join(sourceDirectory, "WowTraderCollector.toc"), "modified", "utf8");

    await expect(
      installCollector(createProductConfiguration("tbc", rootPath), sourceDirectory),
    ).rejects.toThrow("failed verification");
  });
});

describe("default WoW product discovery", () => {
  it("uses the Windows installation root", () => {
    const products = defaultProductCandidates({
      platform: "win32",
      environment: { "ProgramFiles(x86)": "D:\\Games" },
    });

    expect(products.map((product) => product.rootPath)).toEqual([
      path.resolve("D:\\Games", "World of Warcraft", "_anniversary_"),
      path.resolve("D:\\Games", "World of Warcraft", "_forever_"),
      path.resolve("D:\\Games", "World of Warcraft", "_classic_beta_"),
    ]);
  });

  it("checks explicit and common Wine prefixes on Linux", () => {
    const products = defaultProductCandidates({
      platform: "linux",
      homeDirectory: "/home/tester",
      environment: { WINEPREFIX: "/games/custom-prefix" },
    });

    expect(products).toHaveLength(12);
    expect(products[0]?.rootPath).toBe(
      "/games/custom-prefix/drive_c/Program Files (x86)/World of Warcraft/_anniversary_",
    );
    expect(products.some((product) => product.rootPath.startsWith("/home/tester/.wine"))).toBe(
      true,
    );
    expect(
      products.some((product) => product.rootPath.startsWith("/home/tester/Games/battlenet")),
    ).toBe(true);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-desktop-"));
  temporaryDirectories.push(directory);
  return directory;
}
