import { z } from "zod";

const id = z.number().int().positive().max(2_147_483_647);
const name = z.string().min(1).max(400);
export const professionClientReviewSchema = z
  .object({
    schema: z.literal("profession-client-review.v1"),
    build: z
      .object({
        id: z.uuid(),
        product: z.literal("wow_classic_beta"),
        buildNumber: id,
        clientVersion: name,
        locale: z.literal("enUS"),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            itemId: id,
            name,
            description: z.string(),
            classId: z.number().int(),
            subclassId: z.number().int(),
            requiredLevel: z.number().int().nonnegative(),
            requiredSkillId: id.nullable(),
            requiredSkillRank: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100_000),
    spells: z.array(z.object({ spellId: id, name, description: z.string() }).strict()).max(20_000),
    professions: z.array(z.object({ skillLineId: id, name }).strict()).max(100),
    recipes: z
      .array(
        z
          .object({
            recipeSpellId: id,
            professionSkillLineId: id,
            rawRecord: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(20_000),
    recipeOutputs: z
      .array(z.object({ recipeSpellId: id, outputItemId: id.nullable() }).strict())
      .max(40_000),
    recipeTeachingItems: z
      .array(z.object({ recipeSpellId: id, teachingItemId: id }).strict())
      .max(40_000),
  })
  .strict();

export type ProfessionClientReview = z.infer<typeof professionClientReviewSchema>;

export const professionReferenceBundleSchema = z
  .object({
    formatVersion: z.literal(1),
    sourceKind: z.literal("profession_reference_review"),
    sourceVersion: name,
    sourceRevision: name,
    licenseRef: name,
    includedAuthored: z.literal(false),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    validUntil: z.iso.datetime(),
    upstreamSources: z
      .array(
        z
          .object({
            name,
            revision: name,
            checksum: z.string().regex(/^[a-f0-9]{64}$/),
            licenseRef: name,
          })
          .strict(),
      )
      .max(4),
    artifacts: z
      .array(
        z
          .object({
            fileName: name,
            byteSize: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            entityCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100),
    entities: z
      .array(
        z
          .object({
            kind: z.enum(["npc", "item", "quest", "object", "spell"]),
            id,
            name: name.nullable(),
            data: z.record(z.string(), z.json()),
          })
          .strict(),
      )
      .max(100_000),
    relations: z
      .array(
        z
          .object({
            sourceKind: z.enum(["npc", "item", "quest", "object"]),
            sourceId: id,
            relationKind: z.enum([
              "teaches_spell",
              "sold_by_npc",
              "dropped_by_npc",
              "dropped_by_object",
              "contained_in_item",
              "rewarded_by_quest",
            ]),
            targetKind: z.enum(["npc", "item", "quest", "object", "spell"]),
            targetId: id,
            evidence: z.record(z.string(), z.json()),
          })
          .strict(),
      )
      .max(200_000),
  })
  .strict();

export type ProfessionReferenceBundle = z.infer<typeof professionReferenceBundleSchema>;
