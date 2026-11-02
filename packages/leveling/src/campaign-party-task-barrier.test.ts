import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";

function action(id: string, questId: number, leaderOnly = false): CampaignAction {
  return {
    id,
    legId: leaderOnly ? "personal" : "party",
    title: id,
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId,
      state,
      title: id,
      objectiveIndex: null,
    })),
  };
}

function fixture(personal = true): CampaignPlan {
  const actions = [
    ...(personal ? [action("personal-work", 420921, true)] : []),
    action("first-party-work", 420922),
    action("later-party-work", 420923),
  ];
  return {
    release: "party-task-barrier-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: (["personal", "party"] as const).map((id) => ({
      id,
      title: id,
      kind: id === "personal" ? "starter" : "xp-bridge",
      from: 14,
      to: 16,
      stopId: null,
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
      questIds: actions
        .filter((entry) => entry.legId === id)
        .flatMap((entry) => entry.questChanges.map((change) => change.questId)),
      unresolvedQuestIds: [],
    })),
    rewardFacts: [420921, 420922, 420923].map((questId) => ({
      questId,
      fullXp: 1000,
      questLevel: 40,
      minimumLevel: questId === 420921 ? 15 : 1,
      xpByLevel: [],
      sourceUrl: "https://example.test/party-task-barrier",
      capturedAt: "2026-11-02T00:00:00.000Z",
      status: "available",
    })),
  };
}

function progress(): PremadeProgress {
  const state = emptyPremadeProgress();
  return {
    ...state,
    members: state.members.map((member) => ({
      ...member,
      level: 14,
      currentXp: 500,
      xpNeedsUpdate: false,
    })),
  };
}

describe("shared work after an unavailable party member", () => {
  it("preserves the failed personal gate and stops ready peers at their first shared task", () => {
    const plan = fixture();
    const state = progress();
    const before = JSON.stringify({ plan, state });
    const sections = forecastCampaignXp(plan, state, {
      personalActionPlayers: { "personal-work": 2 },
    });
    const party = sections.at(-1)!;
    expect(party.members[1]!.blockedAtActionId).toBe("personal-work");
    expect(party.members[1]!.blockedReason).toContain("pickup requires level 15");
    for (const member of party.members.filter((row) => row.player !== 2)) {
      expect(member.blockedAtActionId).toBe("first-party-work");
      expect(member.blockedReason).toContain("Player 2");
      expect(member.blockedReason).toContain("pickup requires level 15");
    }
    for (const member of party.members) {
      expect(member.knownEndpoint).toEqual({ level: 14, currentXp: 500 });
      expect(member.rewards).toEqual([]);
      expect(member.steps).toEqual([]);
      expect(member.questLog.used).toBe(0);
    }
    expect(JSON.stringify({ plan, state })).toBe(before);
  });

  it("holds shared tasks when one member has no usable XP bar", () => {
    const state = progress();
    state.members[4] = { ...state.members[4]!, level: null, currentXp: null, xpNeedsUpdate: true };
    const party = forecastCampaignXp(fixture(false), state).at(-1)!;
    for (const member of party.members.slice(0, 4)) {
      expect(member.blockedAtActionId).toBe("first-party-work");
      expect(member.blockedReason).toContain("Player 5");
      expect(member.referenceQuestXp).toBe(0);
      expect(member.knownEndpoint).toEqual({ level: 14, currentXp: 500 });
    }
  });

  it("stops later group work after a peer's forty-first pickup is rejected", () => {
    const state = progress();
    state.members[3] = {
      ...state.members[3]!,
      questStates: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          String(430000 + index),
          "objectives-complete" as const,
        ]),
      ),
    };
    const plan = fixture(false);
    const take = plan.actions[0]!;
    const handIn = plan.actions[1]!;
    const value: CampaignPlan = {
      ...plan,
      actions: [
        {
          ...take,
          questChanges: take.questChanges.filter((change) => change.state === "accepted"),
        },
        {
          ...handIn,
          questChanges: take.questChanges.filter((change) => change.state === "rewarded"),
        },
      ],
    };
    const party = forecastCampaignXp(value, state).at(-1)!;
    expect(party.members[3]!.blockedAtActionId).toBe("first-party-work");
    expect(party.members[3]!.blockedReason).toContain("40/40");
    expect(party.members[3]!.questLog.used).toBe(40);
    for (const member of party.members.filter((row) => row.player !== 4)) {
      expect(member.blockedAtActionId).toBe("later-party-work");
      expect(member.blockedReason).toContain("Player 4");
      expect(member.questLog.used).toBe(1);
      expect(member.rewards).toEqual([]);
      expect(member.knownEndpoint).toEqual({ level: 14, currentXp: 500 });
    }
  });

  it("allows every member to continue when the personal path is funded", () => {
    const state = progress();
    state.members[1] = { ...state.members[1]!, level: 15 };
    const sections = forecastCampaignXp(fixture(), state, {
      personalActionPlayers: { "personal-work": 2 },
    });
    const party = sections.at(-1)!;
    expect(party.members.every((member) => member.blockedAtActionId === null)).toBe(true);
    expect(party.members.map((member) => member.referenceQuestXp)).toEqual([
      2000, 2000, 2000, 2000, 2000,
    ]);
  });

  it("keeps a later independent personal path available while a peer waits", () => {
    const plan = fixture();
    const state = progress();
    state.members[2] = { ...state.members[2]!, level: 15 };
    const other = action("other-personal-work", 420924, true);
    const value: CampaignPlan = {
      ...plan,
      actions: [plan.actions[0]!, other, ...plan.actions.slice(1)],
      legs: plan.legs.map((leg) =>
        leg.id === "personal"
          ? { ...leg, actionIds: [...leg.actionIds, other.id], questIds: [...leg.questIds, 420924] }
          : leg,
      ),
      rewardFacts: [...plan.rewardFacts!, { ...plan.rewardFacts![0]!, questId: 420924 }],
    };
    const sections = forecastCampaignXp(value, state, {
      personalActionPlayers: { "personal-work": 2, "other-personal-work": 3 },
    });
    expect(sections[0]!.members[2]!.referenceQuestXp).toBe(1000);
    const member = sections.at(-1)!.members[2]!;
    expect(member.knownEndpoint).toEqual({ level: 15, currentXp: 1500 });
    expect(member.blockedAtActionId).toBe("first-party-work");
  });
});
