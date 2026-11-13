import { z } from "zod";

export const clientValuationItemSchema = z.tuple([
  z.number().int().positive(),
  z.union([z.literal(2), z.literal(4)]),
  z.number().int().min(2).max(4),
  z.number().int().nonnegative(),
  z.boolean(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.boolean(),
]);
export const clientValuationPackSchema = z
  .object({
    schemaVersion: z.literal("client-valuation.v1"),
    clientProduct: z.string().min(1).max(64),
    clientBuild: z.number().int().positive(),
    hotfixSha256: z.string().regex(/^[a-f0-9]{64}$/),
    definitionsRevision: z.string().regex(/^[a-f0-9]{40}$/),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    items: z.array(clientValuationItemSchema).max(100_000),
  })
  .superRefine((pack, context) => {
    if (new Set(pack.items.map((row) => row[0])).size !== pack.items.length)
      context.addIssue({
        code: "custom",
        message: "Duplicate client valuation item IDs.",
        path: ["items"],
      });
  });
export type ClientValuationPack = z.infer<typeof clientValuationPackSchema>;
