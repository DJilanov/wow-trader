import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { compileCampaignFinish } from "./campaign-finish.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignAcquisitionXpBaseline } from "./campaign-acquisition-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixtureData from "./fixtures/finish-collection-methods-70205.json" with { type: "json" };

function fixture(): { plan: CampaignPlan; data: ReturnType<typeof combatDatasetSchema.parse> } {
  const data = combatDatasetSchema.parse(fixtureData.combat), catalog = questCatalogSchema.parse(fixtureData.catalog);
  const intro: CampaignAction = {
    id: "level-60-finish-dungeon-circuit", legId: "level-60-finish", title: "Eight-dungeon finish",
    instructions: [], questChanges: [], positions: [], source: null, kind: "instructions",
    leaderOnly: false, raidOnly: false, dungeonFinishOnly: true, targetLevel: null, targetStopId: null,
  };
  const final: CampaignAction = { ...intro, id: "level-60-finish-checkpoint", kind: "checkpoint", targetLevel: 60, dungeonFinishOnly: false };
  const plan: CampaignPlan = {
    release: "real-finish-method-reference", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sourceArchiveSha256: fixtureData.sourceArchiveSha256, dungeonFinish: true, sharedQuestsOnly: true,
    dungeonCollectionPolicy: "selected-clear", acquisitionXpPolicy: "exclude-unpriced-extra", actions: [intro, final],
    legs: [{ id: "level-60-finish", title: "Eight-dungeon finish", kind: "finish", from: 55, to: 60,
      stopId: null, questIds: [], unresolvedQuestIds: [], actionIds: [intro.id, final.id] }],
  };
  const compiled = compileCampaignFinish(plan, catalog);
  return { plan: attachCampaignCombat(expandCampaignDungeonObjectives(compiled, data), [], data, "finish-reference"), data };
}

describe("full normal finish-collection requirements", () => {
  it("retains all twenty-one selected quest lifecycles across all eight wings", () => {
    const { plan } = fixture();
    expect(plan.finishCircuitReview?.wingIds).toHaveLength(8);
    expect(plan.finishCircuitReview?.plannedQuestIds).toHaveLength(21);
    for (const questId of plan.finishCircuitReview!.plannedQuestIds) {
      const phases = plan.actions.flatMap((action) => action.questChanges.filter((change) => change.questId === questId));
      expect(phases.filter((change) => change.state === "accepted")).toHaveLength(1);
      expect(phases.filter((change) => change.state === "rewarded")).toHaveLength(1);
    }
  });

  it.each([[7441, 18261], [7488, 18426], [5515, 13725]])(
    "preserves the full item for quest %i while excluding unmeasured additional acquisition XP", (questId, itemId) => {
      const { plan } = fixture(), baseline = campaignAcquisitionXpBaseline(plan);
      expect(plan.itemRequirements).toContainEqual(expect.objectContaining({ questId, itemId, quantity: 1 }));
      expect([...baseline.exclusions.values()].flat()).toContainEqual(expect.objectContaining({
        questId, itemId, quantityPerPlayer: 1, planningBasis: "selected-dungeon-clear",
      }));
      expect(baseline.plan.actions).toEqual(plan.actions);
      expect(baseline.plan.itemRequirements).toEqual(plan.itemRequirements);
    },
  );

  it.each([[5001, 1], [4862, 15], [5243, 5]])("keeps quest %i as a full %i-item container task", (questId, quantity) => {
    const { plan } = fixture();
    expect(plan.itemRequirements?.filter((item) => item.questId === questId).map((item) => item.quantity)).toEqual([quantity]);
    expect(plan.combat?.activities.some((activity) => activity.objectives.some((objective) => objective.questId === questId))).toBe(false);
    const work = plan.actions.find((action) => action.questChanges.some((change) => change.questId === questId && change.state === "objectives-complete"))!;
    expect(work.instructions.join(" ")).toContain(`Collect ${quantity}`);
  });

  it("keeps all four Barov deed counters and gives each its own source-object instruction", () => {
    const { plan } = fixture();
    expect(plan.itemRequirements?.filter((item) => item.questId === 5343).map((item) => [item.objectiveIndex, item.quantity])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1]]);
    const work = plan.actions.find((action) => action.questChanges.some((change) => change.questId === 5343 && change.state === "objectives-complete"))!;
    expect(work.questChanges.map((change) => change.objectiveIndex)).toEqual([1, 2, 3, 4]);
    expect(work.instructions.filter((text) => text.startsWith("Collect 1 The Deed"))).toHaveLength(4);
    expect(plan.combat?.activities.some((activity) => activity.objectives.some((objective) => objective.questId === 5343))).toBe(false);
  });

  it("does not omit acquisition XP outside the explicitly selected finish context", () => {
    const { plan } = fixture();
    const change = (kind: "selection" | "visit" | "finish" | "audience"): CampaignPlan => ({ ...plan,
      ...(kind === "selection" ? { finishCircuitReview: { ...plan.finishCircuitReview!, plannedQuestIds: plan.finishCircuitReview!.plannedQuestIds.filter((id) => id !== 7441) } } : {}),
      ...(kind === "finish" ? { dungeonFinish: false } : {}),
      actions: plan.actions.map((action) => action.questChanges.some((row) => row.questId === 7441)
        ? { ...action,
            ...(kind === "visit" ? { location: { zone: "1444", insideDungeon: "dire-maul-west" } } : {}),
            ...(kind === "audience" ? { leaderOnly: true } : {}),
          } : action),
    });
    for (const kind of ["selection", "visit", "finish", "audience"] as const) {
      const baseline = campaignAcquisitionXpBaseline(change(kind));
      expect([...baseline.exclusions.values()].flat().some((row) => row.questId === 7441)).toBe(false);
    }
  });

  it("emits all real counters and preserves Bijou's inside-instance pickup and return", () => {
    const { plan } = fixture();
    const bijou = plan.actions.filter((action) => action.questChanges.some((row) => row.questId === 5001));
    expect(bijou.every((action) => action.location?.insideDungeon === "lower-blackrock")).toBe(true);
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.1.0", runtimeBuild: 70450,
      interfaceVersion: 11508, restedXpVersion: "v4.11.27" });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      for (const index of [1, 2, 3, 4]) expect(text.match(new RegExp(`\\.complete 5343,${index}\\b`, "g"))).toHaveLength(1);
      for (const id of [7441, 7488, 5515, 5001, 4862, 5243])
        expect(text.match(new RegExp(`\\.complete ${id},1\\b`, "g"))).toHaveLength(1);
    }
  });
});
