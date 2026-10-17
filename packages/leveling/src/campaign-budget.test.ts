import { describe, expect, it } from "vitest";
import {
  campaignActionReasons,
  campaignOptionalXpReady,
  type CampaignPlan,
  type CampaignAction,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { questEligibility, questGateResult } from "./quest-eligibility.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { auditCampaignSections, campaignCoverageReady } from "./campaign-coverage.js";

function action(id: string, legId: string): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
function party(level: number, xp = 0): ReturnType<typeof emptyPremadeProgress> {
  const state = emptyPremadeProgress();
  return {
    ...state,
    members: state.members.map((member) => ({
      ...member,
      level,
      currentXp: xp,
      xpNeedsUpdate: false,
    })),
  };
}
function route(
  actions: readonly CampaignAction[],
  kind: CampaignPlan["legs"][number]["kind"] = "xp-bridge",
  from = 20,
  to = 26,
): CampaignPlan {
  return {
    release: "budget-test",
    race: "human",
    leaderClass: null,
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "zone",
        title: "Zone",
        from,
        to,
        kind,
        stopId: null,
        actionIds: actions.map((entry) => entry.id),
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
  };
}
const fact: QuestRewardFact = {
  questId: 300001,
  fullXp: 20000,
  questLevel: 30,
  minimumLevel: 1,
  xpByLevel: [],
  sourceUrl: "https://www.wowhead.com/forever/quest=300001",
  capturedAt: "2026-10-15T00:00:00.000Z",
  status: "available",
};

describe("checkpoint budget regressions", () => {
  it("uses already-scaled Stockade evidence instead of the legacy fallback or another multiplier", () => {
    const scaled: QuestRewardFact = {
      ...fact,
      questId: 378,
      questLevel: 27,
      minimumLevel: 25,
      fullXp: 5800,
      xpByLevel: [
        { level: 27, xp: 5800 },
        { level: 33, xp: 4600 },
      ],
      sourceUrl: "https://www.wowhead.com/forever/quest=378/the-fury-runs-deep",
    };
    expect(resolveQuestReward(378, 27, [scaled])).toMatchObject({
      xp: 5800,
      basis: "wowhead-reference",
    });
    expect(resolveQuestReward(378, 33, [scaled])).toMatchObject({
      xp: 4600,
      basis: "wowhead-reference",
    });
  });
  it("never certifies a whole route while one party member lacks a supported level-60 exit", () => {
    const plan = route([action("finish", "zone")], "finish", 60, 60);
    const state = party(60);
    const chapters = auditCampaignSections(plan, state);
    expect(campaignCoverageReady(chapters, forecastCampaignXp(plan, state))).toBe(true);
    state.members[4]!.level = 59;
    expect(campaignCoverageReady(chapters, forecastCampaignXp(plan, state))).toBe(false);
    state.members[4]!.level = 60;
    state.members[4]!.xpNeedsUpdate = true;
    expect(campaignCoverageReady(chapters, forecastCampaignXp(plan, state))).toBe(false);
    expect(campaignCoverageReady([], [])).toBe(false);
  });
  it.each([
    [20, 23],
    [23, 26],
    [50, 53],
    [53, 55],
    [59, 60],
  ])(
    "never skips level %i catch-up before its own target %i, including legacy level-16 overrides",
    (from, to) => {
      const step = { ...action("extra", "zone"), xpTargetLevel: 16 };
      const plan = route([step], "xp-bridge", from, to);
      expect(campaignOptionalXpReady(plan, party(from), step)).toBe(false);
      expect(campaignOptionalXpReady(plan, party(to), step)).toBe(true);
      const lagging = party(to);
      lagging.members[4]!.level = from;
      expect(campaignOptionalXpReady(plan, lagging, step)).toBe(false);
      const stale = party(to);
      stale.members[4]!.xpNeedsUpdate = true;
      expect(campaignOptionalXpReady(plan, stale, step)).toBe(false);
    },
  );

  it("does not borrow rewards or combat after an impossible entry to fund that entry", () => {
    const entry = { ...action("entry", "zone"), kind: "checkpoint" as const, targetLevel: 26 };
    const reward = {
      ...action("reward", "zone"),
      kind: "quests" as const,
      questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
        questId: fact.questId,
        title: "Reward",
        state: state as "accepted" | "objectives-complete" | "rewarded",
        objectiveIndex: null,
      })),
    };
    const plan = { ...route([entry, reward], "preparation"), rewardFacts: [fact] };
    const state = party(25, 20000);
    const before = JSON.stringify(state);
    expect(campaignActionReasons(entry, state)).not.toEqual([]);
    const member = forecastCampaignXp(plan, state, {
      combat: [{ actionId: "entry", xpByPlayer: [50000, 50000, 50000, 50000, 50000] }],
    })[0]!.members[0]!;
    expect(member).toMatchObject({
      status: "blocked",
      endpoint: null,
      residualXp: null,
      referenceQuestXp: 0,
      combatXp: 0,
      blockedAtActionId: "entry",
      knownEndpoint: { level: 25, currentXp: 20000 },
    });
    expect(member.checkpoints[0]).toMatchObject({ ready: false, missingXp: 14000 });
    expect(JSON.stringify(state)).toBe(before);
    expect(forecastCampaignXp(plan, party(26))[0]!.members[0]!.referenceQuestXp).toBe(20000);
  });

  it("stops only the ineligible member and never hides the lagging player in a party average", () => {
    const entry = { ...action("entry", "zone"), kind: "checkpoint" as const, targetLevel: 26 };
    const state = party(26);
    state.members[4]!.level = 25;
    const members = forecastCampaignXp(route([entry], "preparation"), state)[0]!.members;
    expect(
      members
        .slice(0, 4)
        .every((member) => member.checkpoints[0]?.ready && member.blockedAtActionId === null),
    ).toBe(true);
    expect(members[4]).toMatchObject({
      status: "blocked",
      checkpoints: [{ ready: false, missingXp: 34000 }],
    });
  });

  it("rejects counting the same combat activity at two different actions", () => {
    const plan = route([action("one", "zone"), action("two", "zone")]);
    expect(() =>
      forecastCampaignXp(plan, party(20), {
        combat: [
          { actionId: "one", activityId: "same-pack", xpByPlayer: [10, 10, 10, 10, 10] },
          { actionId: "two", activityId: "same-pack", xpByPlayer: [10, 10, 10, 10, 10] },
        ],
      }),
    ).toThrow(/duplicate/);
  });

  it("adds only one fifth of explicit solo combat XP while keeping the full quest reward", () => {
    const reward = {
      ...action("reward", "zone"),
      kind: "quests" as const,
      questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
        questId: fact.questId,
        title: "Reward",
        state: state as "accepted" | "objectives-complete" | "rewarded",
        objectiveIndex: null,
      })),
    };
    const plan = { ...route([reward], "preparation"), rewardFacts: [fact] };
    const row = forecastCampaignXp(plan, party(25), {
      groupCombat: [
        {
          actionId: "reward",
          activityId: "gnoll-camp",
          soloXpPerKill: 200,
          kills: 100,
          partySize: 5,
        },
      ],
    })[0]!.members[0]!;
    expect(row.referenceQuestXp).toBe(20000);
    expect(row.combatXp).toBe(4000);
    expect(row.status).toBe("incomplete");
  });

  it("shares conservative conflicting minima across live controls and reward resolution", () => {
    const facts = [{ ...fact, questId: 378, minimumLevel: 22 }];
    expect(questEligibility(378, facts)).toMatchObject({ minimumLevel: 25, minimumConflict: true });
    expect(resolveQuestReward(378, 24, facts).xp).toBeNull();
    const pickup = {
      ...action("pickup", "zone"),
      kind: "quests" as const,
      questChanges: [
        { questId: 378, title: "Fury", state: "accepted" as const, objectiveIndex: null },
      ],
    };
    expect(campaignActionReasons(pickup, party(24), facts)[0]).toContain("25");
  });

  it("respects alternative prerequisite paths and does not invent missing item confirmations", () => {
    const member = party(20).members[0]!;
    member.questStates["1"] = "rewarded";
    expect(
      questGateResult(
        {
          kind: "any",
          gates: [
            { kind: "quest", questId: 1, state: "rewarded" },
            { kind: "quest", questId: 2, state: "rewarded" },
          ],
        },
        member,
      ),
    ).toBe("ready");
    expect(questGateResult({ kind: "item", itemId: 1 }, member)).toBe("unknown");
  });

  it("distinguishes the current dungeon entry from the next departure budget", () => {
    const entry = {
      ...action("stockade-entry", "stockade"),
      kind: "checkpoint" as const,
      targetStopId: "stockade" as const,
    };
    const plan: CampaignPlan = {
      ...route([entry]),
      legs: [
        {
          id: "stockade",
          title: "Stockade",
          from: 26,
          to: 27,
          kind: "dungeon",
          stopId: "stockade",
          actionIds: [entry.id],
          questIds: [],
          unresolvedQuestIds: [],
        },
        {
          id: "excavation",
          title: "Excavation",
          from: 27,
          to: 28,
          kind: "dungeon",
          stopId: "excavation",
          actionIds: [],
          questIds: [],
          unresolvedQuestIds: [],
        },
      ],
    };
    const member = forecastCampaignXp(plan, party(26))[0]!.members[0]!;
    expect(member.checkpoints[0]!.targetLevel).toBe(26);
    expect(member.targetLevel).toBe(29);
    expect(member.status).toBe("shortfall");
  });

  it("does not pay a hand-in before every modeled objective has completed", () => {
    const changes = (
      id: string,
      state: "accepted" | "objectives-complete" | "rewarded",
      objectiveIndex: number | null = null,
    ): CampaignAction => ({
      ...action(id, "zone"),
      kind: "quests",
      questChanges: [{ questId: fact.questId, title: "Quest", state, objectiveIndex }],
    });
    const plan = {
      ...route(
        [
          changes("accept", "accepted"),
          changes("one", "objectives-complete", 1),
          changes("premature", "rewarded"),
          changes("two", "objectives-complete", 2),
        ],
        "preparation",
      ),
      rewardFacts: [fact],
    };
    expect(forecastCampaignXp(plan, party(25))[0]!.members[0]).toMatchObject({
      status: "blocked",
      referenceQuestXp: 0,
      blockedAtActionId: "premature",
    });
    const state = party(25);
    for (const member of state.members)
      member.questStates[String(fact.questId)] = "objectives-complete";
    expect(forecastCampaignXp(plan, state)[0]!.members[0]!.referenceQuestXp).toBe(20000);
  });
});
