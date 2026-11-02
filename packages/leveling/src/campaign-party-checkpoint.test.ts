import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";

function fixture(leaderOnly = false, stopId: CampaignAction["targetStopId"] = null): CampaignPlan {
  const checkpoint: CampaignAction = {
    id: "group-entry",
    legId: "dungeon",
    title: "Enter together",
    instructions: [],
    positions: [],
    source: null,
    kind: "checkpoint",
    leaderOnly,
    raidOnly: false,
    targetLevel: 14,
    targetStopId: stopId,
    questChanges: [],
  };
  const reward: CampaignAction = {
    ...checkpoint,
    id: "dungeon-reward",
    kind: "quests",
    targetLevel: null,
    targetStopId: null,
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 420910,
      title: "Dungeon objective reward",
      state,
      objectiveIndex: null,
    })),
  };
  return {
    release: "party-checkpoint-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [checkpoint, reward],
    legs: [
      {
        id: "dungeon",
        title: "Dungeon",
        kind: "dungeon",
        from: 14,
        to: 16,
        stopId,
        actionIds: [checkpoint.id, reward.id],
        questIds: [420910],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 420910,
        fullXp: 1000,
        questLevel: 40,
        minimumLevel: 1,
        xpByLevel: [],
        sourceUrl: "https://example.test/party-checkpoint",
        capturedAt: "2026-11-02T00:00:00.000Z",
        status: "available",
      },
    ],
  };
}

function progress(): PremadeProgress {
  const base = emptyPremadeProgress();
  return {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level: 14,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("shared dungeon entry barriers", () => {
  it("holds an eligible leader and all future group rewards when one peer is below entry", () => {
    const state = progress();
    state.members[1] = { ...state.members[1]!, level: 13 };
    const frozen = JSON.stringify(state);
    const members = forecastCampaignXp(fixture(), state)[0]!.members;
    for (const member of members) {
      expect(member.rewards).toEqual([]);
      expect(member.blockedAtActionId).toBe("group-entry");
      expect(member.checkpoints[0]!.ready).toBe(false);
    }
    expect(members[0]!.checkpoints[0]!.missingXp).toBe(0);
    expect(members[0]!.blockedReason).toContain("Player 2");
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("resumes the entire group when the last peer reaches entry", () => {
    const members = forecastCampaignXp(fixture(), progress())[0]!.members;
    expect(members.every((member) => member.checkpoints[0]!.ready)).toBe(true);
    expect(members.map((member) => member.referenceQuestXp)).toEqual([
      1000, 1000, 1000, 1000, 1000,
    ]);
    expect(members.every((member) => member.blockedAtActionId === null)).toBe(true);
  });

  it("does not advance past a peer with an unknown XP bar", () => {
    const state = progress();
    state.members[4] = { ...state.members[4]!, level: null, currentXp: null, xpNeedsUpdate: true };
    const members = forecastCampaignXp(fixture(), state)[0]!.members;
    expect(members[0]!.rewards).toEqual([]);
    expect(members[0]!.blockedReason).toContain("Player 5");
  });

  it("requires dungeon quest space for every member before reserving anyone's slots", () => {
    const state = progress();
    state.members = state.members.map((member) => ({ ...member, level: 40 }));
    state.members[2] = {
      ...state.members[2]!,
      questStates: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          String(430000 + index),
          "objectives-complete" as const,
        ]),
      ),
    };
    const members = forecastCampaignXp(fixture(false, "drowned-city"), state)[0]!.members;
    expect(members[0]!.rewards).toEqual([]);
    expect(members[0]!.blockedReason).toContain("Player 3");
    expect(members[2]!.blockedReason).toContain("40");
    expect(members[0]!.questLog.used).toBe(0);
  });

  it("reserves the four pending dungeon quests only after the whole party passes", () => {
    const state = progress();
    state.members = state.members.map((member) => ({ ...member, level: 40 }));
    const members = forecastCampaignXp(fixture(false, "drowned-city"), state)[0]!.members;
    expect(members.every((member) => member.checkpoints[0]!.ready)).toBe(true);
    expect(members.map((member) => member.questLog.used)).toEqual([4, 4, 4, 4, 4]);
    expect(members.map((member) => member.referenceQuestXp)).toEqual([
      1000, 1000, 1000, 1000, 1000,
    ]);
  });

  it("waits for one peer's preparation hand-in even when everyone's level is sufficient", () => {
    const state = progress();
    state.members = state.members.map((member, index) => ({
      ...member,
      questStates: { "430000": index === 3 ? "objectives-complete" : "rewarded" },
    }));
    const base = fixture();
    const route = {
      ...base,
      actions: base.actions.map((entry) =>
        entry.id === "group-entry" ? { ...entry, requiredQuestIds: [430000] } : entry,
      ),
    };
    const members = forecastCampaignXp(route, state)[0]!.members;
    expect(members.every((member) => member.rewards.length === 0)).toBe(true);
    expect(members[0]!.blockedReason).toContain("Player 4");
    expect(members[3]!.blockedReason).toContain("430000");
  });

  it("keeps personal starter checkpoints independent of peers", () => {
    const state = progress();
    state.members[1] = { ...state.members[1]!, level: 1 };
    const members = forecastCampaignXp(fixture(true), state)[0]!.members;
    expect(members[0]!.referenceQuestXp).toBe(1000);
    expect(members[0]!.blockedAtActionId).toBeNull();
    expect(members[1]!.rewards).toEqual([]);
  });
});
