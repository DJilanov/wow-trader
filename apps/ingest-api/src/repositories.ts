import type {
  AuctionScanUpload,
  MarketIntelligencePack,
  MarketIntelligenceQuery,
  ProfessionSnapshotUpload,
  PublicDataStatus,
  UploadReceipt,
  UploadStatus,
  WorldDiagnosticsUpload,
} from "@wow-trader/contracts";

export interface UploadRepository {
  acceptAuctionScan(
    upload: AuctionScanUpload,
    rawPayloadUri: string,
    envelopeHash: string,
    collectorInstallationId?: string,
  ): Promise<UploadReceipt>;
  acceptWorldDiagnostics(
    upload: WorldDiagnosticsUpload,
    rawPayloadUri: string,
    envelopeHash: string,
    collectorInstallationId?: string,
  ): Promise<UploadReceipt>;
  acceptProfessionSnapshot(
    upload: ProfessionSnapshotUpload,
    rawPayloadUri: string,
    envelopeHash: string,
    collectorInstallationId?: string,
  ): Promise<UploadReceipt>;
  findUpload(payloadId: string, collectorInstallationId?: string): Promise<UploadStatus | null>;
  getPublicDataStatus(): Promise<PublicDataStatus>;
  getMarketIntelligence(query: MarketIntelligenceQuery): Promise<MarketIntelligencePack | null>;
}
