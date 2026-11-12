import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { batchSharedStarterPickupVisit } from "./campaign-shared-pickup-visits.js";

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog } {
  const phase = (
    id: string,
    questId: number,
    state: "accepted" | "rewarded" | "objectives-complete",
    stepId: string,
  ): CampaignAction => ({
    id,
    legId: "starter",
    title: id,
    instructions: [id],
    positions: [],
    source: {
      chapterId: "chapter-116-6-11-elwynn-forest",
      version: "import-v2-681cabff0e7cdf4e",
      stepId,
    },
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [{ questId, state, title: `Quest ${questId}`, objectiveIndex: null }],
  });
  const pickup = phase("farm-pickups", 88, "accepted", "source-step-0050");
  const actions = [
    {
      ...pickup,
      questChanges: [
        ...phase("necklace", 85, "accepted", "source-step-0050").questChanges,
        ...pickup.questChanges,
      ],
    },
    phase("mine", 62, "objectives-complete", "source-step-0054"),
    phase("farm-return", 86, "rewarded", "source-step-0065"),
    phase("princess", 88, "objectives-complete", "source-step-0170"),
  ];
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic farm-return fixture with reviewed source identifiers",
    providerRevision: "a".repeat(40),
    questSha256: "a".repeat(64),
    npcSha256: "b".repeat(64),
    itemSha256: "c".repeat(64),
    areaMapSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    sourceArchiveSha256: "d".repeat(64),
    quests: [
      [88, 244, "Ma Stonefield", 34.66, 84.48],
      [86, 246, '"Auntie" Bernice Stonefield', 34.49, 84.25],
    ].map(([questId, npcId, name, x, y]) => ({
      questId,
      title: `Quest ${questId}`,
      minimumLevel: 5,
      questLevel: 6,
      requiredRaces: 0,
      requiredClasses: 0,
      starts: [{ npcId, name, friendlyToAlliance: true, positions: [{ zone: "1429", x, y }] }],
      ends: [{ npcId, name, friendlyToAlliance: true, positions: [{ zone: "1429", x, y }] }],
      prerequisites: { allOf: [], anyOf: [] },
      exclusiveWith: [],
      category: "delivery",
      objectives: [],
      unsupportedRequirements: [],
    })),
  });
  return {
    catalog,
    plan: {
      release: "synthetic-farm-return",
      race: "human",
      leaderClass: "warrior",
      sharedQuestsOnly: true,
      sourceArchiveSha256: "d".repeat(64),
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "starter",
          title: "Elwynn",
          from: 1,
          to: 10,
          kind: "starter",
          stopId: null,
          questIds: [85, 62, 86, 88],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
    },
  };
}

describe("shared starter pickup visits", () => {
  it("accepts Princess on the existing farm return while keeping the independent pickup first", () => {
    const { plan, catalog } = fixture(),
      before = structuredClone(plan);
    const result = batchSharedStarterPickupVisit(plan, catalog);
    expect(result.actions.map((action) => action.id)).toEqual([
      "farm-pickups",
      "mine",
      "farm-return",
      "farm-pickups-deferred-88",
      "princess",
    ]);
    expect(result.actions[0]!.questChanges.map((change) => change.questId)).toEqual([85]);
    expect(result.actions[3]!.questChanges.map((change) => change.questId)).toEqual([88]);
    expect(result.actions[3]!.positions[0]!.position).toEqual({
      zone: "1429",
      x: 34.66,
      y: 84.48,
      floor: null,
      space: "map-percent",
    });
    expect(result.legs[0]!.actionIds).toEqual(result.actions.map((action) => action.id));
    expect(result.actions.flatMap((action) => action.questChanges)).toEqual([
      before.actions[0]!.questChanges[0],
      ...before.actions[1]!.questChanges,
      ...before.actions[2]!.questChanges,
      before.actions[0]!.questChanges[1],
      ...before.actions[3]!.questChanges,
    ]);
    expect(batchSharedStarterPickupVisit(result, catalog)).toBe(result);
    expect(plan).toEqual(before);
  });

  it("retains the existing order when source, build, farm or prerequisite support differs", () => {
    const { plan, catalog } = fixture();
    const { sharedQuestsOnly, ...legacy } = plan;
    expect(sharedQuestsOnly).toBe(true);
    expect(batchSharedStarterPickupVisit(legacy, catalog)).toBe(legacy);
    expect(batchSharedStarterPickupVisit(plan, { ...catalog, targetBuild: 70450 })).toBe(plan);
    expect(
      batchSharedStarterPickupVisit(plan, { ...catalog, sourceArchiveSha256: "e".repeat(64) }),
    ).toBe(plan);
    const movedNpc = {
      ...catalog,
      quests: catalog.quests.map((quest) => ({
        ...quest,
        starts: quest.starts.map((giver) => ({
          ...giver,
          positions: [{ zone: "1439", x: 34.66, y: 84.48 }],
        })),
      })),
    };
    expect(batchSharedStarterPickupVisit(plan, movedNpc)).toBe(plan);
    for (const blocked of [
      { ...plan, actions: plan.actions.map((action) => ({ ...action, source: null })) },
      {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id === "mine" ? { ...action, requiredQuestIds: [88] } : action,
        ),
      },
      {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id === "farm-return" ? { ...action, legId: "other" } : action,
        ),
      },
    ])
      expect(batchSharedStarterPickupVisit(blocked, catalog)).toBe(blocked);
  });
});
