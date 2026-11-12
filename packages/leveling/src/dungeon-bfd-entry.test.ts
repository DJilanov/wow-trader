import { describe, expect, it } from "vitest";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";

describe("dungeon entry from the captured encounter levels", () => {
  it("places Excavation at26 without exceeding either encounter limit", () => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === "excavation")!;
    for (const difficultyPolicy of ["at-level", "experienced-premade"] as const) {
      const entry = premadeEntryLevel(stop, { ...emptyPremadeProgress(), difficultyPolicy });
      expect(entry).toBe(26);
      expect(29 - entry).toBeLessThanOrEqual(4);
      expect(31 - entry).toBe(5);
    }
    expect(DUNGEON_VISITS.find((entry) => entry.id === "excavation")!.levels).toEqual({
      hard: 26,
      medium: 26,
      atLevel: 26,
      easy: 31,
    });
  });
  it("uses RFK and Gnomeregan before their old padded targets while preserving quest access", () => {
    const progress = emptyPremadeProgress();
    const rfk = PREMADE_STOPS.find((entry) => entry.id === "razorfen-kraul")!;
    const gnomer = PREMADE_STOPS.find((entry) => entry.id === "gnomeregan")!;
    for (const difficultyPolicy of ["at-level", "experienced-premade"] as const) {
      expect(premadeEntryLevel(rfk, { ...progress, difficultyPolicy })).toBe(29);
      expect(premadeEntryLevel(gnomer, { ...progress, difficultyPolicy })).toBe(29);
    }
    expect(32 - rfk.level).toBeLessThanOrEqual(4);
    expect(33 - rfk.level).toBeLessThanOrEqual(5);
    expect(33 - gnomer.level).toBeLessThanOrEqual(4);
    expect(34 - gnomer.level).toBeLessThanOrEqual(5);
    expect(DUNGEON_VISITS.find((entry) => entry.id === "razorfen-kraul")!.levels!.medium).toBe(28);
    // The Crone of the Kraul's minimum29 takes precedence over the combat floor28.
    expect(premadeEntryLevel(rfk, { ...progress, difficultyPolicy: "experienced-premade" })).toBe(
      29,
    );
  });

  it("also places Stockade before unnecessary filler without exceeding the boss exception", () => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === "stockade")!;
    const progress = emptyPremadeProgress();
    const steady = premadeEntryLevel(stop, progress);
    const coordinated = premadeEntryLevel(stop, {
      ...progress,
      difficultyPolicy: "experienced-premade",
    });
    expect([coordinated, steady]).toEqual([24, 24]);
    expect(stop.level).toBe(24);
    expect(26 - coordinated).toBeLessThanOrEqual(4);
    expect(29 - stop.level).toBe(5);
    expect(29 - steady).toBe(5);
    expect(
      premadeEntryLevel(stop, {
        ...progress,
        selectedExtras: { "378": true },
      }),
    ).toBe(27);
  });

  it("keeps BFD level27 trash within+4 and level28 bosses within+5 for both policies", () => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === "blackfathom")!;
    const progress = emptyPremadeProgress();
    const steady = premadeEntryLevel(stop, progress);
    const coordinated = premadeEntryLevel(stop, {
      ...progress,
      difficultyPolicy: "experienced-premade",
    });
    expect(steady).toBe(23);
    expect(coordinated).toBe(23);
    expect(27 - coordinated).toBe(4);
    expect(28 - coordinated).toBe(5);
    expect(28 - steady).toBe(5);
  });

  it("does not recommend the earlier unsafe level21 band", () => {
    expect(DUNGEON_VISITS.find((entry) => entry.id === "blackfathom")!.levels).toEqual({
      hard: 23,
      medium: 23,
      atLevel: 23,
      easy: 30,
    });
  });

  it.each([
    ["blackfathom", 1198, 26],
    ["gnomeregan", 2930, 31],
    ["excavation", 95772, 28],
  ] as const)(
    "still enforces a higher selected quest minimum for %s",
    (stopId, questId, minimumLevel) => {
      const stop = PREMADE_STOPS.find((entry) => entry.id === stopId)!;
      const fact: QuestRewardFact = {
        questId,
        fullXp: 1000,
        minimumLevel,
        questLevel: minimumLevel,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/synthetic-quest",
        capturedAt: "2026-11-03T00:00:00.000Z",
      };
      const progress = emptyPremadeProgress();
      for (const difficultyPolicy of ["at-level", "experienced-premade"] as const)
        expect(premadeEntryLevel(stop, { ...progress, difficultyPolicy }, [fact])).toBe(
          minimumLevel,
        );
    },
  );
});
