import { z } from "zod";

import { isoDateTimeSchema, positiveCopperSchema } from "./primitives.js";

export const publicDataStatusSchema = z.object({
  service: z.literal("wow-trader"),
  status: z.enum(["ready", "degraded"]),
  catalog: z.object({
    product: z.string().nullable(),
    clientVersion: z.string().nullable(),
    buildNumber: z.number().int().positive().nullable(),
    locale: z.string().nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    itemCount: z.number().int().nonnegative(),
    recipeCount: z.number().int().nonnegative(),
  }),
  market: z.object({
    region: z.string().nullable(),
    realmId: z.string().nullable(),
    auctionHouseType: z.string().nullable(),
    lastScanAt: isoDateTimeSchema.nullable(),
    completeness: z.number().min(0).max(1).nullable(),
    itemCount: z.number().int().nonnegative(),
  }),
  generatedAt: isoDateTimeSchema,
});

export type PublicDataStatus = z.infer<typeof publicDataStatusSchema>;

export const marketSignalKindSchema = z.enum([
  "collecting",
  "bargain",
  "normal",
  "rising",
  "spike_risk",
  "oversupplied",
  "falling",
  "too_thin",
]);

const copperStringSchema = z.string().regex(/^\d+$/);

export const marketHistoryObservationSchema = z.object({
  observedAt: isoDateTimeSchema,
  priceCopper: positiveCopperSchema,
  availableQuantity: z.number().int().nonnegative(),
  listingCount: z.number().int().nonnegative(),
  completeness: z.number().min(0).max(1),
});

export const marketIntelligenceItemSchema = z.object({
  itemId: z.number().int().positive(),
  name: z.string().min(1).max(512).nullable(),
  signal: marketSignalKindSchema,
  observationCount: z.number().int().nonnegative(),
  minimumObservationCount: z.number().int().positive(),
  currentPriceCopper: copperStringSchema.nullable(),
  normalPriceCopper: copperStringSchema.nullable(),
  lowerPriceCopper: copperStringSchema.nullable(),
  upperPriceCopper: copperStringSchema.nullable(),
  differenceBasisPoints: z.number().int().nullable(),
  currentQuantity: z.number().int().nonnegative().nullable(),
  normalQuantity: z.number().int().nonnegative().nullable(),
  supplyRatioBasisPoints: z.number().int().nonnegative().nullable(),
  currentListingCount: z.number().int().nonnegative().nullable(),
  confidenceBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  direction: z.enum(["up", "flat", "down"]).nullable(),
  historyStartedAt: isoDateTimeSchema.nullable().optional(),
  recentObservationCount: z.number().int().nonnegative().optional(),
  history: z.array(marketHistoryObservationSchema).max(336).optional(),
  levels: z
    .array(
      z.object({
        unitPriceCopper: positiveCopperSchema,
        quantity: z.number().int().positive(),
        listingCount: z.number().int().positive(),
      }),
    )
    .max(25_000)
    .optional(),
});

export const marketIntelligencePackSchema = z.object({
  schemaVersion: z.literal("market-intelligence.v1"),
  modelVersion: z.literal("robust-market-signal-v1"),
  clientProduct: z.string().min(1).max(64),
  clientBuild: z.number().int().positive(),
  region: z.string().min(2).max(8),
  realmId: z.string().min(1).max(128),
  auctionHouseType: z.enum(["alliance", "horde", "neutral", "region", "unknown"]),
  generatedAt: isoDateTimeSchema,
  sourceScanAt: isoDateTimeSchema,
  sourceScanId: z.string().uuid().optional(),
  historyPolicy: z.literal("robust-market-history-v1").optional(),
  historyBuilds: z.array(z.number().int().positive()).max(100).optional(),
  historyRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  nextAfterItemId: z.number().int().positive().nullable().optional(),
  items: z.array(marketIntelligenceItemSchema).max(250_000),
});

export const marketIntelligenceQuerySchema = z.object({
  clientProduct: z.string().min(1).max(64),
  clientBuild: z.coerce.number().int().positive(),
  region: z.string().min(2).max(8),
  realmId: z.string().min(1).max(128),
  auctionHouseType: z.enum(["alliance", "horde", "neutral", "region", "unknown"]),
  afterItemId: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(1_000).optional(),
  asOfScanId: z.string().uuid().optional(),
});

export type MarketIntelligenceItem = z.infer<typeof marketIntelligenceItemSchema>;
export type MarketIntelligencePack = z.infer<typeof marketIntelligencePackSchema>;
export type MarketIntelligenceQuery = z.infer<typeof marketIntelligenceQuerySchema>;
