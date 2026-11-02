import { describe, expect, it } from "vitest";
import { combatActivityPhase } from "./campaign-combat-phase.js";
import type { CampaignQuestChange } from "./campaign.js";
import type { CombatActivity } from "./combat-model.js";

const changes: readonly CampaignQuestChange[] = [100, 200].map((questId) => ({
  questId,
  state: "objectives-complete",
  objectiveIndex: 1,
  title: `Quest ${questId}`,
}));
const activity: CombatActivity = {
  id: "combat",
  actionId: "step",
  environment: "outdoor",
  profile: null,
  objectives: [100, 200].map((questId) => ({
    questId,
    objectiveIndex: 1,
    npcIds: [1],
    requiredKills: null,
    credit: "personal-loot",
    source: "fixture",
    reason: null,
  })),
};
describe("consecutive combat phases", () => {
  it("uses one stable identity for consecutive same-creature completions", () => {
    const a = combatActivityPhase(activity, changes, changes[0]!);
    const b = combatActivityPhase(activity, changes, changes[1]!);
    expect(a.id).toBe(b.id);
    expect(a.objectives).toEqual(activity.objectives);
  });
  it("does not move combat over a hand-in or another pickup", () => {
    for (const state of ["accepted", "rewarded"] as const) {
      const split = [changes[0]!, { ...changes[0]!, state }, changes[1]!];
      expect(combatActivityPhase(activity, split, split[0]!).objectives).toHaveLength(1);
      expect(combatActivityPhase(activity, split, split[2]!).objectives).toHaveLength(1);
    }
  });
  it("keeps different-creature objectives in their original phases", () => {
    const mixed = {
      ...activity,
      objectives: [activity.objectives[0]!, { ...activity.objectives[1]!, npcIds: [2] }],
    };
    expect(combatActivityPhase(mixed, changes, changes[0]!).objectives).toHaveLength(1);
  });
});
