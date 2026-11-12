import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import type { CombatQuestReference } from "./combat-model.js";

const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
const body =
  "step\n.goto 1429,50,50\n.accept 91733\nstep\n.goto 1429,51,51\n>>Loot the Waterlogged Axe on the ground\n.complete 91733,1 >>Waterlogged Axe 1/1\nstep\n.goto 1429,52,52\n>>Loot the Waterlogged Saw on the ground\n.complete 91733,2 >>Waterlogged Saw 1/1\nstep\n.goto 1429,53,53\n>>Loot the Waterlogged Toolbox on the ground\n.complete 91733,3 >>Waterlogged Toolbox 1/1\nstep\n.goto 1429,50,50\n.turnin 91733";
const quest: CombatQuestReference = {
  questId: 91733,
  requiredClasses: 0,
  creatureIds: [],
  itemCreatureIds: [],
  onlyCreatureObjectives: false,
  objectiveText: [
    "Collect the Waterlogged Axe, Waterlogged Saw, and Waterlogged Toolbox that have washed downstream.",
  ],
  itemObjectives: (
    [
      [247817, "Waterlogged Axe"],
      [247813, "Waterlogged Saw"],
      [247818, "Waterlogged Toolbox"],
    ] as const
  ).map(([itemId, itemName], index) => ({
    itemId,
    itemName,
    objectiveIndex: index + 1,
    quantity: 1,
    npcIds: [],
    sharing: "unknown",
  })),
};
function library(source = body, value = quest): ReturnType<typeof buildCampaignQuestLibrary> {
  return buildCampaignQuestLibrary(
    [{ reference, guide: parseGuideChapter(source, reference.id, "a".repeat(64), 70205) }],
    createCampaignSourceProfile("human", "warrior"),
    [],
    new Set(),
    [value],
  );
}

describe("explicit multi-object ground pickups", () => {
  it("accepts interact-key pickup instructions and possessive display-label variations", () => {
    const lockbox: CombatQuestReference = {
      ...quest,
      itemObjectives: [
        {
          ...quest.itemObjectives![0]!,
          itemName: "Mist Veil's Lockbox",
          objectIds: [562105],
        },
      ],
    };
    const source =
      "step\n.goto 1429,50,50\n.accept 91733\nstep\n.goto 1429,51,51\n>>On the arrow location, press your Interact with Target keybind to loot the Mist Veil's Lockbox\n.complete 91733,1 >>Mist Veil Lockbox (1)\nstep\n.goto 1429,50,50\n.turnin 91733";
    expect(library(source, lockbox)[0]!.worldObjectPickup).toBe(true);
    expect(
      library(source.replace("Mist Veil Lockbox (1)", "Silver Dawning Lockbox (1)"), lockbox)[0]!
        .worldObjectPickup,
    ).toBeUndefined();
  });
  it("shares pickup prose across consecutive counters and preserves unrelated camp kills", () => {
    const objects: CombatQuestReference = {
      ...quest,
      itemObjectives: quest.itemObjectives!.map((item, index) => ({
        ...item,
        objectIds: [562105 + index],
      })),
    };
    const source =
      "step\n.goto 1429,50,50\n.accept 91733\nstep\n.goto 1429,51,51\n>>Open the Waterlogged Supplies and loot their contents\n.complete 91733,1\n.complete 91733,2\n.complete 91733,3\n.use 5996\nstep\n.goto 1429,50,50\n.turnin 91733";
    expect(library(source, objects)[0]!.worldObjectPickup).toBe(true);
    const mixed = body.replace(
      "Loot the Waterlogged Axe on the ground",
      "Kill nearby Defias Thugs\n>>Open the Supply Crate. Loot it for the Waterlogged Axe\n.complete 18,1 >>Defias Thug slain (5)",
    );
    expect(library(mixed, objects).find((item) => item.questId === 91733)!.worldObjectPickup).toBe(
      true,
    );
    expect(
      library(source.replace(".use 5996", ".use 247817"), objects)[0]!.worldObjectPickup,
    ).toBeUndefined();
  });
  it("uses provider quantities when archived pickup counters have no display label", () => {
    const source = body.replace(/ >>Waterlogged (?:Axe|Saw|Toolbox) 1\/1/g, "");
    const objects: CombatQuestReference = {
      ...quest,
      itemObjectives: quest.itemObjectives!.map((item, index) => ({
        ...item,
        objectIds: [562105 + index],
      })),
    };
    expect(library(source, objects)[0]!.worldObjectPickup).toBe(true);
    expect(library(source)[0]!.worldObjectPickup).toBeUndefined();
    expect(library(source.replace(".goto 1429,51,51\n", ""), objects)[0]!.worldObjectPickup).toBe(
      true,
    );
    expect(
      library(source.replace(".complete 91733,1", ".use 247817\n.complete 91733,1"), objects)[0]!
        .worldObjectPickup,
    ).toBeUndefined();
    expect(
      library(
        source.replace(".complete 91733,1", ".complete 91733,1 >>Wrong Item (1)"),
        objects,
      )[0]!.worldObjectPickup,
    ).toBeUndefined();
  });
  it("uses provider object relations for pickup instructions beyond the on-the-ground wording", () => {
    const source = body.replaceAll("on the ground", "beside the marked riverbank");
    const objects: CombatQuestReference = {
      ...quest,
      itemObjectives: quest.itemObjectives!.map((item, index) => ({
        ...item,
        objectIds: [562105 + index],
      })),
    };
    expect(library(source, objects)[0]!.worldObjectPickup).toBe(true);
    expect(library(source)[0]!.worldObjectPickup).toBeUndefined();
    for (const replaced of [
      source.replace(
        "Loot the Waterlogged Axe beside the marked riverbank",
        "Buy the Waterlogged Axe from the auction house",
      ),
      source.replace(
        "Loot the Waterlogged Axe beside the marked riverbank",
        "Kill Defias Thugs and loot the Waterlogged Axe",
      ),
    ])
      expect(library(replaced, objects)[0]!.worldObjectPickup).toBeUndefined();
  });
  it("recognizes each source item and slash counter without requiring a respawn measurement", () => {
    const before = structuredClone(quest),
      result = library()[0]!;
    expect(result.objective).toBe("interaction");
    expect(result.worldObjectPickup).toBe(true);
    expect(
      result.actions
        .filter((action) => action.questChanges[0]!.state === "objectives-complete")
        .map((action) => action.questChanges[0]!.objectiveIndex),
    ).toEqual([1, 2, 3]);
    expect(quest).toEqual(before);
  });

  it("does not reinterpret a mob farm, item mismatch, count mismatch or use action as a pickup", () => {
    for (const source of [
      body.replace("Waterlogged Axe on the ground", "Waterlogged Axemaster on the ground"),
      body.replace("Waterlogged Axe 1/1", "Waterlogged Axe 1/2"),
      body.replace(
        "Loot the Waterlogged Axe on the ground",
        "Kill Defias Thugs and loot the Waterlogged Axe",
      ),
      body.replace(".complete 91733,1", ".mob Defias Thug\n.complete 91733,1"),
      body.replace(".complete 91733,1", ".use 247817\n.complete 91733,1"),
    ])
      expect(library(source)[0]!.worldObjectPickup).toBeUndefined();
    expect(
      library(body, {
        ...quest,
        itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, npcIds: [123] })),
      })[0]!.worldObjectPickup,
    ).toBeUndefined();
  });
});
