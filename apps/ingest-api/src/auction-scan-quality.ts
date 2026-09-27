import type { AuctionScanUpload } from "@wow-trader/contracts";

export interface NormalizedAuctionScanQuality {
  readonly provider: NonNullable<AuctionScanUpload["provider"]>;
  readonly apiFlavor: string;
  readonly marketKeyVersion: number;
  readonly reportedRowCount: number;
  readonly visitedRowCount: number;
  readonly pricedRowCount: number;
  readonly noBuyoutRowCount: number;
  readonly unresolvedRowCount: number;
  readonly invalidRowCount: number;
  readonly secretRowCount: number;
  readonly scanDurationMs: number;
  readonly auctionHouseStayedOpen: boolean;
}

export function normalizeAuctionScanQuality(
  upload: AuctionScanUpload,
): NormalizedAuctionScanQuality {
  const derivedPricedRows = upload.data.itemSnapshots.reduce(
    (total, snapshot) =>
      total + snapshot.priceLevels.reduce((subtotal, level) => subtotal + level.listingCount, 0),
    0,
  );
  const pricedRowCount = upload.pricedRowCount ?? derivedPricedRows;
  const reportedRowCount = upload.reportedRowCount ?? pricedRowCount;
  return {
    provider: upload.provider ?? "unknown",
    apiFlavor: upload.apiFlavor ?? "unknown",
    marketKeyVersion: upload.marketKeyVersion ?? 1,
    reportedRowCount,
    visitedRowCount: upload.visitedRowCount ?? reportedRowCount,
    pricedRowCount,
    noBuyoutRowCount: upload.noBuyoutRowCount ?? 0,
    unresolvedRowCount: upload.unresolvedRowCount ?? 0,
    invalidRowCount: upload.invalidRowCount ?? 0,
    secretRowCount: upload.secretRowCount ?? 0,
    scanDurationMs: upload.scanDurationMs ?? 0,
    auctionHouseStayedOpen: upload.auctionHouseStayedOpen ?? true,
  };
}

export function auctionScanQualityReason(
  upload: AuctionScanUpload,
  quality: NormalizedAuctionScanQuality,
  previousReportedRowCount: number | null,
): string | null {
  if (upload.completeness < 0.98) return "completeness_below_98_percent";
  if (!quality.auctionHouseStayedOpen) return "auction_house_closed_during_scan";
  if (quality.marketKeyVersion !== 1) return "unsupported_market_key_version";
  if (quality.visitedRowCount !== quality.reportedRowCount) return "row_visit_count_mismatch";

  const classifiedRows =
    quality.pricedRowCount +
    quality.noBuyoutRowCount +
    quality.unresolvedRowCount +
    quality.invalidRowCount +
    quality.secretRowCount;
  if (classifiedRows !== quality.reportedRowCount) return "row_classification_count_mismatch";

  if (quality.provider === "blizzard_replicate") {
    const requiredEvidence = [
      upload.apiFlavor,
      upload.marketKeyVersion,
      upload.reportedRowCount,
      upload.visitedRowCount,
      upload.pricedRowCount,
      upload.noBuyoutRowCount,
      upload.unresolvedRowCount,
      upload.invalidRowCount,
      upload.secretRowCount,
      upload.scanDurationMs,
      upload.auctionHouseStayedOpen,
    ];
    if (requiredEvidence.some((value) => value === undefined)) {
      return "native_quality_evidence_missing";
    }
  }

  if (quality.reportedRowCount === 0) return "empty_scan";
  if (
    previousReportedRowCount !== null &&
    previousReportedRowCount > 0 &&
    quality.reportedRowCount < previousReportedRowCount * 0.25
  ) {
    return "reported_rows_below_recent_baseline";
  }
  return null;
}
