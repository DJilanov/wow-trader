import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatObjective } from "./combat-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";

function fixture(extraIndex = false): CampaignPlan {
  const actions: CampaignAction[] = ["take", "first", "second", "reward", "peer"].map((id) => ({
    id,
    legId: "starter",
    title: id,
    instructions: [],
    questChanges: [
      {
        questId: 300100,
        title: "Two-creature objective",
        state: id === "take" ? "accepted" : id === "reward" ? "rewarded" : "objectives-complete",
        objectiveIndex:
          id === "take" || id === "reward"
            ? null
            : id === "second"
              ? 2
              : id === "peer" && extraIndex
                ? 3
                : 1,
      },
    ],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
  const objectives: readonly CombatObjective[] = [114, 115].map((npcId, index) => ({
    questId: 300100,
    objectiveIndex: index + 1,
    npcIds: [npcId],
    requiredKills: index === 0 ? 4 : 7,
    credit: "shared-kills",
    source: "Synthetic exact counter",
    reason: null,
  }));
  return {
    release: "member-reference-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Starter",
        kind: "starter",
        from: 1,
        to: 2,
        stopId: null,
        actionIds: actions.map((entry) => entry.id),
        questIds: [300100],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 300100,
        fullXp: 100,
        questLevel: 1,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        sourceUrl: "https://example.test/member-reference",
        capturedAt: "2026-11-02T00:00:00.000Z",
      },
    ],
    combat: {
      revision: "unit-test",
      sourceRevision: "unit-test",
      targetBuild: 70205,
      notice: null,
      questObjectiveIndexes: { "300100": [1, 2] },
      npcs: [114, 115].map((id) => ({
        id,
        name: `Creature ${id}`,
        minimumLevel: 1,
        maximumLevel: 1,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      })),
      activities: [
        ...["first", "second"].map((id) => ({
          id: `combat-${id}`,
          actionId: id,
          environment: "outdoor" as const,
          profile: null,
          questWide: true,
          objectives,
        })),
        {
          id: "combat-peer",
          actionId: "peer",
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              ...objectives[0]!,
              objectiveIndex: extraIndex ? 3 : 1,
              npcIds: [],
              requiredKills: null,
              credit: "unknown",
              reason: "Incomplete peer source",
            },
          ],
        },
      ],
      killXpEvidence: [114, 115].map((npcId) => ({
        npcId,
        build: 70205,
        playerLevel: 1,
        mobLevel: 1,
        partySize: 1,
        partyLevels: [1],
        environment: "outdoor",
        unrestedXpPerPlayer: 10,
        sampleCount: 3,
        source: "Synthetic exact-payout calibration",
        contextVerified: true,
      })),
    },
  };
}

function ownership(owner: number): Readonly<Record<string, number>> {
  return { take: owner, first: owner, second: owner, reward: owner, peer: 2 };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  return {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("personal combat reference ownership", () => {
  it.each([1, 3])(
    "counts each creature once for player %i despite a peer's unknown variant",
    (owner) => {
      const plan = fixture();
      const state = progress();
      const original = JSON.stringify({ plan, state });
      const member = forecastCampaignXp(plan, state, {
        personalActionPlayers: ownership(owner),
      })[0]!.members[owner - 1]!;
      expect(member.combatXp).toBe(110);
      expect(member.combatRows.map((row) => [row.npcId, row.kills])).toEqual([
        [114, 4],
        [115, 7],
      ]);
      expect(member.referenceQuestXp).toBe(100);
      expect(member.blockedReason).toBeNull();
      expect(JSON.stringify({ plan, state })).toBe(original);
    },
  );

  it.each([1, 3])(
    "does not import another player's third objective into player %i's hand-in",
    (owner) => {
      const member = forecastCampaignXp(fixture(true), progress(), {
        personalActionPlayers: ownership(owner),
      })[0]!.members[owner - 1]!;
      expect(member.referenceQuestXp).toBe(100);
      expect(member.blockedReason).toBeNull();
    },
  );

  it("still requires every provider objective after filtering peer source actions", () => {
    const base = fixture(true);
    const plan = {
      ...base,
      combat: { ...base.combat!, questObjectiveIndexes: { "300100": [1, 2, 3] } },
    };
    const member = forecastCampaignXp(plan, progress(), { personalActionPlayers: ownership(1) })[0]!
      .members[0]!;
    expect(member.referenceQuestXp).toBe(0);
    expect(member.blockedReason).toContain("required objectives");
  });

  it("does not treat a held quest's unobserved counters as fresh kills", () => {
    const state = progress();
    state.members[0] = { ...state.members[0]!, questStates: { "300100": "accepted" } };
    const member = forecastCampaignXp(fixture(), state, { personalActionPlayers: ownership(1) })[0]!
      .members[0]!;
    expect(member.combatXp).toBe(0);
    expect(member.combatRows).toEqual([]);
    expect(
      member.evidenceIssues.some((issue) => issue.includes("remaining kills are unknown")),
    ).toBe(true);
  });
});
