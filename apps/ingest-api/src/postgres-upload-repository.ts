import type {
  AuctionScanUpload,
  PublicDataStatus,
  UploadReceipt,
  UploadStatus,
} from "@wow-trader/contracts";
import {
  auctionPriceLevels,
  gameBuilds,
  itemVersions,
  marketScans,
  rawUploads,
  recipeVersions,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { count, desc, eq } from "drizzle-orm";

import { PayloadConflictError } from "./errors.js";
import type { AuctionUploadRepository } from "./repositories.js";

const INSERT_CHUNK_SIZE = 4_000;

export class PostgresAuctionUploadRepository implements AuctionUploadRepository {
  readonly #database: WowTraderDatabase;

  public constructor(database: WowTraderDatabase) {
    this.#database = database;
  }

  public async acceptAuctionScan(
    upload: AuctionScanUpload,
    rawPayloadUri: string,
    envelopeHash: string,
  ): Promise<UploadReceipt> {
    return this.#database.transaction(async (transaction) => {
      const [existingUpload] = await transaction
        .select({
          checksum: rawUploads.checksum,
          envelopeHash: rawUploads.envelopeHash,
          status: rawUploads.status,
        })
        .from(rawUploads)
        .where(eq(rawUploads.payloadId, upload.payloadId))
        .limit(1);

      if (existingUpload) {
        if (
          existingUpload.checksum !== upload.checksum ||
          existingUpload.envelopeHash !== envelopeHash
        ) {
          throw new PayloadConflictError("The payload ID was already used with different content");
        }

        return {
          payloadId: upload.payloadId,
          status: existingUpload.status === "processed" ? "processed" : "accepted",
          duplicate: true,
        };
      }

      const [existingScan] = await transaction
        .select({ payloadId: marketScans.payloadId })
        .from(marketScans)
        .where(eq(marketScans.scanId, upload.data.scanId))
        .limit(1);

      if (existingScan) {
        throw new PayloadConflictError("The scan ID was already used by another payload");
      }

      await transaction.insert(rawUploads).values({
        payloadId: upload.payloadId,
        payloadType: upload.payloadType,
        schemaVersion: upload.schemaVersion,
        checksum: upload.checksum,
        envelopeHash,
        status: "processing",
        clientProduct: upload.clientProduct,
        clientBuild: upload.clientBuild,
        locale: upload.locale,
        region: upload.region,
        realmId: upload.realmId,
        auctionHouseType: upload.auctionHouseType,
        sourceCharacterName: upload.sourceCharacter?.name ?? null,
        sourceCharacterRealmId: upload.sourceCharacter?.realmId ?? null,
        sourceCharacterFaction: upload.sourceCharacter?.faction ?? null,
        sourceCharacterGuid: upload.sourceCharacter?.guid ?? null,
        anonymousInstallationId: upload.anonymousInstallationId,
        capturedAt: new Date(upload.capturedAt),
        completedAt: new Date(upload.completedAt),
        completeness: upload.completeness,
        rawPayloadUri,
      });

      const normalizedLevels = upload.data.itemSnapshots.flatMap((snapshot) =>
        snapshot.priceLevels.map((level) => ({
          scanId: upload.data.scanId,
          itemId: snapshot.itemId,
          marketKey: snapshot.marketKey,
          unitPriceCopper: BigInt(level.unitPriceCopper),
          quantity: level.quantity,
          listingCount: level.listingCount,
        })),
      );

      await transaction.insert(marketScans).values({
        scanId: upload.data.scanId,
        payloadId: upload.payloadId,
        clientBuild: upload.clientBuild,
        region: upload.region,
        realmId: upload.realmId,
        auctionHouseType: upload.auctionHouseType,
        startedAt: new Date(upload.capturedAt),
        completedAt: new Date(upload.completedAt),
        completeness: upload.completeness,
        itemCount: upload.data.itemSnapshots.length,
        priceLevelCount: normalizedLevels.length,
      });

      for (let index = 0; index < normalizedLevels.length; index += INSERT_CHUNK_SIZE) {
        const chunk = normalizedLevels.slice(index, index + INSERT_CHUNK_SIZE);
        if (chunk.length > 0) {
          await transaction.insert(auctionPriceLevels).values(chunk);
        }
      }

      await transaction
        .update(rawUploads)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(rawUploads.payloadId, upload.payloadId));

      return {
        payloadId: upload.payloadId,
        status: "processed",
        duplicate: false,
      };
    });
  }

  public async findUpload(payloadId: string): Promise<UploadStatus | null> {
    const [upload] = await this.#database
      .select({
        payloadId: rawUploads.payloadId,
        payloadType: rawUploads.payloadType,
        status: rawUploads.status,
        receivedAt: rawUploads.receivedAt,
        rawPayloadUri: rawUploads.rawPayloadUri,
        errorCode: rawUploads.errorCode,
      })
      .from(rawUploads)
      .where(eq(rawUploads.payloadId, payloadId))
      .limit(1);

    if (!upload) return null;

    return {
      payloadId: upload.payloadId,
      payloadType: upload.payloadType,
      status: upload.status,
      receivedAt: upload.receivedAt.toISOString(),
      rawPayloadUri: upload.rawPayloadUri,
      errorCode: upload.errorCode,
    };
  }

  public async getPublicDataStatus(): Promise<PublicDataStatus> {
    const [latestBuild] = await this.#database
      .select({
        id: gameBuilds.id,
        product: gameBuilds.product,
        clientVersion: gameBuilds.clientVersion,
        buildNumber: gameBuilds.buildNumber,
        locale: gameBuilds.locale,
        publishedAt: gameBuilds.publishedAt,
      })
      .from(gameBuilds)
      .where(eq(gameBuilds.status, "published"))
      .orderBy(desc(gameBuilds.publishedAt))
      .limit(1);

    const [latestScan] = await this.#database
      .select({
        region: marketScans.region,
        realmId: marketScans.realmId,
        auctionHouseType: marketScans.auctionHouseType,
        completedAt: marketScans.completedAt,
        completeness: marketScans.completeness,
        itemCount: marketScans.itemCount,
      })
      .from(marketScans)
      .orderBy(desc(marketScans.completedAt))
      .limit(1);

    let itemCount = 0;
    let recipeCount = 0;
    if (latestBuild) {
      const [itemResult] = await this.#database
        .select({ value: count() })
        .from(itemVersions)
        .where(eq(itemVersions.buildId, latestBuild.id));
      const [recipeResult] = await this.#database
        .select({ value: count() })
        .from(recipeVersions)
        .where(eq(recipeVersions.buildId, latestBuild.id));
      itemCount = itemResult?.value ?? 0;
      recipeCount = recipeResult?.value ?? 0;
    }

    return {
      service: "wow-trader",
      status: latestBuild && latestScan ? "ready" : "degraded",
      catalog: {
        product: latestBuild?.product ?? null,
        clientVersion: latestBuild?.clientVersion ?? null,
        buildNumber: latestBuild?.buildNumber ?? null,
        locale: latestBuild?.locale ?? null,
        publishedAt: latestBuild?.publishedAt?.toISOString() ?? null,
        itemCount,
        recipeCount,
      },
      market: {
        region: latestScan?.region ?? null,
        realmId: latestScan?.realmId ?? null,
        auctionHouseType: latestScan?.auctionHouseType ?? null,
        lastScanAt: latestScan?.completedAt.toISOString() ?? null,
        completeness: latestScan?.completeness ?? null,
        itemCount: latestScan?.itemCount ?? 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
