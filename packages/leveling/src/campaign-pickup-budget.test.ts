import { describe, expect, it } from "vitest";
import { createCampaignPickupBudget, campaignPickupLevelMet } from "./campaign-pickup-budget.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import {
  campaignActionReasons,
  campaignOptionalXpReady,
  currentCampaignAction,
  updateCampaignAction,
  type CampaignAction,
  type CampaignPlan,
} from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";

const earlierRewards: readonly [number, number][] = [
  [783, 40],
  [5261, 90],
  [91741, 90],
  [92124, 20],
  [33, 170],
  [7, 170],
  [15, 250],
  [91743, 170],
  [3100, 40],
];

function fact(questId: number, fullXp: number, minimumLevel = 1): QuestRewardFact {
  return {
    questId,
    fullXp,
    minimumLevel,
    questLevel: 4,
    xpByLevel: [],
    status: "available",
    evidenceKind: "published-forever",
    sourceUrl: `https://www.wowhead.com/forever/quest=${questId}`,
    capturedAt: "2026-10-20T00:00:00.000Z",
  };
}

function action(questId: number, reward = true): CampaignAction {
  return {
    id: `quest-${questId}`,
    legId: "northshire",
    title: `Quest ${questId}`,
    kind: "quests",
    leaderOnly: true,
    questChanges: (reward ? ["accepted", "objectives-complete", "rewarded"] : ["accepted"]).map(
      (state) => ({
        questId,
        state: state as "accepted" | "objectives-complete" | "rewarded",
        title: `Quest ${questId}`,
        objectiveIndex: null,
      }),
    ),
    source: null,
    instructions: [],
    positions: [],
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    xpOptional: false,
  };
}

function route(
  rewards: readonly [number, number][] = earlierRewards,
  transform: (action: CampaignAction) => CampaignAction = (entry) => entry,
): CampaignPlan {
  const actions = [...rewards.map(([id]) => transform(action(id))), action(18, false)];
  return {
    release: "funded-pickup-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "northshire",
        title: "Northshire",
        from: 1,
        to: 6,
        kind: "starter",
        stopId: null,
        actionIds: actions.map((entry) => entry.id),
        questIds: [...rewards.map(([id]) => id), 18],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [...rewards.map(([id, xp]) => fact(id, xp)), fact(18, 360, 2)],
  };
}

function reported(plan: CampaignPlan): PremadeProgress {
  const state = emptyPremadeProgress();
  state.members[0] = {
    ...state.members[0]!,
    level: 1,
    currentXp: 0,
    xpNeedsUpdate: true,
    questStates: Object.fromEntries(earlierRewards.map(([id]) => [String(id), "rewarded"])),
  };
  state.campaigns[plan.release] = { selectedActionId: "northshire-level-2-18", completion: {} };
  return state;
}

describe("conservative quest-funded level proofs", () => {
  it("proves level 2 from 1,040 earlier quest XP without combat or an invented saved bar", () => {
    const plan = route();
    const budget = createCampaignPickupBudget(plan.rewardFacts!);
    expect(budget.isFunded(2)).toBe(false);
    for (const [id] of earlierRewards) budget.reward(id);
    expect(earlierRewards.reduce((total, [, xp]) => total + xp, 0)).toBe(1040);
    expect(budget.isFunded(2)).toBe(true);
    expect(budget.isFunded(3)).toBe(false);
    budget.requireLevel(2);
    budget.reward(18);
    expect(budget.isFunded(3)).toBe(true);
  });

  it("does not spend an overleveled reward at its undiscounted value", () => {
    const budget = createCampaignPickupBudget([
      {
        ...fact(300001, 2000),
        xpByLevel: [
          { level: 1, xp: 2000 },
          { level: 2, xp: 50 },
        ],
      },
    ]);
    budget.reward(300001);
    expect(budget.isFunded(2)).toBe(true);
    budget.requireLevel(2);
    expect(budget.isFunded(3)).toBe(false);
  });

  it("deduplicates rewards, even if a hand-in appears twice in the route", () => {
    const budget = createCampaignPickupBudget([fact(300001, 250)]);
    budget.reward(300001);
    budget.reward(300001);
    expect(budget.isFunded(2)).toBe(false);
  });

  it.each([
    { status: "unknown" as const },
    { status: "conflict" as const },
    { evidenceKind: "historical-reference" as const },
    { fullXp: null, xpByLevel: [] },
    { minimumLevel: null },
  ])("does not turn unsupported reward data into funding: %j", (override) => {
    const budget = createCampaignPickupBudget([{ ...fact(300001, 10000), ...override }]);
    budget.reward(300001);
    expect(budget.isFunded(2)).toBe(false);
  });

  it("can prove a level from other known rewards without treating a missing reward as paid XP", () => {
    const budget = createCampaignPickupBudget([fact(300001, 400)]);
    budget.reward(999999);
    expect(budget.isFunded(2)).toBe(false);
    budget.reward(300001);
    expect(budget.isFunded(2)).toBe(true);
  });

  it("uses the minimum of a reported higher-level quest without requiring an exact XP percentage", () => {
    const budget = createCampaignPickupBudget([fact(300001, 0, 5)]);
    budget.reward(300001);
    expect(budget.isFunded(5)).toBe(true);
    expect(budget.isFunded(6)).toBe(false);
  });

  it("does not assume a lower-level reward happened after a higher-level eligibility floor", () => {
    const state = emptyPremadeProgress();
    state.members[0] = {
      ...state.members[0]!,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: true,
      questStates: { "300001": "rewarded", "300002": "rewarded" },
    };
    const facts = [fact(300001, 0, 5), fact(300002, 5000)];
    expect(campaignPickupLevelMet(state.members[0]!, 5, facts)).toBe(true);
    expect(campaignPickupLevelMet(state.members[0]!, 6, facts)).toBe(false);
    expect(campaignPickupLevelMet(state.members[0]!, 6, [...facts].reverse())).toBe(false);
    expect(campaignPickupLevelMet(state.members[0]!, 6, [...facts, fact(300001, 0)])).toBe(false);
  });

  it("rejects invalid level queries", () => {
    const budget = createCampaignPickupBudget([]);
    for (const level of [0, 61, 1.5, Number.NaN]) {
      expect(() => budget.isFunded(level)).toThrow("Invalid pickup budget level");
      expect(() => budget.requireLevel(level)).toThrow("Invalid pickup budget level");
    }
  });
});

describe("only unfunded pickups get a separate XP check", () => {
  it("omits the redundant level-2 message and migrates its bookmark to the real quest", () => {
    const plan = compileCampaignPickupGates(route());
    expect(plan.actions.some((entry) => entry.pickupQuestId === 18)).toBe(false);
    expect(plan.bookmarkAliases?.["northshire-level-2-18"]).toBe("quest-18");
    const progress = reported(plan);
    const before = JSON.stringify(progress.members);
    expect(currentCampaignAction(plan, progress).id).toBe("quest-18");
    expect(campaignActionReasons(plan.actions.at(-1)!, progress, plan.rewardFacts)).toEqual([]);
    const updated = updateCampaignAction(plan, progress, "quest-18", true);
    expect(updated.members[0]).toMatchObject({ level: 1, currentXp: 0, xpNeedsUpdate: true });
    expect(updated.members[0]?.questStates["18"]).toBe("accepted");
    expect(JSON.stringify(progress.members)).toBe(before);
  });

  it("forecasts the actual early rewards without adding an artificial level-2 grind", () => {
    const plan = compileCampaignPickupGates(route());
    const state = emptyPremadeProgress();
    state.members = state.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const row = forecastCampaignXp(plan, state)[0]!.members[0]!;
    expect(row.referenceQuestXp).toBe(1040);
    expect(row.estimatedCombatXp).toBe(0);
    expect(row.knownEndpoint).toEqual({ level: 2, currentXp: 640 });
  });

  it("retains a genuinely unfunded gate and never uses that quest's future reward to fund pickup", () => {
    const plan = compileCampaignPickupGates(route([[300001, 100]]));
    const gate = plan.actions.find((entry) => entry.pickupQuestId === 18)!;
    expect(gate).toBeDefined();
    expect(gate.leaderOnly).toBe(true);
    expect(gate.instructions.join(" ")).not.toContain("Every participating player must reach");
    const state = reported(plan);
    state.members[0]!.questStates = { "300001": "rewarded" };
    expect(campaignActionReasons(gate, state, plan.rewardFacts)).not.toEqual([]);
  });

  it.each([{ xpOptional: true }, { raidOnly: true }])(
    "never assumes optional earlier work was completed: %j",
    (flags) => {
      const plan = compileCampaignPickupGates(
        route([[300001, 2000]], (entry) => ({ ...entry, ...flags })),
      );
      expect(plan.actions.some((entry) => entry.pickupQuestId === 18)).toBe(true);
    },
  );

  it("never transfers the leader's starter XP to the other four players", () => {
    const base = route();
    const plan = compileCampaignPickupGates({
      ...base,
      actions: base.actions.map((entry) =>
        entry.id === "quest-18" ? { ...entry, leaderOnly: false } : entry,
      ),
    });
    expect(plan.actions.some((entry) => entry.pickupQuestId === 18)).toBe(true);
    expect(
      campaignActionReasons(plan.actions.at(-1)!, reported(plan), plan.rewardFacts)[0],
    ).toContain("Player 2");
  });

  it("does not substitute planned but unreported hand-ins for actual eligibility", () => {
    const plan = compileCampaignPickupGates(route());
    const state = reported(plan);
    state.members[0]!.questStates = {};
    expect(campaignActionReasons(plan.actions.at(-1)!, state, plan.rewardFacts)[0]).toContain(
      "Player 1 needs level 2",
    );
  });

  it("does not nag about a known level merely because the current XP percentage is stale", () => {
    const plan = compileCampaignPickupGates(route([[300001, 100]]));
    const gate = plan.actions.find((entry) => entry.pickupQuestId === 18)!;
    const state = reported(plan);
    state.members[0] = { ...state.members[0]!, level: 2, questStates: {} };
    expect(campaignOptionalXpReady(plan, state, gate)).toBe(true);
    expect(campaignActionReasons(gate, state, plan.rewardFacts)).toEqual([]);
    expect(campaignActionReasons(plan.actions.at(-1)!, state, plan.rewardFacts)).toEqual([]);
  });

  it("counts a preceding same-step hand-in, but never a later hand-in after the pickup", () => {
    const base = route([[300001, 400]]);
    const reward = base.actions[0]!;
    const pickup = base.actions[1]!;
    const handIn = reward.questChanges.filter((change) => change.state === "rewarded");
    const combined = { ...pickup, questChanges: [...handIn, ...pickup.questChanges] };
    const funded = compileCampaignPickupGates({ ...base, actions: [combined] });
    expect(funded.actions.some((entry) => entry.pickupQuestId === 18)).toBe(false);
    const state = emptyPremadeProgress();
    state.members[0] = {
      ...state.members[0]!,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: true,
      questStates: { "300001": "objectives-complete" },
    };
    expect(campaignActionReasons(combined, state, base.rewardFacts)).toEqual([]);
    const later = compileCampaignPickupGates({
      ...base,
      actions: [{ ...pickup, questChanges: [...pickup.questChanges, ...reward.questChanges] }],
    });
    expect(later.actions.some((entry) => entry.pickupQuestId === 18)).toBe(true);
  });

  it("does not force an XP form at a targetless handoff but keeps real XP checks enforced", () => {
    const plan = compileCampaignPickupGates(route());
    const state = reported(plan);
    expect(campaignPickupLevelMet(state.members[0]!, 2, plan.rewardFacts!)).toBe(true);
    const observation = {
      ...action(300001),
      kind: "xp-check" as const,
      questChanges: [],
      targetLevel: null,
    };
    expect(campaignActionReasons(observation, state, plan.rewardFacts)).toEqual([]);
    expect(
      campaignActionReasons({ ...observation, targetLevel: 5 }, state, plan.rewardFacts)[0],
    ).toContain("Confirm you are level 5");
  });
});
