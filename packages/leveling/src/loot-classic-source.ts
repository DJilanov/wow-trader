import { z } from "zod";

const id = z.number().int().positive().max(10_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().min(1).max(300);

export const classicLootSourceSchema = z
  .object({
    kind: z.literal("classic-1.12-reference"),
    repository: z.literal("https://github.com/cmangos/classic-db"),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    file: z.string().regex(/^Full_DB\/ClassicDB_1_12_1_[A-Za-z0-9_]+\.sql\.gz$/),
    sha256: hash,
    sourceBuild: z.literal(5875),
    referencedAt: z.iso.datetime(),
  })
  .strict();
export type ClassicLootSource = z.infer<typeof classicLootSourceSchema>;

export function classicLootSourceUrl(source: ClassicLootSource): string {
  return `${source.repository}/blob/${source.revision}/${source.file}`;
}

export const classicLootStackReferenceSchema = classicLootSourceSchema
  .extend({
    itemId: id,
    npcId: id,
    lootEntry: id,
    minimumQuantity: z.literal(1),
    maximumQuantity: z.literal(1),
  })
  .strict();

export const classicLootProbabilityReferenceSchema = classicLootSourceSchema
  .extend({
    itemId: id,
    npcId: id,
    lootEntry: id,
    probability: z.number().positive().max(1),
    questOnly: z.boolean(),
    rateMultiplier: z.literal(1),
  })
  .strict();

export const classicLootSharingReferenceSchema = classicLootSourceSchema
  .extend({ itemId: id, itemFlags: z.number().int().min(0).max(0xffffffff) })
  .strict();
export type ClassicLootSharingReference = z.infer<typeof classicLootSharingReferenceSchema>;

export const classicLootReferenceSchema = z
  .object({
    schema: z.literal("classic-loot-reference.v1"),
    targetBuild: z.number().int().positive(),
    targetCombatSha256: hash,
    source: classicLootSourceSchema,
    items: z
      .array(
        z.object({ itemId: id, name, flags: z.number().int().min(0).max(0xffffffff) }).strict(),
      )
      .max(10000),
    drops: z
      .array(
        z
          .object({
            itemId: id,
            itemName: name,
            npcId: id,
            npcName: name,
            lootEntry: id,
            minimumQuantity: z.literal(1),
            maximumQuantity: z.literal(1),
            probability: z.number().positive().max(1).optional(),
            questOnly: z.boolean().optional(),
          })
          .strict()
          .refine(
            (drop) => (drop.probability === undefined) === (drop.questOnly === undefined),
            "Historical probability and quest context must be supplied together.",
          ),
      )
      .max(10000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.items.map((item) => item.itemId)).size !== value.items.length)
      context.addIssue({ code: "custom", message: "Duplicate historical item identity." });
    const items = new Map(value.items.map((item) => [item.itemId, item]));
    if (
      new Set(value.drops.map((drop) => `${drop.npcId}:${drop.itemId}`)).size !== value.drops.length
    )
      context.addIssue({ code: "custom", message: "Duplicate historical drop identity." });
    if (value.drops.some((drop) => items.get(drop.itemId)?.name !== drop.itemName))
      context.addIssue({ code: "custom", message: "Historical drop and item identities differ." });
  });
export type ClassicLootReference = z.infer<typeof classicLootReferenceSchema>;
