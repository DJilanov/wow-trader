import { createHash } from "node:crypto";

import {
  canonicalJson,
  type AuctionScanUpload,
  type JsonValue,
  type PublicDataStatus,
  type UploadReceipt,
  type UploadStatus,
} from "@wow-trader/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { RawPayloadStore } from "./raw-payload-store.js";
import type { AuctionUploadRepository } from "./repositories.js";

const API_KEY = "test-api-key-with-enough-entropy";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("ingestion API", () => {
  it("accepts a valid, authenticated, checksummed scan", async () => {
    const repository = new InMemoryRepository();
    const rawStore = new InMemoryRawPayloadStore();
    const app = await buildTestApp(repository, rawStore);
    const payload = createPayload();

    const response = await app.inject({
      method: "POST",
      url: "/v1/uploads/auction-scan",
      headers: { authorization: `Bearer ${API_KEY}` },
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      payloadId: payload.payloadId,
      status: "processed",
      duplicate: false,
    });
    expect(repository.accepted).toHaveLength(1);
    expect(rawStore.entries).toHaveLength(1);
  });

  it("rejects an invalid checksum before storing data", async () => {
    const repository = new InMemoryRepository();
    const rawStore = new InMemoryRawPayloadStore();
    const app = await buildTestApp(repository, rawStore);
    const payload = { ...createPayload(), checksum: "0".repeat(64) };

    const response = await app.inject({
      method: "POST",
      url: "/v1/uploads/auction-scan",
      headers: { authorization: `Bearer ${API_KEY}` },
      payload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: "checksum_mismatch" });
    expect(repository.accepted).toHaveLength(0);
    expect(rawStore.entries).toHaveLength(0);
  });

  it("requires authentication for uploads", async () => {
    const app = await buildTestApp(new InMemoryRepository(), new InMemoryRawPayloadStore());

    const response = await app.inject({
      method: "POST",
      url: "/v1/uploads/auction-scan",
      payload: createPayload(),
    });

    expect(response.statusCode).toBe(401);
  });

  it("exposes public data status without authentication", async () => {
    const app = await buildTestApp(new InMemoryRepository(), new InMemoryRawPayloadStore());

    const response = await app.inject({ method: "GET", url: "/v1/public/data-status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "wow-trader", status: "degraded" });
  });
});

async function buildTestApp(repository: AuctionUploadRepository, rawPayloadStore: RawPayloadStore) {
  const app = await buildApp({
    repository,
    rawPayloadStore,
    apiKeys: [API_KEY],
    webOrigin: "http://localhost:3000",
  });
  apps.push(app);
  return app;
}

function createPayload(): AuctionScanUpload {
  const data = {
    scanId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
    itemSnapshots: [
      {
        itemId: 12808,
        marketKey: "12808",
        itemLink: "|cffffffff|Hitem:12808::::::::70:::::::|h[Essence of Undeath]|h|r",
        priceLevels: [{ unitPriceCopper: "12500", quantity: 7, listingCount: 3 }],
      },
    ],
  };
  const checksum = createHash("sha256")
    .update(canonicalJson(data as JsonValue))
    .digest("hex");

  return {
    schemaVersion: "auction-scan.v1",
    payloadType: "auction_scan",
    payloadId: "f6714653-a4c4-4208-b7ee-b0a21a816593",
    addonVersion: "0.1.0",
    clientProduct: "wow_anniversary",
    clientBuild: 69795,
    locale: "enUS",
    region: "EU",
    realmId: "tbc-validation",
    auctionHouseType: "horde",
    anonymousInstallationId: "anonymous-test-installation",
    capturedAt: "2026-09-15T10:30:00.000Z",
    completedAt: "2026-09-15T10:30:10.000Z",
    completeness: 1,
    checksum,
    data,
  };
}

class InMemoryRawPayloadStore implements RawPayloadStore {
  public readonly entries: { payloadId: string; envelopeHash: string; content: string }[] = [];

  public async put(payloadId: string, envelopeHash: string, content: string): Promise<string> {
    this.entries.push({ payloadId, envelopeHash, content });
    return `memory://${payloadId}`;
  }
}

class InMemoryRepository implements AuctionUploadRepository {
  public readonly accepted: AuctionScanUpload[] = [];

  public async acceptAuctionScan(upload: AuctionScanUpload): Promise<UploadReceipt> {
    this.accepted.push(upload);
    return { payloadId: upload.payloadId, status: "processed", duplicate: false };
  }

  public async findUpload(_payloadId: string): Promise<UploadStatus | null> {
    return null;
  }

  public async getPublicDataStatus(): Promise<PublicDataStatus> {
    return {
      service: "wow-trader",
      status: "degraded",
      catalog: {
        product: null,
        clientVersion: null,
        buildNumber: null,
        locale: null,
        publishedAt: null,
        itemCount: 0,
        recipeCount: 0,
      },
      market: {
        region: null,
        realmId: null,
        auctionHouseType: null,
        lastScanAt: null,
        completeness: null,
        itemCount: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
