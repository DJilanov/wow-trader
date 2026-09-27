import type {
  AuctionScanUpload,
  MarketIntelligencePack,
  MarketIntelligenceQuery,
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
  ): Promise<UploadReceipt>;
  acceptWorldDiagnostics(
    upload: WorldDiagnosticsUpload,
    rawPayloadUri: string,
    envelopeHash: string,
  ): Promise<UploadReceipt>;
  findUpload(payloadId: string): Promise<UploadStatus | null>;
  getPublicDataStatus(): Promise<PublicDataStatus>;
  getMarketIntelligence(query: MarketIntelligenceQuery): Promise<MarketIntelligencePack | null>;
}
