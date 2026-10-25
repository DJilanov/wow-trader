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
import { getDungeonBundle, updateDungeonBundleSlot } from "./dungeon-bundles.js";

describe("reviewable premade-five circuit", () => {
  it("preserves all 21 requested stops and exposes the three evidence gaps", () => {
    expect(PREMADE_STOPS).toHaveLength(21);
    expect(PREMADE_STOPS.map((stop) => stop.level)).toEqual([
      16, 18, 20, 25, 26, 27, 30, 31, 33, 37, 38, 39, 42, 42, 44, 46, 50, 51, 55, 57, 59,
    ]);
    expect(
      PREMADE_STOPS.filter((stop) => stop.dataStatus === "guaranteed-bundle").map(
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
  it("includes ordinary collections by default but keeps separate preparations, deferred quests and raid goals separate", () => {
    const progress = emptyPremadeProgress();
    expect(
      selectedPremadeQuests(getPremadeStop("stratholme")!, progress).map((q) => q.questId),
    ).toEqual([5214, 5251, 5282, 5243, 5212, 5122, 5125]);
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
  it("selects all four Dalaran quests by default and forecasts their full bundle once", () => {
    const progress = recordPremadeXp(emptyPremadeProgress(), 0, 33, 0);
    const stop = getPremadeStop("dalaran")!;
    expect(selectedPremadeQuests(stop, progress).map((choice) => choice.questId)).toEqual([
      92456, 92489, 92457, 92458,
    ]);
    const forecast = forecastPremadeMember(stop, progress, progress.members[0]!);
    expect(forecast.knownQuestXp).toBe(37600);
    expect(forecast.unknownQuestIds).toEqual([]);
    expect(progress.members[0]!.currentXp).toBe(0);
    expect(progress.members[0]!.questStates).toEqual({});
  });
  it("selects Lordaeron's fourth quest while preserving the real Thanes extra", () => {
    const progress = emptyPremadeProgress();
    expect(
      selectedPremadeQuests(getPremadeStop("lordaeron")!, progress).map((quest) => quest.questId),
    ).toEqual([95250, 95189, 92415, 95195]);
    expect(selectedPremadeQuests(getPremadeStop("thanes")!, progress)).toHaveLength(5);
  });
  it("forecasts all four guaranteed slots without inventing quests or earned XP", () => {
    for (const [id, level, xp] of [
      ["drowned-city", 37, 40400],
      ["kroldok", 42, 49000],
      ["alcaz", 50, 67400],
    ] as const) {
      const progress = recordPremadeXp(emptyPremadeProgress(), 0, level, 0);
      const forecast = forecastPremadeMember(getPremadeStop(id)!, progress, progress.members[0]!);
      expect(forecast.bundleQuestXp).toBe(xp);
      expect(forecast.bundleRewards).toHaveLength(4);
      expect(forecast.bundleRewards.every((row) => row.questId === null)).toBe(true);
      expect(progress.members[0]!.currentXp).toBe(0);
      expect(progress.members[0]!.questStates).toEqual({});
    }
  });
  it("does not pay a mapped slot again when the same real quest appears in the stop", () => {
    const bundle = updateDungeonBundleSlot(
      { ...getDungeonBundle("drowned-city", "alliance")!, planningQuestLevel: 33 },
      1,
      { questId: 92456 },
    );
    const progress = {
      ...recordPremadeXp(emptyPremadeProgress(), 0, 37, 0),
      guaranteedBundles: { "drowned-city:alliance": bundle },
    };
    const stop = {
      ...getPremadeStop("drowned-city")!,
      quests: [{ questId: 92456, role: "core" as const }],
    };
    const forecast = forecastPremadeMember(stop, progress, progress.members[0]!);
    expect(forecast.knownQuestXp).toBe(9400);
    expect(forecast.bundleQuestXp).toBe(28200);
    expect(forecast.bundleRewards[0]!.state).toBe("rewarded");
    expect(
      forecastPremadeMember(
        { ...stop, dataStatus: "journal-reference" },
        progress,
        progress.members[0]!,
      ).bundleRewards,
    ).toEqual([]);
  });
  it("allows skipping a planning-only dungeon checkpoint without bypassing Done validation", () => {
    const progress: PremadeProgress = {
      ...emptyPremadeProgress(),
      selectedStopId: "drowned-city",
      selectedStage: "checkpoint",
    };
    expect(() => advancePremadeStage(progress, true)).toThrow("pending");
    const skipped = advancePremadeStage(progress, false);
    expect(skipped.selectedStopId).toBe("scarlet-monastery");
    expect(skipped.members).toEqual(progress.members);
    expect(skipped.stages).toEqual({});
  });
  it("lets players move past Dalaran objectives without reporting completion or earning XP", () => {
    const progress: PremadeProgress = {
      ...recordPremadeXp(emptyPremadeProgress(), 0, 33, 0),
      selectedStopId: "dalaran",
      selectedStage: "clear",
    };
    const next = advancePremadeStage(progress, false);
    expect(next.selectedStopId).toBe("dalaran");
    expect(next.selectedStage).toBe("hand-in");
    expect(next.stages).toEqual({});
    expect(next.members).toEqual(progress.members);
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
    const bundle = getDungeonBundle("alcaz", "alliance")!;
    const skipped = {
      ...progress,
      guaranteedBundles: {
        "alcaz:alliance": {
          ...bundle,
          slots: bundle.slots.map((slot) => ({ ...slot, selected: false })),
        },
      },
    };
    expect(forecastPremadeMember(stop, skipped, skipped.members[0]!).endpoint?.percent).toBe(99.9);
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
