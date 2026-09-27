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
  type WorldDiagnosticsData,
  type WorldDiagnosticsUpload,
  worldDiagnosticsUploadSchema,
} from "@wow-trader/contracts";

import type {
  CollectorSavedVariables,
  CollectorScan,
  CollectorWorldDiagnostics,
} from "./collector-schema.js";

interface RequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export function createAuctionScanUpload(
  savedVariables: CollectorSavedVariables,
  scan: CollectorScan,
): AuctionScanUpload {
  const derivedPricedRowCount = scan.itemSnapshots.reduce(
    (total, snapshot) =>
      total + snapshot.priceLevels.reduce((subtotal, level) => subtotal + level.listingCount, 0),
    0,
  );
  const pricedRowCount = scan.pricedRowCount ?? derivedPricedRowCount;
  const reportedRowCount = scan.reportedRowCount ?? pricedRowCount;
  const requiresExplicitQualityEvidence = scan.provider === "blizzard_replicate";
  const data = {
    scanId: scan.scanId,
    itemSnapshots: scan.itemSnapshots.map((snapshot) => ({
      itemId: snapshot.itemId,
      marketKey: snapshot.marketKey,
      itemLink: snapshot.itemLink ?? null,
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
    sourceCharacter: scan.sourceCharacter
      ? { ...scan.sourceCharacter, guid: scan.sourceCharacter.guid ?? null }
      : null,
    anonymousInstallationId: savedVariables.installationId,
    capturedAt: new Date(scan.capturedAt * 1_000).toISOString(),
    completedAt: new Date(scan.completedAt * 1_000).toISOString(),
    completeness: scan.completeness,
    provider: scan.provider ?? "unknown",
    apiFlavor: requiresExplicitQualityEvidence ? scan.apiFlavor : (scan.apiFlavor ?? "unknown"),
    marketKeyVersion: requiresExplicitQualityEvidence
      ? scan.marketKeyVersion
      : (scan.marketKeyVersion ?? 1),
    reportedRowCount: requiresExplicitQualityEvidence ? scan.reportedRowCount : reportedRowCount,
    visitedRowCount: requiresExplicitQualityEvidence
      ? scan.visitedRowCount
      : (scan.visitedRowCount ?? reportedRowCount),
    pricedRowCount: requiresExplicitQualityEvidence ? scan.pricedRowCount : pricedRowCount,
    noBuyoutRowCount: requiresExplicitQualityEvidence
      ? scan.noBuyoutRowCount
      : (scan.noBuyoutRowCount ?? 0),
    unresolvedRowCount: requiresExplicitQualityEvidence
      ? scan.unresolvedRowCount
      : (scan.unresolvedRowCount ?? 0),
    invalidRowCount: requiresExplicitQualityEvidence
      ? scan.invalidRowCount
      : (scan.invalidRowCount ?? 0),
    secretRowCount: requiresExplicitQualityEvidence
      ? scan.secretRowCount
      : (scan.secretRowCount ?? 0),
    scanDurationMs: requiresExplicitQualityEvidence
      ? scan.scanDurationMs
      : (scan.scanDurationMs ?? 0),
    auctionHouseStayedOpen: requiresExplicitQualityEvidence
      ? scan.auctionHouseStayedOpen
      : (scan.auctionHouseStayedOpen ?? true),
    checksum,
    data,
  });
}

export function createWorldDiagnosticsUpload(
  savedVariables: CollectorSavedVariables,
): WorldDiagnosticsUpload | null {
  const diagnostics = savedVariables.worldDiagnostics;
  if (!diagnostics || !hasDiagnosticEvidence(diagnostics)) return null;

  const latestScan = savedVariables.scans.at(-1);
  const addonVersion = diagnostics.addonVersion ?? latestScan?.addonVersion;
  const clientProduct = diagnostics.clientProduct ?? latestScan?.clientProduct;
  const clientBuild = diagnostics.clientBuild ?? latestScan?.clientBuild;
  const locale = diagnostics.locale ?? latestScan?.locale;
  const region = diagnostics.region ?? latestScan?.region;
  if (!addonVersion || !clientProduct || !clientBuild || !locale || !region) return null;

  const data: WorldDiagnosticsData = {
    modelResolutions: diagnostics.modelResolutions.map((observation) => ({
      resolutionId: observation.resolutionID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      creatureId: observation.creatureID,
      creatureName: observation.creatureName ?? null,
      attempt: observation.attempt,
      status: observation.status,
      displayId: observation.displayID ?? null,
      modelFileDataId: observation.modelFileID ?? null,
      errorMessage: observation.errorMessage ?? null,
      evidence: observation.evidence,
    })),
    healthObservations: diagnostics.healthObservations.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      creatureId: observation.creatureID,
      creatureName: observation.creatureName ?? null,
      trigger: observation.trigger,
      level: observation.level ?? null,
      classification: observation.classification ?? null,
      currentHealth: String(observation.currentHealth),
      maximumHealth: String(observation.maximumHealth),
      healthPercent: observation.healthPercent,
      isDead: observation.isDead,
      groupSize: observation.groupSize,
      observerLocation: normalizeLocation(observation.observerLocation),
    })),
    encounterAttempts: diagnostics.encounterAttempts.map((attempt) => ({
      attemptId: attempt.attemptID,
      encounterId: attempt.encounterID,
      encounterName: attempt.encounterName,
      difficultyId: attempt.difficultyID,
      groupSize: attempt.groupSize,
      startedAt: toIsoDateTime(attempt.startedAt),
      endedAt: toIsoDateTime(attempt.endedAt),
      success: attempt.success,
      startLocation: normalizeLocation(attempt.startLocation),
      endLocation: normalizeLocation(attempt.endLocation),
      actors: attempt.actors.map((actor) => ({
        creatureId: actor.creatureID,
        creatureName: actor.creatureName ?? null,
        remainingHealthPercent: actor.remainingHealthPercent ?? null,
      })),
    })),
    encounterLoot: diagnostics.encounterLoot.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      encounterId: observation.encounterID,
      itemId: observation.itemID,
      itemLink: observation.itemLink ?? null,
      quantity: observation.quantity,
      itemName: observation.itemName ?? null,
      iconFileName: observation.iconFileName ?? null,
      attemptId: observation.attemptID ?? null,
      location: normalizeLocation(observation.location),
    })),
    lootObservations: diagnostics.lootObservations.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      slotIndex: observation.slotIndex,
      itemId: observation.itemID,
      itemLink: observation.itemLink ?? null,
      itemName: observation.itemName ?? null,
      quantity: observation.quantity,
      sourceType: observation.sourceType,
      sourceId: observation.sourceID ?? null,
      sourceGuid: observation.sourceGuid ?? null,
      sourceQuantity: observation.sourceQuantity ?? null,
      encounterId: observation.encounterID ?? null,
      attemptId: observation.attemptID ?? null,
      observerLocation: normalizeLocation(observation.observerLocation),
    })),
    npcSightings: diagnostics.npcSightings.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      npcId: observation.npcID,
      npcName: observation.npcName ?? null,
      objectType: observation.objectType,
      trigger: observation.trigger,
      level: observation.level ?? null,
      classification: observation.classification ?? null,
      creatureType: observation.creatureType ?? null,
      creatureFamily: observation.creatureFamily ?? null,
      reaction: observation.reaction ?? null,
      canAttack: observation.canAttack,
      isQuestBoss: observation.isQuestBoss,
      isDead: observation.isDead,
      distanceSquared: observation.distanceSquared ?? null,
      subjectPosition: observation.subjectPosition
        ? {
            positionX: observation.subjectPosition.positionX,
            positionY: observation.subjectPosition.positionY,
            positionZ: observation.subjectPosition.positionZ ?? null,
            instanceId: observation.subjectPosition.instanceID ?? null,
            coordinateSystem: observation.subjectPosition.coordinateSystem,
          }
        : null,
      closestPosition: observation.closestPosition
        ? {
            xPos: observation.closestPosition.xPos,
            yPos: observation.closestPosition.yPos,
            distance: observation.closestPosition.distance ?? null,
            coordinateSystem: observation.closestPosition.coordinateSystem,
          }
        : null,
      observerLocation: normalizeLocation(observation.observerLocation),
      positionEvidence: observation.positionEvidence,
    })),
    spellObservations: diagnostics.spellObservations.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      lastSeenAt: toIsoDateTime(observation.lastSeenAt),
      eventCount: observation.eventCount,
      subEvent: observation.subEvent,
      sourceCreatureId: observation.sourceCreatureID,
      sourceCreatureName: observation.sourceCreatureName ?? null,
      destinationCreatureId: observation.destinationCreatureID ?? null,
      destinationCreatureName: observation.destinationCreatureName ?? null,
      spellId: observation.spellID,
      spellName: observation.spellName ?? null,
      spellSchool: observation.spellSchool ?? null,
      encounterId: observation.encounterID ?? null,
      attemptId: observation.attemptID ?? null,
      observerLocation: normalizeLocation(observation.observerLocation),
    })),
    questQueries: Object.values(diagnostics.questQueries)
      .sort((left, right) => left.questID - right.questID)
      .map((observation) => ({
        observationId:
          observation.queryID ??
          uuidFromSha256(
            `${savedVariables.installationId}:quest-query:${observation.questID}:${observation.capturedAt}:${observation.status}`,
          ),
        capturedAt: toIsoDateTime(observation.capturedAt),
        questId: observation.questID,
        status: observation.status,
        title: observation.title ?? null,
        objectives: (observation.objectives ?? []).map((objective) => ({
          text: objective.text ?? null,
          objectiveType: objective.objectiveType ?? null,
          finished: objective.finished,
          numFulfilled: objective.numFulfilled ?? null,
          numRequired: objective.numRequired ?? null,
        })),
        tag: observation.tag
          ? {
              tagId: observation.tag.tagID ?? null,
              tagName: observation.tag.tagName ?? null,
              worldQuestType: observation.tag.worldQuestType ?? null,
              quality: observation.tag.quality ?? null,
              tradeskillLineId: observation.tag.tradeskillLineID ?? null,
              isElite: observation.tag.isElite,
              displayExpiration: observation.tag.displayExpiration,
            }
          : null,
        observerLocation: normalizeLocation(observation.location),
      })),
    questObservations: diagnostics.questObservations.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      evidenceKind: observation.evidenceKind,
      questId: observation.questID,
      title: observation.title ?? null,
      questLevel: observation.questLevel ?? null,
      suggestedGroup: observation.suggestedGroup ?? null,
      questText: observation.questText ?? null,
      objectiveText: observation.objectiveText ?? null,
      progressText: observation.progressText ?? null,
      rewardText: observation.rewardText ?? null,
      xpReward: observation.xpReward ?? null,
      moneyReward: observation.moneyReward ?? null,
      itemId: observation.itemID ?? null,
      itemLink: observation.itemLink ?? null,
      currencyId: observation.currencyID ?? null,
      quantity: observation.quantity ?? null,
      sourceType: observation.sourceType ?? null,
      sourceId: observation.sourceID ?? null,
      sourceName: observation.sourceName ?? null,
      rewards: observation.rewards.map((reward) => ({
        rewardType: reward.rewardType,
        choice: reward.choice,
        rewardId: reward.rewardID,
        name: reward.name ?? null,
        link: reward.link ?? null,
        texture: reward.texture ?? null,
        quantity: reward.quantity,
        quality: reward.quality ?? null,
        isUsable: reward.isUsable,
      })),
      observerLocation: normalizeLocation(observation.observerLocation),
    })),
    vendorObservations: diagnostics.vendorObservations.map((observation) => ({
      observationId: observation.observationID,
      capturedAt: toIsoDateTime(observation.capturedAt),
      sourceType: observation.sourceType ?? null,
      sourceId: observation.sourceID,
      sourceName: observation.sourceName ?? null,
      itemIndex: observation.itemIndex,
      itemId: observation.itemID,
      itemLink: observation.itemLink ?? null,
      itemName: observation.itemName ?? null,
      texture: observation.texture ?? null,
      price: observation.price,
      stackCount: observation.stackCount,
      available: observation.available ?? null,
      isPurchasable: observation.isPurchasable,
      isUsable: observation.isUsable,
      extendedCost: observation.extendedCost,
      costs: observation.costs.map((cost) => ({
        itemId: cost.itemID ?? null,
        currencyId: cost.currencyID ?? null,
        name: cost.name ?? null,
        link: cost.link ?? null,
        texture: cost.texture ?? null,
        quantity: cost.quantity ?? 0,
      })),
      observerLocation: normalizeLocation(observation.observerLocation),
    })),
  };
  const checksum = createHash("sha256")
    .update(canonicalJson(data as JsonValue))
    .digest("hex");
  const identity = {
    addonVersion,
    clientProduct,
    clientBuild,
    locale,
    region,
    anonymousInstallationId: savedVariables.installationId,
    checksum,
  };
  const payloadId = uuidFromSha256(canonicalJson(identity as JsonValue));
  const timestamps = diagnosticTimestamps(data);

  return worldDiagnosticsUploadSchema.parse({
    schemaVersion: "world-diagnostics.v1",
    payloadType: "world_diagnostics",
    payloadId,
    addonVersion,
    clientProduct,
    clientBuild,
    locale,
    region,
    anonymousInstallationId: savedVariables.installationId,
    capturedAt: new Date(timestamps.minimum).toISOString(),
    completedAt: new Date(timestamps.maximum).toISOString(),
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

export async function uploadWorldDiagnostics(
  endpoint: URL,
  apiKey: string,
  upload: WorldDiagnosticsUpload,
  options: RequestOptions = {},
): Promise<UploadReceipt> {
  return uploadPayload(endpoint, apiKey, "/v1/uploads/world-diagnostics", upload, options);
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
  return waitForUploadProcessed(endpoint, apiKey, payloadId, options);
}

export async function waitForWorldDiagnosticsProcessed(
  endpoint: URL,
  apiKey: string,
  payloadId: string,
  options: RequestOptions & {
    readonly pollIntervalMilliseconds?: number;
    readonly timeoutMilliseconds?: number;
  } = {},
): Promise<UploadStatus> {
  return waitForUploadProcessed(endpoint, apiKey, payloadId, options);
}

async function waitForUploadProcessed(
  endpoint: URL,
  apiKey: string,
  payloadId: string,
  options: RequestOptions & {
    readonly pollIntervalMilliseconds?: number;
    readonly timeoutMilliseconds?: number;
  },
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

async function uploadPayload(
  endpoint: URL,
  apiKey: string,
  route: string,
  upload: WorldDiagnosticsUpload,
  options: RequestOptions,
): Promise<UploadReceipt> {
  const response = await fetch(new URL(route, endpoint), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(upload),
    signal: combineSignal(options.signal, 60_000),
  });
  const responseBody: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(responseBody) ?? `HTTP ${response.status}`;
    throw new Error(`Upload ${upload.payloadId} failed: ${message}`);
  }
  return uploadReceiptSchema.parse(responseBody);
}

function normalizeLocation(
  location: CollectorWorldDiagnostics["npcSightings"][number]["observerLocation"],
) {
  return {
    capturedAt: toIsoDateTime(location.capturedAt),
    uiMapId: location.uiMapID ?? null,
    uiX: location.uiX ?? null,
    uiY: location.uiY ?? null,
    positionX: location.positionX ?? null,
    positionY: location.positionY ?? null,
    positionZ: location.positionZ ?? null,
    coordinateSystem: location.coordinateSystem ?? null,
    instanceId: location.instanceID ?? null,
    mapId: location.mapID ?? null,
    instanceType: location.instanceType ?? null,
    difficultyId: location.difficultyID ?? null,
    difficultyName: location.difficultyName ?? null,
  };
}

function toIsoDateTime(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString();
}

function hasDiagnosticEvidence(diagnostics: CollectorWorldDiagnostics): boolean {
  return (
    diagnostics.modelResolutions.length > 0 ||
    diagnostics.healthObservations.length > 0 ||
    diagnostics.encounterAttempts.length > 0 ||
    diagnostics.encounterLoot.length > 0 ||
    diagnostics.lootObservations.length > 0 ||
    diagnostics.npcSightings.length > 0 ||
    diagnostics.spellObservations.length > 0 ||
    Object.keys(diagnostics.questQueries).length > 0 ||
    diagnostics.questObservations.length > 0 ||
    diagnostics.vendorObservations.length > 0
  );
}

function diagnosticTimestamps(data: WorldDiagnosticsData): {
  readonly minimum: number;
  readonly maximum: number;
} {
  const timestamps = [
    ...data.modelResolutions.map((row) => Date.parse(row.capturedAt)),
    ...data.healthObservations.map((row) => Date.parse(row.capturedAt)),
    ...data.encounterAttempts.flatMap((row) => [
      Date.parse(row.startedAt),
      Date.parse(row.endedAt),
    ]),
    ...data.encounterLoot.map((row) => Date.parse(row.capturedAt)),
    ...data.lootObservations.map((row) => Date.parse(row.capturedAt)),
    ...data.npcSightings.map((row) => Date.parse(row.capturedAt)),
    ...data.spellObservations.flatMap((row) => [
      Date.parse(row.capturedAt),
      Date.parse(row.lastSeenAt),
    ]),
    ...data.questQueries.map((row) => Date.parse(row.capturedAt)),
    ...data.questObservations.map((row) => Date.parse(row.capturedAt)),
    ...data.vendorObservations.map((row) => Date.parse(row.capturedAt)),
  ];
  return { minimum: Math.min(...timestamps), maximum: Math.max(...timestamps) };
}

function uuidFromSha256(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hexadecimal = bytes.toString("hex");
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}
