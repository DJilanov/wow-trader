import { describe, expect, it } from "vitest";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { createCharacterProfile } from "./profile.js";
import { emptyDungeonPlan, personalDungeonPlanSchema } from "./dungeon-model.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  DUNGEON_ITINERARIES,
  REDRIDGE_DUNGEON_ALTERNATIVE,
  chapterDungeonItineraries,
  dungeonItineraryStages,
  itineraryDungeonOption,
  dungeonXpEndpoint,
  dungeonContinuation,
  createDungeonAlternativeTrip,
  createDungeonItineraryTrip,
  dungeonAlternativeReturnReady,
  dungeonAlternativeSourceReasons,
  dungeonAlternativeKey,
} from "./dungeon-itineraries.js";

const human = { ...createCharacterProfile(), classSlug: "warrior" as const, xpRate: 1, level: 19 };
const chapter = CHAPTER_REFERENCES.find(
  (entry) => entry.id === REDRIDGE_DUNGEON_ALTERNATIVE.chapterId,
)!;
const source = parseGuideChapter(
  "step\n .accept 3765",
  chapter.id,
  REDRIDGE_DUNGEON_ALTERNATIVE.sourceSha256,
  70205,
);
const next = parseGuideChapter(
  "step\n .turnin 3765",
  REDRIDGE_DUNGEON_ALTERNATIVE.continuationId,
  REDRIDGE_DUNGEON_ALTERNATIVE.continuationSha256,
  70205,
);

describe("scoped dungeon itineraries", () => {
  it("authors preparation, clear scope, hand-ins and faction fit for every visit", () => {
    expect(Object.keys(DUNGEON_ITINERARIES).sort()).toEqual(
      DUNGEON_VISITS.map((visit) => visit.id).sort(),
    );
    for (const visit of DUNGEON_VISITS) {
      for (const value of Object.values(DUNGEON_ITINERARIES[visit.id]!))
        expect(value.length).toBeGreaterThan(4);
      const option = itineraryDungeonOption(visit.id, human, emptyDungeonPlan());
      expect(
        dungeonItineraryStages(option, human, emptyDungeonPlan()).map((stage) => stage.id),
      ).toEqual(["prepare", "travel", "clear", "hand-ins", "bridge"]);
    }
    expect(DUNGEON_ITINERARIES["sm-armory"]!.scope).toContain("incomplete");
    expect(DUNGEON_ITINERARIES["brd-prison"]!.scope).toContain("Prison subrun only");
    expect(DUNGEON_ITINERARIES["upper-blackrock"]!.preparation).toContain(
      "do not assume a five-player run",
    );
  });
  it("uses the six core Deadmines quests unless the optional explosives chain is prepared or selected", () => {
    const plan = emptyDungeonPlan();
    const core = itineraryDungeonOption("deadmines", human, plan);
    expect(core.questIds).toHaveLength(6);
    expect(core.questIds).not.toContain(92753);
    expect(core.questXp).toBe(21867);
    for (const prepared of [
      { ...plan, questStates: { "92752": "rewarded" as const } },
      { ...plan, questStates: { "92753": "accepted" as const } },
      { ...plan, selectedQuests: { deadmines: [92753] } },
    ])
      expect(itineraryDungeonOption("deadmines", human, prepared).questIds).toContain(92753);
    expect(plan.selectedQuests).toEqual({});
  });
  it("offers local Deadmines before northern Ruins and moves Alliance WC to Ashenvale without lowering entry", () => {
    expect(
      chapterDungeonItineraries(chapter, human, emptyDungeonPlan()).map(
        (option) => option.visit.id,
      ),
    ).toEqual(["deadmines", "lordaeron"]);
    const ashenvale = CHAPTER_REFERENCES.find(
      (entry) => entry.id === "chapter-8-21-23-stonetalon-ashenvale",
    )!;
    const early = chapterDungeonItineraries(ashenvale, human, emptyDungeonPlan()).find(
      (option) => option.visit.id === "wailing-caverns",
    )!;
    expect(early.schedule).toMatchObject({ state: "too-early", level: 21 });
    expect(early.questIds).not.toContain(1491);
    const ready = chapterDungeonItineraries(
      ashenvale,
      { ...human, level: 21 },
      emptyDungeonPlan(),
    ).find((option) => option.visit.id === "wailing-caverns")!;
    expect(ready.schedule.state).toBe("ready");
    expect(
      itineraryDungeonOption("wailing-caverns", { ...human, level: null }, emptyDungeonPlan())
        .schedule.state,
    ).toBe("unknown-level");
  });
  it("keeps unreviewed XP and access unknown rather than inventing future replacement totals", () => {
    const option = itineraryDungeonOption(
      "upper-blackrock",
      { ...human, level: 60 },
      emptyDungeonPlan(),
    );
    expect(option.visit.questIds).toHaveLength(12);
    expect(option.questIds.length).toBeGreaterThan(0);
    expect(option.questIds.every((id) => option.visit.questIds.includes(id))).toBe(true);
    expect(option.questXp).toBeNull();
    expect(option.schedule.state).toBe("reference-only");
  });
  it("enforces the geographic itinerary floor in the constructor, not only in the UI", () => {
    const chapter = CHAPTER_REFERENCES.find(
      (entry) => entry.id === "chapter-8-21-23-stonetalon-ashenvale",
    )!;
    const source = parseGuideChapter("step\n .accept 959", chapter.id, "a".repeat(64), 70205);
    expect(() =>
      createDungeonItineraryTrip(
        "wailing-caverns",
        chapter,
        source,
        human,
        emptyDungeonPlan(),
        "source-step-0001",
      ),
    ).toThrow(/level/);
    const trip = createDungeonItineraryTrip(
      "wailing-caverns",
      chapter,
      source,
      { ...human, level: 21 },
      emptyDungeonPlan(),
      "source-step-0001",
    );
    expect(trip.itinerary).toBe(true);
    expect(trip.questIds).toHaveLength(4);
    expect(trip.questIds).not.toContain(1491);
  });
});

describe("full XP-curve endpoints", () => {
  it("counts complete level boundaries, not a fraction of the starting level", () => {
    expect(dungeonXpEndpoint(19, 0, 21867)).toEqual({ level: 20, currentXp: 567, percent: 2 });
    expect(dungeonXpEndpoint(19, 0, 22535)).toEqual({ level: 20, currentXp: 1235, percent: 5 });
    expect(dungeonXpEndpoint(19, 0, 32900)).toEqual({ level: 20, currentXp: 11600, percent: 50 });
    expect(dungeonXpEndpoint(19, 5000, 0)).toEqual({ level: 19, currentXp: 5000, percent: 23 });
  });
  it("caps at 60 and rejects invalid or overflowing inputs", () => {
    expect(dungeonXpEndpoint(59, 0, 1_000_000)).toEqual({ level: 60, currentXp: 0, percent: 0 });
    expect(dungeonXpEndpoint(60, 0, 100)).toEqual({ level: 60, currentXp: 0, percent: 0 });
    for (const [level, current, gain] of [
      [0, 0, 1],
      [61, 0, 1],
      [19, 21300, 0],
      [19, -1, 0],
      [19, 0, -1],
      [19, 0, 1.5],
      [19, 1, Number.MAX_SAFE_INTEGER],
    ])
      expect(dungeonXpEndpoint(level!, current!, gain!)).toBeNull();
  });
});

describe("reviewed continuation versus a generic optional trip", () => {
  it("pins both sources and declines unaudited race, class and XP variants", () => {
    expect(dungeonContinuation("deadmines", source, next, human)?.chapterId).toBe(next.chapterId);
    for (const profile of [
      { ...human, raceId: "dwarf" as const },
      { ...human, classSlug: "rogue" as const },
      { ...human, xpRate: 1.5 },
    ])
      expect(dungeonContinuation("deadmines", source, next, profile)).toBeNull();
    expect(
      dungeonContinuation("deadmines", { ...source, sourceSha256: "a".repeat(64) }, next, human),
    ).toBeNull();
    expect(
      dungeonContinuation("deadmines", source, { ...next, sourceSha256: "a".repeat(64) }, human),
    ).toBeNull();
    expect(dungeonContinuation("wailing-caverns", source, next, human)).toBeNull();
    expect(dungeonContinuation("deadmines", source, null, human)).toBeNull();
  });
  it("snapshots a new alternative without replacing an old trip or its outdoor bookmark", () => {
    const plan = emptyDungeonPlan();
    const trip = createDungeonAlternativeTrip(
      "deadmines",
      chapter,
      source,
      next,
      human,
      plan,
      "source-step-0001",
    );
    expect(trip.questIds).toHaveLength(6);
    expect(trip.targetLevel).toBe(20);
    expect(trip.returnStepId).toBe("source-step-0001");
    expect(trip.alternative).toMatchObject({
      chapterId: next.chapterId,
      sourceSha256: next.sourceSha256,
      carryover: {},
    });
    const key = dungeonAlternativeKey(chapter.id, "deadmines");
    expect(
      personalDungeonPlanSchema.parse({ ...plan, trips: { [key]: trip }, activeTripId: key }).trips[
        key
      ],
    ).toEqual(trip);
    expect(plan.trips).toEqual({});
    expect(() =>
      createDungeonAlternativeTrip(
        "deadmines",
        chapter,
        source,
        next,
        { ...human, level: 18 },
        plan,
        "source-step-0001",
      ),
    ).toThrow(/level/);
  });
  it("requires actual checkpoint XP, retained dependencies and unchanged evidence before returning", () => {
    const trip = createDungeonAlternativeTrip(
      "lordaeron",
      chapter,
      source,
      next,
      human,
      emptyDungeonPlan(),
      "source-step-0001",
    );
    const continuation = dungeonContinuation("lordaeron", source, next, human);
    const ready = {
      ...trip,
      returnLevel: 20,
      returnXp: 1234,
      sourceRetained: true,
      alternative: {
        ...trip.alternative!,
        carryover: { "124": true, "3765": true, "cooking-50": true },
      },
    };
    expect(dungeonAlternativeReturnReady(trip, continuation)).toBe(false);
    expect(dungeonAlternativeReturnReady(ready, continuation)).toBe(true);
    expect(dungeonAlternativeReturnReady({ ...ready, returnLevel: 19 }, continuation)).toBe(false);
    expect(dungeonAlternativeReturnReady({ ...ready, returnLevel: 31 }, continuation)).toBe(false);
    expect(dungeonAlternativeReturnReady({ ...ready, returnXp: 23200 }, continuation)).toBe(false);
    expect(dungeonAlternativeReturnReady({ ...ready, xpNeedsUpdate: true }, continuation)).toBe(
      false,
    );
    expect(dungeonAlternativeReturnReady({ ...ready, sourceRetained: false }, continuation)).toBe(
      false,
    );
    expect(
      dungeonAlternativeReturnReady(
        { ...ready, alternative: { ...ready.alternative, carryover: { "124": true } } },
        continuation,
      ),
    ).toBe(false);
    expect(dungeonAlternativeSourceReasons(ready, null)).toHaveLength(1);
    expect(
      dungeonAlternativeReturnReady(
        ready,
        continuation && { ...continuation, sourceVersion: "changed" },
      ),
    ).toBe(false);
    expect(
      dungeonAlternativeReturnReady(
        ready,
        continuation && { ...continuation, stepId: "source-step-0099" },
      ),
    ).toBe(false);
  });
});
