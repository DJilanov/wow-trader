import type {
  AuctionScanUpload,
  PublicDataStatus,
  UploadReceipt,
  UploadStatus,
} from "@wow-trader/contracts";

export interface AuctionUploadRepository {
  acceptAuctionScan(
    upload: AuctionScanUpload,
    rawPayloadUri: string,
    envelopeHash: string,
  ): Promise<UploadReceipt>;
  findUpload(payloadId: string): Promise<UploadStatus | null>;
  getPublicDataStatus(): Promise<PublicDataStatus>;
}
