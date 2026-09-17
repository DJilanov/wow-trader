import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { canonicalJson, type JsonValue } from "@wow-trader/contracts";
import { parse } from "luaparse";
import { describe, expect, it } from "vitest";

import { parseCollectorSavedVariables } from "./saved-variables.js";
import { createAuctionScanUpload } from "./upload.js";

const SAVED_VARIABLES = `WOW_TRADER_SAVED = {
  ["schemaVersion"] = 1,
  ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
  ["scans"] = {
    [1] = {
      ["scanId"] = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
      ["addonVersion"] = "0.1.0",
      ["clientProduct"] = "wow_anniversary",
      ["clientBuild"] = 69795,
      ["locale"] = "enUS",
      ["region"] = "EU",
      ["realmId"] = "Spineshatter",
      ["auctionHouseType"] = "horde",
      ["sourceCharacter"] = {
        ["name"] = "Bankalt",
        ["realmId"] = "Spineshatter",
        ["faction"] = "horde",
        ["guid"] = "Player-1234-ABCDEF",
      },
      ["capturedAt"] = 1789468200,
      ["completedAt"] = 1789468210,
      ["completeness"] = 1,
      ["itemSnapshots"] = {
        [1] = {
          ["itemId"] = 12808,
          ["marketKey"] = "12808",
          ["itemLink"] = "|cffffffff|Hitem:12808::::::::70:::::::|h[Essence of Undeath]|h|r",
          ["priceLevels"] = {
            [1] = { ["unitPriceCopper"] = 12500, ["quantity"] = 7, ["listingCount"] = 3 },
          },
        },
      },
    },
  },
}`;

describe("companion SavedVariables pipeline", () => {
  it("keeps the shipped collector valid for the TBC Lua 5.1 runtime", async () => {
    const collectorPath = new URL("../../addon/WowTraderCollector/Collector.lua", import.meta.url);
    const collector = await readFile(collectorPath, "utf8");

    expect(() => parse(collector, { luaVersion: "5.1" })).not.toThrow();
  });

  it("parses WoW's Lua table without executing it", () => {
    const savedVariables = parseCollectorSavedVariables(SAVED_VARIABLES);

    expect(savedVariables.scans[0]?.itemSnapshots[0]).toMatchObject({
      itemId: 12808,
      marketKey: "12808",
      priceLevels: [{ unitPriceCopper: 12500, quantity: 7, listingCount: 3 }],
    });
  });

  it("creates a valid upload with a canonical data checksum", () => {
    const savedVariables = parseCollectorSavedVariables(SAVED_VARIABLES);
    const scan = savedVariables.scans[0];
    expect(scan).toBeDefined();
    if (!scan) return;

    const upload = createAuctionScanUpload(savedVariables, scan);
    const expectedChecksum = createHash("sha256")
      .update(canonicalJson(upload.data as JsonValue))
      .digest("hex");

    expect(upload.checksum).toBe(expectedChecksum);
    expect(upload.payloadId).toBe(scan.scanId);
    expect(upload.sourceCharacter).toEqual({
      name: "Bankalt",
      realmId: "Spineshatter",
      faction: "horde",
      guid: "Player-1234-ABCDEF",
    });
    expect(upload.data.itemSnapshots[0]?.priceLevels[0]?.unitPriceCopper).toBe("12500");
  });

  it("keeps older scans without character provenance uploadable", () => {
    const savedVariables = parseCollectorSavedVariables(
      SAVED_VARIABLES.replace(
        /\s*\["sourceCharacter"\] = \{[\s\S]*?\n\s*\},\n\s*\["capturedAt"\]/,
        '\n      ["capturedAt"]',
      ),
    );
    const scan = savedVariables.scans[0];
    expect(scan).toBeDefined();
    if (!scan) return;

    expect(createAuctionScanUpload(savedVariables, scan).sourceCharacter).toBeNull();
  });

  it("rejects executable Lua expressions", () => {
    expect(() => parseCollectorSavedVariables("WOW_TRADER_SAVED = os.execute('bad')")).toThrow(
      /Unsupported Lua expression/,
    );
  });
});
