import type { AuctionScanUpload } from "@wow-trader/contracts";
import { describe, expect, it } from "vitest";

import { auctionScanQualityReason, normalizeAuctionScanQuality } from "./auction-scan-quality.js";

describe("Auction House scan quality", () => {
  it("accepts a complete native replication with explicit row accounting", () => {
    const upload = nativeUpload();
    const quality = normalizeAuctionScanQuality(upload);

    expect(auctionScanQualityReason(upload, quality, 102)).toBeNull();
    expect(quality).toMatchObject({
      provider: "blizzard_replicate",
      reportedRowCount: 100,
      visitedRowCount: 100,
      pricedRowCount: 98,
      noBuyoutRowCount: 2,
    });
  });

  it("rejects incomplete, internally inconsistent, empty, and implausibly small scans", () => {
    const upload = nativeUpload();

    const incomplete = { ...upload, completeness: 0.97 };
    expect(
      auctionScanQualityReason(incomplete, normalizeAuctionScanQuality(incomplete), null),
    ).toBe("completeness_below_98_percent");

    const inconsistent = { ...upload, noBuyoutRowCount: 1 };
    expect(
      auctionScanQualityReason(inconsistent, normalizeAuctionScanQuality(inconsistent), null),
    ).toBe("row_classification_count_mismatch");

    const missingEvidence = {
      ...legacyUpload(3),
      provider: "blizzard_replicate" as const,
    };
    expect(
      auctionScanQualityReason(missingEvidence, normalizeAuctionScanQuality(missingEvidence), null),
    ).toBe("native_quality_evidence_missing");

    const empty = legacyUpload(0);
    expect(auctionScanQualityReason(empty, normalizeAuctionScanQuality(empty), null)).toBe(
      "empty_scan",
    );

    expect(auctionScanQualityReason(upload, normalizeAuctionScanQuality(upload), 500)).toBe(
      "reported_rows_below_recent_baseline",
    );
  });

  it("derives compatible row evidence for scans saved by older collectors", () => {
    const upload = legacyUpload(3);
    const quality = normalizeAuctionScanQuality(upload);

    expect(quality).toMatchObject({
      provider: "unknown",
      reportedRowCount: 3,
      visitedRowCount: 3,
      pricedRowCount: 3,
    });
    expect(auctionScanQualityReason(upload, quality, null)).toBeNull();
  });
});

function nativeUpload(): AuctionScanUpload {
  return {
    ...legacyUpload(98),
    addonVersion: "0.8.0",
    clientProduct: "wow_classic_beta",
    clientBuild: 70009,
    provider: "blizzard_replicate",
    apiFlavor: "c_auction_house_replicate",
    marketKeyVersion: 1,
    reportedRowCount: 100,
    visitedRowCount: 100,
    pricedRowCount: 98,
    noBuyoutRowCount: 2,
    unresolvedRowCount: 0,
    invalidRowCount: 0,
    secretRowCount: 0,
    scanDurationMs: 850,
    auctionHouseStayedOpen: true,
  };
}

function legacyUpload(listingCount: number): AuctionScanUpload {
  return {
    schemaVersion: "auction-scan.v1",
    payloadType: "auction_scan",
    payloadId: "f6714653-a4c4-4208-b7ee-b0a21a816593",
    addonVersion: "0.7.0",
    clientProduct: "wow_anniversary",
    clientBuild: 69795,
    locale: "enUS",
    region: "EU",
    realmId: "test-realm",
    auctionHouseType: "horde",
    anonymousInstallationId: "anonymous-test-installation",
    capturedAt: "2026-09-15T10:30:00.000Z",
    completedAt: "2026-09-15T10:30:10.000Z",
    completeness: 1,
    checksum: "a".repeat(64),
    data: {
      scanId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
      itemSnapshots:
        listingCount === 0
          ? []
          : [
              {
                itemId: 12808,
                marketKey: "12808",
                itemLink: null,
                priceLevels: [{ unitPriceCopper: "12500", quantity: listingCount, listingCount }],
              },
            ],
    },
  };
}
