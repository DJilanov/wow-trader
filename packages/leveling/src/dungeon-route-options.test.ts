import { describe, expect, it } from "vitest";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { createCharacterProfile, LEVELING_RACES } from "./profile.js";
import { emptyDungeonPlan } from "./dungeon-model.js";
import { parseGuideChapter } from "./guide-archive.js";
import { getDungeonQuest, compareDungeonPlan } from "./dungeon-planner.js";
import { scheduleDungeonVisit } from "./dungeon-scheduling.js";
import {
  chapterDungeonOptions,
  createDungeonTrip,
  dungeonRouteOption,
  dungeonTripSourceReasons,
  compareDungeonCheckpoint,
} from "./dungeon-route-options.js";
import { calibratedDungeonQuestXp } from "./dungeon-alternatives.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const visit = (id: string) => DUNGEON_VISITS.find((v) => v.id === id)!;
const human = { ...createCharacterProfile(), classSlug: "warrior" as const, xpRate: 1, level: 19 };
const horde = {
  ...createCharacterProfile("horde", "orc"),
  classSlug: "warrior" as const,
  xpRate: 1,
  level: 20,
};
const chapter = CHAPTER_REFERENCES.find((c) => c.id === "chapter-128-19-20-redridge")!;
const guide = parseGuideChapter(
  "#name 19-20 Redridge\nstep\n    .accept 20 >>Accept quest\nstep\n    .xp 20",
  chapter.id,
  "b".repeat(64),
  70205,
);

describe("strict At-level schedules", () => {
  it("never lowers entry for a ready five-player group", () => {
    for (const readiness of ["together", "recruiting"] as const) {
      const p = {
        ...human,
        level: 18,
        party: { size: 5 as const, readiness, tank: "yes" as const, healer: "yes" as const },
      };
      expect(scheduleDungeonVisit(visit("deadmines"), p).state).toBe("too-early");
      expect(scheduleDungeonVisit(visit("deadmines"), { ...p, level: 19 }).state).toBe("ready");
    }
  });
  it("raises the selected pickup floor, but does not invent unknown schedules", () => {
    expect(scheduleDungeonVisit(visit("thanes"), human, [getDungeonQuest(98423)!]).level).toBe(16);
    expect(scheduleDungeonVisit(visit("dalaran"), human).level).toBeNull();
    expect(scheduleDungeonVisit(visit("dalaran"), human).state).toBe("reference-only");
    expect(scheduleDungeonVisit(visit("deadmines"), { ...human, level: null }).state).toBe(
      "unknown-level",
    );
  });
  it("does not use beta access or hard entry to schedule above-cap recommended runs", () => {
    for (const id of ["gnomeregan", "razorfen-kraul", "razorfen-downs", "uldaman"])
      expect(scheduleDungeonVisit(visit(id), { ...human, level: 60 }).state).toBe("reference-only");
    expect(scheduleDungeonVisit(visit("upper-blackrock"), { ...human, level: 60 }).level).toBe(60);
    expect(visit("upper-blackrock").questIds).toHaveLength(12);
    expect(scheduleDungeonVisit(visit("deadmines"), { ...human, level: 31 }).state).toBe(
      "reference-only",
    );
  });
  it("blocks marginal comparisons below At level too", () => {
    const result = compareDungeonPlan({
      visit: visit("wailing-caverns"),
      profile: { ...horde, level: 18 },
      plan: { ...emptyDungeonPlan(), confirmations: { "wailing-caverns-quest-log-space": true } },
      questIds: [959],
      mode: "extra-chain",
      segments: [],
      useReferenceXp: true,
      killXp: null,
      outdoorXpPerHour: { minimum: 1000, maximum: 1000 },
      omittedOutdoorXp: null,
      omittedOutdoorMinutes: null,
    });
    expect(result.state).toBe("blocked");
    expect(result.decision).toBe("unknown");
    expect(result.reasons.join(" ")).toContain("level 19");
  });
});
describe("full chapter dungeon coverage", () => {
  it("accounts for every known-level visit on an applicable race path", () => {
    const seen = new Set<string>(["thanes"]);
    for (const race of LEVELING_RACES) {
      const profile = {
        ...createCharacterProfile(race.faction, race.id),
        classSlug: "warrior" as const,
        xpRate: 1,
      };
      for (const c of CHAPTER_REFERENCES)
        for (const option of chapterDungeonOptions(c, profile, emptyDungeonPlan()))
          seen.add(option.visit.id);
    }
    expect(DUNGEON_VISITS.filter((v) => v.levels !== null).every((v) => seen.has(v.id))).toBe(true);
  });
  it("places three competing level-19 trips on Redridge, not level-15 Westfall", () => {
    const ids = chapterDungeonOptions(chapter, human, emptyDungeonPlan()).map((o) => o.visit.id);
    expect(ids).toEqual(expect.arrayContaining(["deadmines", "wailing-caverns", "lordaeron"]));
    const westfall = CHAPTER_REFERENCES.find((c) => c.id === "chapter-125-13-15-westfall")!;
    expect(
      chapterDungeonOptions(westfall, human, emptyDungeonPlan()).some(
        (o) => o.visit.id === "deadmines",
      ),
    ).toBe(false);
  });
  it("keeps future unknown rewards unknown and separates inside from before entry", () => {
    const option = dungeonRouteOption(
      visit("scholomance"),
      { ...human, level: 60 },
      emptyDungeonPlan(),
    );
    expect(option.questXp).toBeNull();
    expect(option.knownXp).toBeNull();
    expect(option.schedule.state).toBe("reference-only");
    const thanes = dungeonRouteOption(visit("thanes"), { ...human, level: 15 }, emptyDungeonPlan());
    expect(thanes.insideCount).toBe(1);
    expect(thanes.questIds).not.toContain(98423);
    expect(thanes.questIds).not.toContain(1654);
  });
});
describe("source-pinned generic trip", () => {
  it("preserves the actual source branch and rejects hidden or unresolved return rows", () => {
    const conditional = parseGuideChapter(
      "#name 19-20 Redridge\nstep\n    .dungeon !DM\n    .accept 20 >>Outdoor quest\nstep\n    .dungeon DM\n    .accept 20 >>Dungeon variant\nstep << UnknownCondition\n    .accept 20 >>Unresolved variant",
      chapter.id,
      "c".repeat(64),
      70205,
    );
    const initial = emptyDungeonPlan();
    const trip = createDungeonTrip(
      visit("deadmines"),
      chapter,
      conditional,
      human,
      initial,
      "source-step-0001",
    );
    expect(dungeonTripSourceReasons(trip, conditional, human, initial)).toEqual([]);
    const planned = { ...initial, visits: { deadmines: "planned" as const } };
    expect(dungeonTripSourceReasons(trip, conditional, human, planned)).not.toEqual([]);
    expect(() =>
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        conditional,
        human,
        planned,
        "source-step-0001",
      ),
    ).toThrow(/bookmark/);
    expect(
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        conditional,
        human,
        planned,
        "source-step-0002",
      ).returnStepId,
    ).toBe("source-step-0002");
    expect(() =>
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        conditional,
        human,
        initial,
        "source-step-0003",
      ),
    ).toThrow(/bookmark/);
    expect(initial.visits).toEqual({});
  });
  it("snapshots checkpoint inputs separately from another chapter or the reference scenario", () => {
    const plan = {
      ...emptyDungeonPlan(),
      scenarios: {
        deadmines: {
          mode: "whole-trip" as const,
          referenceOnly: false,
          fields: { min: "30", max: "40", currentXp: "1234", kills: "0" },
        },
      },
    };
    const trip = createDungeonTrip(
      visit("deadmines"),
      chapter,
      guide,
      human,
      plan,
      "source-step-0001",
    );
    expect(trip).toMatchObject({
      checkpointFields: { min: "30", max: "40" },
      currentXp: 1234,
      killXp: 0,
    });
    plan.scenarios.deadmines.fields.min = "999";
    expect(trip.checkpointFields.min).toBe("30");
    expect(
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        guide,
        { ...human, level: 23 },
        plan,
        "source-step-0001",
      ).targetLevel,
    ).toBe(24);
  });
  it("saves a matching exact return bookmark with separate instruction progress", () => {
    const trip = createDungeonTrip(
      visit("deadmines"),
      chapter,
      guide,
      human,
      emptyDungeonPlan(),
      "source-step-0002",
    );
    expect(trip).toMatchObject({
      chapterId: chapter.id,
      sourceVersion: guide.version,
      sourceSha256: guide.sourceSha256,
      returnStepId: "source-step-0002",
      progress: {},
      stepId: "prepare",
      targetLevel: 20,
    });
    expect(dungeonTripSourceReasons(trip, guide, human, emptyDungeonPlan())).toEqual([]);
    expect(
      dungeonTripSourceReasons(
        trip,
        { ...guide, sourceSha256: "a".repeat(64) },
        human,
        emptyDungeonPlan(),
      ),
    ).not.toEqual([]);
  });
  it("refuses early entry, future content, missing bookmarks and changed source builds", () => {
    expect(() =>
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        guide,
        { ...human, level: 18 },
        emptyDungeonPlan(),
        "source-step-0001",
      ),
    ).toThrow(/level/);
    expect(() =>
      createDungeonTrip(
        visit("scholomance"),
        chapter,
        guide,
        human,
        emptyDungeonPlan(),
        "source-step-0001",
      ),
    ).toThrow();
    expect(() =>
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        guide,
        human,
        emptyDungeonPlan(),
        "source-step-9999",
      ),
    ).toThrow(/bookmark/);
    expect(() =>
      createDungeonTrip(
        visit("deadmines"),
        chapter,
        { ...guide, targetBuild: 99999 },
        human,
        emptyDungeonPlan(),
        "source-step-0001",
      ),
    ).toThrow(/build/);
  });
});
describe("same-checkpoint XP and catch-up", () => {
  const plan = {
    ...emptyDungeonPlan(),
    confirmations: { "wailing-caverns-quest-log-space": true },
    questStates: {
      870: "rewarded" as const,
      877: "rewarded" as const,
      880: "rewarded" as const,
      1489: "rewarded" as const,
      1490: "rewarded" as const,
    },
  };
  const input = {
    visit: visit("wailing-caverns"),
    profile: horde,
    plan,
    questIds: [914, 914],
    currentXp: 1000,
    targetLevel: 21,
    killXp: 0,
    tripMinutes: { minimum: 30, maximum: 40 },
    outdoorMinutes: { minimum: 60, maximum: 70 },
    outdoorXpPerHour: 20_000,
  };
  it("deduplicates rewards and includes catch-up at the same XP goal", () => {
    const result = compareDungeonCheckpoint(input);
    expect(result.eligibleQuestXp).toBe(calibratedDungeonQuestXp(914, 20));
    expect(result.neededXp).toBe(FOREVER_XP_CURVE[20]! - 1000);
    expect(result.shortfallXp).toBe(result.neededXp! - result.eligibleQuestXp!);
    expect(result.catchUpMinutes?.minimum).toBeCloseTo((result.shortfallXp! / 20_000) * 60);
    expect(result.timeSaved?.minimum).toBeCloseTo(60 - 40 - result.catchUpMinutes!.maximum);
  });
  it("does not pay rewarded or retained rewards twice or multiply group XP", () => {
    const result = compareDungeonCheckpoint({
      ...input,
      profile: { ...horde, party: { size: 5, readiness: "together", tank: "yes", healer: "yes" } },
      plan: { ...plan, questStates: { ...plan.questStates, 914: "rewarded" } },
    });
    expect(result.eligibleQuestXp).toBe(0);
    expect(result.shortfallXp).toBe(result.neededXp);
    expect(
      compareDungeonCheckpoint({ ...input, plan: { ...plan, retainedQuestIds: [914] } })
        .eligibleQuestXp,
    ).toBe(0);
  });
  it("does not use unknown XP, multi-visit rewards or later XP to bypass gates", () => {
    expect(compareDungeonCheckpoint({ ...input, currentXp: null }).neededXp).toBeNull();
    expect(compareDungeonCheckpoint({ ...input, targetLevel: 21.5 }).neededXp).toBeNull();
    expect(
      compareDungeonCheckpoint({ ...input, profile: { ...horde, level: 30 }, targetLevel: 31 })
        .neededXp,
    ).toBeNull();
    expect(compareDungeonCheckpoint({ ...input, killXp: 1_000_001 }).shortfallXp).toBeNull();
    expect(compareDungeonCheckpoint({ ...input, killXp: null }).shortfallXp).toBeNull();
    const missing = compareDungeonCheckpoint({
      ...input,
      visit: visit("deadmines"),
      profile: human,
      questIds: [92753],
      plan: emptyDungeonPlan(),
    });
    expect(missing.eligibleQuestXp).toBeNull();
    expect(missing.timeSaved).toBeNull();
    expect(compareDungeonCheckpoint({ ...input, questIds: [1654] }).eligibleQuestXp).toBeNull();
    expect(
      compareDungeonCheckpoint({ ...input, profile: { ...horde, level: 60 }, targetLevel: 60 })
        .neededXp,
    ).toBeNull();
  });
});
