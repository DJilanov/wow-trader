import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { attachDungeonPreparationCheckpoints } from "./campaign-dungeon-preparation.js";

function fixture(): CampaignPlan {
  const base: CampaignAction = { id: "outside", legId: "world", kind: "instructions", title: "Outside",
    instructions: [], questChanges: [], source: null, positions: [], leaderOnly: false, raidOnly: false,
    targetLevel: null, targetStopId: null };
  const gate: CampaignAction = { ...base, id: "entry", legId: "dungeon-rfd", kind: "checkpoint", targetStopId: "razorfen-downs" };
  const actions = [base, { ...base, id: "brief", legId: gate.legId }, gate];
  return { release: "outside-preparation-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sharedQuestsOnly: true, actions, legs: [
      { id: "world", title: "World", from: 37, to: 38, kind: "preparation", stopId: null, actionIds: [base.id], questIds: [], unresolvedQuestIds: [] },
      { id: gate.legId, title: "Razorfen Downs", from: 39, to: 42, kind: "dungeon", stopId: "razorfen-downs",
        actionIds: ["brief", gate.id], questIds: [], unresolvedQuestIds: [] },
    ],
  };
}
describe("outdoor dungeon preparation", () => {
  it("exposes entry readiness in an outdoor leg without moving or weakening the dungeon gate", () => {
    const plan = fixture(), before = structuredClone(plan);
    const result = attachDungeonPreparationCheckpoints(plan, 1);
    expect(result.actions[0]).toEqual(plan.actions[0]);
    expect(result.actions.slice(-2)).toEqual(plan.actions.slice(-2));
    const preparation = result.legs[1]!;
    expect(preparation).toMatchObject({ kind: "preparation", stopId: null, from: 39, to: 39 });
    expect(result.actions[1]).toMatchObject({ legId: preparation.id, kind: "checkpoint", targetStopId: "razorfen-downs" });
    expect(result.actions[1]!.location?.insideDungeon).toBeUndefined();
    expect(attachDungeonPreparationCheckpoints(result, 1)).toBe(result);
    expect(plan).toEqual(before);
  });
  it.each([2, 3])("does not insert a preparation checkpoint before protected action %s", (minimumIndex) => {
    const plan = fixture();
    expect(attachDungeonPreparationCheckpoints(plan, minimumIndex)).toBe(plan);
  });
});
