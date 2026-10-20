import { createHash } from "node:crypto";

import type { CatalogBundle } from "@wow-trader/contracts";

import {
  decodeQuestieSpawnLocations,
  type QuestieForeverBundle,
  type QuestieForeverEntity,
} from "./questie-forever.js";

const ACQUISITION_RELATION_KINDS = new Set([
  "contained_in_item",
  "dropped_by_npc",
  "dropped_by_object",
  "rewarded_by_quest",
  "sold_by_npc",
]);

export type EvidenceAgreementStatus = "single_source" | "corroborated" | "conflicting";

export interface EvidenceNameAgreement {
  readonly status: EvidenceAgreementStatus;
  readonly referenceCount: number;
  readonly observedCount: number;
  readonly agreeingObservedCount: number;
  readonly conflictingObservedCount: number;
  readonly conflictingNames: readonly string[];
}

export interface CommunityCrawlerTask {
  readonly game: string;
  readonly kind: "spell";
  readonly id: number;
}

export interface CommunityCoverageResult {
  readonly tasks: readonly CommunityCrawlerTask[];
  readonly report: CommunityCoverageReport;
}

export interface BuildCommunityCoverageOptions {
  readonly game?: string;
  readonly generatedAt?: Date;
  readonly observedTrainerSpellIds?: ReadonlySet<number>;
}

export interface CommunityCoverageReport {
  readonly schemaVersion: "community-coverage-report.v1";
  readonly generatedAt: string;
  readonly catalog: {
    readonly product: string;
    readonly clientVersion: string;
    readonly buildNumber: number;
    readonly locale: string;
    readonly extractedAt: string;
  };
  readonly community: {
    readonly sourceKind: string;
    readonly sourceVersion: string;
    readonly sourceRevision: string;
    readonly checksum: string;
    readonly includedAuthored: boolean;
  };
  readonly queueSha256: string;
  readonly summary: {
    readonly catalogItemCount: number;
    readonly communityItemCount: number;
    readonly matchingItemNameCount: number;
    readonly conflictingItemNameCount: number;
    readonly catalogItemsWithAcquisitionCount: number;
    readonly catalogItemsWithoutAcquisitionCount: number;
    readonly recipeCount: number;
    readonly recipesWithClientTeachingItemCount: number;
    readonly recipesWithCommunityTeachingItemCount: number;
    readonly recipesWithObservedTrainerCount: number;
    readonly unresolvedRecipeLearningCount: number;
    readonly npcCount: number;
    readonly npcsWithLocationsCount: number;
    readonly npcLocationCount: number;
    readonly objectCount: number;
    readonly objectsWithLocationsCount: number;
    readonly objectLocationCount: number;
    readonly rejectedLocationCount: number;
  };
  readonly identityConflicts: readonly {
    readonly kind: "item";
    readonly id: number;
    readonly clientName: string;
    readonly communityName: string;
  }[];
  readonly unresolvedRecipes: readonly {
    readonly recipeSpellId: number;
    readonly name: string | null;
    readonly professionSkillLineId: number;
    readonly professionName: string | null;
    readonly clientAcquireMethod: number | null;
    readonly unresolvedFields: readonly ["learning_method"];
    readonly suggestedReference: string;
  }[];
  readonly policy: {
    readonly absenceIsNotConflict: true;
    readonly crawlerPurpose: string;
    readonly clientFieldsRemainAuthoritative: readonly string[];
    readonly communityFields: readonly string[];
  };
}

export function buildCommunityCoverage(
  catalog: CatalogBundle,
  community: QuestieForeverBundle,
  options: BuildCommunityCoverageOptions = {},
): CommunityCoverageResult {
  const game = options.game ?? "forever";
  const generatedAt = options.generatedAt ?? new Date();
  const entitiesByKind = groupEntitiesByKind(community.entities);
  const communityItems = entitiesByKind.item;
  const catalogItemIds = new Set(catalog.items.map((item) => item.itemId));
  const communityItemsById = new Map(communityItems.map((item) => [item.id, item]));
  const matchingItemNames: number[] = [];
  const identityConflicts: CommunityCoverageReport["identityConflicts"][number][] = [];
  for (const item of catalog.items) {
    const reference = communityItemsById.get(item.itemId);
    if (!reference?.name) continue;
    if (normalizeEvidenceName(item.name) === normalizeEvidenceName(reference.name)) {
      matchingItemNames.push(item.itemId);
    } else {
      identityConflicts.push({
        kind: "item",
        id: item.itemId,
        clientName: item.name,
        communityName: reference.name,
      });
    }
  }

  const catalogItemsWithAcquisition = new Set(
    community.relations
      .filter(
        (relation) =>
          relation.sourceKind === "item" &&
          catalogItemIds.has(relation.sourceId) &&
          ACQUISITION_RELATION_KINDS.has(relation.relationKind),
      )
      .map((relation) => relation.sourceId),
  );
  const clientTeachingRecipes = new Set(
    catalog.recipeTeachingItems.map((entry) => entry.recipeSpellId),
  );
  const communityTeachingRecipes = new Set(
    community.relations
      .filter(
        (relation) =>
          relation.sourceKind === "item" &&
          relation.relationKind === "teaches_spell" &&
          relation.targetKind === "spell" &&
          catalogItemIds.has(relation.sourceId),
      )
      .map((relation) => relation.targetId),
  );
  const catalogRecipeIds = new Set(catalog.recipes.map((recipe) => recipe.recipeSpellId));
  const observedTrainerRecipes = new Set(
    [...(options.observedTrainerSpellIds ?? [])].filter((spellId) => catalogRecipeIds.has(spellId)),
  );
  const spellNames = new Map(catalog.spells.map((spell) => [spell.spellId, spell.name]));
  const professionNames = new Map(
    catalog.professions.map((profession) => [profession.skillLineId, profession.name]),
  );
  const unresolvedRecipes = catalog.recipes
    .filter(
      (recipe) =>
        !clientTeachingRecipes.has(recipe.recipeSpellId) &&
        !communityTeachingRecipes.has(recipe.recipeSpellId) &&
        !observedTrainerRecipes.has(recipe.recipeSpellId),
    )
    .map((recipe) => ({
      recipeSpellId: recipe.recipeSpellId,
      name: spellNames.get(recipe.recipeSpellId) ?? null,
      professionSkillLineId: recipe.professionSkillLineId,
      professionName: professionNames.get(recipe.professionSkillLineId) ?? null,
      clientAcquireMethod: readAcquireMethod(recipe.rawRecord),
      unresolvedFields: ["learning_method"] as const,
      suggestedReference: `https://www.wowhead.com/${game}/spell=${recipe.recipeSpellId}`,
    }))
    .sort(
      (left, right) =>
        left.professionSkillLineId - right.professionSkillLineId ||
        left.recipeSpellId - right.recipeSpellId,
    );
  const tasks = unresolvedRecipes.map((recipe): CommunityCrawlerTask => ({
    game,
    kind: "spell",
    id: recipe.recipeSpellId,
  }));
  const npcLocations = locationCoverage(entitiesByKind.npc);
  const objectLocations = locationCoverage(entitiesByKind.object);

  return {
    tasks,
    report: {
      schemaVersion: "community-coverage-report.v1",
      generatedAt: generatedAt.toISOString(),
      catalog: {
        product: catalog.manifest.product,
        clientVersion: catalog.manifest.clientVersion,
        buildNumber: catalog.manifest.buildNumber,
        locale: catalog.manifest.locale,
        extractedAt: catalog.manifest.extractedAt,
      },
      community: {
        sourceKind: community.sourceKind,
        sourceVersion: community.sourceVersion,
        sourceRevision: community.sourceRevision,
        checksum: community.checksum,
        includedAuthored: community.includedAuthored,
      },
      queueSha256: sha256(JSON.stringify(tasks)),
      summary: {
        catalogItemCount: catalog.items.length,
        communityItemCount: communityItems.length,
        matchingItemNameCount: matchingItemNames.length,
        conflictingItemNameCount: identityConflicts.length,
        catalogItemsWithAcquisitionCount: catalogItemsWithAcquisition.size,
        catalogItemsWithoutAcquisitionCount:
          catalog.items.length - catalogItemsWithAcquisition.size,
        recipeCount: catalog.recipes.length,
        recipesWithClientTeachingItemCount: clientTeachingRecipes.size,
        recipesWithCommunityTeachingItemCount: communityTeachingRecipes.size,
        recipesWithObservedTrainerCount: observedTrainerRecipes.size,
        unresolvedRecipeLearningCount: unresolvedRecipes.length,
        npcCount: entitiesByKind.npc.length,
        npcsWithLocationsCount: npcLocations.entitiesWithLocations,
        npcLocationCount: npcLocations.locationCount,
        objectCount: entitiesByKind.object.length,
        objectsWithLocationsCount: objectLocations.entitiesWithLocations,
        objectLocationCount: objectLocations.locationCount,
        rejectedLocationCount:
          npcLocations.rejectedLocationCount + objectLocations.rejectedLocationCount,
      },
      identityConflicts: identityConflicts.sort((left, right) => left.id - right.id),
      unresolvedRecipes,
      policy: {
        absenceIsNotConflict: true,
        crawlerPurpose:
          "Resolve recipe learning methods still missing from the exact client and pinned community snapshot",
        clientFieldsRemainAuthoritative: [
          "identity",
          "profession",
          "required_skill",
          "reagents",
          "outputs",
          "craft_time",
          "cooldown",
        ],
        communityFields: [
          "teaching_item",
          "drop_relationship",
          "vendor_relationship",
          "quest_relationship",
          "spawn_location",
        ],
      },
    },
  };
}

export function assessEvidenceNameAgreement(
  referenceName: string | null,
  observedNames: readonly (string | null)[],
): EvidenceNameAgreement {
  const normalizedReference = referenceName ? normalizeEvidenceName(referenceName) : null;
  const usableObservedNames = observedNames.filter(
    (name): name is string => typeof name === "string" && name.trim().length > 0,
  );
  const agreeingObservedCount = normalizedReference
    ? usableObservedNames.filter((name) => normalizeEvidenceName(name) === normalizedReference)
        .length
    : 0;
  const conflictingNames = normalizedReference
    ? [
        ...new Set(
          usableObservedNames.filter((name) => normalizeEvidenceName(name) !== normalizedReference),
        ),
      ].sort((left, right) => left.localeCompare(right))
    : [];
  const conflictingObservedCount = normalizedReference
    ? usableObservedNames.length - agreeingObservedCount
    : 0;
  return {
    status:
      conflictingObservedCount > 0
        ? "conflicting"
        : normalizedReference && agreeingObservedCount > 0
          ? "corroborated"
          : "single_source",
    referenceCount: normalizedReference ? 1 : 0,
    observedCount: usableObservedNames.length,
    agreeingObservedCount,
    conflictingObservedCount,
    conflictingNames,
  };
}

function groupEntitiesByKind(entities: readonly QuestieForeverEntity[]): Readonly<{
  quest: readonly QuestieForeverEntity[];
  npc: readonly QuestieForeverEntity[];
  item: readonly QuestieForeverEntity[];
  object: readonly QuestieForeverEntity[];
}> {
  return {
    quest: entities.filter((entity) => entity.kind === "quest"),
    npc: entities.filter((entity) => entity.kind === "npc"),
    item: entities.filter((entity) => entity.kind === "item"),
    object: entities.filter((entity) => entity.kind === "object"),
  };
}

function locationCoverage(entities: readonly QuestieForeverEntity[]): {
  readonly entitiesWithLocations: number;
  readonly locationCount: number;
  readonly rejectedLocationCount: number;
} {
  let entitiesWithLocations = 0;
  let locationCount = 0;
  let rejectedLocationCount = 0;
  for (const entity of entities) {
    const decoded = decodeQuestieSpawnLocations(entity.data.spawns);
    if (decoded.locations.length > 0) entitiesWithLocations += 1;
    locationCount += decoded.locations.length;
    rejectedLocationCount += decoded.rejectedCount;
  }
  return { entitiesWithLocations, locationCount, rejectedLocationCount };
}

function readAcquireMethod(rawRecord: Readonly<Record<string, unknown>>): number | null {
  const skillLineAbility = rawRecord.skillLineAbility;
  if (!isRecord(skillLineAbility)) return null;
  const value = skillLineAbility.AcquireMethod;
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0 ? value : null;
}

function normalizeEvidenceName(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
