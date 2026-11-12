import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { partyQuestLootCost } from "./party-quest-cost.js";

function fixture(
  body = ">>Buy a [Rhapsody Malt] from Innkeeper Belm\n.complete 384,2 >>Collect Rhapsody Malt (x1)\n.target Innkeeper Belm",
): { plan: CampaignPlan; sources: readonly CampaignSource[]; data: CombatDataset } {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(
    `step\n.goto 1429,43,65\n${body}`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic mixed purchase/drop regression",
    provider: {
      repository: "https://example.test/reference",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    npcs: [
      {
        id: 1127,
        name: "Crag Boar",
        minimumLevel: 6,
        maximumLevel: 6,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
      {
        id: 1247,
        name: "Innkeeper Belm",
        minimumLevel: 10,
        maximumLevel: 10,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "excluded",
      },
    ],
    quests: [
      {
        questId: 384,
        creatureIds: [],
        itemCreatureIds: [1127, 1247],
        objectiveText: ["Bring 6 Crag Boar Ribs and a Rhapsody Malt."],
        itemObjectives: [
          {
            itemId: 2886,
            itemName: "Crag Boar Rib",
            objectiveIndex: 1,
            quantity: 6,
            npcIds: [1127],
            sharing: "pooled",
          },
          {
            itemId: 2894,
            itemName: "Rhapsody Malt",
            objectiveIndex: 2,
            quantity: 1,
            npcIds: [1247],
            sharing: "pooled",
            vendorEvidence: {
              npcIds: [1247],
              sourceUrl: "https://example.test/item=2894",
              sourceSha256: "d".repeat(64),
              capturedAt: "2026-11-02T00:00:00Z",
            },
          },
        ],
      },
    ],
    dungeons: [],
    lootDrops: [
      {
        itemId: 2886,
        npcId: 1127,
        probability: 0.8,
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/item=2886",
        sourceSha256: "e".repeat(64),
        capturedAt: "2026-11-02T00:00:00Z",
      },
    ],
  });
  const plan: CampaignPlan = {
    release: "purchase-regression",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    legs: [],
    actions: [
      {
        id: "buy-malt",
        legId: "starter",
        title: "Buy Rhapsody Malt",
        instructions: [],
        questChanges: [
          {
            questId: 384,
            objectiveIndex: 2,
            state: "objectives-complete",
            title: "Beer Basted Boar Ribs",
          },
        ],
        positions: [],
        source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
        kind: "quests",
        leaderOnly: true,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
      },
    ],
    combat: {
      revision: "purchase-regression",
      sourceRevision: data.provider.revision,
      targetBuild: 70205,
      notice: null,
      npcs: data.npcs,
      lootDrops: data.lootDrops!,
      activities: [
        {
          id: "gather-ribs",
          actionId: "gather-ribs",
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              questId: 384,
              objectiveIndex: 1,
              npcIds: [1127],
              requiredKills: null,
              credit: "personal-loot",
              source: "Synthetic rib gathering",
              reason: null,
              loot: { itemId: 2886, quantity: 6, sharing: "pooled" },
            },
          ],
        },
      ],
    },
  };
  return { plan, sources: [{ reference, guide }], data };
}

describe("source-backed quest purchase costs", () => {
  it("prices only the gathered ingredient while retaining the required vendor purchase", () => {
    const { plan, sources, data } = fixture();
    const original = structuredClone({ plan, sources, data });
    expect(partyQuestLootCost(384, plan, data, 1, sources)).toMatchObject({
      eligible: true,
      expectedKills: 8,
    });
    expect(partyQuestLootCost(384, plan, data, 5, sources)).toMatchObject({
      eligible: true,
      expectedKills: 38,
      auctionItems: [{ itemId: 2886, quantityPerPlayer: 6 }],
    });
    expect({ plan, sources, data }).toEqual(original);
    expect(data.quests[0]!.itemObjectives![1]!.provided).toBeUndefined();
  });

  it("does not infer a purchase from vendor availability without a matching planned source", () => {
    const { plan, sources, data } = fixture();
    expect(partyQuestLootCost(384, plan, data, 1)).toMatchObject({
      eligible: false,
      expectedKills: null,
    });
    const wrongVersion = sources.map((source) => ({
      ...source,
      guide: { ...source.guide, version: "wrong-source" },
    }));
    expect(partyQuestLootCost(384, plan, data, 1, wrongVersion).eligible).toBe(false);
  });

  it.each([
    ">>Buy a [Rhapsody Malt] from another vendor\n.complete 384,2 >>Collect Rhapsody Malt (x1)\n.target Another Vendor",
    ">>Buy a [Rhapsody Malt] if affordable\n.complete 384,2 >>Collect Rhapsody Malt (x1)\n.target Innkeeper Belm",
    ">>Buy a [Rhapsody Malt] from Innkeeper Belm\n.complete 384,2 >>Collect Rhapsody Malt (x2)\n.target Innkeeper Belm",
    ">>Buy a [Spring Water] from Innkeeper Belm\n.complete 384,2 >>Collect Spring Water (x1)\n.target Innkeeper Belm",
  ])("holds an unsupported purchase: %s", (body) => {
    const { plan, sources, data } = fixture(body);
    expect(partyQuestLootCost(384, plan, data, 1, sources)).toMatchObject({
      eligible: false,
      expectedKills: null,
    });
  });

  it("does not hide an additional unresolved ingredient behind a demonstrated purchase", () => {
    const { plan, sources, data } = fixture();
    const extra: CombatDataset = {
      ...data,
      quests: data.quests.map((quest) => ({
        ...quest,
        itemObjectives: [
          ...quest.itemObjectives!,
          {
            itemId: 1,
            itemName: "Unknown ingredient",
            objectiveIndex: 3,
            quantity: 1,
            npcIds: [],
            sharing: "unknown",
          },
        ],
      })),
    };
    expect(partyQuestLootCost(384, plan, extra, 1, sources)).toMatchObject({
      eligible: false,
      expectedKills: null,
    });
  });

  it("does not demand a loot stream when every required item has a proved purchase", () => {
    const { plan, sources, data } = fixture();
    const onlyMalt: CombatDataset = {
      ...data,
      quests: data.quests.map((quest) => ({
        ...quest,
        itemObjectives: quest.itemObjectives!.filter((item) => item.itemId === 2894),
      })),
    };
    const noGathering: CampaignPlan = { ...plan, combat: { ...plan.combat!, activities: [] } };
    expect(partyQuestLootCost(384, noGathering, onlyMalt, 1, sources)).toMatchObject({
      eligible: true,
      expectedKills: 0,
      slowKills: 0,
    });
  });
});
