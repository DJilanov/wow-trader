import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { relocateFundingBatch } from "./campaign-funding-relocation.js";

function fixture(): { plan: CampaignPlan; batch: CampaignFundingBatch; catalog: QuestCatalog } {
  const handoff: CampaignAction = {
    id: "shared-handoff", legId: "first", title: "Hand in the parent and accept its follow-up",
    instructions: ["Turn in Parent", "Accept Follow-up"],
    questChanges: [
      { questId: 192, state: "rewarded", title: "Parent", objectiveIndex: null },
      { questId: 193, state: "accepted", title: "Follow-up", objectiveIndex: null },
    ],
    source: { chapterId: "chapter-test", version: "v1", stepId: "shared-handoff" },
    positions: [], kind: "quests", leaderOnly: false, targetLevel: null, targetStopId: null,
    raidOnly: false, requiredQuestIds: [],
  };
  const gate: CampaignAction = { ...handoff, id: "gate", legId: "later", kind: "xp-check",
    questChanges: [], targetLevel: 39 };
  return {
    plan: {
      release: "relocation-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
      actions: [handoff, gate],
      legs: ["first", "later"].map((id) => ({ id, title: id, from: 30, to: 39,
        kind: "preparation", stopId: null, actionIds: [id === "first" ? handoff.id : gate.id],
        questIds: id === "first" ? [192, 193] : [], unresolvedQuestIds: [] })),
    },
    batch: { questIds: [192], actions: [{ ...handoff, id: "moved-parent", legId: "later",
      questChanges: [handoff.questChanges[0]!] }], travelCost: 0, returnTravelCost: 0, requiredKills: 0 },
    catalog: {
      schema: "forever-quest-funding-catalog.v1", targetBuild: 70205, publication: "private-reference",
      authorizationNote: "Synthetic source-exchange regression", providerRevision: "a".repeat(40),
      questSha256: "b".repeat(64), npcSha256: "c".repeat(64), areaMapSha256: "d".repeat(64),
      sourceArchiveSha256: "e".repeat(64), includesAuthoredCorrections: false,
      quests: [{ questId: 193, title: "Follow-up", minimumLevel: 28, questLevel: 40,
        requiredRaces: 0, requiredClasses: 0, starts: [], ends: [],
        prerequisites: { allOf: [], anyOf: [192] }, exclusiveWith: [], category: "delivery",
        objectives: [], unsupportedRequirements: [] }],
    },
  };
}

describe("funding relocation at a shared NPC exchange", () => {
  it.each(["allOf", "anyOf"] as const)("retains a removed %s hand-in before the unchanged child pickup", (kind) => {
    const input = fixture();
    input.catalog.quests[0]!.prerequisites = { allOf: [], anyOf: [], [kind]: [192] };
    const before = structuredClone(input);
    const moved = relocateFundingBatch(input.plan, input.batch, input.plan.actions[1]!, input.catalog);
    const child = moved.actions.find((action) => action.id === "shared-handoff")!;
    expect(child.requiredQuestIds).toEqual([192]);
    expect(child.questChanges.map((change) => change.questId)).toEqual([193]);
    expect(moved.actions.flatMap((action) => action.questChanges)
      .filter((change) => change.questId === 192 && change.state === "rewarded")).toHaveLength(1);
    expect(input).toEqual(before);
  });

  it("keeps an unrelated removed hand-in from becoming a new prerequisite", () => {
    const input = fixture();
    input.catalog.quests[0]!.prerequisites = { allOf: [], anyOf: [190] };
    const moved = relocateFundingBatch(input.plan, input.batch, input.plan.actions[1]!, input.catalog);
    expect(moved.actions.find((action) => action.id === "shared-handoff")!.requiredQuestIds).toEqual([]);
  });

  it("preserves pre-existing requirements once without making a later hand-in gate an earlier pickup", () => {
    const input = fixture();
    input.plan = { ...input.plan, actions: input.plan.actions.map((action) => action.id === "shared-handoff"
      ? { ...action, requiredQuestIds: [190, 192], questChanges: [...action.questChanges].reverse() } : action) };
    const moved = relocateFundingBatch(input.plan, input.batch, input.plan.actions[1]!, input.catalog);
    expect(moved.actions.find((action) => action.id === "shared-handoff")!.requiredQuestIds).toEqual([190, 192]);
  });

  it("does not infer a source-order dependency from a later hand-in", () => {
    const input = fixture();
    input.plan = { ...input.plan, actions: input.plan.actions.map((action) => action.id === "shared-handoff"
      ? { ...action, questChanges: [...action.questChanges].reverse() } : action) };
    const moved = relocateFundingBatch(input.plan, input.batch, input.plan.actions[1]!, input.catalog);
    expect(moved.actions.find((action) => action.id === "shared-handoff")!.requiredQuestIds).toEqual([]);
  });
});
