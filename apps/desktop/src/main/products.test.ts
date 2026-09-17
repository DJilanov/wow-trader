import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createProductConfiguration, inspectProduct, installCollector } from "./products.js";

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
    const product = createProductConfiguration("tbc", rootPath);
    const sourceDirectory = path.resolve(import.meta.dirname, "../../../addon/WowTraderCollector");

    await installCollector(product, sourceDirectory);

    const installedToc = path.join(
      rootPath,
      "Interface/AddOns/WowTraderCollector/WowTraderCollector.toc",
    );
    expect(await readFile(installedToc, "utf8")).toContain("## Version: 0.4.0");
    await expect(
      readFile(
        path.join(rootPath, "Interface/AddOns/WowTraderCollector/ForeverQuestSample.lua"),
        "utf8",
      ),
    ).resolves.toContain("WOW_TRADER_FOREVER_QUEST_SAMPLE_BUILD");
    await expect(
      readFile(
        path.join(rootPath, "Interface/AddOns/WowTraderCollector/ForeverBossSample.lua"),
        "utf8",
      ),
    ).resolves.toContain("WOW_TRADER_FOREVER_BOSS_SAMPLE_BUILD");
    await expect(inspectProduct(product)).resolves.toMatchObject({
      collectorHealth: "ready",
      collectorVersion: "0.4.0",
      collectorFileCount: 0,
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

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-desktop-"));
  temporaryDirectories.push(directory);
  return directory;
}
