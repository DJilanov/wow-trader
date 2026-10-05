import { z } from "zod";

export const levelingRewardPreviewSchema = z
  .object({
    itemId: z.number().int().positive(),
    name: z.string(),
    build: z.number().int().positive(),
    requiredLevel: z.number().int().nonnegative(),
    slot: z.string(),
    binding: z.string().nullable(),
    stats: z.array(z.string()),
    weaponDps: z.number().nullable(),
    armor: z.number().nullable(),
    vendorCopper: z.number().int().nonnegative().safe(),
    classNames: z.array(z.string()),
  })
  .strict();
export type LevelingRewardPreview = z.infer<typeof levelingRewardPreviewSchema>;
