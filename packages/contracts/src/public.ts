import { z } from "zod";

import { isoDateTimeSchema } from "./primitives.js";

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
