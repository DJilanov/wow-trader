import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { batchCampaignSourceObjectives } from "./campaign-source-objectives.js";

function fixture(): CampaignPlan {
  const actions: CampaignAction[] = [1, 2].map((objectiveIndex) => ({
    id: `collect-${objectiveIndex}`, legId: "camp", title: `Collect item ${objectiveIndex}`,
    instructions: [`Collect item ${objectiveIndex}`],
    source: { chapterId: "chapter-17-35-36-desolace", version: "test", stepId: "source-step-0015" },
    positions: [], kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    libraryQuestId: 1458, libraryObjective: "collection",
    questChanges: [{ questId: 1458, title: "Reagents", state: "objectives-complete", objectiveIndex }],
  }));
  return { release: "source-collection-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sharedQuestsOnly: true, actions, legs: [{ id: "camp", title: "Camp", kind: "preparation",
      from: 35, to: 36, stopId: null, actionIds: actions.map((action) => action.id), questIds: [1458], unresolvedQuestIds: [] }],
  };
}

describe("same-source collection counters", () => {
  it("keeps both counters and instructions in one activity and preserves the old bookmark", () => {
    const plan = fixture(), before = structuredClone(plan);
    const result = batchCampaignSourceObjectives(plan, 0);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.questChanges.map((change) => change.objectiveIndex)).toEqual([1, 2]);
    expect(result.actions[0]!.instructions).toEqual(["Collect item 1", "Collect item 2"]);
    expect(result.bookmarkAliases).toEqual({ "collect-2": "collect-1" });
    expect(result.legs[0]!.actionIds).toEqual(["collect-1"]);
    expect(plan).toEqual(before);
  });
  it.each(["locked", "different-source", "different-guard", "duplicate-counter"])("does not combine %s", (reason) => {
    let plan = fixture();
    const second = plan.actions[1]!;
    if (reason === "different-source") plan = { ...plan, actions: [plan.actions[0]!, { ...second, source: { ...second.source!, stepId: "source-step-0016" } }] };
    if (reason === "different-guard") plan = { ...plan, actions: [plan.actions[0]!, { ...second, requiredQuestIds: [20] }] };
    if (reason === "duplicate-counter") plan = { ...plan, actions: [plan.actions[0]!, { ...second, questChanges: plan.actions[0]!.questChanges }] };
    expect(batchCampaignSourceObjectives(plan, reason === "locked" ? 1 : 0)).toBe(plan);
  });
});
