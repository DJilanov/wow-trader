import { describe, expect, it } from "vitest";
import {
  referencedQuestObjectiveIndexes,
  mergeQuestObjectiveIndexes,
} from "./campaign-quest-objectives.js";
import type { CombatQuestReference } from "./combat-model.js";

describe("explicit whole-quest objective requirements", () => {
  it("keeps kill, item and disputed indices without inventing an index for unmapped items", () => {
    const quest: CombatQuestReference = {
      questId: 300001,
      creatureIds: [114],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: false,
      killQuotas: [{ objectiveIndex: 1, npcId: 114, kills: 3, source: "Synthetic source control" }],
      killQuotaConflicts: [3],
      itemObjectives: [
        {
          objectiveIndex: 2,
          itemId: 1,
          itemName: "Control item",
          quantity: 1,
          npcIds: [],
          sharing: "unknown",
        },
        {
          objectiveIndex: null,
          itemId: 2,
          itemName: "Unmapped control item",
          quantity: 1,
          npcIds: [],
          sharing: "unknown",
        },
      ],
    };
    const before = JSON.stringify(quest);
    expect(referencedQuestObjectiveIndexes([quest])).toEqual({ "300001": [1, 2, 3] });
    expect(JSON.stringify(quest)).toBe(before);
  });

  it("unions party and personal definitions without dropping a requirement or mutating inputs", () => {
    const a = { "300001": [1] },
      b = { "300001": [2], "300002": [1] };
    expect(mergeQuestObjectiveIndexes([a, undefined, b])).toEqual({
      "300001": [1, 2],
      "300002": [1],
    });
    expect(a).toEqual({ "300001": [1] });
    expect(b).toEqual({ "300001": [2], "300002": [1] });
  });
});
