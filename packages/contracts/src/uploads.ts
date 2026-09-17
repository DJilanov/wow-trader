import { z } from "zod";

import {
  isoDateTimeSchema,
  localeSchema,
  positiveCopperSchema,
  sha256Schema,
  wowIdSchema,
} from "./primitives.js";

export const auctionHouseTypeSchema = z.enum(["alliance", "horde", "neutral", "region", "unknown"]);

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
    checksum: sha256Schema,
    data: auctionScanDataSchema,
  })
  .refine((value) => Date.parse(value.completedAt) >= Date.parse(value.capturedAt), {
    message: "Scan completion cannot precede scan start",
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
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
export type UploadReceipt = z.infer<typeof uploadReceiptSchema>;
