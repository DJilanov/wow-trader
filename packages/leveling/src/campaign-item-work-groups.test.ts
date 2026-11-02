import { describe, expect, it } from "vitest";
import { groupCampaignItemWork } from "./campaign-item-work-groups.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { campaignActionAlias } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";

function collection(id: string, itemId: number): CampaignAction {
  return {
    id,
    legId: "starter",
    title: id,
    instructions: ["Use this one captured gathering loop"],
    positions: [],
    source: { chapterId: "source", version: "v1", stepId: "step-1" },
    kind: "instructions",
    leaderOnly: true,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: [],
    itemCollections: [
      {
        questId: 300100,
        itemId,
        quantity: 3,
        objectiveBitmask: 1,
        confirmationKey: `item-${itemId}`,
      },
    ],
  };
}
function plan(actions: readonly CampaignAction[]): CampaignPlan {
  return {
    release: "collection-group-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [...new Set(actions.map((action) => action.legId))].map((id) => ({
      id,
      title: id,
      kind: "starter",
      from: 1,
      to: 10,
      stopId: null,
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
  };
}

describe("one route for a source step's material targets", () => {
  it("groups adjacent targets and preserves identity, old bookmarks and source inputs", () => {
    const input = {
      ...plan([collection("one", 1), collection("two", 2), collection("three", 3)]),
      bookmarkAliases: { legacy: "two" },
    };
    const original = JSON.stringify(input);
    const result = groupCampaignItemWork(input);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.id).toBe("one");
    expect(result.actions[0]!.itemCollections!.map((item) => item.itemId)).toEqual([1, 2, 3]);
    expect(result.actions[0]!.instructions).toEqual(["Use this one captured gathering loop"]);
    expect(result.legs[0]!.actionIds).toEqual(["one"]);
    expect(result.bookmarkAliases).toEqual({ legacy: "one", two: "one", three: "one" });
    for (const id of ["legacy", "two", "three"])
      expect(campaignActionAlias(result, emptyPremadeProgress(), id)).toBe("one");
    expect(groupCampaignItemWork(result)).toBe(result);
    expect(JSON.stringify(input)).toBe(original);
  });

  const differences: readonly Partial<CampaignAction>[] = [
    { leaderOnly: false },
    { legId: "other" },
    { xpOptional: true },
    { requiredQuestIds: [300101] },
    { source: { chapterId: "source", version: "v2", stepId: "step-1" } },
    { source: { chapterId: "source", version: "v1", stepId: "step-2" } },
  ];
  it.each(differences)(
    "keeps a different audience, source or context separate (%j)",
    (difference) => {
      const input = plan([collection("one", 1), { ...collection("two", 2), ...difference }]);
      expect(groupCampaignItemWork(input)).toBe(input);
    },
  );

  it("does not move later collection across an intervening quest transition", () => {
    const middle: CampaignAction = {
      ...collection("hand-in", 5),
      kind: "quests",
      itemCollections: [],
      questChanges: [
        { questId: 300101, title: "Other quest", state: "rewarded", objectiveIndex: null },
      ],
    };
    const input = plan([collection("one", 1), middle, collection("two", 2)]);
    expect(groupCampaignItemWork(input)).toBe(input);
  });

  it("does not combine conflicting targets for the same item", () => {
    const other = collection("two", 1);
    const input = plan([
      collection("one", 1),
      { ...other, itemCollections: [{ ...other.itemCollections![0]!, quantity: 4 }] },
    ]);
    expect(groupCampaignItemWork(input)).toBe(input);
  });

  it("does not merge different quest requirements from the same source", () => {
    const other = collection("two", 2);
    const input = plan([
      collection("one", 1),
      { ...other, itemCollections: [{ ...other.itemCollections![0]!, questId: 300102 }] },
    ]);
    expect(groupCampaignItemWork(input)).toBe(input);
  });

  it("retains a compound pickup instead of treating it as a standalone material target", () => {
    const input = plan([
      collection("one", 1),
      {
        ...collection("two", 2),
        questChanges: [
          { questId: 300100, title: "Accept", state: "accepted", objectiveIndex: null },
        ],
      },
    ]);
    expect(groupCampaignItemWork(input)).toBe(input);
  });
});
