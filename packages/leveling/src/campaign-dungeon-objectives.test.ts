import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import { referencedQuestObjectiveIndexes } from "./campaign-quest-objectives.js";

function fixture(): {
  readonly plan: CampaignPlan;
  readonly reference: Pick<CombatDataset, "targetBuild" | "quests">;
} {
  const action: CampaignAction = {
    id: "dungeon-objective",
    legId: "dungeon",
    title: "Complete all quest objectives",
    instructions: ["Finish every quest counter before returning."],
    questChanges: [
      { questId: 300001, title: "Control quest", state: "objectives-complete", objectiveIndex: 1 },
    ],
    wholeQuestObjectives: true,
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  return {
    plan: {
      release: "dungeon-objective-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [],
    },
    reference: {
      targetBuild: 70205,
      quests: [
        {
          questId: 300001,
          creatureIds: [10, 11],
          itemCreatureIds: [],
          objectiveText: [],
          onlyCreatureObjectives: true,
          killQuotas: [
            { objectiveIndex: 1, npcId: 10, kills: 5, source: "Synthetic captured counter" },
            { objectiveIndex: 2, npcId: 11, kills: 6, source: "Synthetic captured counter" },
          ],
        },
      ],
    },
  };
}

describe("generated whole-quest dungeon objectives", () => {
  it("adds a mapped counter once, retaining the action identity and inputs", () => {
    const { plan, reference } = fixture();
    const before = structuredClone({ plan, reference });
    const expanded = expandCampaignDungeonObjectives(plan, reference);
    expect(expanded.actions[0]!.questChanges.map((change) => change.objectiveIndex)).toEqual([
      1, 2,
    ]);
    expect(expanded.actions[0]).toEqual({
      ...plan.actions[0],
      questChanges: expanded.actions[0]!.questChanges,
    });
    expect(expanded.legs).toBe(plan.legs);
    expect(expanded.rewardFacts).toBeUndefined();
    expect({ plan, reference }).toEqual(before);
    expect(expandCampaignDungeonObjectives(expanded, reference)).toBe(expanded);
  });

  it("retains explicit slots and their order while adding mapped item indices", () => {
    const { plan } = fixture();
    const action = plan.actions[0]!;
    const input = {
      ...plan,
      actions: [
        {
          ...action,
          questChanges: [2, 1].map((objectiveIndex) => ({
            ...action.questChanges[0]!,
            objectiveIndex,
          })),
        },
      ],
    };
    const quest: CombatQuestReference = {
      questId: 300001,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: false,
      itemObjectives: [3, null].map((objectiveIndex, index) => ({
        objectiveIndex,
        itemId: 200 + index,
        quantity: null,
        npcIds: [],
        sharing: "unknown",
      })),
    };
    const expanded = expandCampaignDungeonObjectives(input, {
      targetBuild: 70205,
      quests: [quest],
    });
    expect(expanded.actions[0]!.questChanges.map((change) => change.objectiveIndex)).toEqual([
      2, 1, 3,
    ]);
    expect(quest.itemObjectives?.map((item) => item.quantity)).toEqual([null, null]);
  });

  it("leaves unmarked partial and source-owned steps unchanged", () => {
    const { plan, reference } = fixture();
    const { wholeQuestObjectives: _marker, ...partial } = plan.actions[0]!;
    const source = {
      ...partial,
      id: "source-counter",
      source: { chapterId: "control", version: "control", stepId: "counter" },
    };
    const input = { ...plan, actions: [partial, source] };
    expect(expandCampaignDungeonObjectives(input, reference)).toBe(input);
  });

  it("preserves disputed requirements without inventing an unmapped completion", () => {
    const { plan, reference } = fixture();
    const quest = { ...reference.quests[0]!, killQuotaConflicts: [2, 4] };
    const before = structuredClone(quest);
    const expanded = expandCampaignDungeonObjectives(plan, { ...reference, quests: [quest] });
    expect(expanded.actions[0]!.questChanges.map((change) => change.objectiveIndex)).toEqual([
      1, 2,
    ]);
    expect(referencedQuestObjectiveIndexes([quest])).toEqual({ "300001": [1, 2, 4] });
    expect(quest).toEqual(before);
  });

  it("does not infer counters from mixed objectives or mismatched creature mappings", () => {
    const { plan, reference } = fixture();
    for (const quest of [
      { ...reference.quests[0]!, onlyCreatureObjectives: false },
      { ...reference.quests[0]!, creatureIds: [10, 999] },
    ])
      expect(expandCampaignDungeonObjectives(plan, { ...reference, quests: [quest] })).toBe(plan);
  });

  it("rejects references from another build", () => {
    const { plan, reference } = fixture();
    expect(() =>
      expandCampaignDungeonObjectives(plan, { ...reference, targetBuild: 70450 }),
    ).toThrow("different route build");
  });

  it.each([
    { questChanges: [] },
    { kind: "instructions" as const },
    { source: { chapterId: "control", version: "control", stepId: "counter" } },
    {
      questChanges: [
        { questId: 300001, title: "Control", state: "accepted" as const, objectiveIndex: null },
      ],
    },
    {
      questChanges: [300001, 300002].map((questId) => ({
        questId,
        title: "Control",
        state: "objectives-complete" as const,
        objectiveIndex: 1,
      })),
    },
  ])("rejects an invalid whole-quest task contract: %o", (patch) => {
    const { plan, reference } = fixture();
    const input: CampaignPlan = { ...plan, actions: [{ ...plan.actions[0]!, ...patch }] };
    expect(() => expandCampaignDungeonObjectives(input, reference)).toThrow(
      "Invalid generated whole-quest objective task",
    );
  });
});
