import { z } from "zod";
import type { QuestRewardFact } from "./quest-rewards.js";
import { groundPickupReferenceSchema, type GroundPickupReference } from "./quest-ground-pickup.js";

const id = z.number().int().positive().max(10_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const level = z.number().int().min(1).max(60);
const questTimingSource = z.object({
  build: z.number().int().positive(),
  url: z.url().max(1500),
  sha256: hash,
}).strict();

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

const objectEndpoint = z
  .object({
    objectId: id,
    name: z.string().trim().min(1).max(300),
    positions: z.array(questCatalogPositionSchema).min(1).max(500),
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
    timeLimitSeconds: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    timeLimitSources: z.tuple([questTimingSource, questTimingSource]).optional(),
    groundPickup: groundPickupReferenceSchema.optional(),
    groundPickups: z.array(groundPickupReferenceSchema).min(2).max(100).optional(),
    providedItem: z
      .object({ itemId: id, name: z.string().trim().min(1).max(300) })
      .strict()
      .optional(),
    starts: z.array(giver).max(30),
    objectStarts: z.array(objectEndpoint).max(30).optional(),
    ends: z.array(giver).max(30),
    objectEnds: z.array(objectEndpoint).max(30).optional(),
    prerequisites: z.object({ allOf: z.array(id).max(100), anyOf: z.array(id).max(100) }).strict(),
    exclusiveWith: z.array(id).max(100),
    category: z.enum(["shared-kills", "delivery", "unsupported"]),
    itemObjectiveLocations: z.array(z.object({
      index: z.number().int().min(1).max(100),
      itemId: id,
      npcId: id,
      positions: z.array(questCatalogPositionSchema).min(1).max(500),
    }).strict()).min(1).max(500).optional(),
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
    if (
      !catalog.objectSha256 &&
      catalog.quests.some((quest) => quest.objectStarts?.length || quest.objectEnds?.length)
    )
      context.addIssue({
        code: "custom",
        message: "Object quest endpoints require object-export provenance.",
      });
    for (const quest of catalog.quests) {
      const lootLocations = quest.itemObjectiveLocations ?? [];
      if (lootLocations.length && (!catalog.itemSha256 || quest.category !== "unsupported" ||
        new Set(lootLocations.map((row) => `${row.index}:${row.npcId}`)).size !== lootLocations.length ||
        lootLocations.some((row) => quest.objectives.some((objective) => objective.index === row.index))))
        context.addIssue({ code: "custom", message: `Incompatible item objective locations for quest ${quest.questId}.` });
      for (const endpoints of [quest.objectStarts ?? [], quest.objectEnds ?? []])
        if (new Set(endpoints.map((endpoint) => endpoint.objectId)).size !== endpoints.length)
          context.addIssue({
            code: "custom",
            message: `Duplicate object endpoint for quest ${quest.questId}.`,
          });
      const grounds = questGroundPickups(quest);
      const indices = new Set(grounds.map((ground) => ground.objectiveIndex));
      if (
        (quest.groundPickup && quest.groundPickups) ||
        indices.size !== grounds.length ||
        grounds.some((_ground, index) => !indices.has(index + 1)) ||
        new Set(grounds.map((ground) => ground.itemId)).size !== grounds.length ||
        grounds.some(
          (ground) =>
            !catalog.itemSha256 ||
            !catalog.objectSha256 ||
            ground.questId !== quest.questId ||
            ground.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
            quest.category !== "unsupported" ||
            quest.objectives.length ||
            quest.providedItem,
        )
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

/** Normalize the legacy single-objective representation and complete multi-objective pickups. */
export function questGroundPickups(
  quest: Pick<QuestCatalogEntry, "groundPickup" | "groundPickups">,
): readonly GroundPickupReference[] {
  return quest.groundPickups ?? (quest.groundPickup ? [quest.groundPickup] : []);
}

export const questCatalogManifestSchema = z
  .object({
    schema: z.literal("forever-quest-funding-manifest.v1"),
    file: z.string().regex(/^quest-catalog-[a-f0-9]{64}\.json$/),
    sha256: hash,
    targetBuild: z.number().int().positive(),
  })
  .strict();

/** Access checks only; source-based callers must separately prove the full pickup/return program. */
export function hasUnrestrictedQuestAccess(quest: QuestCatalogEntry): boolean {
  const allianceRaces = 4294967373n;
  return (
    quest.requiredClasses === 0 &&
    (quest.requiredRaces === 0 ||
      (BigInt(quest.requiredRaces) & allianceRaces) === allianceRaces) &&
    quest.unsupportedRequirements.length === 0 &&
    quest.minimumLevel !== null &&
    quest.questLevel !== null
  );
}

export function isUnrestrictedFundingQuest(quest: QuestCatalogEntry): boolean {
  return (
    hasUnrestrictedQuestAccess(quest) &&
    (quest.starts.some((giver) => giver.friendlyToAlliance && giver.positions.length > 0) ||
      (quest.category === "delivery" &&
        Boolean(quest.providedItem) &&
        quest.objectives.length === 0 &&
        Boolean(quest.objectStarts?.length))) &&
    quest.ends.some((giver) => giver.friendlyToAlliance && giver.positions.length > 0)
  );
}

export function isGroundPickupFundingQuest(quest: QuestCatalogEntry): boolean {
  return (
    isUnrestrictedFundingQuest(quest) &&
    quest.category === "unsupported" &&
    questGroundPickups(quest).length > 0 &&
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
