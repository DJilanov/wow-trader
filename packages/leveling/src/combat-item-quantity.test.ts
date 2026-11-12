import { describe, expect, it } from "vitest";
import {
  conflictingItemQuantities,
  holdConflictingCombatItemQuantities,
} from "./combat-item-quantity.js";
import type { CombatDataset } from "./combat-model.js";

describe("current item prose and historical count conflicts", () => {
  it.each([
    ["Obtain 4 Young Crocolisk Skins for James Halloran.", "Young Crocolisk Skin", 6, [4]],
    ["Travel north and collect 15 Spire Spider Eggs.", "Spire Spider Egg", 10, [15]],
    ["Bring 4 Frostmaul Shards to me.", "Frostmaul Shards", 10, [4]],
    ["Collect 4 A+B [Token]s.", "A+B [Token]", 6, [4]],
    ["Bring 4 Skins. Collect 6 Skins.", "Skin", 6, [4, 6]],
    ["Bring 4 Skins.", "Skin", 4, []],
    ["Bring 4 Skins.", "Skin", null, []],
    ["Bring four Skins.", "Skin", 6, []],
    ["Bring at least 4 Skins.", "Skin", 6, []],
    ["Do not collect 4 Skins.", "Skin", 6, []],
    ["Don't collect 4 Skins.", "Skin", 6, []],
    ["Bring 4 Skinning Knives.", "Skin", 6, []],
    ["Bring 4 Skins.", undefined, 6, []],
    ["Collect 0 Skins.", "Skin", 6, []],
    ["Collect 1001 Skins.", "Skin", 6, []],
  ] as const)("checks %s conservatively", (text, name, quantity, expected) => {
    expect(conflictingItemQuantities([text], name, quantity)).toEqual(expected);
  });

  it("holds a contradiction without choosing a replacement, changing loot or mutating input", () => {
    const data: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      provider: {
        repository: "https://example.test/provider",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: [],
      },
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
      quests: [
        {
          questId: 484,
          creatureIds: [],
          itemCreatureIds: [],
          objectiveText: ["Obtain 4 Young Crocolisk Skins for James Halloran."],
          onlyCreatureObjectives: false,
          itemObjectives: [
            {
              itemId: 3397,
              itemName: "Young Crocolisk Skin",
              objectiveIndex: 1,
              quantity: 6,
              sharing: "unknown",
              npcIds: [],
            },
          ],
        },
      ],
    };
    const before = JSON.stringify(data),
      result = holdConflictingCombatItemQuantities(data);
    expect(result.conflicts).toEqual([
      {
        questId: 484,
        itemId: 3397,
        itemName: "Young Crocolisk Skin",
        quantity: 6,
        objectiveQuantities: [4],
      },
    ]);
    expect(result.data.quests[0]!.itemObjectives![0]).toEqual({
      ...data.quests[0]!.itemObjectives![0],
      quantity: null,
    });
    expect(result.data.npcs).toBe(data.npcs);
    expect(result.data.dungeons).toBe(data.dungeons);
    expect(JSON.stringify(data)).toBe(before);
    const repeated = holdConflictingCombatItemQuantities(result.data);
    expect(repeated.conflicts).toEqual([]);
    expect(repeated.data).toBe(result.data);
  });
});
