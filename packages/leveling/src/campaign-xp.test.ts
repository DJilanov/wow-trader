import { describe, expect, it } from "vitest";
import { forecastCampaignXp } from "./campaign-xp.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { recordPremadeXp } from "./premade.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

function action(id: string, legId: string, questId: number, leaderOnly = false): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly,
    questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
      questId,
      title: id,
      state: state as "accepted" | "objectives-complete" | "rewarded",
      objectiveIndex: null,
    })),
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
function fact(
  questId: number,
  fullXp: number | null,
  overrides: Partial<QuestRewardFact> = {},
): QuestRewardFact {
  return {
    questId,
    fullXp,
    questLevel: 14,
    minimumLevel: 1,
    xpByLevel: [],
    sourceUrl: `https://www.wowhead.com/forever/quest=${questId}`,
    capturedAt: new Date().toISOString(),
    status: fullXp === null ? "unknown" : "available",
    ...overrides,
  };
}
function plan(): CampaignPlan {
  const actions = [
    action("first", "world", 300001),
    action("second", "world", 300002),
    action("repeat", "dungeon-thanes", 300001),
    action("later", "later-world", 300003),
  ];
  return {
    release: "xp-test",
    race: "human",
    leaderClass: null,
    targetBuild: 70205,
    actions,
    legs: [
      { id: "world", title: "World", from: 14, to: 16, kind: "preparation", stopId: null },
      {
        id: "dungeon-thanes",
        title: "Thanes",
        from: 16,
        to: 18,
        kind: "dungeon",
        stopId: "thanes",
      },
      { id: "later-world", title: "Later", from: 16, to: 18, kind: "preparation", stopId: null },
      {
        id: "dungeon-lordaeron",
        title: "Ruins",
        from: 18,
        to: 20,
        kind: "dungeon",
        stopId: "lordaeron",
      },
    ].map((leg) => ({
      ...leg,
      actionIds: actions.filter((a) => a.legId === leg.id).map((a) => a.id),
      questIds: [],
      unresolvedQuestIds: [],
    })) as CampaignPlan["legs"],
    rewardFacts: [
      fact(300001, 250),
      fact(300002, 400, { xpByLevel: [{ level: 15, xp: 80 }] }),
      fact(300003, 70),
    ],
  };
}
function progress(level = 14, xp = 12800): ReturnType<typeof emptyPremadeProgress> {
  let state = emptyPremadeProgress();
  for (let member = 0; member < 5; member++) state = recordPremadeXp(state, member, level, xp);
  return state;
}

describe("cumulative per-player route XP", () => {
  it("carries overflow and resolves later hand-ins at the new level without resetting at chapter boundaries", () => {
    const state = progress(),
      before = JSON.stringify(state);
    const forecast = forecastCampaignXp(plan(), state);
    expect(forecast[0]?.members[0]?.endpoint).toEqual({ level: 15, currentXp: 230 });
    expect(forecast[0]?.members[0]?.rewards.map((row) => row.handInLevel)).toEqual([14, 15]);
    expect(forecast[2]?.members[0]?.start).toEqual({ level: 15, currentXp: 230 });
    expect(forecast[2]?.members[0]?.endpoint).toEqual({ level: 15, currentXp: 300 });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("counts each one-time hand-in once per player and preserves individual previously paid rewards", () => {
    const state = progress();
    state.members[0]!.questStates["300001"] = "rewarded";
    const forecast = forecastCampaignXp(plan(), state);
    expect(forecast[0]?.members[0]?.referenceQuestXp).toBe(400);
    expect(forecast[0]?.members[1]?.referenceQuestXp).toBe(330);
    expect(forecast[1]?.members.every((member) => member.rewards.length === 0)).toBe(true);
  });
  it("keeps unresolved XP and stale bars visible and does not claim incomplete budgets covered", () => {
    const route = { ...plan(), rewardFacts: [] };
    const forecast = forecastCampaignXp(route, progress());
    expect(forecast[0]?.members[0]?.unknownQuestIds).toEqual([300001]);
    expect(forecast[0]?.members[0]?.blockedAtActionId).toBe("first");
    expect(forecast[2]?.members[0]?.unknownQuestIds).toContain(300001);
    expect(forecast[2]?.members[0]?.status).toBe("incomplete");
    expect(forecast[2]?.members[0]?.endpoint).toBeNull();
    expect(forecast[2]?.members[0]?.residualXp).toBeNull();
    expect(forecastCampaignXp(plan(), emptyPremadeProgress())[0]?.members[0]?.endpoint).toBeNull();
  });
  it("does not crash or discard other progress when an older saved bar no longer fits the curve", () => {
    const state = progress();
    state.members[0]!.currentXp = 99999;
    const row = forecastCampaignXp(plan(), state)[0]!.members[0]!;
    expect(row.status).toBe("no-start");
    expect(row.eligibilityIssues[0]).toMatch(/reference level curve/);
    expect(state.members[0]!.currentXp).toBe(99999);
  });
  it("honors pickup gates and never counts unverified combat as proven coverage", () => {
    const route = { ...plan(), rewardFacts: [fact(300001, 250, { minimumLevel: 15 })] };
    expect(forecastCampaignXp(route, progress())[0]?.members[0]?.endpoint).toBeNull();
    const member = forecastCampaignXp(plan(), progress(16, 0), {
      combat: [{ actionId: "first", xpByPlayer: [100, 100, 100, 100, 100] }],
    })[0]!.members[0]!;
    expect(member.status).toBe("incomplete");
    expect(member.issues.map((issue) => issue.code)).toContain("combat-scenario-estimated");
    expect(member.evidence.combat).toBe("estimated");
  });
  it("exposes historical reward evidence as a structured, deduplicated issue", () => {
    const route = {
      ...plan(),
      rewardFacts: [
        fact(300001, 250, { evidenceKind: "historical-reference" }),
        fact(300002, 400),
        fact(300003, 70),
      ],
    };
    const member = forecastCampaignXp(route, progress())[0]!.members[0]!;
    expect(member.evidence.reward).toBe("estimated");
    expect(member.issues).toContainEqual(
      expect.objectContaining({
        code: "reward-historical-estimate",
        questId: 300001,
        resolution: "offline-or-in-game",
      }),
    );
  });
  it("stops adding leveling XP at 60 even when another hand-in follows", () => {
    const route = {
      ...plan(),
      rewardFacts: [
        fact(300001, 250, { xpByLevel: [{ level: 59, xp: 250 }] }),
        fact(300002, 100),
        fact(300003, 100),
      ],
    };
    const row = forecastCampaignXp(route, progress(59, 209700))[0]!.members[0]!;
    expect(row.rewards.map((reward) => reward.xp)).toEqual([250, 0]);
    expect(row.endpoint).toEqual({ level: 60, currentXp: 0 });
  });
  it("starts at the recorded action and never transfers a leader-only reward to the other players", () => {
    const original = plan();
    const route = {
      ...original,
      actions: original.actions.map((entry, index) =>
        index === 0 ? { ...entry, leaderOnly: true } : entry,
      ),
    };
    expect(forecastCampaignXp(route, progress())[0]?.members[1]?.referenceQuestXp).toBe(400);
    const rows = forecastCampaignXp(route, progress(), { fromActionId: "later" });
    expect(rows[0]?.members[0]?.status).toBe("before-start");
    expect(rows[2]?.members[0]?.rewards.map((r) => r.questId)).toEqual([300003]);
  });
  it("rejects duplicate combat budgets and adds only explicit per-player combat estimates", () => {
    const budget = { actionId: "first", xpByPlayer: [100, 200, 300, 400, 500] };
    expect(() => forecastCampaignXp(plan(), progress(), { combat: [budget, budget] })).toThrow(
      /duplicate/,
    );
    expect(
      forecastCampaignXp(plan(), progress(), { combat: [budget] })[0]?.members[4]?.combatXp,
    ).toBe(500);
  });
  it("distinguishes zero from unknown, honors exact level tables and never boosts a Forever fact twice", () => {
    expect(resolveQuestReward(300001, 14, [fact(300001, 0)]).xp).toBe(0);
    expect(resolveQuestReward(300001, 14, [fact(300001, null)]).xp).toBeNull();
    expect(resolveQuestReward(214, 17, [fact(214, 2950, { questLevel: 17 })]).xp).toBe(2950);
    expect(resolveQuestReward(300001, 20, [fact(300001, 100)])).toMatchObject({
      xp: null,
      basis: "unknown",
    });
    expect(resolveQuestReward(300001, 60, [fact(300001, 100)]).xp).toBe(0);
    expect(resolveQuestReward(300001, 14, [fact(300001, 100, { minimumLevel: 15 })]).xp).toBeNull();
    expect(
      resolveQuestReward(300001, 14, [fact(300001, 100, { status: "conflict" })]).xp,
    ).toBeNull();
    expect(
      resolveQuestReward(300001, 14, [fact(300001, 100, { evidenceKind: "historical-reference" })]),
    ).toMatchObject({ xp: 100, basis: "base-estimate" });
  });
});
