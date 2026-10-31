import { z } from "zod";
import { positiveCopperSchema } from "./primitives.js";

export const traderWatchSchema = z.object({
  product: z.enum(["wow_classic_beta", "wow_anniversary"]),
  market: z
    .string()
    .max(200)
    .regex(/^[A-Z]{2,10}\|[A-Za-z0-9 _.'-]{1,120}\|(alliance|horde|neutral|region|unknown)$/),
  itemId: z.number().int().positive().max(100_000_000),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) =>
      [...value].every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ),
  maximumBuyCopper: positiveCopperSchema.nullable().default(null),
  minimumProfitCopper: z
    .string()
    .regex(/^\d{1,16}$/)
    .default("0"),
  maximumUnits: z.number().int().min(1).max(100).default(100),
  cooldownMinutes: z.number().int().min(5).max(1440).default(60),
});
export type TraderWatch = z.infer<typeof traderWatchSchema>;
export const traderWatchChangeSchema = z.object({
  changeId: z.string().uuid(),
  action: z.enum(["watch", "unwatch"]),
  item: traderWatchSchema,
});
export const traderTradeSchema = z
  .object({
    eventId: z.string().uuid(),
    sourceKey: z.string().min(1).max(512),
    product: z.enum(["wow_classic_beta", "wow_anniversary"]),
    clientBuild: z.number().int().positive(),
    market: traderWatchSchema.shape.market,
    characterName: z.string().trim().min(1).max(64),
    itemId: traderWatchSchema.shape.itemId,
    itemName: traderWatchSchema.shape.name,
    quantity: z.number().int().min(1).max(1_000_000),
    kind: z.enum(["purchase", "sale", "expired", "cancelled", "deposit_paid"]),
    amountCopper: z.string().regex(/^\d{1,16}$/),
    auctionFeeCopper: z
      .string()
      .regex(/^\d{1,16}$/)
      .nullable(),
    depositCopper: z
      .string()
      .regex(/^\d{1,16}$/)
      .nullable(),
    occurredAt: z.string().datetime(),
    postedAt: z.string().datetime().nullable().default(null),
    evidence: z.enum(["mail_receipt", "manual"]),
  })
  .superRefine((event, context) => {
    if (
      Date.parse(event.occurredAt) > Date.now() + 300_000 ||
      (event.postedAt && Date.parse(event.postedAt) > Date.parse(event.occurredAt))
    )
      context.addIssue({ code: "custom", message: "Invalid trade timestamps" });
    if (["purchase", "sale"].includes(event.kind) && BigInt(event.amountCopper) === 0n)
      context.addIssue({
        code: "custom",
        message: "Purchases and sales require a positive actual amount",
      });
    if (
      event.kind === "sale" &&
      event.auctionFeeCopper !== null &&
      BigInt(event.auctionFeeCopper) > BigInt(event.amountCopper)
    )
      context.addIssue({ code: "custom", message: "A sale fee cannot exceed its gross price" });
  });
export type TraderTrade = z.infer<typeof traderTradeSchema>;
export const traderSyncSchema = z.object({
  trades: z.array(traderTradeSchema).max(500).default([]),
  watchChanges: z.array(traderWatchChangeSchema).max(100).default([]),
});
export const traderSyncResponseSchema = z.object({
  tradesAccepted: z.number().int().nonnegative(),
  watchChangesAccepted: z.array(z.string().uuid()),
  watches: z.array(traderWatchSchema).max(50),
  generatedAt: z.string().datetime(),
});
export const pairingStartSchema = z.object({ label: z.string().trim().min(1).max(80) });
export const pairingStartResponseSchema = z.object({
  deviceCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  userCode: z.string().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  verificationUri: z.string().url(),
  expiresAt: z.string().datetime(),
  intervalSeconds: z.literal(5),
});
export const pairingPollSchema = z.object({
  deviceCode: pairingStartResponseSchema.shape.deviceCode,
});
export const pairingPollResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({
    status: z.literal("connected"),
    credential: z.string().regex(/^wtc_[A-Za-z0-9_-]{43}$/),
    installationId: z.string().uuid(),
  }),
  z.object({ status: z.literal("expired") }),
]);

export type TraderSync = z.infer<typeof traderSyncSchema>;
