import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { batchCampaignVisits } from "./campaign-visit-flow.js";

function task(
  id: string,
  zone: string,
  questId: number,
  state: CampaignAction["questChanges"][number]["state"],
): CampaignAction {
  return {
    id,
    legId: "prepare",
    kind: "quests",
    title: id,
    instructions: [],
    positions: [],
    source: null,
    questChanges: [
      {
        questId,
        state,
        title: "Quest",
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    location: { zone },
  };
}

describe("outdoor visits", () => {
  it("collects city work before departing, preserves dependencies, and puts optional grinding after the quests", () => {
    const start = { ...task("start", "1453", 400000, "rewarded"), legId: "start" };
    const actions = [
      start,
      task("westfall-pickup", "1436", 400001, "accepted"),
      task("westfall-kills", "1436", 400001, "objectives-complete"),
      task("westfall-return", "1436", 400001, "rewarded"),
      task("city-pickup", "1453", 400002, "accepted"),
      {
        ...task("old-grind", "1436", 400003, "accepted"),
        kind: "xp-check" as const,
        questChanges: [],
      },
      { ...task("follow-up", "1453", 400004, "accepted"), requiredQuestIds: [400001] },
    ];
    const plan: CampaignPlan = {
      release: "visits",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: ["start", "prepare"].map((id) => ({
        id,
        title: id,
        from: 20,
        to: 25,
        kind: id === "start" ? "starter" : "preparation",
        stopId: null,
        actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
        questIds: [],
        unresolvedQuestIds: [],
      })),
    };
    const saved = structuredClone(plan);
    const result = batchCampaignVisits(plan, []);
    expect(result.actions.map((entry) => entry.id)).toEqual([
      "start",
      "city-pickup",
      "westfall-pickup",
      "westfall-kills",
      "westfall-return",
      "follow-up",
      "old-grind",
    ]);
    expect(plan).toEqual(saved);
    expect(result.legs[1]!.actionIds).toEqual(result.actions.slice(1).map((entry) => entry.id));
  });
});
