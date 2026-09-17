import { z } from "zod";

const collectorPriceLevelSchema = z.object({
  unitPriceCopper: z.number().int().positive().safe(),
  quantity: z.number().int().positive().safe(),
  listingCount: z.number().int().positive().safe(),
});

const collectorItemSnapshotSchema = z.object({
  itemId: z.number().int().positive().safe(),
  marketKey: z.string().min(1).max(512),
  itemLink: z.string().min(1).max(2_048),
  priceLevels: z.array(collectorPriceLevelSchema).min(1).max(10_000),
});

const collectorSourceCharacterSchema = z.object({
  name: z.string().min(1).max(64),
  realmId: z.string().min(1).max(128),
  faction: z.enum(["alliance", "horde", "neutral", "unknown"]),
  guid: z.string().min(1).max(128).nullable(),
});

export const collectorScanSchema = z.object({
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
  itemSnapshots: z.array(collectorItemSnapshotSchema).max(250_000),
});

export const collectorSavedVariablesSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string().min(16).max(128),
  scans: z.array(collectorScanSchema).max(8),
});

export type CollectorScan = z.infer<typeof collectorScanSchema>;
export type CollectorSavedVariables = z.infer<typeof collectorSavedVariablesSchema>;
