import { z } from "zod";

import {
  isoDateTimeSchema,
  localeSchema,
  positiveCopperSchema,
  sha256Schema,
  wowIdSchema,
} from "./primitives.js";

export const auctionHouseTypeSchema = z.enum(["alliance", "horde", "neutral", "region", "unknown"]);

export const auctionScanProviderSchema = z.enum([
  "blizzard_replicate",
  "blizzard_legacy_getall",
  "auctionator",
  "unknown",
]);

const nonnegativeIntegerSchema = z.number().int().nonnegative().safe();

export const sourceCharacterSchema = z.object({
  name: z.string().min(1).max(64),
  realmId: z.string().min(1).max(128),
  faction: z.enum(["alliance", "horde", "neutral", "unknown"]),
  guid: z.string().min(1).max(128).nullable(),
});

export const auctionPriceLevelSchema = z.object({
  unitPriceCopper: positiveCopperSchema,
  quantity: z.number().int().positive(),
  listingCount: z.number().int().positive(),
});

export const auctionItemSnapshotSchema = z.object({
  itemId: wowIdSchema,
  marketKey: z.string().min(1).max(512),
  itemLink: z.string().min(1).max(2_048).nullable(),
  priceLevels: z.array(auctionPriceLevelSchema).min(1).max(10_000),
});

export const auctionScanDataSchema = z
  .object({
    scanId: z.string().uuid(),
    itemSnapshots: z.array(auctionItemSnapshotSchema).max(250_000),
  })
  .superRefine((value, context) => {
    const marketKeys = new Set<string>();

    value.itemSnapshots.forEach((snapshot, snapshotIndex) => {
      if (marketKeys.has(snapshot.marketKey)) {
        context.addIssue({
          code: "custom",
          message: "Market keys must be unique within a scan",
          path: ["itemSnapshots", snapshotIndex, "marketKey"],
        });
      }
      marketKeys.add(snapshot.marketKey);

      const prices = new Set<string>();
      snapshot.priceLevels.forEach((level, levelIndex) => {
        if (prices.has(level.unitPriceCopper)) {
          context.addIssue({
            code: "custom",
            message: "Price levels must be unique for a market key",
            path: ["itemSnapshots", snapshotIndex, "priceLevels", levelIndex, "unitPriceCopper"],
          });
        }
        prices.add(level.unitPriceCopper);
      });
    });
  });

export const auctionScanUploadSchema = z
  .object({
    schemaVersion: z.literal("auction-scan.v1"),
    payloadType: z.literal("auction_scan"),
    payloadId: z.string().uuid(),
    addonVersion: z.string().min(1).max(64),
    clientProduct: z.string().min(1).max(64),
    clientBuild: z.number().int().positive(),
    locale: localeSchema,
    region: z.string().min(2).max(8),
    realmId: z.string().min(1).max(128),
    auctionHouseType: auctionHouseTypeSchema,
    sourceCharacter: sourceCharacterSchema.nullable().optional(),
    anonymousInstallationId: z.string().min(16).max(128),
    capturedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    completeness: z.number().min(0).max(1),
    provider: auctionScanProviderSchema.optional(),
    apiFlavor: z.string().min(1).max(128).optional(),
    marketKeyVersion: z.number().int().positive().safe().optional(),
    reportedRowCount: nonnegativeIntegerSchema.optional(),
    visitedRowCount: nonnegativeIntegerSchema.optional(),
    pricedRowCount: nonnegativeIntegerSchema.optional(),
    noBuyoutRowCount: nonnegativeIntegerSchema.optional(),
    unresolvedRowCount: nonnegativeIntegerSchema.optional(),
    invalidRowCount: nonnegativeIntegerSchema.optional(),
    secretRowCount: nonnegativeIntegerSchema.optional(),
    scanDurationMs: nonnegativeIntegerSchema.optional(),
    auctionHouseStayedOpen: z.boolean().optional(),
    checksum: sha256Schema,
    data: auctionScanDataSchema,
  })
  .refine((value) => Date.parse(value.completedAt) >= Date.parse(value.capturedAt), {
    message: "Scan completion cannot precede scan start",
    path: ["completedAt"],
  });

const nullableWowIdSchema = wowIdSchema.nullable();

export const worldObservationLocationSchema = z.object({
  capturedAt: isoDateTimeSchema,
  uiMapId: nullableWowIdSchema,
  uiX: z.number().min(0).max(1).nullable(),
  uiY: z.number().min(0).max(1).nullable(),
  positionX: z.number().finite().nullable(),
  positionY: z.number().finite().nullable(),
  positionZ: z.number().finite().nullable(),
  coordinateSystem: z.string().min(1).max(128).nullable(),
  instanceId: nonnegativeIntegerSchema.nullable(),
  mapId: nonnegativeIntegerSchema.nullable(),
  instanceType: z.string().min(1).max(64).nullable(),
  difficultyId: nonnegativeIntegerSchema.nullable(),
  difficultyName: z.string().min(1).max(128).nullable(),
});

export const worldModelResolutionSchema = z.object({
  resolutionId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  creatureId: wowIdSchema,
  creatureName: z.string().min(1).max(256).nullable(),
  attempt: z.number().int().positive().safe(),
  status: z.enum(["resolved", "timeout", "api_error"]),
  displayId: nullableWowIdSchema,
  modelFileDataId: nullableWowIdSchema,
  errorMessage: z.string().max(2_048).nullable(),
  evidence: z.string().min(1).max(128),
});

export const worldHealthObservationSchema = z
  .object({
    observationId: z.string().uuid(),
    capturedAt: isoDateTimeSchema,
    creatureId: wowIdSchema,
    creatureName: z.string().min(1).max(256).nullable(),
    trigger: z.string().min(1).max(64),
    level: z.number().int().min(-1).max(255).nullable(),
    classification: z.string().min(1).max(64).nullable(),
    currentHealth: z.string().regex(/^\d+$/),
    maximumHealth: z.string().regex(/^[1-9]\d*$/),
    healthPercent: z.number().min(0).max(100),
    isDead: z.boolean(),
    groupSize: nonnegativeIntegerSchema,
    observerLocation: worldObservationLocationSchema,
  })
  .refine((value) => BigInt(value.currentHealth) <= BigInt(value.maximumHealth), {
    message: "Current health cannot exceed maximum health",
    path: ["currentHealth"],
  });

export const worldEncounterActorSchema = z.object({
  creatureId: wowIdSchema,
  creatureName: z.string().min(1).max(256).nullable(),
  remainingHealthPercent: z.number().min(0).max(100).nullable(),
});

export const worldEncounterAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  encounterId: wowIdSchema,
  encounterName: z.string().min(1).max(256),
  difficultyId: nonnegativeIntegerSchema,
  groupSize: nonnegativeIntegerSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema,
  success: z.boolean(),
  startLocation: worldObservationLocationSchema,
  endLocation: worldObservationLocationSchema,
  actors: z.array(worldEncounterActorSchema).max(64),
});

export const worldEncounterLootObservationSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  encounterId: wowIdSchema,
  itemId: wowIdSchema,
  itemLink: z.string().min(1).max(2_048).nullable(),
  quantity: z.number().int().positive().safe(),
  itemName: z.string().min(1).max(256).nullable(),
  iconFileName: z.string().min(1).max(512).nullable(),
  attemptId: z.string().uuid().nullable(),
  location: worldObservationLocationSchema,
});

export const worldLootObservationSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  slotIndex: z.number().int().positive().safe(),
  itemId: wowIdSchema,
  itemLink: z.string().min(1).max(2_048).nullable(),
  itemName: z.string().min(1).max(256).nullable(),
  quantity: z.number().int().positive().safe(),
  sourceType: z.string().min(1).max(64),
  sourceId: nullableWowIdSchema,
  sourceGuid: z.string().min(1).max(256).nullable(),
  sourceQuantity: nonnegativeIntegerSchema.nullable(),
  encounterId: nullableWowIdSchema,
  attemptId: z.string().uuid().nullable(),
  observerLocation: worldObservationLocationSchema,
});

export const worldNpcSightingSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  npcId: wowIdSchema,
  npcName: z.string().min(1).max(256).nullable(),
  objectType: z.string().min(1).max(64),
  trigger: z.string().min(1).max(64),
  level: z.number().int().min(-1).max(255).nullable(),
  classification: z.string().min(1).max(64).nullable(),
  creatureType: z.string().min(1).max(128).nullable(),
  creatureFamily: z.string().min(1).max(128).nullable(),
  reaction: z.number().int().min(1).max(8).nullable(),
  canAttack: z.boolean(),
  isQuestBoss: z.boolean(),
  isDead: z.boolean(),
  distanceSquared: z.number().nonnegative().finite().nullable(),
  subjectPosition: z
    .object({
      positionX: z.number().finite(),
      positionY: z.number().finite(),
      positionZ: z.number().finite().nullable(),
      instanceId: nonnegativeIntegerSchema.nullable(),
      coordinateSystem: z.string().min(1).max(128),
    })
    .nullable(),
  closestPosition: z
    .object({
      xPos: z.number().finite(),
      yPos: z.number().finite(),
      distance: z.number().nonnegative().finite().nullable(),
      coordinateSystem: z.string().min(1).max(128),
    })
    .nullable(),
  observerLocation: worldObservationLocationSchema,
  positionEvidence: z.string().min(1).max(128),
});

export const worldCombatSpellObservationSchema = z
  .object({
    observationId: z.string().uuid(),
    capturedAt: isoDateTimeSchema,
    lastSeenAt: isoDateTimeSchema,
    eventCount: z.number().int().positive().safe(),
    subEvent: z.string().min(1).max(64),
    sourceCreatureId: wowIdSchema,
    sourceCreatureName: z.string().min(1).max(256).nullable(),
    destinationCreatureId: nullableWowIdSchema,
    destinationCreatureName: z.string().min(1).max(256).nullable(),
    spellId: wowIdSchema,
    spellName: z.string().min(1).max(256).nullable(),
    spellSchool: nonnegativeIntegerSchema.nullable(),
    encounterId: nullableWowIdSchema,
    attemptId: z.string().uuid().nullable(),
    observerLocation: worldObservationLocationSchema,
  })
  .refine((value) => Date.parse(value.lastSeenAt) >= Date.parse(value.capturedAt), {
    message: "Last seen time cannot precede the first observation",
    path: ["lastSeenAt"],
  });

export const worldQuestObjectiveObservationSchema = z.object({
  text: z.string().max(2_048).nullable(),
  objectiveType: z.string().max(128).nullable(),
  finished: z.boolean(),
  numFulfilled: nonnegativeIntegerSchema.nullable(),
  numRequired: nonnegativeIntegerSchema.nullable(),
});

export const worldQuestTagObservationSchema = z.object({
  tagId: nullableWowIdSchema,
  tagName: z.string().min(1).max(256).nullable(),
  worldQuestType: nonnegativeIntegerSchema.nullable(),
  quality: nonnegativeIntegerSchema.nullable(),
  tradeskillLineId: nullableWowIdSchema,
  isElite: z.boolean(),
  displayExpiration: z.boolean(),
});

export const worldQuestQueryObservationSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  questId: wowIdSchema,
  status: z.enum(["success", "failed", "timeout"]),
  title: z.string().min(1).max(512).nullable(),
  objectives: z.array(worldQuestObjectiveObservationSchema).max(64),
  tag: worldQuestTagObservationSchema.nullable(),
  observerLocation: worldObservationLocationSchema,
});

export const worldQuestRewardObservationSchema = z.object({
  rewardType: z.literal("item"),
  choice: z.boolean(),
  rewardId: wowIdSchema,
  name: z.string().min(1).max(256).nullable(),
  link: z.string().min(1).max(2_048).nullable(),
  texture: z.union([nonnegativeIntegerSchema, z.string().min(1).max(1_024)]).nullable(),
  quantity: z.number().int().positive().safe(),
  quality: nonnegativeIntegerSchema.nullable(),
  isUsable: z.boolean(),
});

export const worldQuestObservationSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  evidenceKind: z.enum([
    "accepted",
    "completed",
    "item_reward",
    "currency_reward",
    "detail",
    "progress",
    "completion_dialog",
    "gossip_available",
    "gossip_active",
  ]),
  questId: wowIdSchema,
  title: z.string().min(1).max(512).nullable(),
  questLevel: z.number().int().min(-1).max(255).nullable(),
  suggestedGroup: nonnegativeIntegerSchema.nullable(),
  questText: z.string().min(1).max(16_384).nullable(),
  objectiveText: z.string().min(1).max(16_384).nullable(),
  progressText: z.string().min(1).max(16_384).nullable(),
  rewardText: z.string().min(1).max(16_384).nullable(),
  xpReward: nonnegativeIntegerSchema.nullable(),
  moneyReward: nonnegativeIntegerSchema.nullable(),
  itemId: nullableWowIdSchema,
  itemLink: z.string().min(1).max(2_048).nullable(),
  currencyId: nullableWowIdSchema,
  quantity: nonnegativeIntegerSchema.nullable(),
  sourceType: z.string().min(1).max(64).nullable(),
  sourceId: nullableWowIdSchema,
  sourceName: z.string().min(1).max(256).nullable(),
  rewards: z.array(worldQuestRewardObservationSchema).max(128),
  observerLocation: worldObservationLocationSchema,
});

export const worldVendorCostObservationSchema = z.object({
  itemId: nullableWowIdSchema,
  currencyId: nullableWowIdSchema,
  name: z.string().min(1).max(256).nullable(),
  link: z.string().min(1).max(2_048).nullable(),
  texture: z.union([nonnegativeIntegerSchema, z.string().min(1).max(1_024)]).nullable(),
  quantity: nonnegativeIntegerSchema,
});

export const worldVendorObservationSchema = z.object({
  observationId: z.string().uuid(),
  capturedAt: isoDateTimeSchema,
  sourceType: z.string().min(1).max(64).nullable(),
  sourceId: wowIdSchema,
  sourceName: z.string().min(1).max(256).nullable(),
  itemIndex: z.number().int().positive().safe(),
  itemId: wowIdSchema,
  itemLink: z.string().min(1).max(2_048).nullable(),
  itemName: z.string().min(1).max(256).nullable(),
  texture: z.union([nonnegativeIntegerSchema, z.string().min(1).max(1_024)]).nullable(),
  price: nonnegativeIntegerSchema,
  stackCount: z.number().int().positive().safe(),
  available: z.number().int().min(-1).safe().nullable(),
  isPurchasable: z.boolean(),
  isUsable: z.boolean(),
  extendedCost: z.boolean(),
  costs: z.array(worldVendorCostObservationSchema).max(32),
  observerLocation: worldObservationLocationSchema,
});

export const worldDiagnosticsDataSchema = z.object({
  modelResolutions: z.array(worldModelResolutionSchema).max(1_000),
  healthObservations: z.array(worldHealthObservationSchema).max(5_000),
  encounterAttempts: z.array(worldEncounterAttemptSchema).max(100),
  encounterLoot: z.array(worldEncounterLootObservationSchema).max(1_000),
  lootObservations: z.array(worldLootObservationSchema).max(5_000),
  npcSightings: z.array(worldNpcSightingSchema).max(5_000),
  spellObservations: z.array(worldCombatSpellObservationSchema).max(20_000),
  questQueries: z.array(worldQuestQueryObservationSchema).max(10_000),
  questObservations: z.array(worldQuestObservationSchema).max(10_000),
  vendorObservations: z.array(worldVendorObservationSchema).max(10_000),
});

export const worldDiagnosticsUploadSchema = z
  .object({
    schemaVersion: z.literal("world-diagnostics.v1"),
    payloadType: z.literal("world_diagnostics"),
    payloadId: z.string().uuid(),
    addonVersion: z.string().min(1).max(64),
    clientProduct: z.string().min(1).max(64),
    clientBuild: z.number().int().positive().safe(),
    locale: localeSchema,
    region: z.string().min(2).max(8),
    anonymousInstallationId: z.string().min(16).max(128),
    capturedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    checksum: sha256Schema,
    data: worldDiagnosticsDataSchema,
  })
  .refine((value) => Date.parse(value.completedAt) >= Date.parse(value.capturedAt), {
    message: "Diagnostics completion cannot precede the first observation",
    path: ["completedAt"],
  });

export const uploadStatusSchema = z.object({
  payloadId: z.string().uuid(),
  payloadType: z.string().min(1),
  status: z.enum(["accepted", "processing", "processed", "rejected"]),
  receivedAt: isoDateTimeSchema,
  rawPayloadUri: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
});

export const uploadReceiptSchema = z.object({
  payloadId: z.string().uuid(),
  status: z.enum(["accepted", "processed"]),
  duplicate: z.boolean(),
});

export type AuctionScanUpload = z.infer<typeof auctionScanUploadSchema>;
export type AuctionScanData = z.infer<typeof auctionScanDataSchema>;
export type AuctionItemSnapshot = z.infer<typeof auctionItemSnapshotSchema>;
export type AuctionPriceLevel = z.infer<typeof auctionPriceLevelSchema>;
export type WorldObservationLocation = z.infer<typeof worldObservationLocationSchema>;
export type WorldDiagnosticsData = z.infer<typeof worldDiagnosticsDataSchema>;
export type WorldDiagnosticsUpload = z.infer<typeof worldDiagnosticsUploadSchema>;
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
export type UploadReceipt = z.infer<typeof uploadReceiptSchema>;
