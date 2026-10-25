import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { dungeonFinishRunSchema, type DungeonFinishRun } from "./dungeon-finish-model.js";
import { recordPremadeXp } from "./premade.js";
import {
  DUNGEON_FINISH_OPTIONS,
  dungeonFinishPartyKey,
  dungeonFinishTotalXp,
  recordDungeonFinishRun,
  estimateDungeonFinish,
  rankedDungeonFinishOptions,
  dungeonFinishQuestRewards,
} from "./dungeon-finish.js";
import {
  activeCampaignActions,
  campaignActionAlias,
  campaignIncludedLegs,
  campaignActionReasons,
  currentCampaignAction,
  type CampaignPlan,
  type CampaignAction,
} from "./campaign.js";
import { campaignSections } from "./campaign-sections.js";
import {
  campaignExportSelectionFromProgress,
  campaignExportProgress,
} from "./restedxp-documents.js";
import { compileCampaignAddon } from "./campaign-addon.js";

function progress(): ReturnType<typeof emptyPremadeProgress> {
  let state = emptyPremadeProgress();
  for (let player = 0; player < 5; player++) state = recordPremadeXp(state, player, 55, 10000);
  return state;
}
function clear(state = progress()): DungeonFinishRun {
  return {
    id: randomUUID(),
    dungeonId: "blackrock-depths",
    scope: "full-clear",
    recordedAt: "2026-10-25T12:00:00.000Z",
    build: 70532,
    partyKey: dungeonFinishPartyKey(state),
    minutes: 30,
    before: Array.from({ length: 5 }, () => ({ level: 55, currentXp: 10000 })),
    after: Array.from({ length: 5 }, () => ({ level: 55, currentXp: 30000 })),
    questXp: [5000, 5000, 5000, 5000, 5000],
  };
}
function route(): CampaignPlan {
  const legs = [
    { id: "early", from: 50, to: 55, kind: "preparation" as const, stopId: null },
    {
      id: "dungeon-blackrock-depths",
      from: 55,
      to: 57,
      kind: "dungeon" as const,
      stopId: "blackrock-depths" as const,
    },
    { id: "blackrock-world-returns", from: 55, to: 57, kind: "xp-bridge" as const, stopId: null },
    {
      id: "dungeon-lower-blackrock",
      from: 57,
      to: 59,
      kind: "dungeon" as const,
      stopId: "lower-blackrock" as const,
    },
    { id: "level-60-finish", from: 60, to: 60, kind: "finish" as const, stopId: null },
  ].map((leg) => ({
    ...leg,
    title: leg.id,
    actionIds: [`${leg.id}-entry`],
    questIds: [],
    unresolvedQuestIds: [],
  }));
  const actions: CampaignAction[] = legs.map((leg) => ({
    id: `${leg.id}-entry`,
    legId: leg.id,
    title: leg.id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: leg.stopId ? "checkpoint" : "instructions",
    leaderOnly: false,
    targetLevel: leg.stopId ? 55 : null,
    targetStopId: leg.stopId,
    raidOnly: false,
  }));
  actions.push({
    ...actions[0]!,
    id: "level-60-finish-dungeon-circuit",
    legId: "level-60-finish",
    dungeonFinishOnly: true,
  });
  return {
    release: "finish-test",
    targetBuild: 70205,
    race: "human",
    leaderClass: "warrior",
    legs,
    actions,
    dungeonFinish: true,
  };
}
describe("premade dungeon finish", () => {
  it("lists ten five-player run options without inventing new-dungeon quests", () => {
    expect(DUNGEON_FINISH_OPTIONS).toHaveLength(10);
    expect(new Set(DUNGEON_FINISH_OPTIONS.map((option) => option.id)).size).toBe(10);
    expect(
      DUNGEON_FINISH_OPTIONS.find((option) => option.id === "blackmaw-hold")?.questIds,
    ).toEqual([]);
    expect(
      DUNGEON_FINISH_OPTIONS.find((option) => option.id === "shapers-terrace")?.recommendedLevel,
    ).toBe(58);
  });
  it("upgrades old progress without losing quest states or XP", () => {
    const state = progress();
    const { dungeonFinish, ...old } = state;
    const parsed = premadeProgressSchema.parse(old);
    expect(parsed.dungeonFinish.strategy).toBe("dungeons");
    expect(parsed.members).toEqual(state.members);
    expect(dungeonFinish.runs).toEqual([]);
  });
  it("replaces the mandatory late outdoor route with one circuit and retains mixed mode", () => {
    const plan = route(),
      state = progress(),
      before = JSON.stringify(state);
    expect(campaignIncludedLegs(plan, state).map((leg) => leg.id)).toEqual([
      "early",
      "dungeon-blackrock-depths",
      "level-60-finish",
    ]);
    expect(campaignSections(plan, state).at(-1)?.dungeonFinish).toBe(true);
    expect(
      activeCampaignActions(plan, state).some(
        (action) => action.legId === "blackrock-world-returns",
      ),
    ).toBe(false);
    const mixed = {
      ...state,
      dungeonFinish: { ...state.dungeonFinish, strategy: "mixed" as const },
    };
    expect(campaignIncludedLegs(plan, mixed)).toHaveLength(5);
    expect(activeCampaignActions(plan, mixed).some((action) => action.dungeonFinishOnly)).toBe(
      false,
    );
    expect(JSON.stringify(state)).toBe(before);
  });
  it("redirects old late bookmarks without resetting the party's recorded bars", () => {
    const plan = route(),
      state = progress();
    state.campaigns[plan.release] = {
      selectedActionId: "dungeon-lower-blackrock-entry",
      completion: { "early-entry": "done" },
    };
    expect(campaignActionAlias(plan, state, "dungeon-lower-blackrock-entry")).toBe(
      "level-60-finish-dungeon-circuit",
    );
    expect(currentCampaignAction(plan, state).id).toBe("level-60-finish-dungeon-circuit");
    expect(state.members[0]?.level).toBe(55);
    expect(state.campaigns[plan.release]?.completion["early-entry"]).toBe("done");
  });
  it("does not turn recommended BRD levels into a hard entry gate or remove quest gates", () => {
    const plan = route(),
      state = progress();
    const action = activeCampaignActions(plan, state).find(
      (entry) => entry.targetStopId === "blackrock-depths",
    )!;
    expect(action.kind).toBe("instructions");
    expect(campaignActionReasons(action, emptyPremadeProgress())).toEqual([]);
  });
  it("also migrates late optional-batch bookmarks that were generated outside plan.actions", () => {
    const plan = route(),
      state = progress();
    const expanded: CampaignPlan = {
      ...plan,
      catchUpBatches: [
        {
          id: "batch",
          questId: 123,
          title: "Optional returns",
          zone: "Burning Steppes",
          referenceLevel: 56,
          sourceIds: [],
          objectiveType: "shared-kills",
          conditional: false,
          actions: [{ ...plan.actions[0]!, id: "extra-task" }],
        },
      ],
    };
    state.campaigns[plan.release] = {
      selectedActionId: "blackrock-world-returns-extra-task",
      completion: {},
    };
    expect(currentCampaignAction(expanded, state).id).toBe("level-60-finish-dungeon-circuit");
    expect(state.members[0]?.currentXp).toBe(10000);
  });
  it("records separate player bars and subtracts quest XP from repeated-clear forecasts", () => {
    const state = progress(),
      before = JSON.stringify(state);
    const next = recordDungeonFinishRun(state, clear(state));
    expect(
      next.members.every((member) => member.currentXp === 30000 && !member.xpNeedsUpdate),
    ).toBe(true);
    const estimate = estimateDungeonFinish(next, "blackrock-depths", 70532);
    expect(estimate.repeatXp).toEqual([15000, 15000, 15000, 15000, 15000]);
    expect(estimate.clears).toBe(64);
    expect(estimate.minutes).toBe(1920);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("does not calibrate unknown quest XP, another build, another scope or a changed party", () => {
    const state = progress(),
      run = clear(state);
    const unknown = recordDungeonFinishRun(state, {
      ...run,
      questXp: [null, null, null, null, null],
    });
    expect(estimateDungeonFinish(unknown, "blackrock-depths", 70532).clears).toBeNull();
    const next = recordDungeonFinishRun(state, run);
    expect(estimateDungeonFinish(next, "blackrock-depths", 70450).samples).toBe(0);
    expect(
      estimateDungeonFinish(
        { ...next, dungeonFinish: { ...next.dungeonFinish, selectedScope: "boss-loop" } },
        "blackrock-depths",
        70532,
      ).samples,
    ).toBe(0);
    const changed = {
      ...next,
      members: next.members.map((member, index) =>
        index === 0 ? { ...member, classSlug: "paladin" as const } : member,
      ),
    };
    expect(estimateDungeonFinish(changed, "blackrock-depths", 70532).samples).toBe(0);
  });
  it("rejects invalid bars, backwards XP, impossible quest gains and duplicate clears", () => {
    expect(() => dungeonFinishTotalXp({ level: 60, currentXp: 1 })).toThrow();
    const state = progress(),
      run = clear(state);
    expect(dungeonFinishRunSchema.safeParse({ ...run, before: [] }).success).toBe(false);
    expect(dungeonFinishRunSchema.safeParse({ ...run, questXp: [99999, 0, 0, 0, 0] }).success).toBe(
      false,
    );
    expect(
      dungeonFinishRunSchema.safeParse({
        ...run,
        after: run.before.map(() => ({ level: 54, currentXp: 0 })),
      }).success,
    ).toBe(false);
    const next = recordDungeonFinishRun(state, run);
    expect(() => recordDungeonFinishRun(next, run)).toThrow(/already/);
    expect(() => recordDungeonFinishRun(next, { ...run, id: randomUUID() })).toThrow(
      /starting bar/,
    );
  });
  it("allows lower-level expert logs without inventing an instance minimum", () => {
    let state = progress();
    for (let i = 0; i < 5; i++) state = recordPremadeXp(state, i, 52, 10000);
    const run = clear(state);
    const next = recordDungeonFinishRun(state, {
      ...run,
      before: run.before.map(() => ({ level: 52, currentXp: 10000 })),
      after: run.after.map(() => ({ level: 52, currentXp: 30000 })),
    });
    expect(next.members[0]?.level).toBe(52);
  });
  it("ends leveling for all five at 60 but does not mark gear targets obtained", () => {
    let state = progress();
    for (let i = 0; i < 5; i++) state = recordPremadeXp(state, i, 60, 0);
    expect(estimateDungeonFinish(state, "blackrock-depths", 70532)).toMatchObject({
      clears: 0,
      minutes: 0,
      remainingXp: [0, 0, 0, 0, 0],
    });
  });
  it("treats stale or invalid legacy XP bars as needing an update rather than crashing", () => {
    const state = progress();
    state.members[0]!.currentXp = 999999;
    state.members[1]!.xpNeedsUpdate = true;
    expect(estimateDungeonFinish(state, "blackrock-depths", 70532)).toMatchObject({
      clears: null,
      remainingXp: [null, null, expect.any(Number), expect.any(Number), expect.any(Number)],
    });
  });
  it("ranks outstanding party targets and removes obtained targets from priorities", () => {
    const state = progress();
    state.dungeonFinish.targets = [
      {
        id: randomUUID(),
        dungeonId: "scholomance",
        player: 2,
        itemId: 1,
        name: "Personal target",
        priority: 3,
        obtained: false,
      },
    ];
    expect(rankedDungeonFinishOptions(state)[0]?.id).toBe("scholomance");
    state.dungeonFinish.targets[0]!.obtained = true;
    expect(rankedDungeonFinishOptions(state)[0]?.id).not.toBe("scholomance");
  });
  it("does not count claimed or level-locked first-clear rewards", () => {
    const state = progress(),
      option = DUNGEON_FINISH_OPTIONS.find((entry) => entry.id === "lower-blackrock")!;
    const member = { ...state.members[0]!, level: 50 };
    const rows = dungeonFinishQuestRewards(option, member, []);
    expect(rows.some((row) => row.status === "level-locked")).toBe(true);
    expect(
      rows.filter((row) => row.status === "level-locked").every((row) => row.xp === null),
    ).toBe(true);
    const questId = option.questIds[0]!;
    const claimed = dungeonFinishQuestRewards(
      option,
      { ...member, questStates: { [questId]: "rewarded" } },
      [],
    ).find((row) => row.questId === questId);
    expect(claimed).toMatchObject({ status: "claimed", xp: 0 });
  });
  it("does not treat an unknown class as a confirmed class mismatch", () => {
    const member = { ...progress().members[0]!, level: 60, classSlug: null };
    const option = DUNGEON_FINISH_OPTIONS.find((entry) => entry.id === "dire-maul-east")!;
    expect(
      dungeonFinishQuestRewards(option, member, []).find((quest) => quest.questId === 7463),
    ).toMatchObject({ status: "unverified", xp: null });
    expect(
      dungeonFinishQuestRewards(option, { ...member, classSlug: "warrior" }, []).find(
        (quest) => quest.questId === 7463,
      ),
    ).toMatchObject({ status: "restricted", xp: null });
  });
  it("exports the selected strategy but never personal runs or gear targets", () => {
    const state = recordDungeonFinishRun(progress(), clear());
    const selection = campaignExportSelectionFromProgress(state);
    expect(selection.dungeonFinish).toEqual({ strategy: "dungeons" });
    expect(JSON.stringify(selection)).not.toContain("recordedAt");
    expect(campaignExportProgress(selection).dungeonFinish.runs).toEqual([]);
    const plan = route(),
      actions = activeCampaignActions(plan, state);
    const addon = compileCampaignAddon(plan, actions, {
      version: "0.2.0-review.7",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(
      addon.documents.some((document) =>
        document.content.includes("level-60-finish-dungeon-circuit"),
      ),
    ).toBe(true);
  });
});
