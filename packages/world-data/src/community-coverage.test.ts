import type { CatalogBundle } from "@wow-trader/contracts";
import { describe, expect, it } from "vitest";

import { assessEvidenceNameAgreement, buildCommunityCoverage } from "./community-coverage.js";
import type { QuestieForeverBundle } from "./questie-forever.js";

describe("community coverage", () => {
  it("queues only recipes without an exact or community teaching item", () => {
    const result = buildCommunityCoverage(createCatalog(), createCommunity(), {
      game: "forever",
      generatedAt: new Date("2026-10-18T08:00:00.000Z"),
    });

    expect(result.tasks).toEqual([{ game: "forever", kind: "spell", id: 300 }]);
    expect(result.report.summary).toMatchObject({
      recipeCount: 3,
      recipesWithClientTeachingItemCount: 1,
      recipesWithCommunityTeachingItemCount: 1,
      recipesWithObservedTrainerCount: 0,
      unresolvedRecipeLearningCount: 1,
      catalogItemsWithAcquisitionCount: 1,
      matchingItemNameCount: 1,
      conflictingItemNameCount: 1,
      npcsWithLocationsCount: 1,
      npcLocationCount: 1,
      rejectedLocationCount: 1,
    });
    expect(result.report.identityConflicts).toEqual([
      {
        kind: "item",
        id: 2,
        clientName: "Client Name",
        communityName: "Old Name",
      },
    ]);
    expect(result.report.unresolvedRecipes).toEqual([
      expect.objectContaining({
        recipeSpellId: 300,
        name: "Unknown Training",
        clientAcquireMethod: 2,
        unresolvedFields: ["learning_method"],
      }),
    ]);
    expect(result.report.queueSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("removes exact-build trainer observations from the unresolved crawl queue", () => {
    const result = buildCommunityCoverage(createCatalog(), createCommunity(), {
      observedTrainerSpellIds: new Set([300, 999_999]),
    });

    expect(result.tasks).toEqual([]);
    expect(result.report.summary.recipesWithObservedTrainerCount).toBe(1);
    expect(result.report.summary.unresolvedRecipeLearningCount).toBe(0);
  });

  it("reports corroboration and name conflicts without treating absence as disagreement", () => {
    expect(assessEvidenceNameAgreement("Gann Stonespire", [])).toMatchObject({
      status: "single_source",
      observedCount: 0,
      conflictingObservedCount: 0,
    });
    expect(
      assessEvidenceNameAgreement("Gann Stonespire", ["Gann Stonespire", "gann stonespire"]),
    ).toMatchObject({
      status: "corroborated",
      agreeingObservedCount: 2,
      conflictingObservedCount: 0,
    });
    expect(assessEvidenceNameAgreement("Gann Stonespire", ["Different NPC", null])).toEqual({
      status: "conflicting",
      referenceCount: 1,
      observedCount: 1,
      agreeingObservedCount: 0,
      conflictingObservedCount: 1,
      conflictingNames: ["Different NPC"],
    });
  });
});

function createCatalog(): CatalogBundle {
  const item = (itemId: number, name: string): CatalogBundle["items"][number] => ({
    itemId,
    name,
    description: "",
    classId: 0,
    subclassId: 0,
    quality: 1,
    requiredLevel: 0,
    itemLevel: 1,
    requiredSkillId: null,
    requiredSkillRank: 0,
    stackSize: 1,
    binding: 0,
    inventoryType: 0,
    allowableClassMask: 0,
    allowableRaceMask: [],
    maxCount: 0,
    maxDurability: 0,
    delayMs: 0,
    damageType: 0,
    itemSetId: null,
    limitCategoryId: null,
    socketBonusEnchantmentId: null,
    gemPropertiesId: null,
    randomSuffixGroupId: null,
    randomPropertyId: null,
    requiredAbilityId: null,
    minimumFactionId: null,
    minimumReputation: 0,
    buyPriceCopper: "0",
    sellPriceCopper: "0",
    iconFileDataId: null,
    rawRecord: {},
  });
  const spell = (spellId: number, name: string): CatalogBundle["spells"][number] => ({
    spellId,
    name,
    description: "",
    auraDescription: "",
    durationMs: 0,
    maximumDurationMs: 0,
    procChance: null,
    procCharges: null,
    procCooldownMs: null,
    descriptionVariables: "",
    rawRecord: {},
  });
  const recipe = (recipeSpellId: number): CatalogBundle["recipes"][number] => ({
    recipeSpellId,
    professionSkillLineId: 164,
    requiredSkillRank: 1,
    craftTimeMs: 0,
    cooldownMs: 0,
    cooldownCategoryId: null,
    categoryCooldownMs: 0,
    outputKind: "item",
    extractionStatus: "complete",
    rawRecord: { skillLineAbility: { AcquireMethod: 2 } },
  });
  return {
    manifest: {
      schemaVersion: "catalog-snapshot-manifest.v4",
      product: "wow_classic_beta",
      clientVersion: "1.60.1.70450",
      buildNumber: 70450,
      buildKey: "a".repeat(32),
      cdnKey: "b".repeat(32),
      locale: "enUS",
      extractedAt: "2026-10-17T00:00:00.000Z",
      hotfix: { status: "applied", sha256: "c".repeat(64) },
      definitions: { source: "test", revision: "test" },
      extractor: { name: "test", version: "1", revision: null },
      rawTables: {},
      normalizedArtifacts: {},
    },
    items: [item(1, "Recipe: Known"), item(2, "Client Name")],
    spells: [
      spell(100, "Community Learned"),
      spell(200, "Client Learned"),
      spell(300, "Unknown Training"),
    ],
    professions: [
      { skillLineId: 164, name: "Blacksmithing", slug: "blacksmithing", rawRecord: {} },
    ],
    recipes: [recipe(100), recipe(200), recipe(300)],
    recipeTeachingItems: [{ recipeSpellId: 200, teachingItemId: 2, learningSpellId: null }],
    itemStats: [],
    itemDamages: [],
    itemResistances: [],
    itemSockets: [],
    itemEffects: [],
    itemSets: [],
    itemSetMembers: [],
    itemSetEffects: [],
    gameClasses: [],
    gameRaces: [],
    itemClasses: [],
    itemSubclasses: [],
    itemLimitCategories: [],
    gemProperties: [],
    itemEnchantments: [],
    itemEnchantmentEffects: [],
    itemRandomEnchantments: [],
    itemBonusTrees: [],
    itemBonusTreeNodes: [],
    itemBonuses: [],
    recipeInputs: [],
    recipeOutputs: [],
    transformations: [],
    transformationInputs: [],
    transformationOutputs: [],
  };
}

function createCommunity(): QuestieForeverBundle {
  return {
    formatVersion: 1,
    sourceKind: "questiedb_forever",
    sourceVersion: "1.0.6",
    sourceRevision: "a".repeat(40),
    licenseRef: "https://example.test/license",
    includedAuthored: false,
    checksum: "d".repeat(64),
    artifacts: [],
    entities: [
      { kind: "item", id: 1, name: "Recipe: Known", data: { name: "Recipe: Known" } },
      { kind: "item", id: 2, name: "Old Name", data: { name: "Old Name" } },
      {
        kind: "npc",
        id: 10,
        name: "Trainer",
        data: {
          name: "Trainer",
          spawns: {
            "12": [
              [40, 50],
              [200, 50],
            ],
          },
        },
      },
    ],
    relations: [
      {
        sourceKind: "item",
        sourceId: 1,
        relationKind: "teaches_spell",
        targetKind: "spell",
        targetId: 100,
        evidence: {},
      },
      {
        sourceKind: "item",
        sourceId: 1,
        relationKind: "sold_by_npc",
        targetKind: "npc",
        targetId: 10,
        evidence: {},
      },
    ],
  };
}
