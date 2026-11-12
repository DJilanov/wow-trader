import { z } from "zod";

const id = z.number().int().positive().max(10_000_000);
export const MAXIMUM_GROUND_COLLECTION_QUANTITY = 10_000;

/** One objective corroborated by the item/object export and a source pickup instruction. */
export const groundPickupReferenceSchema = z
  .object({
    questId: id,
    itemId: id,
    // Omitted by legacy references, which describe exactly one item per character.
    quantity: z.number().int().min(1).max(MAXIMUM_GROUND_COLLECTION_QUANTITY).optional(),
    objectiveIndex: z.number().int().min(1).max(100),
    objectId: id,
    objectName: z.string().trim().min(1).max(300),
    positions: z
      .array(
        z
          .object({
            zone: z.string().regex(/^14\d{2}$/),
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    sourceArchiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
    source: z
      .object({
        chapterId: z.string().min(1).max(300),
        version: z.string().min(1).max(300),
        stepId: z.string().min(1).max(300),
      })
      .strict(),
  })
  .strict();

export type GroundPickupReference = z.infer<typeof groundPickupReferenceSchema>;
