import { describe, expect, it } from "vitest";

import {
  collectorSavedVariablesSchema,
  collectorScanSchema,
  type CollectorScan,
} from "./collector-schema.js";
import { createAuctionScanUpload } from "./upload.js";

const diagnostics = {
  queuedItems: 1,
  pendingItems: 0,
  requestedItems: 1,
  requestErrors: 0,
  cachedBeforeRequest: 0,
  initialDeferredRows: 1,
  requestAttempts: 3,
  retryRequests: 2,
  loadedItems: 0,
  exhaustedItems: 1,
  inFlightItems: 0,
  loadSuccessEvents: 0,
  loadFailureEvents: 1,
  timedOutRequests: 2,
  finalCheckedRows: 1,
  finalRecoveredRows: 0,
  finalUninspectedRows: 0,
  finalPassTimedOut: false,
  readyCheckedRows: 10,
  readyRecoveredRows: 8,
  unresolvedSamples: [
    {
      rowIndex: 0,
      itemId: 2865,
      hasAllInfo: false,
      itemDataCached: false,
      loadAttempts: 3,
      lastLoadSucceeded: false,
      countReadable: true,
      buyoutReadable: true,
    },
  ],
};

function scan(): CollectorScan {
  return collectorScanSchema.parse({
    scanId: "7a3269c6-416f-4b88-9dde-a58dc7d9d332",
    addonVersion: "0.15.3",
    clientProduct: "wow_classic_beta",
    clientBuild: 70862,
    locale: "enUS",
    region: "EU",
    realmId: "TestRealm",
    auctionHouseType: "alliance",
    capturedAt: 1794284558,
    completedAt: 1794284640,
    provider: "blizzard_replicate",
    apiFlavor: "c_auction_house_replicate",
    marketKeyVersion: 1,
    completeness: 0.5,
    reportedRowCount: 2,
    visitedRowCount: 2,
    pricedRowCount: 1,
    noBuyoutRowCount: 0,
    unresolvedRowCount: 1,
    invalidRowCount: 0,
    secretRowCount: 0,
    scanDurationMs: 82000,
    auctionHouseStayedOpen: true,
    itemSnapshots: [
      {
        itemId: 25,
        marketKey: "25",
        priceLevels: [{ unitPriceCopper: 100, quantity: 1, listingCount: 1 }],
      },
    ],
    cacheDiagnostics: diagnostics,
  });
}

describe("local native scan diagnostics", () => {
  it("retains bounded failure evidence without requiring diagnostics in older scans", () => {
    const current = scan();
    expect(current.cacheDiagnostics).toEqual(diagnostics);
    const { cacheDiagnostics: _diagnostics, ...old } = current;
    expect(collectorScanSchema.parse(old).cacheDiagnostics).toBeUndefined();
    expect(() =>
      collectorScanSchema.parse({
        ...current,
        cacheDiagnostics: {
          ...diagnostics,
          unresolvedSamples: Array.from({ length: 21 }, () => diagnostics.unresolvedSamples[0]),
        },
      }),
    ).toThrow();
    expect(() =>
      collectorScanSchema.parse({
        ...current,
        cacheDiagnostics: {
          ...diagnostics,
          unresolvedSamples: [{ ...diagnostics.unresolvedSamples[0], rowIndex: -1 }],
        },
      }),
    ).toThrow();
  });

  it("accepts the prior diagnostics and bounds retry evidence", () => {
    const current = scan();
    const prior = {
      queuedItems: 1,
      pendingItems: 0,
      requestedItems: 1,
      requestErrors: 0,
      cachedBeforeRequest: 0,
      initialDeferredRows: 1,
      unresolvedSamples: [],
    };
    expect(
      collectorScanSchema.parse({ ...current, cacheDiagnostics: prior }).cacheDiagnostics,
    ).toEqual(prior);
    for (const invalid of [
      { retryRequests: -1 },
      { inFlightItems: 257 },
      { finalCheckedRows: -1 },
      { readyCheckedRows: -1 },
      { finalRecoveredRows: 1_000_001 },
      { unresolvedSamples: [{ ...diagnostics.unresolvedSamples[0], loadAttempts: 4 }] },
    ]) {
      expect(() =>
        collectorScanSchema.parse({
          ...current,
          cacheDiagnostics: { ...diagnostics, ...invalid },
        }),
      ).toThrow();
    }
  });

  it("keeps diagnostics local and leaves the public upload and checksum unchanged", () => {
    const current = scan();
    const { cacheDiagnostics: _diagnostics, ...without } = current;
    const saved = {
      schemaVersion: 1 as const,
      installationId: "67af914b-851d-44a0-b4ba-bb01458b7cbf",
      scans: [current],
      professionSnapshots: [],
      tradeEvents: [],
      watchChanges: [],
    };
    const upload = createAuctionScanUpload(saved, current);
    expect(upload).toEqual(createAuctionScanUpload(saved, without));
    expect(upload).not.toHaveProperty("cacheDiagnostics");
    expect(upload.data).not.toHaveProperty("cacheDiagnostics");
  });
});

describe("native request failure diagnostics", () => {
  const current = scan();
  const saved = {
    schemaVersion: 1 as const,
    installationId: "67af914b-851d-44a0-b4ba-bb01458b7cbf",
    scans: [current],
  };
  const failure = {
    failedAt: 1794461440,
    code: "request_timeout" as const,
    reason: "No auction list arrived within 120 seconds.",
    stage: "awaiting_response" as const,
    addonVersion: "0.15.5",
    clientBuild: 70888,
    requestIssuedAt: 1794461320,
    responseTimeoutSeconds: 120,
    durationMs: 120000,
    reportedRowCount: 0,
    visitedRowCount: 0,
  };

  it("retains the latest local failure without requiring it from older collectors", () => {
    const state = { lastRequestedAt: failure.requestIssuedAt, lastFailure: failure };
    expect(
      collectorSavedVariablesSchema.parse({ ...saved, nativeScanner: state }).nativeScanner,
    ).toEqual(state);
    expect(collectorSavedVariablesSchema.parse(saved).nativeScanner).toBeUndefined();
    expect(
      collectorSavedVariablesSchema.parse({
        ...saved,
        nativeScanner: { ...state, lastFailure: { ...failure, stage: "finalizing" } },
      }).nativeScanner?.lastFailure?.stage,
    ).toBe("finalizing");
    expect(
      collectorSavedVariablesSchema.parse({ ...saved, nativeScanner: [] }).nativeScanner,
    ).toEqual({});
  });

  it("does not block valid scans when optional request diagnostics are malformed", () => {
    for (const invalid of [
      { lastRequestedAt: -1 },
      { lastFailure: { ...failure, durationMs: -1 } },
      { lastFailure: { ...failure, reason: "x".repeat(513) } },
      { lastFailure: { ...failure, code: "unrecognized" } },
    ]) {
      const parsed = collectorSavedVariablesSchema.parse({ ...saved, nativeScanner: invalid });
      expect(parsed.nativeScanner).toBeUndefined();
      expect(parsed.scans).toEqual(saved.scans);
    }
  });

  it("keeps failure evidence out of public uploads and checksums", () => {
    const without = collectorSavedVariablesSchema.parse(saved);
    const withFailure = collectorSavedVariablesSchema.parse({
      ...saved,
      nativeScanner: { lastRequestedAt: failure.requestIssuedAt, lastFailure: failure },
    });
    expect(createAuctionScanUpload(withFailure, current)).toEqual(
      createAuctionScanUpload(without, current),
    );
  });
});
