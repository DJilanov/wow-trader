import { z } from "zod";
import type { QuestRewardFact } from "./quest-rewards.js";
import { groundPickupReferenceSchema } from "./quest-ground-pickup.js";

const id = z.number().int().positive().max(10_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const level = z.number().int().min(1).max(60);

export const questCatalogPositionSchema = z
  .object({
    zone: z.string().regex(/^14\d{2}$/),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })
  .strict();

const giver = z
  .object({
    npcId: id,
    name: z.string().min(1).max(300),
    friendlyToAlliance: z.boolean(),
    positions: z.array(questCatalogPositionSchema).max(500),
  })
  .strict();

export const questCatalogEntrySchema = z
  .object({
    questId: id,
    title: z.string().min(1).max(300),
    minimumLevel: level.nullable(),
    questLevel: level.nullable(),
    requiredRaces: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    requiredClasses: z.number().int().min(0).max(0xffffffff),
    groundPickup: groundPickupReferenceSchema.optional(),
    providedItem: z
      .object({ itemId: id, name: z.string().trim().min(1).max(300) })
      .strict()
      .optional(),
    starts: z.array(giver).max(30),
    ends: z.array(giver).max(30),
    prerequisites: z.object({ allOf: z.array(id).max(100), anyOf: z.array(id).max(100) }).strict(),
    exclusiveWith: z.array(id).max(100),
    category: z.enum(["shared-kills", "delivery", "unsupported"]),
    objectives: z
      .array(
        z
          .object({
            index: z.number().int().min(1).max(100),
            npcId: id,
            count: z.number().int().min(1).max(1000).nullable(),
            positions: z.array(questCatalogPositionSchema).max(500),
          })
          .strict(),
      )
      .max(100),
    unsupportedRequirements: z.array(z.string().min(1).max(100)).max(30),
  })
  .strict();
export type QuestCatalogEntry = z.infer<typeof questCatalogEntrySchema>;
export type QuestCatalogPosition = z.infer<typeof questCatalogPositionSchema>;

export const questCatalogSchema = z
  .object({
    schema: z.literal("forever-quest-funding-catalog.v1"),
    targetBuild: z.number().int().positive(),
    publication: z.enum(["private-reference", "authorized"]),
    authorizationNote: z.string().max(2000),
    providerRevision: z.string().regex(/^[a-f0-9]{40}$/),
    questSha256: hash,
    npcSha256: hash,
    itemSha256: hash.optional(),
    objectSha256: hash.optional(),
    areaMapSha256: hash,
    includesAuthoredCorrections: z.boolean(),
    sourceArchiveSha256: hash,
    quests: z.array(questCatalogEntrySchema).max(30000),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.publication === "authorized" && !catalog.authorizationNote.trim())
      context.addIssue({
        code: "custom",
        message: "Public quest catalog requires authorization provenance.",
      });
    if (new Set(catalog.quests.map((quest) => quest.questId)).size !== catalog.quests.length)
      context.addIssue({ code: "custom", message: "Duplicate quest catalog identity." });
    if (!catalog.itemSha256 && catalog.quests.some((quest) => quest.providedItem))
      context.addIssue({
        code: "custom",
        message: "Provided items require item-export provenance.",
      });
    for (const quest of catalog.quests) {
      const ground = quest.groundPickup;
      if (
        ground &&
        (!catalog.itemSha256 ||
          !catalog.objectSha256 ||
          ground.questId !== quest.questId ||
          ground.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
          quest.category !== "unsupported" ||
          quest.objectives.length ||
          quest.providedItem)
      )
        context.addIssue({
          code: "custom",
          message: `Incompatible ground pickup for quest ${quest.questId}.`,
        });
    }
    for (const quest of catalog.quests)
      if (
        new Set(quest.objectives.map((objective) => objective.index)).size !==
        quest.objectives.length
      )
        context.addIssue({
          code: "custom",
          message: `Duplicate objective index for quest ${quest.questId}.`,
        });
  });
export type QuestCatalog = z.infer<typeof questCatalogSchema>;

export const questCatalogManifestSchema = z
  .object({
    schema: z.literal("forever-quest-funding-manifest.v1"),
    file: z.string().regex(/^quest-catalog-[a-f0-9]{64}\.json$/),
    sha256: hash,
    targetBuild: z.number().int().positive(),
  })
  .strict();

export function isUnrestrictedFundingQuest(quest: QuestCatalogEntry): boolean {
  const allianceRaces = 4294967373n;
  return (
    quest.requiredClasses === 0 &&
    (quest.requiredRaces === 0 ||
      (BigInt(quest.requiredRaces) & allianceRaces) === allianceRaces) &&
    quest.unsupportedRequirements.length === 0 &&
    quest.minimumLevel !== null &&
    quest.questLevel !== null &&
    quest.starts.some((giver) => giver.friendlyToAlliance && giver.positions.length > 0) &&
    quest.ends.some((giver) => giver.friendlyToAlliance && giver.positions.length > 0)
  );
}

export function isGroundPickupFundingQuest(quest: QuestCatalogEntry): boolean {
  return (
    isUnrestrictedFundingQuest(quest) &&
    quest.category === "unsupported" &&
    Boolean(quest.groundPickup) &&
    !quest.providedItem &&
    quest.objectives.length === 0
  );
}

export function isSharedFundingQuest(quest: QuestCatalogEntry): boolean {
  return (
    isUnrestrictedFundingQuest(quest) &&
    (quest.category === "delivery" ||
      (quest.category === "shared-kills" &&
        quest.objectives.length > 0 &&
        quest.objectives.every(
          (objective) => objective.count !== null && objective.positions.length > 0,
        )))
  );
}

export function questCatalogRewardFacts(
  facts: readonly QuestRewardFact[],
  catalog: QuestCatalog | null,
): readonly QuestRewardFact[] {
  if (!catalog) return facts;
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  return facts.map((fact) => {
    const minimumLevel = quests.get(fact.questId)?.minimumLevel;
    if (fact.minimumLevel !== null || minimumLevel === null || minimumLevel === undefined)
      return fact;
    return { ...fact, minimumLevel };
  });
}
