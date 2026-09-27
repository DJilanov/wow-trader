import { z } from "zod";

const collectorPriceLevelSchema = z.object({
  unitPriceCopper: z.number().int().positive().safe(),
  quantity: z.number().int().positive().safe(),
  listingCount: z.number().int().positive().safe(),
});

const collectorItemSnapshotSchema = z.object({
  itemId: z.number().int().positive().safe(),
  marketKey: z.string().min(1).max(512),
  itemLink: z.string().min(1).max(2_048).nullish(),
  priceLevels: z.array(collectorPriceLevelSchema).min(1).max(10_000),
});

const collectorSourceCharacterSchema = z.object({
  name: z.string().min(1).max(64),
  realmId: z.string().min(1).max(128),
  faction: z.enum(["alliance", "horde", "neutral", "unknown"]),
  guid: z.string().min(1).max(128).nullish(),
});

const collectorProviderSchema = z.enum([
  "blizzard_replicate",
  "blizzard_legacy_getall",
  "auctionator",
  "unknown",
]);

const optionalCountSchema = z.number().int().nonnegative().safe().optional();

export const collectorScanSchema = z
  .object({
    scanId: z.string().uuid(),
    addonVersion: z.string().min(1).max(64),
    clientProduct: z.string().min(1).max(64),
    clientBuild: z.number().int().positive(),
    locale: z.string().regex(/^[a-z]{2}[A-Z]{2}$/),
    region: z.string().min(2).max(8),
    realmId: z.string().min(1).max(128),
    auctionHouseType: z.enum(["alliance", "horde", "neutral", "region", "unknown"]),
    sourceCharacter: collectorSourceCharacterSchema.nullable().optional(),
    capturedAt: z.number().int().positive(),
    completedAt: z.number().int().positive(),
    completeness: z.number().min(0).max(1),
    provider: collectorProviderSchema.optional(),
    apiFlavor: z.string().min(1).max(128).optional(),
    marketKeyVersion: z.number().int().positive().safe().optional(),
    reportedRowCount: optionalCountSchema,
    visitedRowCount: optionalCountSchema,
    pricedRowCount: optionalCountSchema,
    noBuyoutRowCount: optionalCountSchema,
    unresolvedRowCount: optionalCountSchema,
    invalidRowCount: optionalCountSchema,
    secretRowCount: optionalCountSchema,
    scanDurationMs: optionalCountSchema,
    auctionHouseStayedOpen: z.boolean().optional(),
    itemSnapshots: z.array(collectorItemSnapshotSchema).max(250_000),
  })
  .superRefine((scan, context) => {
    if (
      scan.reportedRowCount !== undefined &&
      scan.visitedRowCount !== undefined &&
      scan.visitedRowCount > scan.reportedRowCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Visited row count cannot exceed the reported row count",
        path: ["visitedRowCount"],
      });
    }
  });

const nullableString = (maximum: number) =>
  z.preprocess((value) => (value === "" ? null : value), z.string().min(1).max(maximum).nullish());
const nullableSafeInteger = z.number().int().nonnegative().safe().nullish();

const collectorLocationSchema = z.object({
  capturedAt: z.number().int().positive().safe(),
  uiMapID: nullableSafeInteger,
  uiX: z.number().min(0).max(1).nullish(),
  uiY: z.number().min(0).max(1).nullish(),
  positionX: z.number().finite().nullish(),
  positionY: z.number().finite().nullish(),
  positionZ: z.number().finite().nullish(),
  coordinateSystem: nullableString(128),
  instanceID: nullableSafeInteger,
  mapID: nullableSafeInteger,
  instanceType: nullableString(64),
  difficultyID: nullableSafeInteger,
  difficultyName: nullableString(128),
});

const collectorModelResolutionSchema = z.object({
  resolutionID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
  clientBuild: z.number().int().positive().safe(),
  creatureID: z.number().int().positive().safe(),
  creatureName: nullableString(256),
  attempt: z.number().int().positive().safe(),
  status: z.enum(["resolved", "timeout", "api_error"]),
  displayID: z.number().int().positive().safe().nullish(),
  modelFileID: z.number().int().positive().safe().nullish(),
  errorMessage: nullableString(2_048),
  evidence: z.string().min(1).max(128),
});

const collectorHealthObservationSchema = z.object({
  observationID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
  creatureID: z.number().int().positive().safe(),
  creatureName: nullableString(256),
  trigger: z.string().min(1).max(64),
  level: z.number().int().min(-1).max(255).nullish(),
  classification: nullableString(64),
  currentHealth: z.number().int().nonnegative().safe(),
  maximumHealth: z.number().int().positive().safe(),
  healthPercent: z.number().min(0).max(100),
  isDead: z.boolean(),
  groupSize: z.number().int().nonnegative().safe(),
  observerLocation: collectorLocationSchema,
});

const collectorEncounterActorSchema = z.object({
  creatureID: z.number().int().positive().safe(),
  creatureName: nullableString(256),
  remainingHealthPercent: z.number().min(0).max(100).nullish(),
});

const collectorEncounterAttemptSchema = z.object({
  attemptID: z.string().uuid(),
  encounterID: z.number().int().positive().safe(),
  encounterName: z.string().min(1).max(256),
  difficultyID: z.number().int().nonnegative().safe(),
  groupSize: z.number().int().nonnegative().safe(),
  startedAt: z.number().int().positive().safe(),
  endedAt: z.number().int().positive().safe(),
  success: z.boolean(),
  startLocation: collectorLocationSchema,
  endLocation: collectorLocationSchema,
  actors: z.array(collectorEncounterActorSchema).max(64),
});

const collectorEncounterLootSchema = z.object({
  observationID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
  encounterID: z.number().int().positive().safe(),
  itemID: z.number().int().positive().safe(),
  itemLink: nullableString(2_048),
  quantity: z.number().int().positive().safe(),
  itemName: nullableString(256),
  iconFileName: nullableString(512),
  attemptID: z.string().uuid().nullish(),
  location: collectorLocationSchema,
});

const collectorLootObservationSchema = z.object({
  observationID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
  slotIndex: z.number().int().positive().safe(),
  itemID: z.number().int().positive().safe(),
  itemLink: nullableString(2_048),
  itemName: nullableString(256),
  quantity: z.number().int().positive().safe(),
  sourceType: z.string().min(1).max(64),
  sourceID: z.number().int().positive().safe().nullish(),
  sourceGuid: nullableString(256),
  sourceQuantity: nullableSafeInteger,
  encounterID: z.number().int().positive().safe().nullish(),
  attemptID: z.string().uuid().nullish(),
  observerLocation: collectorLocationSchema,
});

const collectorNpcSightingSchema = z.object({
  observationID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
  npcID: z.number().int().positive().safe(),
  npcName: nullableString(256),
  objectType: z.string().min(1).max(64),
  trigger: z.string().min(1).max(64),
  level: z.number().int().min(-1).max(255).nullish(),
  classification: nullableString(64),
  creatureType: nullableString(128),
  creatureFamily: nullableString(128),
  reaction: z.number().int().min(1).max(8).nullish(),
  canAttack: z.boolean(),
  isQuestBoss: z.boolean(),
  isDead: z.boolean(),
  distanceSquared: z.number().nonnegative().finite().nullish(),
  subjectPosition: z
    .object({
      positionX: z.number().finite(),
      positionY: z.number().finite(),
      positionZ: z.number().finite().nullish(),
      instanceID: nullableSafeInteger,
      coordinateSystem: z.string().min(1).max(128),
    })
    .nullish(),
  closestPosition: z
    .object({
      xPos: z.number().finite(),
      yPos: z.number().finite(),
      distance: z.number().nonnegative().finite().nullish(),
      coordinateSystem: z.string().min(1).max(128),
    })
    .nullish(),
  observerLocation: collectorLocationSchema,
  positionEvidence: z.string().min(1).max(128),
});

const collectorCombatSpellObservationSchema = z.object({
  observationID: z.string().uuid(),
  observationKey: z.string().min(1).max(512),
  capturedAt: z.number().int().positive().safe(),
  lastSeenAt: z.number().int().positive().safe(),
  eventCount: z.number().int().positive().safe(),
  combatLogTimestamp: z.number().finite().nullish(),
  subEvent: z.string().min(1).max(64),
  sourceCreatureID: z.number().int().positive().safe(),
  sourceCreatureName: nullableString(256),
  destinationCreatureID: z.number().int().positive().safe().nullish(),
  destinationCreatureName: nullableString(256),
  spellID: z.number().int().positive().safe(),
  spellName: nullableString(256),
  spellSchool: nullableSafeInteger,
  encounterID: z.number().int().positive().safe().nullish(),
  attemptID: z.string().uuid().nullish(),
  observerLocation: collectorLocationSchema,
});

const collectorQuestObjectiveSchema = z.object({
  text: nullableString(2_048),
  objectiveType: nullableString(128),
  finished: z.boolean(),
  numFulfilled: nullableSafeInteger,
  numRequired: nullableSafeInteger,
});

const collectorQuestTagSchema = z.object({
  tagID: z.number().int().positive().safe().nullish(),
  tagName: nullableString(256),
  worldQuestType: nullableSafeInteger,
  quality: nullableSafeInteger,
  tradeskillLineID: z.number().int().positive().safe().nullish(),
  isElite: z.boolean(),
  displayExpiration: z.boolean(),
});

const collectorQuestQuerySchema = z.object({
  queryID: z.string().uuid().nullish(),
  questID: z.number().int().positive().safe(),
  status: z.enum(["success", "failed", "timeout"]),
  capturedAt: z.number().int().positive().safe(),
  title: nullableString(512),
  objectives: z.array(collectorQuestObjectiveSchema).max(64).nullish(),
  tag: collectorQuestTagSchema.nullish(),
  location: collectorLocationSchema,
});

const collectorQuestQueryRecordSchema = z.preprocess(
  (value) => (Array.isArray(value) && value.length === 0 ? {} : value),
  z.record(z.string(), collectorQuestQuerySchema),
);

const textureReferenceSchema = z
  .union([z.number().int().nonnegative().safe(), z.string().min(1).max(1_024)])
  .nullish();

const collectorQuestRewardSchema = z.object({
  rewardType: z.literal("item"),
  choice: z.boolean(),
  rewardID: z.number().int().positive().safe(),
  name: nullableString(256),
  link: nullableString(2_048),
  texture: textureReferenceSchema,
  quantity: z.number().int().positive().safe(),
  quality: nullableSafeInteger,
  isUsable: z.boolean(),
});

const collectorQuestObservationSchema = z.object({
  observationID: z.string().uuid(),
  capturedAt: z.number().int().positive().safe(),
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
  questID: z.number().int().positive().safe(),
  title: nullableString(512),
  questLevel: z.number().int().min(-1).max(255).nullish(),
  suggestedGroup: nullableSafeInteger,
  questText: nullableString(16_384),
  objectiveText: nullableString(16_384),
  progressText: nullableString(16_384),
  rewardText: nullableString(16_384),
  xpReward: nullableSafeInteger,
  moneyReward: nullableSafeInteger,
  itemID: z.number().int().positive().safe().nullish(),
  itemLink: nullableString(2_048),
  currencyID: z.number().int().positive().safe().nullish(),
  quantity: nullableSafeInteger,
  sourceType: nullableString(64),
  sourceID: z.number().int().positive().safe().nullish(),
  sourceName: nullableString(256),
  rewards: z.array(collectorQuestRewardSchema).max(128).default([]),
  observerLocation: collectorLocationSchema,
});

const collectorVendorCostSchema = z.object({
  itemID: z.number().int().positive().safe().nullish(),
  currencyID: z.number().int().positive().safe().nullish(),
  name: nullableString(256),
  link: nullableString(2_048),
  texture: textureReferenceSchema,
  quantity: nullableSafeInteger,
});

const collectorVendorObservationSchema = z.object({
  observationID: z.string().uuid(),
  observationKey: z.string().min(1).max(512),
  capturedAt: z.number().int().positive().safe(),
  sourceType: nullableString(64),
  sourceID: z.number().int().positive().safe(),
  sourceName: nullableString(256),
  itemIndex: z.number().int().positive().safe(),
  itemID: z.number().int().positive().safe(),
  itemLink: nullableString(2_048),
  itemName: nullableString(256),
  texture: textureReferenceSchema,
  price: z.number().int().nonnegative().safe(),
  stackCount: z.number().int().positive().safe(),
  available: z.number().int().min(-1).safe().nullish(),
  isPurchasable: z.boolean(),
  isUsable: z.boolean(),
  extendedCost: z.boolean(),
  costs: z.array(collectorVendorCostSchema).max(32).default([]),
  observerLocation: collectorLocationSchema,
});

export const collectorWorldDiagnosticsSchema = z.object({
  schemaVersion: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  addonVersion: nullableString(64),
  clientProduct: nullableString(64),
  clientBuild: z.number().int().positive().safe().nullish(),
  locale: z
    .string()
    .regex(/^[a-z]{2}[A-Z]{2}$/)
    .nullish(),
  region: z.string().min(2).max(8).nullish(),
  encounterAttempts: z.array(collectorEncounterAttemptSchema).max(100).default([]),
  encounterLoot: z.array(collectorEncounterLootSchema).max(1_000).default([]),
  npcSightings: z.array(collectorNpcSightingSchema).max(5_000).default([]),
  lootObservations: z.array(collectorLootObservationSchema).max(5_000).default([]),
  healthObservations: z.array(collectorHealthObservationSchema).max(5_000).default([]),
  modelResolutions: z.array(collectorModelResolutionSchema).max(1_000).default([]),
  spellObservations: z.array(collectorCombatSpellObservationSchema).max(20_000).default([]),
  questQueries: collectorQuestQueryRecordSchema.default({}),
  questObservations: z.array(collectorQuestObservationSchema).max(10_000).default([]),
  vendorObservations: z.array(collectorVendorObservationSchema).max(10_000).default([]),
});

export const collectorSavedVariablesSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string().min(16).max(128),
  scans: z.array(collectorScanSchema).max(8),
  worldDiagnostics: collectorWorldDiagnosticsSchema.optional(),
});

export type CollectorScan = z.infer<typeof collectorScanSchema>;
export type CollectorWorldDiagnostics = z.infer<typeof collectorWorldDiagnosticsSchema>;
export type CollectorSavedVariables = z.infer<typeof collectorSavedVariablesSchema>;
