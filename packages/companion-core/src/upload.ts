import { createHash } from "node:crypto";

import {
  auctionScanUploadSchema,
  canonicalJson,
  uploadReceiptSchema,
  uploadStatusSchema,
  type AuctionScanUpload,
  type JsonValue,
  type UploadReceipt,
  type UploadStatus,
} from "@wow-trader/contracts";

import type { CollectorSavedVariables, CollectorScan } from "./collector-schema.js";

interface RequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export function createAuctionScanUpload(
  savedVariables: CollectorSavedVariables,
  scan: CollectorScan,
): AuctionScanUpload {
  const data = {
    scanId: scan.scanId,
    itemSnapshots: scan.itemSnapshots.map((snapshot) => ({
      itemId: snapshot.itemId,
      marketKey: snapshot.marketKey,
      itemLink: snapshot.itemLink,
      priceLevels: snapshot.priceLevels.map((level) => ({
        unitPriceCopper: String(level.unitPriceCopper),
        quantity: level.quantity,
        listingCount: level.listingCount,
      })),
    })),
  };
  const checksum = createHash("sha256")
    .update(canonicalJson(data as JsonValue))
    .digest("hex");
  return auctionScanUploadSchema.parse({
    schemaVersion: "auction-scan.v1",
    payloadType: "auction_scan",
    payloadId: scan.scanId,
    addonVersion: scan.addonVersion,
    clientProduct: scan.clientProduct,
    clientBuild: scan.clientBuild,
    locale: scan.locale,
    region: scan.region,
    realmId: scan.realmId,
    auctionHouseType: scan.auctionHouseType,
    sourceCharacter: scan.sourceCharacter ?? null,
    anonymousInstallationId: savedVariables.installationId,
    capturedAt: new Date(scan.capturedAt * 1_000).toISOString(),
    completedAt: new Date(scan.completedAt * 1_000).toISOString(),
    completeness: scan.completeness,
    checksum,
    data,
  });
}

export async function uploadAuctionScan(
  endpoint: URL,
  apiKey: string,
  upload: AuctionScanUpload,
  options: RequestOptions = {},
): Promise<UploadReceipt> {
  const response = await fetch(new URL("/v1/uploads/auction-scan", endpoint), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(upload),
    signal: combineSignal(options.signal, 60_000),
  });
  const responseBody: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(responseBody) ?? `HTTP ${response.status}`;
    throw new Error(`Upload ${upload.data.scanId} failed: ${message}`);
  }
  return uploadReceiptSchema.parse(responseBody);
}

export async function waitForAuctionScanProcessed(
  endpoint: URL,
  apiKey: string,
  payloadId: string,
  options: RequestOptions & {
    readonly pollIntervalMilliseconds?: number;
    readonly timeoutMilliseconds?: number;
  } = {},
): Promise<UploadStatus> {
  const pollIntervalMilliseconds = options.pollIntervalMilliseconds ?? 1_000;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 120_000;
  const deadline = Date.now() + timeoutMilliseconds;
  while (true) {
    const status = await getAuctionScanUploadStatus(endpoint, apiKey, payloadId, options.signal);
    if (status.status === "processed") return status;
    if (status.status === "rejected") {
      throw new Error(
        `Upload ${payloadId} was rejected${status.errorCode ? `: ${status.errorCode}` : ""}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(`Upload ${payloadId} was not processed within ${timeoutMilliseconds}ms`);
    }
    await abortableDelay(pollIntervalMilliseconds, options.signal);
  }
}

async function getAuctionScanUploadStatus(
  endpoint: URL,
  apiKey: string,
  payloadId: string,
  signal: AbortSignal | undefined,
): Promise<UploadStatus> {
  const url = new URL(`/v1/uploads/${encodeURIComponent(payloadId)}`, endpoint);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: combineSignal(signal, 30_000),
  });
  const responseBody: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(responseBody) ?? `HTTP ${response.status}`;
    throw new Error(`Upload status ${payloadId} failed: ${message}`);
  }
  return uploadStatusSchema.parse(responseBody);
}

function combineSignal(signal: AbortSignal | undefined, timeoutMilliseconds: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMilliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function abortableDelay(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    if (signal?.aborted) {
      rejectPromise(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      rejectPromise(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolvePromise();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("message" in value)) return null;
  return typeof value.message === "string" ? value.message : null;
}
