import { describe, expect, it } from "vitest";
import {
  DUNGEON_RELEASE,
  LEGACY_DUNGEON_RELEASE,
  CHAPTER_REFERENCES,
  DUNGEON_VISITS,
  parseGuideChapter,
  createDungeonTrip,
  createDungeonAlternativeTrip,
  dungeonAlternativeKey,
  REDRIDGE_DUNGEON_ALTERNATIVE,
  dungeonTripKey,
  emptyDungeonPlan,
  THANES_REPLACEMENT,
  emptyDungeonReplacement,
  createCharacterProfile,
} from "@wow-trader/leveling";
import {
  emptyLevelingWorkspace,
  readLevelingWorkspace,
  updateCharacterSession,
  updatePersonalDungeonPlan,
} from "./leveling-experience";
import { exportLevelingBackup, mergeLevelingBackup, readLevelingBackup } from "./leveling-backup";

function workspace() {
  return updateCharacterSession(emptyLevelingWorkspace(), "human", {
    ...createCharacterProfile(),
    classSlug: "warrior",
    level: 19,
    xpRate: 1,
  });
}
describe("durable dungeon plans", () => {
  it("keeps an alternative and its earlier optional trip as separate validated backup records", () => {
    const current = workspace();
    const profile = current.sessions[0]!.profile;
    const definition = REDRIDGE_DUNGEON_ALTERNATIVE;
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === definition.chapterId)!;
    const source = parseGuideChapter(
      "step\n .accept 3765",
      chapter.id,
      definition.sourceSha256,
      70205,
    );
    const next = parseGuideChapter(
      "step\n .turnin 3765",
      definition.continuationId,
      definition.continuationSha256,
      70205,
    );
    const visit = DUNGEON_VISITS.find((entry) => entry.id === "deadmines")!;
    const original = createDungeonTrip(
      visit,
      chapter,
      source,
      profile,
      emptyDungeonPlan(),
      "source-step-0001",
    );
    const alternative = createDungeonAlternativeTrip(
      visit.id,
      chapter,
      source,
      next,
      profile,
      emptyDungeonPlan(),
      "source-step-0001",
    );
    const oldKey = dungeonTripKey(chapter.id, visit.id),
      key = dungeonAlternativeKey(chapter.id, visit.id);
    const saved = updatePersonalDungeonPlan(current, "human", (plan) => ({
      ...plan,
      trips: { [oldKey]: original, [key]: alternative },
      activeTripId: key,
    }));
    expect(readLevelingBackup(exportLevelingBackup(saved))).toEqual(saved);
    expect(saved.sessions[0]!.progress).toEqual(current.sessions[0]!.progress);
    const inactive = updatePersonalDungeonPlan(saved, "human", (plan) => ({
      ...plan,
      activeTripId: oldKey,
    }));
    expect(inactive.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[key]).toEqual(alternative);
    expect(() =>
      updatePersonalDungeonPlan(current, "human", (plan) => ({
        ...plan,
        trips: { [oldKey]: alternative },
      })),
    ).toThrow(/identity/);
    expect(() =>
      updatePersonalDungeonPlan(current, "human", (plan) => ({
        ...plan,
        trips: { [key]: { ...alternative, targetLevel: 25 } },
      })),
    ).toThrow(/continuation/);
    const reported = updatePersonalDungeonPlan(saved, "human", (plan) => ({
      ...plan,
      questStates: { "2040": "rewarded" },
    }));
    expect(reported.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[key]!.xpNeedsUpdate).toBe(
      true,
    );
    expect(reported.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[key]!.returnLevel).toBeNull();
  });
  it("migrates v1 Thanes bookmarks and forecasts to v2 while retaining the original release", () => {
    const current = workspace();
    const legacy = {
      ...emptyDungeonPlan(),
      replacements: {
        [THANES_REPLACEMENT.chapterId]: {
          ...emptyDungeonReplacement(),
          active: true,
          stepId: "travel",
          progress: { prepare: "done" as const },
          xpForecast: { level: 15, questXp: 11685, neededXp: 13400 },
        },
      },
    };
    const old = {
      ...current,
      sessions: current.sessions.map((session) => ({
        ...session,
        dungeonPlans: { [LEGACY_DUNGEON_RELEASE]: legacy },
      })),
    };
    const restored = readLevelingWorkspace(JSON.stringify(old))!;
    expect(restored.sessions[0]!.dungeonPlans[LEGACY_DUNGEON_RELEASE]).toEqual(legacy);
    expect(restored.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]).toEqual(legacy);
    expect(restored.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]).not.toBe(
      restored.sessions[0]!.dungeonPlans[LEGACY_DUNGEON_RELEASE],
    );
    expect(readLevelingBackup(exportLevelingBackup(old))).toEqual(restored);
    expect(restored.sessions[0]!.progress).toEqual(current.sessions[0]!.progress);
  });
  it("keeps competing trips, independent steps and exact return bookmarks in validated backups", () => {
    const current = workspace();
    const profile = current.sessions[0]!.profile;
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === "chapter-128-19-20-redridge")!;
    const guide = parseGuideChapter(
      "step\n .accept 20\nstep\n .xp 20",
      chapter.id,
      "b".repeat(64),
      70205,
    );
    const dm = createDungeonTrip(
      DUNGEON_VISITS.find((entry) => entry.id === "deadmines")!,
      chapter,
      guide,
      profile,
      emptyDungeonPlan(),
      "source-step-0002",
    );
    const wc = createDungeonTrip(
      DUNGEON_VISITS.find((entry) => entry.id === "wailing-caverns")!,
      chapter,
      guide,
      profile,
      emptyDungeonPlan(),
      "source-step-0001",
    );
    const dmKey = dungeonTripKey(chapter.id, "deadmines"),
      wcKey = dungeonTripKey(chapter.id, "wailing-caverns");
    const first = updatePersonalDungeonPlan(current, "human", (plan) => ({
      ...plan,
      trips: { [dmKey]: { ...dm, progress: { prepare: "done" }, stepId: "travel" }, [wcKey]: wc },
      activeTripId: dmKey,
    }));
    const second = updatePersonalDungeonPlan(first, "human", (plan) => ({
      ...plan,
      activeTripId: wcKey,
    }));
    expect(second.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[dmKey]).toMatchObject({
      stepId: "travel",
      progress: { prepare: "done" },
      returnStepId: "source-step-0002",
    });
    expect(second.sessions[0]!.progress).toEqual(current.sessions[0]!.progress);
    expect(readLevelingBackup(exportLevelingBackup(second))).toEqual(second);
    const rewarded = updatePersonalDungeonPlan(second, "human", (plan) => ({
      ...plan,
      questStates: { ...plan.questStates, 1486: "rewarded" },
    }));
    expect(rewarded.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[wcKey]!.xpNeedsUpdate).toBe(
      true,
    );
    expect(rewarded.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.trips[dmKey]!.xpNeedsUpdate).toBe(
      false,
    );
    expect(() =>
      updatePersonalDungeonPlan(second, "human", (plan) => ({ ...plan, activeTripId: "unknown" })),
    ).toThrow(/active dungeon/);
    expect(() =>
      updatePersonalDungeonPlan(second, "human", (plan) => ({
        ...plan,
        trips: { [dmKey]: { ...dm, questIds: [914] } },
        activeTripId: dmKey,
      })),
    ).toThrow(/bundle/);
  });
  it("marks actual XP stale after reported rewards or corrections from any dungeon UI", () => {
    const initial = updatePersonalDungeonPlan(workspace(), "human", (plan) => ({
      ...plan,
      replacements: {
        [THANES_REPLACEMENT.chapterId]: {
          ...emptyDungeonReplacement(),
          active: true,
          currentXp: 1000,
          xpForecast: { level: 15, questXp: 11_685, neededXp: 13_400 },
        },
      },
    }));
    const reported = updatePersonalDungeonPlan(initial, "human", (plan) => ({
      ...plan,
      questStates: { ...plan.questStates, 96395: "rewarded" },
    }));
    const replacement =
      reported.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.replacements[
        THANES_REPLACEMENT.chapterId
      ]!;
    expect(replacement).toMatchObject({
      currentXp: 1000,
      returnLevel: null,
      xpNeedsUpdate: true,
      xpForecast: { level: 15, questXp: 11_685, neededXp: 13_400 },
    });
    const refreshed = updatePersonalDungeonPlan(reported, "human", (plan) => ({
      ...plan,
      replacements: {
        ...plan.replacements,
        [THANES_REPLACEMENT.chapterId]: { ...replacement, currentXp: 5000, xpNeedsUpdate: false },
      },
    }));
    expect(
      refreshed.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.replacements[
        THANES_REPLACEMENT.chapterId
      ]!.xpNeedsUpdate,
    ).toBe(false);
    const corrected = updatePersonalDungeonPlan(refreshed, "human", (plan) => ({
      ...plan,
      questStates: { ...plan.questStates, 96395: "accepted" },
    }));
    expect(
      corrected.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.replacements[
        THANES_REPLACEMENT.chapterId
      ]!.xpNeedsUpdate,
    ).toBe(true);
    expect(readLevelingBackup(exportLevelingBackup(corrected))).toEqual(corrected);
  });
  it("saves reversible replacement progress separately from outdoor bookmarks and backup state", () => {
    const current = workspace();
    const next = updatePersonalDungeonPlan(current, "human", (plan) => ({
      ...plan,
      replacements: {
        [THANES_REPLACEMENT.chapterId]: {
          ...emptyDungeonReplacement(),
          active: true,
          stepId: "travel",
          progress: { prepare: "done" },
        },
      },
    }));
    expect(next.sessions[0]!.progress).toEqual(current.sessions[0]!.progress);
    expect(next.sessions[0]!.readerPositions).toEqual(current.sessions[0]!.readerPositions);
    expect(readLevelingBackup(exportLevelingBackup(next))).toEqual(next);
    const restored = updatePersonalDungeonPlan(next, "human", (plan) => ({
      ...plan,
      replacements: {
        ...plan.replacements,
        [THANES_REPLACEMENT.chapterId]: {
          ...plan.replacements[THANES_REPLACEMENT.chapterId]!,
          active: false,
        },
      },
    }));
    expect(
      restored.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.replacements[
        THANES_REPLACEMENT.chapterId
      ]!.progress,
    ).toEqual({ prepare: "done" });
    expect(updatePersonalDungeonPlan(restored, "human", (plan) => plan)).toBe(restored);
  });
  it("rejects unknown replacement chapters and step IDs in imported backups", () => {
    for (const replacements of [
      { wrong: emptyDungeonReplacement() },
      { [THANES_REPLACEMENT.chapterId]: { ...emptyDungeonReplacement(), stepId: "wrong" } },
      {
        [THANES_REPLACEMENT.chapterId]: {
          ...emptyDungeonReplacement(),
          progress: { wrong: "done" as const },
        },
      },
    ])
      expect(() =>
        updatePersonalDungeonPlan(workspace(), "human", (plan) => ({ ...plan, replacements })),
      ).toThrow("Unknown");
  });
  it("reads legacy characters and preserves source progress and bookmarks", () => {
    const current = workspace();
    const raw = JSON.parse(JSON.stringify(current)) as { sessions: Record<string, unknown>[] };
    delete raw.sessions[0]!.dungeonPlans;
    expect(readLevelingWorkspace(JSON.stringify(raw))).toEqual(current);
    const next = updatePersonalDungeonPlan(current, "human", (plan) => ({
      ...plan,
      visits: { deadmines: "planned" },
      questStates: { 166: "accepted" },
    }));
    expect(next.sessions[0]!.progress).toEqual(current.sessions[0]!.progress);
    expect(next.sessions[0]!.readerPositions).toEqual(current.sessions[0]!.readerPositions);
    expect(readLevelingWorkspace(JSON.stringify(next))).toEqual(next);
  });
  it("isolates characters and releases", () => {
    const current = updateCharacterSession(workspace(), "orc", {
      ...createCharacterProfile("horde", "orc"),
      classSlug: "warrior",
    });
    const next = updatePersonalDungeonPlan(current, "human", (plan) => ({
      ...plan,
      visits: { deadmines: "planned" },
    }));
    expect(next.sessions.find((entry) => entry.id === "orc")!.dungeonPlans).toEqual({});
    expect(
      next.sessions.find((entry) => entry.id === "human")!.dungeonPlans[DUNGEON_RELEASE]?.visits
        .deadmines,
    ).toBe("planned");
    expect(updatePersonalDungeonPlan(current, "missing", (plan) => plan)).toBe(current);
  });
  it("rejects fake quests, invalid visit bundles and illegal reward choices", () => {
    expect(() =>
      updatePersonalDungeonPlan(workspace(), "human", (plan) => ({
        ...plan,
        questStates: { 2930001: "rewarded" },
      })),
    ).toThrow();
    expect(() =>
      updatePersonalDungeonPlan(workspace(), "human", (plan) => ({
        ...plan,
        selectedQuests: { deadmines: [914] },
      })),
    ).toThrow("not part");
    expect(() =>
      updatePersonalDungeonPlan(workspace(), "human", (plan) => ({
        ...plan,
        rewardChoices: { 96393: 5342 },
      })),
    ).toThrow("Invalid");
  });
  it("round-trips backups and does not resurrect an undone quest-state confirmation", () => {
    const incoming = updatePersonalDungeonPlan(workspace(), "human", (plan) => ({
      ...plan,
      visits: { deadmines: "planned" },
      questStates: { 166: "rewarded" },
    }));
    const current = updatePersonalDungeonPlan(workspace(), "human", (plan) => plan);
    expect(readLevelingBackup(exportLevelingBackup(incoming))).toEqual(incoming);
    const merged = mergeLevelingBackup(current, incoming);
    expect(merged.sessions[0]!.dungeonPlans[DUNGEON_RELEASE]!.questStates).toEqual({});
    expect(current.sessions[0]!.dungeonPlans).not.toEqual(incoming.sessions[0]!.dungeonPlans);
  });
  it("rejects semantically invalid restored plans without replacing existing progress", () => {
    const current = workspace();
    const corrupted = {
      ...current,
      sessions: current.sessions.map((session) => ({
        ...session,
        dungeonPlans: {
          [DUNGEON_RELEASE]: {
            visits: {},
            selectedQuests: { deadmines: [499999] },
            questStates: {},
            confirmations: {},
            rewardChoices: {},
            retainedQuestIds: [],
            scenarios: {},
          },
        },
      })),
    };
    expect(readLevelingWorkspace(JSON.stringify(corrupted))).toBeNull();
    expect(() =>
      readLevelingBackup(
        JSON.stringify({
          format: "kfc-leveling-backup",
          version: 1,
          exportedAt: "2026-10-05T00:00:00.000Z",
          workspace: corrupted,
        }),
      ),
    ).toThrow("Nothing has been changed");
    expect(readLevelingWorkspace(JSON.stringify(current))).toEqual(current);
  });
});
