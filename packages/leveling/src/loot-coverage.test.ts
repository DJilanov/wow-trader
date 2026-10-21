import { describe, expect, it } from "vitest";
import { combatDatasetSchema } from "./combat-model.js";
import { prepareCampaignLootReferences, type LootCapture } from "./loot-coverage.js";
function dataset(): ReturnType<typeof combatDatasetSchema.parse> {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    publication: "private-reference",
    authorizationNote: "",
    targetBuild: 70205,
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    npcs: [
      {
        id: 299,
        name: "Young Wolf",
        minimumLevel: 1,
        maximumLevel: 1,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 33,
        creatureIds: [],
        itemCreatureIds: [299],
        objectiveText: [],
        onlyCreatureObjectives: false,
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}
const metadata = {
  game: "forever" as const,
  sourceUrl: "https://www.wowhead.com/forever/item=750",
  sourceSha256: "a".repeat(64),
  capturedAt: "2026-10-20T00:00:00.000Z",
};
const quest: LootCapture = {
  ...metadata,
  kind: "quest",
  id: 33,
  requiredItems: [{ itemId: 750, quantity: 8 }],
  relations: [],
};
const item: LootCapture = {
  ...metadata,
  kind: "item",
  id: 750,
  relations: [
    {
      relation: "dropped-by",
      kind: "npc",
      id: 299,
      dropStatistics: { percent: 40, attempts: 100, minimumQuantity: 1, maximumQuantity: 1 },
    },
  ],
};
describe("missing loot data crawl preparation", () => {
  it("queues a quest only when item identities are missing, then only the missing item page", () => {
    expect(prepareCampaignLootReferences(dataset(), new Set([33]), []).queue).toEqual([
      { game: "forever", kind: "quest", id: 33 },
    ]);
    expect(prepareCampaignLootReferences(dataset(), new Set([33]), [quest]).queue).toEqual([
      { game: "forever", kind: "item", id: 750 },
    ]);
  });
  it("reuses quantitative captures, preserves publication status and records unknown sharing", () => {
    const original = dataset(),
      before = JSON.stringify(original);
    const result = prepareCampaignLootReferences(original, new Set([33]), [quest, item]);
    expect(result.queue).toEqual([]);
    expect(result.data.lootDrops?.[0]).toMatchObject({
      probability: 0.4,
      itemId: 750,
      npcId: 299,
      targetBuild: 70205,
    });
    expect(result.data.quests[0]?.itemObjectives?.[0]).toMatchObject({
      quantity: 8,
      objectiveIndex: 1,
      sharing: "unknown",
    });
    expect(result.data.publication).toBe("private-reference");
    expect(result.reviews.some((r) => r.reason.includes("independent rolls"))).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("does not loop a recrawl to resolve missing stack or sharing semantics", () => {
    const incomplete: LootCapture = {
      ...item,
      relations: [
        {
          ...item.relations[0]!,
          dropStatistics: {
            ...item.relations[0]!.dropStatistics!,
            minimumQuantity: null,
            maximumQuantity: null,
          },
        },
      ],
    };
    const result = prepareCampaignLootReferences(dataset(), new Set([33]), [quest, incomplete]);
    expect(result.queue).toEqual([]);
    expect(result.reviews.some((r) => r.reason.includes("items per drop"))).toBe(true);
  });
  it("retains explicit quantity weights without requesting a redundant stack review", () => {
    const quantityDistribution = [
      { quantity: 1, percent: 75 },
      { quantity: 3, percent: 25 },
    ];
    const captured: LootCapture = {
      ...item,
      relations: [
        {
          ...item.relations[0]!,
          dropStatistics: {
            percent: 40,
            attempts: 100,
            minimumQuantity: 1,
            maximumQuantity: 3,
            quantityDistribution,
          },
        },
      ],
    };
    const before = JSON.stringify(captured);
    const first = prepareCampaignLootReferences(dataset(), new Set([33]), [quest, captured]);
    expect(first.data.lootDrops?.[0]?.quantityDistribution).toEqual(quantityDistribution);
    expect(first.reviews.some((review) => review.reason.includes("items per drop"))).toBe(false);
    const reordered: LootCapture = {
      ...captured,
      relations: [
        {
          ...captured.relations[0]!,
          dropStatistics: {
            ...captured.relations[0]!.dropStatistics!,
            quantityDistribution: [...quantityDistribution].reverse(),
          },
        },
      ],
    };
    const again = prepareCampaignLootReferences(first.data, new Set([33]), [quest, reordered]);
    expect(again.data.lootDrops).toHaveLength(1);
    expect(again.reviews.some((review) => review.reason.includes("Conflicting"))).toBe(false);
    const changed: LootCapture = {
      ...captured,
      relations: [
        {
          ...captured.relations[0]!,
          dropStatistics: {
            ...captured.relations[0]!.dropStatistics!,
            quantityDistribution: [
              { quantity: 1, percent: 50 },
              { quantity: 3, percent: 50 },
            ],
          },
        },
      ],
    };
    const conflict = prepareCampaignLootReferences(first.data, new Set([33]), [quest, changed]);
    expect(conflict.data.lootDrops).toEqual([]);
    expect(conflict.reviews.some((review) => review.reason.includes("Conflicting"))).toBe(true);
    expect(JSON.stringify(captured)).toBe(before);
  });
  it("ignores a different edition and out-of-route quests", () => {
    expect(
      prepareCampaignLootReferences(dataset(), new Set([33]), [{ ...quest, game: "tbc" }]).queue,
    ).toEqual([{ game: "forever", kind: "quest", id: 33 }]);
    expect(prepareCampaignLootReferences(dataset(), new Set([999]), []).queue).toEqual([]);
  });
  it("takes explicit sharing overrides without assuming shareable means shared loot", () => {
    const result = prepareCampaignLootReferences(
      dataset(),
      new Set([33]),
      [quest, item],
      [{ questId: 33, itemId: 750, sharing: "independent" }],
    );
    expect(result.data.quests[0]!.itemObjectives![0]!.sharing).toBe("independent");
    expect(result.reviews.some((r) => r.reason.includes("independent rolls"))).toBe(false);
  });
  it("keeps same-time conflicting drop evidence unresolved across repeated quest references", () => {
    const original = dataset();
    original.quests.push({ ...original.quests[0]!, questId: 34 });
    original.lootDrops = [
      {
        itemId: 750,
        npcId: 299,
        probability: 0.5,
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        ...metadata,
      },
    ].map(({ game: _, ...drop }) => drop);
    const result = prepareCampaignLootReferences(original, new Set([33, 34]), [
      quest,
      { ...quest, id: 34 },
      item,
    ]);
    expect(result.data.lootDrops).toEqual([]);
    expect(result.reviews.some((review) => review.reason.includes("Conflicting"))).toBe(true);
  });
  it("recovers a missing quantity from explicit quest evidence rather than assuming one", () => {
    const original = dataset();
    original.quests[0]!.itemObjectives = [
      { itemId: 750, quantity: null, objectiveIndex: 1, npcIds: [299], sharing: "unknown" },
    ];
    expect(prepareCampaignLootReferences(original, new Set([33]), []).queue).toContainEqual({
      game: "forever",
      kind: "quest",
      id: 33,
    });
    const result = prepareCampaignLootReferences(original, new Set([33]), [quest]);
    expect(result.data.quests[0]!.itemObjectives?.[0]?.quantity).toBe(8);
    expect(result.queue).toEqual([{ game: "forever", kind: "item", id: 750 }]);
  });
  it("recovers quantities from previously captured named objective rows without changing the capture", () => {
    const original = dataset();
    original.quests[0]!.itemObjectives = [
      { itemId: 750, quantity: null, objectiveIndex: 1, npcIds: [299], sharing: "unknown" },
    ];
    const { requiredItems: _, ...olderQuest } = quest;
    const captured = { ...olderQuest, objectives: ["Collect the food. Tough Wolf Meat (8)"] };
    const before = JSON.stringify(captured);
    const result = prepareCampaignLootReferences(original, new Set([33]), [
      captured,
      { ...item, name: "Tough Wolf Meat" },
    ]);
    expect(result.data.quests[0]!.itemObjectives?.[0]?.quantity).toBe(8);
    expect(result.queue).toEqual([]);
    expect(JSON.stringify(captured)).toBe(before);
  });
  it("preserves whether a probability was inferred from collected samples", () => {
    const result = prepareCampaignLootReferences(dataset(), new Set([33]), [
      quest,
      {
        ...item,
        relations: [
          {
            ...item.relations[0]!,
            dropStatistics: { ...item.relations[0]!.dropStatistics!, percentBasis: "sample-ratio" },
          },
        ],
      },
    ]);
    expect(result.data.lootDrops?.[0]?.probabilityBasis).toBe("sample-ratio");
  });
  it("does not recrawl supplied items or add collection kills after pickup", () => {
    const original = dataset();
    original.quests[0]!.itemObjectives = [
      { itemId: 750, quantity: null, objectiveIndex: 1, npcIds: [299], sharing: "unknown" },
    ];
    const { requiredItems: _, ...olderQuest } = quest;
    const result = prepareCampaignLootReferences(original, new Set([33]), [
      { ...olderQuest, objectives: ["Bring the food. Tough Wolf Meat (Provided) (8)"] },
      { ...item, name: "Tough Wolf Meat" },
    ]);
    expect(result.data.quests[0]!.itemObjectives?.[0]).toMatchObject({
      quantity: 8,
      provided: true,
      npcIds: [],
    });
    expect(result.queue).toEqual([]);
  });
  it("does not ask for drop rates on gathering-only item objectives", () => {
    const original = dataset();
    original.quests = [
      {
        ...original.quests[0]!,
        itemCreatureIds: [],
        itemObjectives: [
          {
            itemId: 750,
            quantity: 8,
            objectiveIndex: 1,
            npcIds: [],
            sharing: "unknown",
          },
        ],
      },
    ];
    const result = prepareCampaignLootReferences(original, new Set([33]), []);
    expect(result.queue).toEqual([]);
    expect(result.reviews).toEqual([]);
  });
});
