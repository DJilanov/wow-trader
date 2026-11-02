import { describe, expect, it } from "vitest";
import { campaignItemObjectiveQuantity } from "./campaign-item-quantities.js";
import type { CombatQuestReference } from "./combat-model.js";

function quantity(
  itemName: string,
  ...objectiveText: string[]
): ReturnType<typeof campaignItemObjectiveQuantity> {
  const quest: CombatQuestReference = {
    questId: 86,
    creatureIds: [],
    itemCreatureIds: [],
    objectiveText,
    onlyCreatureObjectives: false,
  };
  return campaignItemObjectiveQuantity(quest, itemName);
}

describe("full item requirement quantities", () => {
  it.each([
    ["Chunk of Boar Meat", "Bring 4 Chunks of Boar Meat to Auntie Bernice.", 4],
    [
      "Bear Meat",
      "Bring 3 pieces of Bear Meat, 3 Boar Intestines, and 3 Spider Ichor to Vidra.",
      3,
    ],
    [
      "Boar Intestines",
      "Bring 3 pieces of Bear Meat, 3 Boar Intestines, and 3 Spider Ichor to Vidra.",
      3,
    ],
    [
      "Spider Ichor",
      "Bring 3 pieces of Bear Meat, 3 Boar Intestines, and 3 Spider Ichor to Vidra.",
      3,
    ],
    ["Small Spider Leg", "Collect 7 Small Spider Legs for Zenn Foulhoof.", 7],
    ["Darkshore Grouper", "Catch 6 Darkshore Grouper for Gubber Blump.", 6],
    ["Strider Meat", "Bring back 5 Strider Meat to Alanndarian Nightsong.", 5],
    ["Empty Powder Keg", "Bring an Empty Powder Keg to Quarrymaster Thesten.", 1],
  ] as const)("binds %s to an explicit objective quantity", (name, text, count) => {
    expect(quantity(name, text)).toEqual({ quantity: count, conflict: false });
  });

  it("holds genuinely conflicting full requirements", () => {
    expect(quantity("Meat", "Bring 4 Meat to Billy.", "Collect 8 Meat for Billy.")).toEqual({
      quantity: null,
      conflict: true,
    });
  });

  it.each([
    "Bring the Meat to Billy.",
    "Collect Meat for Billy.",
    "Bring 4 Boar Meat to Billy.",
    "Bring 1.5 Meat to Billy.",
    "Bring 2-3 Meat to Billy.",
    "Bring 0 Meat to Billy.",
    "Bring 10001 Meat to Billy.",
    "An optional reminder says collect 4 Meat.",
  ])("does not infer a full quantity from %s", (text) => {
    expect(quantity("Meat", text)).toEqual({ quantity: null, conflict: false });
  });
});
