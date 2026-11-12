import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { retainCampaignBridgeQuests } from "./campaign-required-quests.js";

function fixture(): CampaignPlan {
  const phase = (
    questId: number,
    state: "accepted" | "rewarded",
  ): CampaignAction["questChanges"][number] => ({
    questId,
    state,
    title: "Thandol handoff",
    objectiveIndex: null,
  });
  const rows = [
    [phase(631, "accepted")],
    [phase(631, "rewarded"), phase(632, "accepted")],
    [phase(632, "rewarded")],
  ];
  const actions: CampaignAction[] = rows.map((questChanges, index) => ({
    id: `thandol-${index}`,
    legId: "excavation-approach",
    title: "Thandol handoff",
    instructions: ["Use the captured staircase and return to Rhag."],
    questChanges,
    positions: [
      {
        sourceLine: index + 1,
        position: { zone: "1437", x: 50, y: 18, floor: null, space: "map-percent" },
      },
    ],
    source: {
      chapterId: "chapter-11-27-29-wetlands-hillsbrad",
      version: "import-v2-test",
      stepId: `source-step-${index}`,
    },
    kind: "quests",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
  }));
  return {
    release: "required-handoffs-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    actions,
    legs: [
      {
        id: "excavation-approach",
        title: "Wetlands",
        kind: "xp-bridge",
        from: 26,
        to: 26,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [631, 632],
        unresolvedQuestIds: [],
      },
    ],
    bookmarkAliases: { "old-thandol": "thandol-0" },
  };
}

describe("required shared source handoffs", () => {
  it("keeps the on-route Dun Modr courier independently of the complete Thandol pair", () => {
    const original = fixture();
    const courier = (["accepted", "rewarded"] as const).map((state) => ({
      ...original.actions[0]!, id: `courier-${state}`,
      questChanges: [{ questId: 472, title: "Fall of Dun Modr", state, objectiveIndex: null }],
    }));
    for (const pair of [original.actions, original.actions.slice(0, -1)]) {
      const plan = { ...original, actions: [...courier, ...pair] };
      const result = retainCampaignBridgeQuests(plan);
      expect(result.actions.slice(0, 2).every((action) => action.libraryRequired)).toBe(true);
      expect(result.actions.slice(2).every((action) => action.libraryRequired)).toBe(
        pair.length === original.actions.length,
      );
      expect(result.actions.map(({ libraryRequired: _required, ...action }) => action)).toEqual(
        plan.actions,
      );
    }
  });

  it("retains the whole pair without changing its composite phases, positions or bookmarks", () => {
    const plan = fixture(),
      original = structuredClone(plan);
    const result = retainCampaignBridgeQuests(plan);
    expect(result.actions).toEqual(
      plan.actions.map((action) => ({ ...action, libraryRequired: true })),
    );
    expect(result.legs).toBe(plan.legs);
    expect(result.bookmarkAliases).toBe(plan.bookmarkAliases);
    expect(plan).toEqual(original);
    expect(retainCampaignBridgeQuests(result)).toBe(result);
  });

  it.each([
    "missing return",
    "duplicate pickup",
    "extra objective",
    "mixed unconfigured phase",
    "no source",
    "personal",
    "raid",
    "dungeon",
    "wrong visit",
    "no visit",
  ])("does not promote an incomplete or incompatible configured pair: %s", (reason) => {
    const plan = fixture();
    let actions = [...plan.actions];
    if (reason === "missing return") actions = actions.slice(0, -1);
    else if (reason === "duplicate pickup")
      actions = [actions[0]!, { ...actions[0]!, id: "repeat" }, ...actions.slice(1)];
    else if (reason === "extra objective")
      actions = [
        actions[0]!,
        {
          ...actions[0]!,
          id: "extra",
          questChanges: [
            { ...actions[0]!.questChanges[0]!, state: "objectives-complete", objectiveIndex: 1 },
          ],
        },
        ...actions.slice(1),
      ];
    else
      actions[0] = {
        ...actions[0]!,
        ...(reason === "mixed unconfigured phase"
          ? {
              questChanges: [
                ...actions[0]!.questChanges,
                { ...actions[0]!.questChanges[0]!, questId: 472 },
              ],
            }
          : {}),
        ...(reason === "no source" ? { source: null } : {}),
        ...(reason === "personal" ? { leaderOnly: true } : {}),
        ...(reason === "raid" ? { raidOnly: true } : {}),
        ...(reason === "dungeon" ? { dungeonFinishOnly: true } : {}),
        ...(reason === "wrong visit" ? { legId: "dalaran-approach" } : {}),
      };
    const input = { ...plan, actions, ...(reason === "no visit" ? { legs: [] } : {}) };
    expect(retainCampaignBridgeQuests(input)).toBe(input);
    expect(input.actions.every((action) => action.libraryRequired !== true)).toBe(true);
  });

  it("keeps legacy editions and unrelated optional visits unchanged", () => {
    const shared = fixture();
    const legacy = { ...shared };
    delete legacy.sharedQuestsOnly;
    expect(retainCampaignBridgeQuests(legacy)).toBe(legacy);
    const unrelated = {
      ...shared,
      actions: shared.actions.map((action) => ({ ...action, legId: "other" })),
      legs: shared.legs.map((leg) => ({ ...leg, id: "other" })),
    };
    expect(retainCampaignBridgeQuests(unrelated)).toBe(unrelated);
  });
});
