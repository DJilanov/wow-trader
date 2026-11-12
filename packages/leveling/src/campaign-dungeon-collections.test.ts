import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import { campaignAcquisitionXpBaseline } from "./campaign-acquisition-xp.js";
import { selectDungeonCollectionSources } from "./campaign-dungeon-collections.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function fixture(): CampaignPlan {
  const actions: CampaignPlan["actions"] = (
    ["accepted", "objectives-complete", "rewarded"] as const
  ).map((state) => ({
    id: state,
    legId: "stockade",
    title: "The Color of Blood",
    kind: "quests",
    instructions: ["Collect 10 Red Wool Bandanas per player on the selected clear."],
    positions: [],
    source: null,
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: [
      {
        questId: 388,
        title: "The Color of Blood",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
  }));
  return {
    release: "selected-clear-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    acquisitionXpPolicy: "exclude-unpriced-extra",
    dungeonCollectionPolicy: "selected-clear",
    incidentalKillXpPercent: 10,
    actions,
    legs: [
      {
        id: "stockade",
        title: "Stockade",
        kind: "dungeon",
        stopId: "stockade",
        from: 24,
        to: 25,
        actionIds: actions.map((action) => action.id),
        questIds: [388],
        unresolvedQuestIds: [],
      },
    ],
    itemRequirements: [{ questId: 388, objectiveIndex: 1, itemId: 2909, quantity: 10 }],
    rewardFacts: [
      {
        questId: 388,
        fullXp: 100,
        minimumLevel: 22,
        questLevel: 26,
        xpByLevel: [],
        sourceUrl: "https://example.test/synthetic-bandana-reward",
        capturedAt: "2026-11-04T00:00:00Z",
        status: "available",
        evidenceKind: "published-forever",
      },
    ],
    combat: {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      notice: null,
      npcs: [1706, 1707].map((id) => ({
        id,
        name: `Synthetic prisoner ${id}`,
        minimumLevel: 23,
        maximumLevel: 24,
        rank: 1,
        zoneIds: [717],
        xpEligibility: "assumed",
      })),
      activities: [
        {
          id: "bandanas",
          actionId: "objectives-complete",
          environment: "dungeon",
          profile: null,
          objectives: [
            {
              questId: 388,
              objectiveIndex: 1,
              npcIds: [1706, 1707],
              requiredKills: null,
              credit: "personal-loot",
              source: "Synthetic known dungeon source pool",
              reason: null,
              loot: { itemId: 2909, quantity: 10, sharing: "pooled" },
            },
          ],
        },
      ],
      lootDrops: [],
      killXpEvidence: [],
    },
  };
}

function collectionFixture(
  questId: number,
  stopId: NonNullable<CampaignPlan["legs"][number]["stopId"]> | "wailing-caverns",
): CampaignPlan {
  const original = fixture();
  return {
    ...original,
    actions: original.actions.map((action) => ({
      ...action,
      legId: stopId,
      questChanges: action.questChanges.map((change) => ({ ...change, questId })),
    })),
    legs: original.legs.map((leg) => ({
      ...leg, id: stopId, stopId: stopId === "wailing-caverns" ? null : stopId,
      dungeonVisitId: stopId, questIds: [questId],
    })),
    itemRequirements: original.itemRequirements!.map((item) => ({ ...item, questId })),
    rewardFacts: original.rewardFacts!.map((fact) => ({ ...fact, questId })),
    combat: {
      ...original.combat!,
      activities: original.combat!.activities.map((activity) => ({
        ...activity,
        objectives: activity.objectives.map((objective) => ({ ...objective, questId })),
      })),
    },
  };
}

describe("selected dungeon collections", () => {
  it.each([
    [92458, "dalaran"],
    [1360, "uldaman"],
    [4701, "lower-blackrock"],
  ] as const)("applies the normal-clear policy to core quest %i without adding acquisition XP", (questId, stopId) => {
    const plan = collectionFixture(questId, stopId);
    const result = campaignAcquisitionXpBaseline(plan);
    expect(result.plan.combat!.activities).toEqual([]);
    expect(result.exclusions.get("objectives-complete")).toEqual([
      expect.objectContaining({ questId, quantityPerPlayer: 10, planningBasis: "selected-dungeon-clear" }),
    ]);
    expect(result.plan.actions).toBe(plan.actions);
    expect(result.plan.itemRequirements).toBe(plan.itemRequirements);
    expect(result.plan.combat!.npcs).toBe(plan.combat!.npcs);
  });

  it("does not waive a core quest's entry requirements when collection XP is omitted", () => {
    const plan = collectionFixture(92458, "dalaran");
    const initial = emptyPremadeProgress();
    const forecast = forecastCampaignXp(plan, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member, level: 24, currentXp: 0, xpNeedsUpdate: false,
      })),
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("accepted");
      expect(member.rewards).toEqual([]);
      expect(member.combatXp).toBe(0);
    }
  });

  it.each([
    [1486, "wailing-caverns"],
    [1275, "blackfathom"],
  ] as const)("keeps the explicit collection exception %i unresolved when its acquisition is unpriced", (questId, stopId) => {
    const plan = collectionFixture(questId, stopId);
    const result = campaignAcquisitionXpBaseline(plan);
    expect(result.plan).toBe(plan);
    expect(result.exclusions.size).toBe(0);
    expect(result.plan.itemRequirements).toBe(plan.itemRequirements);
    expect(result.plan.combat!.activities).toHaveLength(1);
  });

  it("preserves all five quotas and physical sources while counting no speculative loot kills", () => {
    const plan = fixture(),
      before = JSON.stringify(plan);
    const baseline = campaignAcquisitionXpBaseline(plan);
    expect(baseline.plan.actions).toBe(plan.actions);
    expect(baseline.plan.itemRequirements).toBe(plan.itemRequirements);
    expect(baseline.plan.combat!.npcs).toBe(plan.combat!.npcs);
    expect(baseline.plan.combat!.activities).toEqual([]);
    expect(baseline.exclusions.get("objectives-complete")).toEqual([
      expect.objectContaining({
        quantityPerPlayer: 10,
        npcIds: [1706, 1707],
        planningBasis: "selected-dungeon-clear",
      }),
    ]);
    const initial = emptyPremadeProgress();
    const forecast = forecastCampaignXp(plan, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 24,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 24, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
      expect(member.rewards.filter((reward) => reward.questId === 388)).toHaveLength(1);
    }
    expect(JSON.stringify(plan)).toBe(before);
  });

  it.each(["legacy", "strict", "outdoor", "unknown-source", "quota-conflict", "missing-quantity"])(
    "keeps unsupported work unresolved outside the selected-clear contract (%s)",
    (change) => {
      let plan = fixture();
      if (change === "legacy") {
        const { dungeonCollectionPolicy: _policy, ...previous } = plan;
        plan = previous;
      }
      if (change === "outdoor")
        plan = {
          ...plan,
          combat: {
            ...plan.combat!,
            activities: [{ ...plan.combat!.activities[0]!, environment: "outdoor" }],
          },
        };
      if (change === "unknown-source") plan = { ...plan, combat: { ...plan.combat!, npcs: [] } };
      const objective = plan.combat!.activities[0]!.objectives[0]!;
      if (change === "quota-conflict") Object.assign(objective, { quotaConflict: true });
      if (change === "missing-quantity") Object.assign(objective.loot!, { quantity: null });
      const result = campaignAcquisitionXpBaseline(
        plan,
        change === "strict" ? "strict" : undefined,
      );
      expect(result.plan.combat!.activities).toHaveLength(1);
      expect(result.exclusions.size).toBe(0);
    },
  );

  it("keeps the real enemy limit even when acquisition XP is omitted", () => {
    const plan = fixture();
    const npc = plan.combat!.npcs[0]!;
    Object.assign(npc, { maximumLevel: 30 });
    expect(createCampaignCombatReadiness(plan)(plan.actions[1]!).targetLevel).toBe(26);
    expect(campaignAcquisitionXpBaseline(plan).plan.combat!.npcs).toContainEqual(npc);
  });

  it("does not extend the selected-clear assumption to an unreviewed optional collection", () => {
    const original = fixture();
    const plan: CampaignPlan = {
      ...original,
      actions: original.actions.map((action) => ({
        ...action,
        questChanges: action.questChanges.map((change) => ({ ...change, questId: 378 })),
      })),
      itemRequirements: original.itemRequirements!.map((item) => ({ ...item, questId: 378 })),
      combat: {
        ...original.combat!,
        activities: original.combat!.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => ({ ...objective, questId: 378 })),
        })),
      },
    };
    const result = campaignAcquisitionXpBaseline(plan);
    expect(result.plan).toBe(plan);
    expect(result.exclusions.size).toBe(0);
  });

  it("selects known sources on the instance clear without deleting uncaptured alternatives from provenance", () => {
    const plan = fixture(),
      objective = plan.combat!.activities[0]!.objectives[0]!;
    const original = { ...objective, npcIds: [1706, 1707, 999999] };
    const npcs = new Map(plan.combat!.npcs.map((npc) => [npc.id, npc]));
    const result = selectDungeonCollectionSources([original], "stockade", npcs)[0]!;
    expect(result.npcIds).toEqual([1706, 1707]);
    expect(result.loot!.sourceNpcIds).toEqual([1706, 1707, 999999]);
    expect(original.npcIds).toEqual([1706, 1707, 999999]);
    expect(selectDungeonCollectionSources([original], "excavation", npcs)).toEqual([original]);
  });
});
