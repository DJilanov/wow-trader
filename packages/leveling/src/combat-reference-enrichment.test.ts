import { describe, expect, it } from "vitest";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import {
  reuseCombatLootReferences,
  supplementCombatItemStarts,
} from "./combat-reference-enrichment.js";

const revision = "a".repeat(64);
function dataset(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    publication: "private-reference",
    authorizationNote: "",
    targetBuild: 70205,
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: revision,
      questSha256: revision,
      itemSha256: revision,
      limitations: ["Synthetic unit-test source"],
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
        prerequisites: { allOf: [32], anyOf: [] },
        itemObjectives: [
          { objectiveIndex: 1, itemId: 750, quantity: null, sharing: "unknown", npcIds: [299] },
        ],
      },
    ],
    lootDrops: [
      {
        itemId: 750,
        npcId: 299,
        probability: 0.4,
        probabilityBasis: "reported",
        minimumQuantity: null,
        maximumQuantity: null,
        sampleSize: null,
        targetBuild: 70205,
        sourceUrl: "https://example.test/item=750",
        capturedAt: "2026-10-31T00:00:00Z",
        sourceSha256: revision,
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}

describe("same-provider item-start supplementation", () => {
  it("adds only reciprocal start identities, preserving every old field and input", () => {
    const current = dataset(),
      imported = dataset();
    imported.quests[0]!.startItem = { itemId: 750, name: "Quest Starter" };
    imported.quests[0]!.itemObjectives![0]!.quantity = 99;
    imported.npcs[0]!.rank = 1;
    const before = JSON.stringify({ current, imported });
    const result = supplementCombatItemStarts(current, imported);
    expect(result.quests[0]!.startItem).toEqual(imported.quests[0]!.startItem);
    const { startItem: _start, ...unchanged } = result.quests[0]!;
    expect(unchanged).toEqual(current.quests[0]);
    expect(result.npcs).toEqual(current.npcs);
    expect(result.lootDrops).toEqual(current.lootDrops);
    expect(JSON.stringify({ current, imported })).toBe(before);
    expect(supplementCombatItemStarts(result, imported)).toEqual(result);
  });

  it("rejects changed providers and conflicting existing starts", () => {
    const current = dataset(),
      imported = dataset();
    imported.provider.itemSha256 = "b".repeat(64);
    expect(() => supplementCombatItemStarts(current, imported)).toThrow(/exact same/);
    imported.provider.itemSha256 = current.provider.itemSha256;
    current.quests[0]!.startItem = { itemId: 750, name: "Starter" };
    expect(() => supplementCombatItemStarts(current, imported)).toThrow(/Conflicting/);
  });
});

describe("provider upgrades preserve separate captured loot facts", () => {
  it("retains captured quotas and acquisition evidence without reverting corrected provider data", () => {
    const previous = dataset();
    previous.quests[0]!.itemObjectives![0] = {
      ...previous.quests[0]!.itemObjectives![0]!,
      quantity: 8,
      sharing: "independent",
      vendorEvidence: {
        npcIds: [299],
        sourceUrl: "https://example.test/item=750",
        sourceSha256: revision,
        capturedAt: "2026-10-31T00:00:00Z",
      },
    };
    previous.killXpEvidence = [
      {
        npcId: 299,
        build: 70205,
        playerLevel: 1,
        mobLevel: 1,
        partySize: 1,
        partyLevels: [1],
        environment: "outdoor",
        unrestedXpPerPlayer: 50,
        sampleCount: 3,
        source: "Synthetic private recording",
        contextVerified: true,
      },
    ];
    const current = dataset();
    current.npcs[0]!.minimumLevel = 2;
    current.npcs[0]!.maximumLevel = 2;
    current.quests[0]!.prerequisites = { allOf: [31], anyOf: [] };
    delete current.lootDrops;
    const before = JSON.stringify({ previous, current });
    const merged = reuseCombatLootReferences(current, previous, revision);
    expect(merged.quests[0]).toMatchObject({
      prerequisites: { allOf: [31] },
      itemObjectives: [
        {
          quantity: 8,
          sharing: "independent",
          vendorEvidence: previous.quests[0]!.itemObjectives![0]!.vendorEvidence,
        },
      ],
    });
    expect(merged.npcs[0]!.minimumLevel).toBe(2);
    expect(merged.lootDrops).toEqual(previous.lootDrops);
    expect(merged.lootDrops![0]!.minimumQuantity).toBeNull();
    expect(merged.killXpEvidence).toEqual([]);
    expect(merged.dungeons).toEqual([]);
    expect(merged.publication).toBe("private-reference");
    expect(merged.provider.limitations.at(-1)).toContain(revision);
    expect(JSON.stringify({ previous, current })).toBe(before);
  });

  it("keeps current explicit facts and does not silently bind conflicting objective indices", () => {
    const previous = dataset(),
      current = dataset();
    previous.quests[0]!.itemObjectives![0] = {
      ...previous.quests[0]!.itemObjectives![0]!,
      quantity: 8,
      sharing: "independent",
      provided: true,
      objectiveIndex: 2,
    };
    current.quests[0]!.itemObjectives![0] = {
      ...current.quests[0]!.itemObjectives![0]!,
      quantity: 5,
      sharing: "pooled",
      provided: false,
    };
    current.lootDrops![0]!.probability = 0.8;
    const merged = reuseCombatLootReferences(current, previous, revision);
    expect(merged.quests[0]!.itemObjectives![0]).toMatchObject({
      quantity: 5,
      sharing: "pooled",
      provided: false,
      objectiveIndex: null,
      npcIds: [299],
    });
    expect(merged.lootDrops![0]!.probability).toBe(0.8);
  });

  it("does not copy one item's quota into multiple objectives or keep drops for removed creatures", () => {
    const previous = dataset(),
      current = dataset();
    previous.quests[0]!.itemObjectives![0]!.quantity = 8;
    current.quests[0]!.itemObjectives!.push({
      ...current.quests[0]!.itemObjectives![0]!,
      objectiveIndex: 2,
    });
    current.npcs = [];
    delete current.lootDrops;
    const merged = reuseCombatLootReferences(current, previous, revision);
    expect(merged.quests[0]!.itemObjectives!.map((item) => item.quantity)).toEqual([null, null]);
    expect(merged.lootDrops).toEqual([]);
  });

  it("requires an exact source hash and matching build", () => {
    const current = dataset(),
      previous = dataset();
    expect(() => reuseCombatLootReferences(current, previous, "unknown")).toThrow(/same build/);
    previous.targetBuild = 70450;
    expect(() => reuseCombatLootReferences(current, previous, revision)).toThrow(/same build/);
  });
});
