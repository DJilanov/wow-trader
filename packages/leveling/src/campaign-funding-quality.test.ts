import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";

function fixture(firstXp: number, lastXp: number): CampaignPlan {
  const quest: CampaignAction = {
    id: "reward",
    legId: "starter",
    title: "Complete the patrol",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId: 400001,
      title: "Patrol",
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
  const actions: CampaignAction[] = [
    quest,
    { ...quest, id: "first-pickup", kind: "xp-check", targetLevel: 2, questChanges: [] },
    {
      ...quest,
      id: "second-reward",
      questChanges: quest.questChanges.map((change) => ({ ...change, questId: 400002 })),
    },
    { ...quest, id: "departure", kind: "xp-check", targetLevel: 3, questChanges: [] },
  ];
  return {
    release: "frontier-quality-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "One public chapter",
        kind: "starter",
        from: 1,
        to: 3,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [400001, 400002],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [firstXp, lastXp].map((fullXp, index) => ({
      questId: 400001 + index,
      fullXp,
      questLevel: 3,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
  };
}

describe("funding proposal quality", () => {
  it("compares a deferred pickup by its source phase rather than treating its new bookmark as an earlier blocker", () => {
    const source = { chapterId: "test", version: "test", stepId: "pickup-source" };
    function input(xp: number, deferred: boolean): CampaignPlan {
      const plan = fixture(xp, 100);
      return {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id !== "second-reward"
            ? action
            : { ...action, source, id: deferred ? "second-reward-deferred-400002" : action.id },
        ),
        rewardFacts: plan.rewardFacts!.map((fact) =>
          fact.questId === 400002 ? { ...fact, minimumLevel: 3 } : fact,
        ),
      };
    }
    const baseline = input(300, false);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(input(500, true)),
      ),
    ).toEqual([]);
  });
  it("retains a completely funded configuration when a proposal introduces a blocker", () => {
    const baseline = fixture(500, 1000);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(fixture(500, 100)),
      ),
    ).toEqual(["at-level/separate/dungeons/true"]);
  });
  it("rejects an earlier unsupported source action even inside the same public chapter", () => {
    const baseline = fixture(500, 100);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(fixture(300, 500)),
      ),
    ).toEqual(["at-level/separate/dungeons/true"]);
  });
  it("rejects a larger deficit at the same source action", () => {
    const baseline = fixture(300, 100);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(fixture(200, 100)),
      ),
    ).toEqual(["at-level/separate/dungeons/true"]);
  });
  it("accepts a later first blocker or a smaller deficit without inventing XP", () => {
    for (const [before, after] of [
      [fixture(300, 100), fixture(500, 100)],
      [fixture(500, 100), fixture(600, 100)],
    ] as const)
      expect(
        regressedFundingScenarios(
          before,
          campaignFundingStates(before),
          campaignFundingStates(after),
        ),
      ).toEqual([]);
  });
  it("allows a travel optimization to retain less XP at the same blocker while preserving reached requirements", () => {
    const baseline = fixture(500, 100);
    const previous = campaignFundingStates(baseline);
    const options = { allowLargerDeficitAtSameAction: true };
    expect(
      regressedFundingScenarios(
        baseline,
        previous,
        campaignFundingStates(fixture(500, 50)),
        options,
      ),
    ).toEqual([]);
    expect(
      regressedFundingScenarios(
        baseline,
        previous,
        campaignFundingStates(fixture(300, 500)),
        options,
      ),
    ).toEqual(["at-level/separate/dungeons/true"]);
    const funded = fixture(500, 1000);
    expect(
      regressedFundingScenarios(funded, campaignFundingStates(funded), previous, options),
    ).toEqual(["at-level/separate/dungeons/true"]);
  });
  it("does not trade away one configuration to improve another", () => {
    const baseline = fixture(500, 100);
    const original = campaignFundingStates(baseline)[0]!;
    const improved = campaignFundingStates(fixture(600, 100))[0]!;
    const worse = campaignFundingStates(fixture(300, 100))[0]!;
    expect(
      regressedFundingScenarios(
        baseline,
        [original, { ...original, difficultyPolicy: "experienced-premade" }],
        [improved, { ...worse, difficultyPolicy: "experienced-premade" }],
      ),
    ).toEqual(["experienced-premade/separate/dungeons/true"]);
  });
});
