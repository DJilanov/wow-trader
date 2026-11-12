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
  it.each([300, 500])("rejects moving a later blocked pickup ahead of an existing requirement (%i XP)", (firstXp) => {
    const initial = fixture(firstXp, 100);
    const baseline: CampaignPlan = { ...initial, rewardFacts: initial.rewardFacts!.map((fact) =>
      fact.questId === 400002 ? { ...fact, minimumLevel: firstXp === 300 ? 2 : 3 } : fact) };
    const actions = [baseline.actions[0]!, baseline.actions[2]!, baseline.actions[1]!, baseline.actions[3]!];
    const proposed: CampaignPlan = { ...baseline, actions, legs: baseline.legs.map((leg) => ({
      ...leg, actionIds: actions.map((action) => action.id),
    })) };
    const before = campaignFundingStates(baseline), after = campaignFundingStates(proposed);
    expect(before[0]!.forecast[0]!.members[0]!.checkpoints
      .find((checkpoint) => checkpoint.actionId === "first-pickup")!.ready).toBe(firstXp === 500);
    expect(before[0]!.forecast[0]!.members[0]!.blockedAtActionId).toBe("second-reward");
    expect(after[0]!.forecast[0]!.members[0]!.blockedAtActionId).toBe("second-reward");
    for (const allowLargerDeficitAtSameAction of [false, true])
      expect(regressedFundingScenarios(baseline, before, after, { allowLargerDeficitAtSameAction }))
        .toEqual(["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`));
  });

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
    ).toEqual(
      ["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`),
    );
  });
  it("rejects an earlier unsupported source action even inside the same public chapter", () => {
    const baseline = fixture(500, 100);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(fixture(300, 500)),
      ),
    ).toEqual(
      ["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`),
    );
  });
  it("rejects a larger deficit at the same source action", () => {
    const baseline = fixture(300, 100);
    expect(
      regressedFundingScenarios(
        baseline,
        campaignFundingStates(baseline),
        campaignFundingStates(fixture(200, 100)),
      ),
    ).toEqual(
      ["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`),
    );
  });

  it.each(["blocked", "unknown"] as const)(
    "rejects an unresolved new task at the existing XP checkpoint (%s)",
    (status) => {
      const initial = fixture(500, 100);
      const original = campaignFundingStates(initial)[0]!;
      const action: CampaignAction = {
        ...initial.actions.at(-1)!, id: "unresolved-new-objective", kind: "quests",
        fundingCheckpointId: "departure", questChanges: [{
          questId: 400003, title: "New collection", state: "objectives-complete", objectiveIndex: 1,
        }],
      };
      const proposed = {
        ...original,
        actions: [...original.actions.slice(0, -1), action, original.actions.at(-1)!],
        forecast: original.forecast.map((section) => ({
          ...section,
          members: section.members.map((member) => ({
            ...member,
            checkpoints: member.checkpoints.filter((checkpoint) => checkpoint.actionId !== "departure"),
            blockedAtActionId: action.id,
            blockedReason: "New collection XP is unresolved.",
            steps: [...member.steps.filter((step) => step.actionId !== "departure"), {
              actionId: action.id, questId: 400003, title: "New collection",
              phase: "objectives-complete" as const, objectiveIndex: 1,
              before: member.knownEndpoint!, after: null, minimumLevel: null,
              questXp: 0, combatXp: 0, shortfallXp: 0, status,
            }],
          })),
        })),
      };
      for (const allowLargerDeficitAtSameAction of [false, true])
        expect(regressedFundingScenarios(initial, [original], [proposed], {
          allowLargerDeficitAtSameAction,
        })).toEqual(["at-level/separate/dungeons/true/expected"]);
    },
  );
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
    ).toEqual(
      ["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`),
    );
    const funded = fixture(500, 1000);
    expect(
      regressedFundingScenarios(funded, campaignFundingStates(funded), previous, options),
    ).toEqual(
      ["expected", "fast", "slow"].map((loot) => `at-level/separate/dungeons/true/${loot}`),
    );
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
    ).toEqual(["experienced-premade/separate/dungeons/true/expected"]);
  });
});
