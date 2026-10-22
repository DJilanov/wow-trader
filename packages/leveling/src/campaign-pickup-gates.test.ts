import { describe, expect, it } from "vitest";
import { campaignActionReasons, type CampaignPlan } from "./campaign.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import { emptyPremadeProgress } from "./premade-model.js";

describe("campaign pickup level gates", () => {
  it("inserts one monotonic actual-XP gate before an otherwise premature pickup", () => {
    const pickup = {
      id: "route-pickup",
      legId: "route",
      title: "Accept the quest",
      instructions: [],
      questChanges: [
        { questId: 10, state: "accepted" as const, title: "Quest", objectiveIndex: null },
      ],
      positions: [],
      source: null,
      kind: "quests" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [pickup],
      legs: [
        {
          id: "route",
          title: "Route",
          from: 1,
          to: 10,
          kind: "xp-bridge",
          actionIds: [pickup.id],
          questIds: [10],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      rewardFacts: [
        {
          questId: 10,
          fullXp: 100,
          questLevel: 10,
          minimumLevel: 5,
          xpByLevel: [],
          status: "available",
          sourceUrl: "https://example.com/quest=10",
          capturedAt: "2026-10-18T00:00:00.000Z",
        },
      ],
    };
    const compiled = compileCampaignPickupGates(plan);
    expect(compiled.actions.map((action) => action.id)).toEqual([
      "route-level-5-10",
      "route-pickup",
    ]);
    expect(compiled.legs[0]?.actionIds).toEqual(["route-level-5-10", "route-pickup"]);
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignActionReasons(compiled.actions[0]!, progress)[0]).toContain("level 5");
  });
  it("starts a phase at its first real task, without an XP-recording step", () => {
    const original = {
      id: "phase-instructions",
      legId: "phase",
      title: "Continue the route",
      instructions: [],
      questChanges: [],
      positions: [],
      source: null,
      kind: "instructions" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [original],
      legs: [
        {
          id: "phase",
          title: "Phase",
          from: 20,
          to: 21,
          kind: "xp-bridge",
          actionIds: [original.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
    };
    const compiled = compileCampaignPickupGates(plan);
    expect(compiled.actions).toEqual([original]);
    expect(compiled.bookmarkAliases?.["phase-entry-xp"]).toBe(original.id);
    expect(compiled.bookmarkAliases?.["phase-entry-level-20"]).toBe(original.id);
  });
  it("records a build-source prerequisite conflict instead of silently blocking that pickup", () => {
    const pickup = {
      id: "source-pickup",
      legId: "route",
      title: "Accept Murloc Gills",
      instructions: [],
      questChanges: [
        { questId: 92744, state: "accepted" as const, title: "Murloc Gills", objectiveIndex: null },
      ],
      positions: [],
      source: { chapterId: "source", version: "1", stepId: "source-step-0001" },
      kind: "quests" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [pickup],
      legs: [
        {
          id: "route",
          title: "Route",
          from: 9,
          to: 10,
          kind: "xp-bridge",
          actionIds: [pickup.id],
          questIds: [92744],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      rewardFacts: [
        {
          questId: 92744,
          fullXp: 460,
          questLevel: 12,
          minimumLevel: 9,
          xpByLevel: [],
          status: "available",
          sourceUrl: "https://example.com/quest=92744",
          capturedAt: "2026-10-18T00:00:00.000Z",
        },
      ],
    };
    const compiled = compileCampaignPickupGates(plan);
    const action = compiled.actions.find((entry) => entry.id === pickup.id)!;
    expect(action.sourceGateConflictQuestIds).toEqual([92744]);
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 9,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignActionReasons(action, progress, plan.rewardFacts)).toEqual([]);
  });
  it("places a required actual-XP departure gate in the preparation leg before a dungeon", () => {
    const preparation = {
      id: "prepare-work",
      legId: "prepare",
      title: "Prepare",
      instructions: [],
      questChanges: [],
      positions: [],
      source: null,
      kind: "instructions" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const entry = {
      ...preparation,
      id: "dungeon-entry",
      legId: "dungeon",
      title: "Enter",
      kind: "checkpoint" as const,
      targetLevel: 16,
      targetStopId: "thanes" as const,
    };
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [preparation, entry],
      legs: [
        {
          id: "prepare",
          title: "Prepare",
          from: 14,
          to: 16,
          kind: "xp-bridge",
          actionIds: [preparation.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: null,
        },
        {
          id: "dungeon",
          title: "Hall",
          from: 16,
          to: 19,
          kind: "dungeon",
          actionIds: [entry.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: "thanes",
        },
      ],
      rewardFacts: [
        {
          questId: 1,
          fullXp: 100,
          questLevel: 1,
          minimumLevel: 1,
          xpByLevel: [],
          status: "available",
          sourceUrl: "https://example.com/quest=1",
          capturedAt: "2026-10-18T00:00:00.000Z",
        },
      ],
    };
    const compiled = compileCampaignPickupGates(plan);
    expect(compiled.actions.map((action) => action.id)).toEqual([
      "prepare-work",
      "prepare-departure-level-16-before-thanes",
      "dungeon-entry",
    ]);
    expect(compiled.legs[0]?.actionIds).toContain("prepare-departure-level-16-before-thanes");
  });
  it("makes the level-60 handoff explicit even without reward evidence", () => {
    const preparation = {
      id: "final-work",
      legId: "final-work",
      title: "Finish the route",
      instructions: [],
      questChanges: [],
      positions: [],
      source: null,
      kind: "instructions" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    };
    const finish = {
      ...preparation,
      id: "finish-checkpoint",
      legId: "finish",
      title: "Confirm level 60",
      kind: "checkpoint" as const,
      targetLevel: 60,
    };
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [preparation, finish],
      legs: [
        {
          id: "final-work",
          title: "Final work",
          from: 58,
          to: 60,
          kind: "xp-bridge",
          actionIds: [preparation.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: null,
        },
        {
          id: "finish",
          title: "Finish",
          from: 60,
          to: 60,
          kind: "finish",
          actionIds: [finish.id],
          questIds: [],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
    };
    const compiled = compileCampaignPickupGates(plan);
    expect(compiled.actions.map((action) => action.id)).toEqual([
      "final-work",
      "final-work-departure-level-60-before-finish",
      "finish-checkpoint",
    ]);
  });
});
