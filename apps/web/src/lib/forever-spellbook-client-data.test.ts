import { describe, expect, it } from "vitest";
import type { Spellbook, SpellDescription, TalentClass } from "@wow-trader/forever-data";

import { selectForeverSpellbookClientData } from "./forever-spellbook-client-data";

describe("Forever spellbook client data", () => {
  it("sends only the selected class spell descriptions and icons to the browser", () => {
    const spellbook = {
      general: [["Attack", "Rank 1"]],
      tabs: [{ name: "Arms", spells: [["Heroic Strike", "Rank 2"]] }],
      icons: {},
      levels: {},
      notes: [],
      missing: [],
    } as unknown as Spellbook;
    const classData = {
      icon: "class_warrior",
      trees: [{ name: "Arms", icon: "tree_arms", talents: [] }],
    } as unknown as TalentClass;
    const descriptions = {
      "Warrior|Attack|Rank 1": { d: "Attack" },
      "Warrior|Heroic Strike|Rank 2": { d: "Strike" },
      "Mage|Fireball|Rank 1": { d: "Fire" },
    } as unknown as Record<string, SpellDescription>;

    expect(
      selectForeverSpellbookClientData("Warrior", classData, spellbook, descriptions, {
        Attack: "attack",
        "Heroic Strike": "strike",
        Fireball: "fire",
      }),
    ).toEqual({
      classIcon: "class_warrior",
      treeIcons: { Arms: "tree_arms" },
      descriptions: {
        "Warrior|Attack|Rank 1": { d: "Attack" },
        "Warrior|Heroic Strike|Rank 2": { d: "Strike" },
      },
      icons: { Attack: "attack", "Heroic Strike": "strike" },
    });
  });
});
