import { describe, expect, it } from "vitest";
import { activeCampaignActions, type CampaignAction, type CampaignPlan } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";
import { conditionalFundingAlternative } from "./campaign-funding-alternatives.js";
import { emptyPremadeProgress } from "./premade-model.js";

function fixture(): { plan: CampaignPlan; batch: CampaignFundingBatch } {
  const actions: CampaignAction[] = (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
    id: `earlier-${state}`, legId: "optional", title: state, instructions: [], positions: [], source: null,
    kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    questChanges: [{ questId: 303, title: "The Dark Iron War", state, objectiveIndex: state === "objectives-complete" ? 1 : null }],
  }));
  return {
    plan: { release: "conditional-funding-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
      sharedQuestsOnly: true, actions,
      legs: ["optional", "later"].map((id) => ({ id, title: id, from: 26, to: 35, kind: "preparation",
        stopId: null, actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
        questIds: [303], unresolvedQuestIds: [], ...(id === "optional" ? { optionalQuestId: 378 } : {}) })) },
    batch: { questIds: [303], requiredKills: 30, travelCost: 0, returnTravelCost: 0,
      actions: actions.map((action) => ({ ...action, id: action.id.replace("earlier", "fallback"), legId: "later" })) },
  };
}

describe("funding after a skipped optional visit", () => {
  it("preserves the earlier program and selects exactly one complete program for either visit choice", () => {
    const { plan, batch } = fixture(), before = structuredClone({ plan, batch });
    const result = conditionalFundingAlternative(plan, batch, 3, new Set())!;
    expect([...result.retainedQuestIds]).toEqual([303]);
    expect(result.batch.actions.every((action) => action.excludedByOptionalQuestId === 378)).toBe(true);
    const combined = { ...plan, actions: [...plan.actions, ...result.batch.actions] };
    for (const included of [false, true]) {
      const progress = { ...emptyPremadeProgress(), selectedExtras: { "378": included } };
      const selected = activeCampaignActions(combined, progress);
      expect(selected.map((action) => action.id)).toEqual((included ? plan.actions : batch.actions).map((action) => action.id));
      expect(selected.flatMap((action) => action.questChanges).map((change) => change.state))
        .toEqual(["accepted", "objectives-complete", "rewarded"]);
    }
    expect({ plan, batch }).toEqual(before);
  });

  it.each(["active", "partial", "mixed selection", "mixed batch", "conflicting fallback"])(
    "rejects a fallback whose earlier program is %s", (kind) => {
      const input = fixture();
      let plan = input.plan, batch = input.batch;
      const active = new Set<string>();
      if (kind === "active") active.add(plan.actions[0]!.id);
      if (kind === "partial") plan = { ...plan, actions: plan.actions.filter((action) => action.questChanges[0]!.state !== "objectives-complete") };
      if (kind === "mixed selection") plan = { ...plan, actions: plan.actions.map((action, index) => index === 1 ? { ...action, legId: "later" } : action) };
      if (kind === "mixed batch") batch = { ...batch, questIds: [303, 304] };
      if (kind === "conflicting fallback") batch = { ...batch, actions: batch.actions.map((action) => ({ ...action, excludedByOptionalQuestId: 959 })) };
      expect(conditionalFundingAlternative(plan, batch, 3, active)).toBeNull();
    },
  );

  it("leaves a new quest or a future program to the normal funding rules", () => {
    const { plan, batch } = fixture();
    for (const input of [{ ...plan, actions: [] }, plan]) {
      const result = conditionalFundingAlternative(input, batch, 0, new Set())!;
      expect(result.batch).toBe(batch);
      expect(result.retainedQuestIds.size).toBe(0);
    }
  });
});
