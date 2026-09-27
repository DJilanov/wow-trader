import type {
  AuctionScanUpload,
  MarketIntelligencePack,
  MarketIntelligenceQuery,
  PublicDataStatus,
  UploadReceipt,
  UploadStatus,
  WorldDiagnosticsUpload,
} from "@wow-trader/contracts";
import {
  auctionPriceLevels,
  gameBuilds,
  itemVersions,
  marketScans,
  marketItemObservations,
  marketItemSignals,
  rawUploads,
  recipeVersions,
  worldEncounterActorObservations,
  worldEncounterObservations,
  worldHealthObservations,
  worldLootObservations,
  worldModelObservations,
  worldNpcObservations,
  worldQuestObservations,
  worldSpellObservations,
  worldVendorObservations,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { analyzePriceHistory, summarizeOrderBook } from "@wow-trader/market";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";

import { PayloadConflictError } from "./errors.js";
import { auctionScanQualityReason, normalizeAuctionScanQuality } from "./auction-scan-quality.js";
import type { UploadRepository } from "./repositories.js";

const INSERT_CHUNK_SIZE = 4_000;
type UploadTransaction = Parameters<Parameters<WowTraderDatabase["transaction"]>[0]>[0];

interface MarketSignalScope {
  readonly clientProduct: string;
  readonly clientBuild: number;
  readonly region: string;
  readonly realmId: string;
  readonly auctionHouseType: AuctionScanUpload["auctionHouseType"];
  readonly completedAt: string;
  readonly scanId: string;
}

export class PostgresUploadRepository implements UploadRepository {
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
      const normalizedObservations = upload.data.itemSnapshots.map((snapshot) => {
        const summary = summarizeOrderBook(
          snapshot.priceLevels.map((level) => ({
            unitPriceCopper: BigInt(level.unitPriceCopper),
            quantity: level.quantity,
            listingCount: level.listingCount,
          })),
        );
        return {
          scanId: upload.data.scanId,
          itemId: snapshot.itemId,
          marketKey: snapshot.marketKey,
          minimumPriceCopper: summary.minimumPriceCopper,
          tenthPercentilePriceCopper: summary.weightedTenthPercentilePriceCopper,
          medianPriceCopper: summary.weightedMedianPriceCopper,
          ninetiethPercentilePriceCopper: summary.weightedNinetiethPercentilePriceCopper,
          availableQuantity: summary.availableQuantity,
          listingCount: summary.listingCount,
          quantityWithinFivePercent: summary.quantityWithinFivePercent,
          quantityWithinTenPercent: summary.quantityWithinTenPercent,
        };
      });

      const quality = normalizeAuctionScanQuality(upload);
      const [latestAcceptedScan] = await transaction
        .select({ reportedRowCount: marketScans.reportedRowCount })
        .from(marketScans)
        .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
        .where(
          and(
            eq(marketScans.region, upload.region),
            eq(marketScans.realmId, upload.realmId),
            eq(marketScans.auctionHouseType, upload.auctionHouseType),
            eq(marketScans.qualityAccepted, true),
            eq(rawUploads.clientProduct, upload.clientProduct),
          ),
        )
        .orderBy(desc(marketScans.completedAt))
        .limit(1);
      const qualityReason = auctionScanQualityReason(
        upload,
        quality,
        latestAcceptedScan?.reportedRowCount ?? null,
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
        provider: quality.provider,
        apiFlavor: quality.apiFlavor,
        marketKeyVersion: quality.marketKeyVersion,
        reportedRowCount: quality.reportedRowCount,
        visitedRowCount: quality.visitedRowCount,
        pricedRowCount: quality.pricedRowCount,
        noBuyoutRowCount: quality.noBuyoutRowCount,
        unresolvedRowCount: quality.unresolvedRowCount,
        invalidRowCount: quality.invalidRowCount,
        secretRowCount: quality.secretRowCount,
        scanDurationMs: quality.scanDurationMs,
        auctionHouseStayedOpen: quality.auctionHouseStayedOpen,
        qualityAccepted: qualityReason === null,
        qualityReason,
        itemCount: upload.data.itemSnapshots.length,
        priceLevelCount: normalizedLevels.length,
      });

      for (let index = 0; index < normalizedLevels.length; index += INSERT_CHUNK_SIZE) {
        const chunk = normalizedLevels.slice(index, index + INSERT_CHUNK_SIZE);
        if (chunk.length > 0) {
          await transaction.insert(auctionPriceLevels).values(chunk);
        }
      }

      for (let index = 0; index < normalizedObservations.length; index += INSERT_CHUNK_SIZE) {
        const chunk = normalizedObservations.slice(index, index + INSERT_CHUNK_SIZE);
        if (chunk.length > 0) await transaction.insert(marketItemObservations).values(chunk);
      }

      if (qualityReason === null) {
        await refreshMarketItemSignals(
          transaction,
          {
            clientProduct: upload.clientProduct,
            clientBuild: upload.clientBuild,
            region: upload.region,
            realmId: upload.realmId,
            auctionHouseType: upload.auctionHouseType,
            completedAt: upload.completedAt,
            scanId: upload.data.scanId,
          },
          normalizedObservations,
        );
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

  public async acceptWorldDiagnostics(
    upload: WorldDiagnosticsUpload,
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
        realmId: "unknown",
        auctionHouseType: "unknown",
        anonymousInstallationId: upload.anonymousInstallationId,
        capturedAt: new Date(upload.capturedAt),
        completedAt: new Date(upload.completedAt),
        completeness: 1,
        rawPayloadUri,
      });

      await insertInChunks(
        transaction,
        worldModelObservations,
        upload.data.modelResolutions.map((observation) => ({
          resolutionId: observation.resolutionId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          capturedAt: new Date(observation.capturedAt),
          creatureId: observation.creatureId,
          creatureName: observation.creatureName,
          attempt: observation.attempt,
          status: observation.status,
          displayId: observation.displayId,
          modelFileDataId: observation.modelFileDataId,
          errorMessage: observation.errorMessage,
          evidence: observation.evidence,
        })),
      );
      await insertInChunks(
        transaction,
        worldHealthObservations,
        upload.data.healthObservations.map((observation) => ({
          observationId: observation.observationId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          capturedAt: new Date(observation.capturedAt),
          creatureId: observation.creatureId,
          creatureName: observation.creatureName,
          trigger: observation.trigger,
          level: observation.level,
          classification: observation.classification,
          currentHealth: BigInt(observation.currentHealth),
          maximumHealth: BigInt(observation.maximumHealth),
          healthPercent: observation.healthPercent,
          isDead: observation.isDead,
          groupSize: observation.groupSize,
          mapId: observation.observerLocation.mapId,
          uiMapId: observation.observerLocation.uiMapId,
          difficultyId: observation.observerLocation.difficultyId,
          difficultyName: observation.observerLocation.difficultyName,
          instanceType: observation.observerLocation.instanceType,
          observerLocation: observation.observerLocation,
        })),
      );
      await insertInChunks(
        transaction,
        worldEncounterObservations,
        upload.data.encounterAttempts.map((attempt) => ({
          attemptId: attempt.attemptId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          encounterId: attempt.encounterId,
          encounterName: attempt.encounterName,
          difficultyId: attempt.difficultyId,
          groupSize: attempt.groupSize,
          startedAt: new Date(attempt.startedAt),
          endedAt: new Date(attempt.endedAt),
          success: attempt.success,
          startLocation: attempt.startLocation,
          endLocation: attempt.endLocation,
        })),
      );
      await insertInChunks(
        transaction,
        worldEncounterActorObservations,
        upload.data.encounterAttempts.flatMap((attempt) =>
          attempt.actors.map((actor, actorIndex) => ({
            attemptId: attempt.attemptId,
            actorIndex,
            creatureId: actor.creatureId,
            creatureName: actor.creatureName,
            remainingHealthPercent: actor.remainingHealthPercent,
          })),
        ),
      );

      const encounterLoot = upload.data.encounterLoot.map((observation) => ({
        observationId: observation.observationId,
        payloadId: upload.payloadId,
        clientProduct: upload.clientProduct,
        clientBuild: upload.clientBuild,
        locale: upload.locale,
        evidenceKind: "encounter_event",
        capturedAt: new Date(observation.capturedAt),
        itemId: observation.itemId,
        itemLink: observation.itemLink,
        itemName: observation.itemName,
        quantity: observation.quantity,
        iconFileName: observation.iconFileName,
        encounterId: observation.encounterId,
        attemptId: observation.attemptId,
        sourceType: null,
        sourceId: null,
        sourceGuid: null,
        sourceQuantity: null,
        location: observation.location,
      }));
      const lootWindows = upload.data.lootObservations.map((observation) => ({
        observationId: observation.observationId,
        payloadId: upload.payloadId,
        clientProduct: upload.clientProduct,
        clientBuild: upload.clientBuild,
        locale: upload.locale,
        evidenceKind: "loot_window",
        capturedAt: new Date(observation.capturedAt),
        itemId: observation.itemId,
        itemLink: observation.itemLink,
        itemName: observation.itemName,
        quantity: observation.quantity,
        iconFileName: null,
        encounterId: observation.encounterId,
        attemptId: observation.attemptId,
        sourceType: observation.sourceType,
        sourceId: observation.sourceId,
        sourceGuid: observation.sourceGuid,
        sourceQuantity: observation.sourceQuantity,
        location: observation.observerLocation,
      }));
      await insertInChunks(transaction, worldLootObservations, [...encounterLoot, ...lootWindows]);
      await insertInChunks(
        transaction,
        worldNpcObservations,
        upload.data.npcSightings.map((observation) => ({
          observationId: observation.observationId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          capturedAt: new Date(observation.capturedAt),
          creatureId: observation.npcId,
          creatureName: observation.npcName,
          objectType: observation.objectType,
          trigger: observation.trigger,
          level: observation.level,
          classification: observation.classification,
          creatureType: observation.creatureType,
          creatureFamily: observation.creatureFamily,
          reaction: observation.reaction,
          canAttack: observation.canAttack,
          isQuestBoss: observation.isQuestBoss,
          isDead: observation.isDead,
          distanceSquared: observation.distanceSquared,
          positionEvidence: observation.positionEvidence,
          subjectPosition: observation.subjectPosition,
          closestPosition: observation.closestPosition,
          observerLocation: observation.observerLocation,
          mapId: observation.observerLocation.mapId,
          uiMapId: observation.observerLocation.uiMapId,
        })),
      );
      await upsertSpellObservations(
        transaction,
        upload.data.spellObservations.map((observation) => ({
          observationId: observation.observationId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          capturedAt: new Date(observation.capturedAt),
          lastSeenAt: new Date(observation.lastSeenAt),
          eventCount: observation.eventCount,
          subEvent: observation.subEvent,
          sourceCreatureId: observation.sourceCreatureId,
          sourceCreatureName: observation.sourceCreatureName,
          destinationCreatureId: observation.destinationCreatureId,
          destinationCreatureName: observation.destinationCreatureName,
          spellId: observation.spellId,
          spellName: observation.spellName,
          spellSchool: observation.spellSchool,
          encounterId: observation.encounterId,
          attemptId: observation.attemptId,
          mapId: observation.observerLocation.mapId,
          uiMapId: observation.observerLocation.uiMapId,
          difficultyId: observation.observerLocation.difficultyId,
          observerLocation: observation.observerLocation,
        })),
      );
      const questQueries = upload.data.questQueries.map((observation) => ({
        observationId: observation.observationId,
        payloadId: upload.payloadId,
        clientProduct: upload.clientProduct,
        clientBuild: upload.clientBuild,
        locale: upload.locale,
        capturedAt: new Date(observation.capturedAt),
        evidenceKind: "server_query",
        questId: observation.questId,
        status: observation.status,
        title: observation.title,
        questLevel: null,
        suggestedGroup: null,
        questText: null,
        objectiveText: null,
        progressText: null,
        rewardText: null,
        xpReward: null,
        moneyReward: null,
        itemId: null,
        itemLink: null,
        currencyId: null,
        quantity: null,
        sourceType: null,
        sourceId: null,
        sourceName: null,
        objectives: observation.objectives,
        tag: observation.tag,
        rewards: [],
        mapId: observation.observerLocation.mapId,
        uiMapId: observation.observerLocation.uiMapId,
        observerLocation: observation.observerLocation,
      }));
      const questEvents = upload.data.questObservations.map((observation) => ({
        observationId: observation.observationId,
        payloadId: upload.payloadId,
        clientProduct: upload.clientProduct,
        clientBuild: upload.clientBuild,
        locale: upload.locale,
        capturedAt: new Date(observation.capturedAt),
        evidenceKind: observation.evidenceKind,
        questId: observation.questId,
        status: null,
        title: observation.title,
        questLevel: observation.questLevel,
        suggestedGroup: observation.suggestedGroup,
        questText: observation.questText,
        objectiveText: observation.objectiveText,
        progressText: observation.progressText,
        rewardText: observation.rewardText,
        xpReward: observation.xpReward === null ? null : BigInt(observation.xpReward),
        moneyReward: observation.moneyReward === null ? null : BigInt(observation.moneyReward),
        itemId: observation.itemId,
        itemLink: observation.itemLink,
        currencyId: observation.currencyId,
        quantity: observation.quantity,
        sourceType: observation.sourceType,
        sourceId: observation.sourceId,
        sourceName: observation.sourceName,
        objectives: [],
        tag: null,
        rewards: observation.rewards,
        mapId: observation.observerLocation.mapId,
        uiMapId: observation.observerLocation.uiMapId,
        observerLocation: observation.observerLocation,
      }));
      await insertInChunks(transaction, worldQuestObservations, [...questQueries, ...questEvents]);
      await insertInChunks(
        transaction,
        worldVendorObservations,
        upload.data.vendorObservations.map((observation) => ({
          observationId: observation.observationId,
          payloadId: upload.payloadId,
          clientProduct: upload.clientProduct,
          clientBuild: upload.clientBuild,
          locale: upload.locale,
          capturedAt: new Date(observation.capturedAt),
          sourceType: observation.sourceType,
          sourceId: observation.sourceId,
          sourceName: observation.sourceName,
          itemIndex: observation.itemIndex,
          itemId: observation.itemId,
          itemLink: observation.itemLink,
          itemName: observation.itemName,
          texture: observation.texture,
          price: BigInt(observation.price),
          stackCount: observation.stackCount,
          available: observation.available,
          isPurchasable: observation.isPurchasable,
          isUsable: observation.isUsable,
          extendedCost: observation.extendedCost,
          costs: observation.costs,
          mapId: observation.observerLocation.mapId,
          uiMapId: observation.observerLocation.uiMapId,
          observerLocation: observation.observerLocation,
        })),
      );

      await transaction
        .update(rawUploads)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(rawUploads.payloadId, upload.payloadId));

      return { payloadId: upload.payloadId, status: "processed", duplicate: false };
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
      .where(eq(marketScans.qualityAccepted, true))
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

  public async getMarketIntelligence(
    query: MarketIntelligenceQuery,
  ): Promise<MarketIntelligencePack | null> {
    const [build] = await this.#database
      .select({ id: gameBuilds.id })
      .from(gameBuilds)
      .where(
        and(
          eq(gameBuilds.product, query.clientProduct),
          eq(gameBuilds.buildNumber, query.clientBuild),
          eq(gameBuilds.status, "published"),
        ),
      )
      .orderBy(desc(gameBuilds.publishedAt))
      .limit(1);
    if (!build) return null;

    const rows = await this.#database
      .select({
        itemId: marketItemSignals.itemId,
        name: itemVersions.name,
        signal: marketItemSignals.signal,
        observationCount: marketItemSignals.observationCount,
        minimumObservationCount: marketItemSignals.minimumObservationCount,
        currentPriceCopper: marketItemSignals.currentPriceCopper,
        normalPriceCopper: marketItemSignals.normalPriceCopper,
        lowerPriceCopper: marketItemSignals.lowerPriceCopper,
        upperPriceCopper: marketItemSignals.upperPriceCopper,
        differenceBasisPoints: marketItemSignals.differenceBasisPoints,
        currentQuantity: marketItemSignals.currentQuantity,
        normalQuantity: marketItemSignals.normalQuantity,
        supplyRatioBasisPoints: marketItemSignals.supplyRatioBasisPoints,
        currentListingCount: marketItemSignals.currentListingCount,
        confidenceBasisPoints: marketItemSignals.confidenceBasisPoints,
        direction: marketItemSignals.direction,
        generatedAt: marketItemSignals.generatedAt,
        asOfScanId: marketItemSignals.asOfScanId,
      })
      .from(marketItemSignals)
      .leftJoin(
        itemVersions,
        and(eq(itemVersions.buildId, build.id), eq(itemVersions.itemId, marketItemSignals.itemId)),
      )
      .where(
        and(
          eq(marketItemSignals.clientProduct, query.clientProduct),
          eq(marketItemSignals.clientBuild, query.clientBuild),
          eq(marketItemSignals.region, query.region),
          eq(marketItemSignals.realmId, query.realmId),
          eq(marketItemSignals.auctionHouseType, query.auctionHouseType),
        ),
      )
      .orderBy(marketItemSignals.itemId);
    const first = rows[0];
    if (!first) return null;
    const [scan] = await this.#database
      .select({ completedAt: marketScans.completedAt })
      .from(marketScans)
      .where(eq(marketScans.scanId, first.asOfScanId))
      .limit(1);
    if (!scan) return null;

    return {
      schemaVersion: "market-intelligence.v1",
      modelVersion: "robust-market-signal-v1",
      ...query,
      generatedAt: first.generatedAt.toISOString(),
      sourceScanAt: scan.completedAt.toISOString(),
      items: rows.map((row) => ({
        itemId: row.itemId,
        name: row.name,
        signal: parseStoredSignal(row.signal),
        observationCount: row.observationCount,
        minimumObservationCount: row.minimumObservationCount,
        currentPriceCopper: row.currentPriceCopper === null ? null : String(row.currentPriceCopper),
        normalPriceCopper: row.normalPriceCopper === null ? null : String(row.normalPriceCopper),
        lowerPriceCopper: row.lowerPriceCopper === null ? null : String(row.lowerPriceCopper),
        upperPriceCopper: row.upperPriceCopper === null ? null : String(row.upperPriceCopper),
        differenceBasisPoints: row.differenceBasisPoints,
        currentQuantity: row.currentQuantity,
        normalQuantity: row.normalQuantity,
        supplyRatioBasisPoints: row.supplyRatioBasisPoints,
        currentListingCount: row.currentListingCount,
        confidenceBasisPoints: row.confidenceBasisPoints,
        direction: parseStoredDirection(row.direction),
      })),
    };
  }
}

export async function rebuildLatestMarketSignals(database: WowTraderDatabase): Promise<number> {
  const acceptedScans = await database
    .select({
      scanId: marketScans.scanId,
      clientProduct: rawUploads.clientProduct,
      clientBuild: marketScans.clientBuild,
      region: marketScans.region,
      realmId: marketScans.realmId,
      auctionHouseType: marketScans.auctionHouseType,
      completedAt: marketScans.completedAt,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(eq(marketScans.qualityAccepted, true))
    .orderBy(desc(marketScans.completedAt));
  const latestByMarket = new Map<string, (typeof acceptedScans)[number]>();
  for (const scan of acceptedScans) {
    const key = [
      scan.clientProduct,
      scan.clientBuild,
      scan.region,
      scan.realmId,
      scan.auctionHouseType,
    ].join("\u0000");
    if (!latestByMarket.has(key)) latestByMarket.set(key, scan);
  }

  for (const scan of latestByMarket.values()) {
    const observations = await database
      .select({
        itemId: marketItemObservations.itemId,
        marketKey: marketItemObservations.marketKey,
      })
      .from(marketItemObservations)
      .where(eq(marketItemObservations.scanId, scan.scanId));
    await database.transaction((transaction) =>
      refreshMarketItemSignals(
        transaction,
        {
          ...scan,
          completedAt: scan.completedAt.toISOString(),
        },
        observations,
      ),
    );
  }
  return latestByMarket.size;
}

function parseStoredSignal(value: string): MarketIntelligencePack["items"][number]["signal"] {
  if (
    value === "collecting" ||
    value === "bargain" ||
    value === "normal" ||
    value === "rising" ||
    value === "spike_risk" ||
    value === "oversupplied" ||
    value === "falling" ||
    value === "too_thin"
  ) {
    return value;
  }
  throw new Error(`Unsupported stored market signal: ${value}`);
}

function parseStoredDirection(
  value: string | null,
): MarketIntelligencePack["items"][number]["direction"] {
  if (value === null || value === "up" || value === "flat" || value === "down") return value;
  throw new Error(`Unsupported stored market direction: ${value}`);
}

async function refreshMarketItemSignals(
  transaction: UploadTransaction,
  scope: MarketSignalScope,
  latestObservations: readonly {
    readonly itemId: number;
    readonly marketKey: string;
  }[],
): Promise<void> {
  const recentScans = await transaction
    .select({
      scanId: marketScans.scanId,
      completedAt: marketScans.completedAt,
      completeness: marketScans.completeness,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(
      and(
        eq(marketScans.region, scope.region),
        eq(marketScans.realmId, scope.realmId),
        eq(marketScans.auctionHouseType, scope.auctionHouseType),
        eq(marketScans.clientBuild, scope.clientBuild),
        eq(marketScans.qualityAccepted, true),
        eq(rawUploads.clientProduct, scope.clientProduct),
      ),
    )
    .orderBy(desc(marketScans.completedAt))
    .limit(400);
  if (recentScans.length === 0) return;

  const observations = await transaction
    .select({
      scanId: marketItemObservations.scanId,
      itemId: marketItemObservations.itemId,
      marketKey: marketItemObservations.marketKey,
      priceCopper: marketItemObservations.tenthPercentilePriceCopper,
      availableQuantity: marketItemObservations.availableQuantity,
      listingCount: marketItemObservations.listingCount,
    })
    .from(marketItemObservations)
    .where(
      inArray(
        marketItemObservations.scanId,
        recentScans.map((scan) => scan.scanId),
      ),
    );
  const scansById = new Map(recentScans.map((scan) => [scan.scanId, scan]));
  const currentItemIds = new Set(
    latestObservations
      .filter((observation) => observation.marketKey === String(observation.itemId))
      .map((observation) => observation.itemId),
  );
  const byItem = new Map<number, typeof observations>();
  for (const observation of observations) {
    if (!currentItemIds.has(observation.itemId)) continue;
    if (observation.marketKey !== String(observation.itemId)) continue;
    const existing = byItem.get(observation.itemId);
    if (existing) existing.push(observation);
    else byItem.set(observation.itemId, [observation]);
  }

  const generatedAt = new Date(scope.completedAt);
  const signals = [...byItem].map(([itemId, itemObservations]) => {
    const intelligence = analyzePriceHistory(
      itemObservations.flatMap((observation) => {
        const scan = scansById.get(observation.scanId);
        return scan
          ? [
              {
                observedAt: scan.completedAt,
                priceCopper: observation.priceCopper,
                availableQuantity: observation.availableQuantity,
                listingCount: observation.listingCount,
                completeness: scan.completeness,
              },
            ]
          : [];
      }),
    );
    const market = {
      clientProduct: scope.clientProduct,
      clientBuild: scope.clientBuild,
      region: scope.region,
      realmId: scope.realmId,
      auctionHouseType: scope.auctionHouseType,
      itemId,
      asOfScanId: scope.scanId,
      generatedAt,
    };
    return intelligence.status === "collecting"
      ? {
          ...market,
          signal: "collecting",
          observationCount: intelligence.observationCount,
          minimumObservationCount: intelligence.minimumObservationCount,
          modelVersion: "robust-market-signal-v1",
        }
      : {
          ...market,
          signal: intelligence.signal,
          observationCount: intelligence.observationCount,
          minimumObservationCount: 6,
          currentPriceCopper: intelligence.currentPriceCopper,
          normalPriceCopper: intelligence.normalPriceCopper,
          lowerPriceCopper: intelligence.lowerPriceCopper,
          upperPriceCopper: intelligence.upperPriceCopper,
          differenceBasisPoints: intelligence.differenceBasisPoints,
          currentQuantity: intelligence.currentQuantity,
          normalQuantity: intelligence.normalQuantity,
          supplyRatioBasisPoints: intelligence.supplyRatioBasisPoints,
          currentListingCount: intelligence.currentListingCount,
          confidenceBasisPoints: intelligence.confidenceBasisPoints,
          direction: intelligence.direction,
          modelVersion: intelligence.modelVersion,
        };
  });

  await transaction
    .delete(marketItemSignals)
    .where(
      and(
        eq(marketItemSignals.clientProduct, scope.clientProduct),
        eq(marketItemSignals.clientBuild, scope.clientBuild),
        eq(marketItemSignals.region, scope.region),
        eq(marketItemSignals.realmId, scope.realmId),
        eq(marketItemSignals.auctionHouseType, scope.auctionHouseType),
      ),
    );
  for (let index = 0; index < signals.length; index += INSERT_CHUNK_SIZE) {
    const chunk = signals.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length > 0) await transaction.insert(marketItemSignals).values(chunk);
  }
}

async function insertInChunks<TTable extends PgTable>(
  transaction: UploadTransaction,
  table: TTable,
  values: readonly PgInsertValue<TTable>[],
): Promise<void> {
  for (let index = 0; index < values.length; index += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length > 0) {
      await transaction.insert(table).values(chunk).onConflictDoNothing();
    }
  }
}

async function upsertSpellObservations(
  transaction: UploadTransaction,
  values: readonly PgInsertValue<typeof worldSpellObservations>[],
): Promise<void> {
  for (let index = 0; index < values.length; index += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await transaction
      .insert(worldSpellObservations)
      .values(chunk)
      .onConflictDoUpdate({
        target: worldSpellObservations.observationId,
        set: {
          payloadId: sql`excluded.payload_id`,
          lastSeenAt: sql`GREATEST(${worldSpellObservations.lastSeenAt}, excluded.last_seen_at)`,
          eventCount: sql`GREATEST(${worldSpellObservations.eventCount}, excluded.event_count)`,
        },
      });
  }
}
