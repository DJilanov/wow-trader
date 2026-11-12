import { describe, expect, it } from "vitest";
import { buildCampaignPlan, type CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { batchSharedThanesVisit } from "./campaign-shared-thanes-visit.js";
import type { QuestCatalog } from "./quest-catalog.js";

function catalog(): QuestCatalog {
  const giver = {
    npcId: 264936,
    name: "Earthseer Farsen",
    friendlyToAlliance: true,
    positions: [{ zone: "1426", x: 65, y: 58 }],
  };
  return {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic Thanes visit fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "a".repeat(64),
    includesAuthoredCorrections: false,
    quests: [96392, 96390, 96391].map((questId) => ({
      questId,
      title: `Quest ${questId}`,
      minimumLevel: 9,
      questLevel: 13,
      requiredRaces: 0,
      requiredClasses: 0,
      starts: [giver],
      ends: [giver],
      prerequisites: { allOf: [], anyOf: [] },
      exclusiveWith: [],
      category: "unsupported",
      objectives: [],
      unsupportedRequirements: [],
    })),
  };
}

function sources(): readonly CampaignSource[] {
  const body = [
    "step\n.goto 1426,80,50\n.accept 433",
    "step\n.goto 1426,80,50\n.complete 433,1\n.turnin 433",
    "step\n.goto 1426,65,58\n.accept 96392",
    "step\n>>Talk to Earthseer Farsen\n.complete 96392,1 >>Use Farsen's Farsight\n.skipgossip\n.target Earthseer Farsen",
    "step\n.goto 1426,65,58\n.turnin 96392\n.accept 96390",
    "step\n.goto 1426,80,40\n>>Kill Dark Iron Spies. Loot them for the Dark Iron Map\n.complete 96390,1 >>Dark Iron Spy slain 10/10\n.collect 274268,1,96391,1\n.use 274268\n.accept 96391\n.mob Dark Iron Spy",
    "step\n.goto 1426,65,58\n.turnin 96390\n.turnin 96391",
  ].join("\n");
  return [115, 116, 117].map((id) => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
    return {
      reference,
      guide: parseGuideChapter(
        id === 116 ? body : "step\n+Continue the route",
        reference.id,
        "a".repeat(64),
        70205,
      ),
    };
  });
}

describe("shared Thanes source visit", () => {
  it("finishes the existing unlock phases before Loch Modan without adding or duplicating them", () => {
    const input = sources(),
      data = catalog();
    const plan = buildCampaignPlan("human", "a".repeat(64), input, "warrior", {
      sharedQuestsOnly: true,
    });
    const snapshot = structuredClone(plan);
    const result = batchSharedThanesVisit(plan, input, data);
    expect(result).not.toBe(plan);
    expect(result.legs.some((leg) => leg.id === "ironforge-rendezvous")).toBe(false);
    const loch = result.actions.findIndex((action) => action.legId === "start-117");
    const phases = result.actions.filter((action) =>
      action.questChanges.some((change) => [96392, 96390, 96391].includes(change.questId)),
    );
    expect(
      phases.every(
        (action) => action.legId === "start-116" && result.actions.indexOf(action) < loch,
      ),
    ).toBe(true);
    expect(
      result.actions.flatMap((action) => action.questChanges).sort((a, b) => a.questId - b.questId),
    ).toEqual(
      plan.actions.flatMap((action) => action.questChanges).sort((a, b) => a.questId - b.questId),
    );
    expect(batchSharedThanesVisit(result, input, data)).toBe(result);
    expect(plan).toEqual(snapshot);
    expect(batchSharedThanesVisit(plan, [], data)).toBe(plan);
    expect(batchSharedThanesVisit(plan, input, { ...data, targetBuild: 70450 })).toBe(plan);
    expect(
      batchSharedThanesVisit(plan, input, {
        ...data,
        quests: data.quests.map((quest) => ({ ...quest, minimumLevel: 10 })),
      }),
    ).toBe(plan);
    const noBrief = {
      ...plan,
      actions: plan.actions.filter((action) => action.id !== "ironforge-rendezvous-brief"),
    };
    expect(batchSharedThanesVisit(noBrief, input, data)).toBe(noBrief);
  });
  it("starts the dropped map at the spy camp before returning to hand in the spy kills", () => {
    const plan = buildCampaignPlan("human", "a".repeat(64), sources(), "warrior", {
      sharedQuestsOnly: true,
    });
    const accepted = plan.actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 96391 && change.state === "accepted"),
    );
    const returned = plan.actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 96390 && change.state === "rewarded"),
    );
    expect(accepted).toBeGreaterThanOrEqual(0);
    expect(accepted).toBeLessThan(returned);
    expect(plan.actions[accepted]!.questChanges).toContainEqual(
      expect.objectContaining({ questId: 96390, state: "objectives-complete" }),
    );
  });
});
