import { describe, expect, it } from "vitest";
import {
  advancePremadeStage,
  forecastPremadeMember,
  getPremadeStop,
  premadePreparationQuests,
  premadeEntryLevel,
  premadeReward,
  recordPremadeXp,
  selectedPremadeQuests,
  updatePremadeQuestState,
  PREMADE_STOPS,
} from "./premade.js";
import {
  emptyPremadeProgress,
  premadeProgressSchema,
  type PremadeProgress,
} from "./premade-model.js";
import { estimateDungeonReward } from "./dungeon-xp.js";

describe("reviewable premade-five circuit", () => {
  it("preserves all 21 requested stops and exposes the three evidence gaps", () => {
    expect(PREMADE_STOPS).toHaveLength(21);
    expect(PREMADE_STOPS.map((stop) => stop.level)).toEqual([
      16, 18, 20, 26, 27, 28, 30, 33, 35, 37, 38, 42, 45, 47, 48, 49, 50, 53, 55, 57, 59,
    ]);
    expect(
      PREMADE_STOPS.filter((stop) => stop.dataStatus === "missing-quest-data").map(
        (stop) => stop.id,
      ),
    ).toEqual(["drowned-city", "kroldok", "alcaz"]);
    for (const stop of PREMADE_STOPS)
      expect(new Set(stop.quests.map((q) => q.questId)).size).toBe(stop.quests.length);
  });
  it("defaults to conservative gates and requires an explicit experienced-premade policy", () => {
    const progress = emptyPremadeProgress();
    expect(premadeEntryLevel(getPremadeStop("lordaeron")!, progress)).toBe(19);
    expect(
      premadeEntryLevel(getPremadeStop("lordaeron")!, {
        ...progress,
        difficultyPolicy: "experienced-premade",
      }),
    ).toBe(18);
    expect(premadeEntryLevel(getPremadeStop("lower-blackrock")!, progress)).toBe(60);
  });
  it("does not apply a bonus twice to reported Forever rewards", () => {
    expect(estimateDungeonReward(378, 26).xp).toBe(5750);
    expect(estimateDungeonReward(96800, 38).xp).toBe(6750);
    expect(estimateDungeonReward(92457, 30).xp).toBe(9400);
    expect(estimateDungeonReward(96403, 16).xp).toBe(2950);
  });
  it("uses the fitted historical scenario but keeps unknowns and overlevels unknown", () => {
    expect(premadeReward({ questId: 7065, role: "core" }, 48).xp).toBe(14500);
    expect(premadeReward({ questId: 2770, role: "opportunistic" }, 49).xp).toBeNull();
    expect(estimateDungeonReward(2922, 33).xp).toBeNull();
    expect(estimateDungeonReward(96800, NaN).xp).toBeNull();
  });
  it("excludes collection/deferred quests and keeps raid goals separate", () => {
    const progress = emptyPremadeProgress();
    expect(
      selectedPremadeQuests(getPremadeStop("stratholme")!, progress).map((q) => q.questId),
    ).toEqual([5214, 5251, 5282, 5243]);
    expect(
      selectedPremadeQuests(getPremadeStop("stratholme")!, {
        ...progress,
        selectedExtras: { 5848: true },
      }).some((choice) => choice.questId === 5848),
    ).toBe(true);
    expect(
      selectedPremadeQuests(getPremadeStop("deadmines")!, progress).map((q) => q.questId),
    ).not.toContain(92753);
    expect(
      selectedPremadeQuests(getPremadeStop("blackrock-depths")!, {
        ...progress,
        raidGoals: false,
      }).map((q) => q.questId),
    ).not.toContain(7848);
  });
  it("retains complete Defias and Dalaran preparation without paying them twice", () => {
    const preparation = premadePreparationQuests(
      getPremadeStop("deadmines")!,
      emptyPremadeProgress(),
    ).map((quest) => quest.id);
    expect(preparation.indexOf(65)).toBeLessThan(preparation.indexOf(132));
    expect(
      premadePreparationQuests(getPremadeStop("deadmines")!, emptyPremadeProgress()).map(
        (q) => q.id,
      ),
    ).toContain(65);
    expect(
      premadePreparationQuests(getPremadeStop("dalaran")!, emptyPremadeProgress()).map((q) => q.id),
    ).toContain(92432);
  });
  it("never rounds an unfinished XP bar up to a level and gives no leveling XP at 60", () => {
    const progress = recordPremadeXp(emptyPremadeProgress(), 0, 59, 209799);
    const stop = getPremadeStop("alcaz")!;
    expect(forecastPremadeMember(stop, progress, progress.members[0]!).endpoint?.percent).toBe(
      99.9,
    );
    expect(estimateDungeonReward(96800, 60).xp).toBe(0);
    expect(premadeEntryLevel(getPremadeStop("dalaran")!, progress)).toBe(31);
  });
  it("requires actual progress, never guessed zero bars or parity forecasts", () => {
    const progress = emptyPremadeProgress(),
      stop = getPremadeStop("thanes")!;
    expect(forecastPremadeMember(stop, progress, progress.members[0]!).requiredXp).toBeNull();
    const recorded = recordPremadeXp(progress, 0, 16, 0);
    const estimate = forecastPremadeMember(
      stop,
      { ...recorded, parityScenarios: { thanes: { extraQuests: 10, baseXp: 10000 } } },
      recorded.members[0]!,
    );
    expect(estimate.actualReady).toBe(false);
    expect(estimate.parityGapXp).toBe(0);
  });
  it("invalidates XP after a hand-in change and does not repeat rewards on visit two", () => {
    let progress = recordPremadeXp(emptyPremadeProgress(), 0, 57, 0);
    progress = updatePremadeQuestState(progress, 0, 4701, "rewarded");
    expect(progress.members[0]!.xpNeedsUpdate).toBe(true);
    expect(
      forecastPremadeMember(getPremadeStop("lower-blackrock")!, progress, progress.members[0]!)
        .requiredXp,
    ).toBeNull();
    progress = recordPremadeXp(progress, 0, 57, 10000);
    const without = forecastPremadeMember(
      getPremadeStop("lower-blackrock")!,
      progress,
      progress.members[0]!,
    );
    const withReward = forecastPremadeMember(getPremadeStop("lower-blackrock")!, progress, {
      ...progress.members[0]!,
      questStates: {},
    });
    expect(withReward.knownQuestXp).toBeGreaterThan(without.knownQuestXp);
  });
  it("separates Next from Done, saves exact stage and does not reset to the first stop", () => {
    const progress = { ...emptyPremadeProgress(), selectedStopId: "deadmines" as const };
    const next = advancePremadeStage(progress, false);
    expect(next.selectedStopId).toBe("deadmines");
    expect(next.selectedStage).toBe("clear");
    expect(next.stages).toEqual({});
    const done = advancePremadeStage(progress, true);
    expect(done.stages["deadmines-prepare"]).toBe(true);
    expect(premadeProgressSchema.parse(JSON.parse(JSON.stringify(done))).selectedStage).toBe(
      "clear",
    );
  });
  it("finishes at the last checkpoint rather than looping to the beginning", () => {
    const progress = emptyPremadeProgress();
    const stop = getPremadeStop("stratholme")!;
    const ready: PremadeProgress = {
      ...progress,
      selectedStopId: "stratholme",
      selectedStage: "checkpoint",
      members: progress.members.map((member) => ({
        ...member,
        level: 60,
        currentXp: 0,
        xpNeedsUpdate: false,
        questStates: Object.fromEntries(
          selectedPremadeQuests(stop, progress).map((quest) => [
            quest.questId,
            "rewarded" as const,
          ]),
        ),
      })),
    };
    const finished = advancePremadeStage(ready, true);
    expect(finished.selectedStopId).toBe("stratholme");
    expect(finished.selectedStage).toBe("checkpoint");
    expect(finished.stages["stratholme-checkpoint"]).toBe(true);
  });
  it("does not permit an unfinished/unknown run or key chain to be marked complete", () => {
    const progress = { ...emptyPremadeProgress(), selectedStage: "checkpoint" as const };
    expect(() => advancePremadeStage(progress, true)).toThrow();
    expect(() => recordPremadeXp(progress, 0, 59, 209800)).toThrow();
    expect(() => recordPremadeXp(progress, 0, 60, 1)).toThrow();
    expect(() => updatePremadeQuestState(progress, 0, 999999, "rewarded")).toThrow();
  });
});
