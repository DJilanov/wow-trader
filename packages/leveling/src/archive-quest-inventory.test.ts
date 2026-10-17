import { describe, expect, it } from "vitest";
import { buildArchiveQuestInventory, type ArchiveQuestSource } from "./archive-quest-inventory.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { DungeonQuest } from "./dungeon-model.js";

function source(text: string, faction: "alliance" | "horde", suffix = "1"): ArchiveQuestSource {
  const id = `chapter-${faction}-${suffix}`;
  return {
    guide: parseGuideChapter(text, id, "a".repeat(64), 70205),
    reference: {
      id,
      sourceId: Number(suffix),
      title: "1-6 Starting Zone",
      factions: [faction],
      family: "questing",
      condition: "",
      defaults: [],
      labels: [],
      next: [],
      xpRates: [],
    },
  };
}
function dungeon(): DungeonQuest {
  return {
    id: 300,
    title: "Dungeon Quest",
    faction: "horde",
    classSlug: null,
    raceIds: [],
    restrictionsKnown: true,
    minimumLevel: 10,
    questLevel: 15,
    pickup: null,
    turnin: null,
    objective: null,
    position: null,
    pickupStage: "unknown",
    objectiveStage: "unknown",
    gate: {
      kind: "any",
      gates: [
        { kind: "quest", questId: 301, state: "rewarded" },
        {
          kind: "all",
          gates: [
            { kind: "quest", questId: 302, state: "accepted" },
            { kind: "item", itemId: 999 },
          ],
        },
      ],
    },
    referenceXp: null,
    shareable: null,
    rewards: { fixed: [], choices: [] },
    requiredItems: [],
    notes: [],
    evidence: { source: "test", build: 70205, effectiveDate: "2026-10-15", status: "reference" },
    minimumLevelClaims: [],
  };
}

describe("complete archive quest collection inventory", () => {
  it("retains both factions, alternate guide families and excluded/conditional source branches", () => {
    const alliance = source(
      "step << skip\n.accept 1 >>Quest one << Warrior\n.complete 1,10\nstep\n.accept 2",
      "alliance",
    );
    const hordeBase = source("step\n.accept 1\n.turnin 3", "horde");
    const horde = {
      ...hordeBase,
      reference: { ...hordeBase.reference, family: "mage-aoe" as const },
    };
    const entries = buildArchiveQuestInventory([alliance, horde], []);
    expect(entries.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(entries[0]?.factions).toEqual(["alliance", "horde"]);
    expect(entries[0]?.origins[0]).toMatchObject({
      kind: "guide",
      stepCondition: "skip",
      condition: "Warrior",
    });
    expect(entries[0]?.origins).toHaveLength(3);
    expect(entries[2]?.origins[0]).toMatchObject({ family: "mage-aoe" });
  });
  it("includes condition-only and item-linked quests without treating objective/item/choice numbers as quest IDs", () => {
    const guide = source(
      `step
.isOnQuest 10,11
.isQuestTurnedIn 12,13,account
.isQuestAvailable 14,15
.isNotOnQuest 16,17
.isQuestComplete 18,98765
.isQuestNotComplete 19
.addquestitem 54321,20
.complete 21,9
.turnin 22,8
.collect 43210,7`,
      "horde",
    );
    const entries = buildArchiveQuestInventory([guide], []);
    expect(entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 10),
    );
    expect(entries.find((entry) => entry.id === 18)?.origins[0]).toMatchObject({
      role: "condition",
    });
    expect(entries.find((entry) => entry.id === 20)?.origins[0]).toMatchObject({
      role: "item-reference",
    });
  });
  it("keeps signed optional hand-ins, daily alternatives and accept-flag quest references", () => {
    const guide = source(
      "step\n.turnin -41,1\n.daily 42,43,44\n.dailyturnin 42,43,44\n.accept 45,2,46",
      "alliance",
    );
    const entries = buildArchiveQuestInventory([guide], []);
    expect(entries.map((entry) => entry.id)).toEqual([41, 42, 43, 44, 45, 46]);
    expect(entries.find((entry) => entry.id === 46)?.origins[0]).toMatchObject({
      role: "condition",
    });
  });
  it("includes all known dungeon gates and unresolved associations without inventing faction eligibility", () => {
    const entries = buildArchiveQuestInventory([], [dungeon()], [{ questId: 303 }]);
    expect(entries.map((entry) => entry.id)).toEqual([300, 301, 302, 303]);
    expect(entries[1]).toMatchObject({
      factions: ["horde"],
      origins: [{ role: "prerequisite", ownerQuestId: 300 }],
    });
    expect(entries[3]?.factions).toEqual([]);
    expect(entries.some((entry) => entry.id === 999)).toBe(false);
  });
  it("rejects duplicate/mismatched chapter identities and invalid quest references", () => {
    const guide = source("step\n.accept 1", "alliance");
    expect(() => buildArchiveQuestInventory([guide, guide], [])).toThrow(/duplicate/);
    expect(() =>
      buildArchiveQuestInventory(
        [{ ...guide, reference: { ...guide.reference, id: "other" } }],
        [],
      ),
    ).toThrow(/Mismatched/);
    expect(() => buildArchiveQuestInventory([source("step\n.isOnQuest abc", "horde")], [])).toThrow(
      /Invalid quest/,
    );
    expect(() =>
      buildArchiveQuestInventory([source("step\n.isOnQuest 1,account", "horde")], []),
    ).toThrow(/Invalid quest/);
    expect(() =>
      buildArchiveQuestInventory([source("step\n.addquestitem 123", "horde")], []),
    ).toThrow(/Missing quest/);
  });
});
