import { describe, expect, it } from "vitest";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import {
  reuseCombatLootReferences,
  correctCombatNpcMetadata,
  supplementCombatItemStarts,
  supplementCombatNpcMetadata,
} from "./combat-reference-enrichment.js";
import type { CombatNpcMetadataReference } from "./combat-npc-metadata.js";

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
          {
            objectiveIndex: 1,
            itemId: 750,
            itemName: "Tough Wolf Meat",
            quantity: null,
            sharing: "unknown",
            npcIds: [299],
          },
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

function metadata(): CombatNpcMetadataReference {
  const source = {
    build: 70450,
    sourceUrl: "https://example.test/pinned-creatures.json",
    sha256: revision,
  };
  return {
    npcId: 299,
    name: "Young Wolf",
    minimumLevel: 13,
    maximumLevel: 14,
    rank: 1,
    levelSource: { ...source, build: 70338 },
    rankSource: source,
    attribution: "Synthetic metadata fixture",
    limitation: "Cross-build reference, not kill XP evidence",
  };
}

describe("attributed creature metadata for named provider stubs", () => {
  it("fills only the selected stub fields and preserves build provenance and all other facts", () => {
    const current = dataset();
    current.npcs[0]!.minimumLevel = null;
    current.npcs[0]!.maximumLevel = null;
    const input = metadata(),
      before = JSON.stringify({ current, input });
    const result = supplementCombatNpcMetadata(current, [input]);
    expect(result.npcs[0]).toEqual({
      ...current.npcs[0],
      minimumLevel: 13,
      maximumLevel: 14,
      rank: 1,
    });
    const { npcs: _npcs, npcMetadataReferences: _references, ...unchanged } = result;
    const { npcs: _oldNpcs, ...previous } = current;
    expect(unchanged).toEqual(previous);
    expect(result.npcMetadataReferences).toEqual([input]);
    expect(result.killXpEvidence).toEqual([]);
    expect(JSON.stringify({ current, input })).toBe(before);
  });

  it("rejects known fields, wrong identities, excluded creatures and duplicate or absent references", () => {
    const current = dataset(),
      input = metadata();
    expect(() => supplementCombatNpcMetadata(current, [input])).toThrow(/level-less/);
    current.npcs[0]!.minimumLevel = null;
    current.npcs[0]!.maximumLevel = null;
    expect(() => supplementCombatNpcMetadata(current, [{ ...input, name: "Other Wolf" }])).toThrow(
      /matching/,
    );
    expect(() => supplementCombatNpcMetadata(current, [{ ...input, npcId: 100 }])).toThrow(
      /absent/,
    );
    expect(() => supplementCombatNpcMetadata(current, [input, input])).toThrow(/Duplicate/);
    current.npcs[0]!.rank = 1;
    expect(() => supplementCombatNpcMetadata(current, [input])).toThrow(/level-less/);
    current.npcs[0]!.rank = 0;
    current.npcs[0]!.xpEligibility = "excluded";
    expect(() => supplementCombatNpcMetadata(current, [input])).toThrow(/level-less/);
  });

  it("rejects detached metadata or a changed normalized NPC on later reads", () => {
    const current = dataset();
    current.npcs[0]!.minimumLevel = null;
    current.npcs[0]!.maximumLevel = null;
    const result = supplementCombatNpcMetadata(current, [metadata()]);
    result.npcs[0]!.maximumLevel = 15;
    expect(() => combatDatasetSchema.parse(result)).toThrow(/metadata provenance/);
    result.npcs[0]!.maximumLevel = 14;
    result.npcMetadataReferences!.push(metadata());
    expect(() => combatDatasetSchema.parse(result)).toThrow(/metadata provenance/);
  });
});

describe("reviewed creature metadata corrections", () => {
  it("corrects an explicitly pinned prior record while preserving its identity and XP evidence", () => {
    const current = dataset(),
      input = metadata();
    const before = JSON.stringify({ current, input });
    const result = correctCombatNpcMetadata(current, [
      { previous: current.npcs[0]!, reference: input },
    ]);
    expect(result.npcs[0]).toEqual({
      ...current.npcs[0],
      minimumLevel: 13,
      maximumLevel: 14,
      rank: 1,
    });
    const { npcs: _npcs, npcMetadataReferences: _references, ...unchanged } = result;
    const { npcs: _previousNpcs, ...previous } = current;
    expect(unchanged).toEqual(previous);
    expect(result.npcMetadataReferences).toEqual([input]);
    expect(JSON.stringify({ current, input })).toBe(before);
  });

  it.each(["name", "level", "rank", "zones", "identity", "excluded", "unknown", "qualified"])(
    "rejects stale, mismatched or already qualified corrections (%s)",
    (change) => {
      const current = dataset(),
        previous = structuredClone(current.npcs[0]!),
        reference = metadata();
      if (change === "name") reference.name = "Different Wolf";
      if (change === "level") previous.maximumLevel = 2;
      if (change === "rank") previous.rank = 1;
      if (change === "zones") previous.zoneIds = [13];
      if (change === "identity") previous.id = 300;
      if (change === "excluded")
        current.npcs[0]!.xpEligibility = previous.xpEligibility = "excluded";
      if (change === "unknown") current.npcs[0]!.xpEligibility = previous.xpEligibility = "unknown";
      if (change === "qualified") current.npcMetadataReferences = [metadata()];
      expect(() => correctCombatNpcMetadata(current, [{ previous, reference }])).toThrow(
        /exact unqualified prior/,
      );
    },
  );

  it("rejects duplicate or absent corrections and cannot replay against a changed record", () => {
    const current = dataset(),
      correction = { previous: current.npcs[0]!, reference: metadata() };
    expect(() => correctCombatNpcMetadata(current, [correction, correction])).toThrow(/Duplicate/);
    expect(() =>
      correctCombatNpcMetadata(current, [
        { ...correction, reference: { ...correction.reference, npcId: 300 } },
      ]),
    ).toThrow(/absent/);
    const result = correctCombatNpcMetadata(current, [correction]);
    expect(() => correctCombatNpcMetadata(result, [correction])).toThrow(/exact unqualified prior/);
  });
});

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
  it("does not copy a historical count that contradicts the current named-item objective", () => {
    const previous = dataset(),
      current = dataset();
    previous.quests[0]!.itemObjectives![0]!.quantity = 6;
    current.quests[0]!.objectiveText = ["Obtain 4 Tough Wolf Meats for the cook."];
    const before = JSON.stringify({ current, previous });
    const result = reuseCombatLootReferences(current, previous, "d".repeat(64));
    expect(result.quests[0]!.itemObjectives![0]!.quantity).toBeNull();
    expect(result.lootDrops).toEqual(current.lootDrops);
    expect(JSON.stringify({ current, previous })).toBe(before);
    expect(
      reuseCombatLootReferences(current, result, "e".repeat(64)).quests[0]!.itemObjectives![0]!
        .quantity,
    ).toBeNull();
    current.quests[0]!.objectiveText = ["Obtain 6 Tough Wolf Meats for the cook."];
    expect(
      reuseCombatLootReferences(current, previous, "d".repeat(64)).quests[0]!.itemObjectives![0]!
        .quantity,
    ).toBe(6);
  });

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

  it("does not reuse a capture when item names cannot establish the upgraded identity", () => {
    const previous = dataset();
    for (const conflicting of [false, true]) {
      const current = dataset();
      current.lootDrops = [];
      if (conflicting)
        current.quests.push({
          ...current.quests[0]!,
          questId: 34,
          itemObjectives: [{ ...current.quests[0]!.itemObjectives![0]!, itemName: "Other meat" }],
        });
      else delete current.quests[0]!.itemObjectives![0]!.itemName;
      expect(reuseCombatLootReferences(current, previous, revision).lootDrops).toEqual([]);
    }
  });

  it("does not match absent creature identities to each other", () => {
    const previous = dataset(),
      current = dataset();
    previous.npcs = [];
    current.npcs = [];
    current.lootDrops = [];
    expect(reuseCombatLootReferences(current, previous, revision).lootDrops).toEqual([]);
  });

  it("does not inherit collection facts for a changed item identity", () => {
    const previous = dataset(),
      current = dataset();
    previous.quests[0]!.itemObjectives![0] = {
      ...previous.quests[0]!.itemObjectives![0]!,
      quantity: 8,
      sharing: "pooled",
      vendorEvidence: {
        npcIds: [299],
        sourceUrl: "https://example.test/item=750",
        sourceSha256: revision,
        capturedAt: "2026-10-31T00:00:00Z",
      },
    };
    current.quests[0]!.itemObjectives![0]!.itemName = "Corrected other item";
    const result = reuseCombatLootReferences(current, previous, revision);
    expect(result.quests[0]!.itemObjectives).toEqual(current.quests[0]!.itemObjectives);
    expect(result.lootDrops).toEqual(current.lootDrops);
  });
});
