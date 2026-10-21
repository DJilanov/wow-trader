import type { CampaignPlan } from "@wow-trader/leveling";

export function guideTestPlan(): CampaignPlan {
  return {
    release: "guide-ui-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: ["northshire", "elwynn"].map((legId, index) => ({
      id: `${legId}-quest`,
      legId,
      title: index ? "Continue in Elwynn" : "A Threat Within",
      instructions: ["Talk to Marshal McBride."],
      positions: [],
      source: null,
      kind: "quests",
      leaderOnly: true,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
      questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
        questId: 300001 + index,
        title: "A Threat Within",
        state: state as "accepted" | "objectives-complete" | "rewarded",
        objectiveIndex: null,
      })),
    })),
    legs: [
      { id: "northshire", title: "Northshire", from: 1, to: 6 },
      { id: "elwynn", title: "Elwynn Forest", from: 6, to: 11 },
    ].map((leg) => ({
      ...leg,
      kind: "starter",
      stopId: null,
      actionIds: [`${leg.id}-quest`],
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [400, 900].map((fullXp, index) => ({
      questId: 300001 + index,
      fullXp,
      minimumLevel: 1,
      questLevel: 10,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: `https://example.test/quest=${300001 + index}`,
      capturedAt: "2026-10-21T00:00:00.000Z",
    })),
  };
}
