import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  ["worldDiagnostics"] = {
    ["schemaVersion"] = 4,
    ["addonVersion"] = "0.5.0",
    ["clientProduct"] = "wow_classic_beta",
    ["clientBuild"] = 69893,
    ["locale"] = "enUS",
    ["region"] = "EU",
    ["encounterAttempts"] = {},
    ["encounterLoot"] = {},
    ["npcSightings"] = {},
    ["lootObservations"] = {},
    ["healthObservations"] = {},
    ["modelResolutions"] = {
      [1] = {
        ["resolutionID"] = "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
        ["capturedAt"] = 1789671600,
        ["clientBuild"] = 69893,
        ["creatureID"] = 249790,
        ["creatureName"] = "Bandalar",
        ["attempt"] = 1,
        ["status"] = "resolved",
        ["displayID"] = 12345,
        ["modelFileID"] = 987654,
        ["evidence"] = "player_model_set_creature",
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
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/market-intelligence") {
        return Response.json(marketPack());
      }
      const body = JSON.parse(String(init?.body)) as { payloadId: string };
      return Response.json(
        { payloadId: body.payloadId, status: "processed", duplicate: false },
        { status: 202 },
      );
    });
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(phases).toContain("checking");
    expect(phases).toContain("scan_detected");
    expect(phases).toContain("uploading");
    await expect(readCompanionState(statePath)).resolves.toMatchObject({
      uploadedScanIds: [SCAN_ID],
      uploadedDiagnosticPayloadIds: [expect.any(String)],
      activities: [{ scanId: SCAN_ID, status: "processed" }],
    });
    await expect(
      readFile(path.join(rootPath, "Interface/AddOns/WowTraderCollector/MarketData.lua"), "utf8"),
    ).resolves.toContain("robust-market-signal-v1");
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

  it("keeps an upload error visible while its automatic retry is deferred", async () => {
    vi.useFakeTimers();
    try {
      const rootPath = await temporaryProductRoot();
      const savedVariablesPath = path.join(
        rootPath,
        "WTF/Account/100#1/SavedVariables/WowTraderCollector.lua",
      );
      await mkdir(path.dirname(savedVariablesPath), { recursive: true });
      await writeFile(savedVariablesPath, SAVED_VARIABLES, "utf8");
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          Response.json(
            {
              error: "internal_error",
              message: "The request could not be completed",
              requestId: "request-1",
            },
            { status: 500 },
          ),
        ),
      );

      const service = new DefaultCompanionService({
        endpoint: new URL("https://helper.example.test"),
        statePath: path.join(rootPath, "state.json"),
        products: [{ id: "tbc", kind: "tbc", label: "TBC", rootPath, enabled: true }],
        automaticUploads: true,
        apiKey: "test-key-with-enough-entropy",
        pollIntervalMilliseconds: 500,
      });
      await service.start();
      await expect(service.checkNow()).resolves.toMatchObject({
        phase: "error",
        errorCode: "companion_error",
      });

      await vi.advanceTimersByTimeAsync(500);

      expect(service.getSnapshot()).toMatchObject({
        phase: "error",
        errorCode: "companion_error",
      });
      await service.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

async function temporaryProductRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-core-service-"));
  temporaryDirectories.push(directory);
  return directory;
}

function marketPack() {
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
        itemId: 12808,
        name: "Essence of Undeath",
        signal: "collecting",
        observationCount: 1,
        minimumObservationCount: 6,
        currentPriceCopper: null,
        normalPriceCopper: null,
        lowerPriceCopper: null,
        upperPriceCopper: null,
        differenceBasisPoints: null,
        currentQuantity: null,
        normalQuantity: null,
        supplyRatioBasisPoints: null,
        currentListingCount: null,
        confidenceBasisPoints: null,
        direction: null,
      },
    ],
  };
}
