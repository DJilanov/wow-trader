import { describe, expect, it } from "vitest";
import snapshots from "./fixtures/quest-client-corrections-70205-70450.json" with { type: "json" };
import { reconcileClientProvidedItems } from "./combat-client-provided-items.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";

function fixture(): {
  combat: CombatDataset;
  catalog: QuestCatalog;
  snapshots: typeof snapshots;
  questIds: number[];
} {
  return {
    combat: combatDatasetSchema.parse({
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic provider",
      provider: {
        repository: "https://example.test/provider",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic provider data, not observed loot or XP."],
      },
      npcs: [],
      quests: [{
        questId: 98824,
        creatureIds: [],
        itemCreatureIds: [260326],
        objectiveText: [snapshots[0]!.document.quests["98824"].objectivesText],
        onlyCreatureObjectives: false,
        onlyInteractionObjectives: false,
        requiredClasses: 0,
        itemObjectives: [{
          objectiveIndex: 1, itemId: 270865, itemName: "Titan Relic", quantity: 1,
          npcIds: [], sharing: "unknown", provided: true,
        }],
      }],
      dungeons: [],
      killXpEvidence: [],
    }),
    catalog: questCatalogSchema.parse({
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic catalog",
      providerRevision: "a".repeat(40),
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      areaMapSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
      includesAuthoredCorrections: true,
      quests: [{
        questId: 98824, title: "Prehistoric Prism", minimumLevel: 24, questLevel: 31,
        requiredClasses: 0, requiredRaces: 1,
        providedItem: { itemId: 287959, name: "Titan Relic" },
        starts: [{ npcId: 1077, name: "Prospector Whelgar", friendlyToAlliance: true,
          positions: [{ zone: "1437", x: 38.81, y: 52.39 }] }],
        ends: [{ npcId: 5387, name: "High Explorer Magellas", friendlyToAlliance: true,
          positions: [{ zone: "1455", x: 69.93, y: 18.55 }] }],
        prerequisites: { allOf: [95810], anyOf: [] }, exclusiveWith: [],
        category: "unsupported", objectives: [],
        unsupportedRequirements: ["provided-item-interaction", "non-outdoor-zone"],
      }],
    }),
    snapshots: structuredClone(snapshots),
    questIds: [98824],
  };
}

describe("matching-build supplied parcel identity", () => {
  it("uses the supplied second relic, preserving the original boss loot only in provenance", () => {
    const input = fixture(), before = structuredClone(input);
    const result = reconcileClientProvidedItems(input);
    expect(result.combat.quests[0]!.itemObjectives).toEqual([
      { ...input.combat.quests[0]!.itemObjectives![0]!, itemId: 287959 },
    ]);
    expect(result.combat.quests[0]!.itemCreatureIds).toEqual([]);
    expect(result.resolutions[0]).toEqual(expect.objectContaining({
      itemId: 287959, clientObjectiveId: 478769,
      previous: { combat: input.combat.quests[0], catalog: input.catalog.quests[0] },
    }));
    expect(result.combat.npcs).toEqual(input.combat.npcs);
    expect(combatDatasetSchema.parse(result.combat)).toEqual(result.combat);
    expect(input).toEqual(before);
    expect(reconcileClientProvidedItems({ ...input, combat: result.combat }).combat).toEqual(result.combat);
  });

  it.each([
    "provider", "build", "item-provenance", "missing-quest", "class", "start-item", "not-provided",
    "quantity", "npc-source", "sharing", "extra-item", "kill", "interaction", "item-name",
    "client-item", "client-source-item", "client-count", "client-index", "client-mixed-objective",
    "client-title", "client-level", "client-minimum", "client-text", "catalog-item", "recipient",
    "unfriendly", "no-position", "unsupported-method", "selection",
  ])("holds an incompatible parcel rather than waiving its acquisition: %s", (kind) => {
    const input = fixture(), quest = input.combat.quests[0]!, item = quest.itemObjectives![0]!,
      definition = input.catalog.quests[0]!, client = input.snapshots[1]!.document.quests["98824"];
    if (kind === "provider") input.combat.provider.questSha256 = "e".repeat(64);
    else if (kind === "build") input.combat.targetBuild = 70450;
    else if (kind === "item-provenance") delete input.catalog.itemSha256;
    else if (kind === "missing-quest") input.combat.quests = [];
    else if (kind === "class") quest.requiredClasses = 1;
    else if (kind === "start-item") quest.startItem = { itemId: 270865, name: "Titan Relic" };
    else if (kind === "not-provided") item.provided = false;
    else if (kind === "quantity") item.quantity = 2;
    else if (kind === "npc-source") item.npcIds = [260326];
    else if (kind === "sharing") item.sharing = "pooled";
    else if (kind === "extra-item") quest.itemObjectives!.push({ ...item, objectiveIndex: 2 });
    else if (kind === "kill") quest.creatureIds = [260326];
    else if (kind === "interaction") quest.onlyInteractionObjectives = true;
    else if (kind === "item-name") item.itemName = "Other relic";
    else if (kind === "client-item") client.objectives[0]!.objectId = 270865;
    else if (kind === "client-source-item") client.startItemId = 270865;
    else if (kind === "client-count") client.objectives[0]!.amount = 2;
    else if (kind === "client-index") client.objectives[0]!.storageIndex = 1;
    else if (kind === "client-mixed-objective") client.objectives.push({ ...client.objectives[0]!, type: "monster" });
    else if (kind === "client-title") client.title = "Other quest";
    else if (kind === "client-level") client.level = 32;
    else if (kind === "client-minimum") client.minLevel = 25;
    else if (kind === "client-text") client.objectivesText += " Slay a guardian.";
    else if (kind === "catalog-item") definition.providedItem!.itemId = 270865;
    else if (kind === "recipient") definition.ends[0]!.name = "Another explorer";
    else if (kind === "unfriendly") definition.ends[0]!.friendlyToAlliance = false;
    else if (kind === "no-position") definition.ends[0]!.positions = [];
    else if (kind === "unsupported-method") definition.unsupportedRequirements.push("escort");
    else if (kind === "selection") input.questIds.push(98824);
    expect(() => reconcileClientProvidedItems(input)).toThrow();
  });
});
