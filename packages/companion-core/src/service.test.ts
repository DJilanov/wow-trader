import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultCompanionService } from "./service.js";
import { readCompanionState } from "./state.js";

const temporaryDirectories: string[] = [];
const SCAN_ID = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8";
const SAVED_VARIABLES = `WOW_TRADER_SAVED = {
  ["schemaVersion"] = 1,
  ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
  ["scans"] = {
    [1] = {
      ["scanId"] = "${SCAN_ID}",
      ["addonVersion"] = "0.2.0",
      ["clientProduct"] = "wow_anniversary",
      ["clientBuild"] = 69795,
      ["locale"] = "enUS",
      ["region"] = "EU",
      ["realmId"] = "Spineshatter",
      ["auctionHouseType"] = "horde",
      ["capturedAt"] = 1789468200,
      ["completedAt"] = 1789468210,
      ["completeness"] = 1,
      ["itemSnapshots"] = {
        [1] = {
          ["itemId"] = 12808,
          ["marketKey"] = "12808",
          ["itemLink"] = "|Hitem:12808|h[Essence of Undeath]|h",
          ["priceLevels"] = {
            [1] = { ["unitPriceCopper"] = 12500, ["quantity"] = 7, ["listingCount"] = 3 },
          },
        },
      },
    },
  },
}`;

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("companion service", () => {
  it("uploads one stable scan, persists it, and does not replay it", async () => {
    const rootPath = await temporaryProductRoot();
    const savedVariablesPath = path.join(
      rootPath,
      "WTF/Account/100#1/SavedVariables/WowTraderCollector.lua",
    );
    await mkdir(path.dirname(savedVariablesPath), { recursive: true });
    await writeFile(savedVariablesPath, SAVED_VARIABLES, "utf8");
    const statePath = path.join(rootPath, "state.json");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { payloadId: SCAN_ID, status: "processed", duplicate: false },
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = new DefaultCompanionService({
      endpoint: new URL("https://helper.example.test"),
      statePath,
      products: [{ id: "tbc", kind: "tbc", label: "TBC", rootPath, enabled: true }],
      automaticUploads: false,
      apiKey: "test-key-with-enough-entropy",
      pollIntervalMilliseconds: 60_000,
    });
    const phases: string[] = [];
    service.subscribe((snapshot) => phases.push(snapshot.phase));
    await service.start();

    await expect(service.checkNow()).resolves.toMatchObject({
      phase: "up_to_date",
      lastProcessedScanId: SCAN_ID,
      pendingScanCount: 0,
    });
    await service.checkNow();
    await service.stop();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(phases).toContain("scan_detected");
    expect(phases).toContain("uploading");
    await expect(readCompanionState(statePath)).resolves.toMatchObject({
      uploadedScanIds: [SCAN_ID],
      activities: [{ scanId: SCAN_ID, status: "processed" }],
    });
  });

  it("requires a credential without touching a discovered scan", async () => {
    const rootPath = await temporaryProductRoot();
    const service = new DefaultCompanionService({
      endpoint: new URL("https://helper.example.test"),
      statePath: path.join(rootPath, "state.json"),
      products: [{ id: "tbc", kind: "tbc", label: "TBC", rootPath, enabled: true }],
      automaticUploads: false,
    });
    await service.start();
    await expect(service.checkNow()).resolves.toMatchObject({
      phase: "setup_required",
      errorCode: null,
    });
    await service.stop();
  });
});

async function temporaryProductRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-core-service-"));
  temporaryDirectories.push(directory);
  return directory;
}
