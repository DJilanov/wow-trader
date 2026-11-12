import { describe, expect, it } from "vitest";
import { attachCampaignCombat, createCampaignCombatState } from "./campaign-combat.js";
import type { CampaignPlan } from "./campaign.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { emptyPremadeProgress } from "./premade-model.js";
import reviewed from "./fixtures/dungeon-ground-methods-70205.json" with { type: "json" };

function dataset(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic object-collection reference"],
    },
    npcs: [],
    quests: [
      {
        questId: 96403,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: ["Collect 8 Dwarven Heirlooms from the Hall of Thanes."],
        onlyCreatureObjectives: false,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 274289,
            itemName: "Dwarven Heirloom",
            quantity: 8,
            npcIds: [],
            objectIds: [652227, 652228],
            sharing: "unknown",
          },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}

function route(
  instruction = "Collect 8 Dwarven Heirlooms from the Hall of Thanes.",
  questId = 96403,
  stopId: "thanes" | "blackfathom" | "dalaran" = "thanes",
): CampaignPlan {
  const id = `dungeon-${stopId}-objectives-complete-${questId}`,
    legId = `dungeon-${stopId}`;
  return {
    release: "test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    legs: [
      {
        id: legId,
        title: "Thane collection",
        kind: "dungeon",
        from: 14,
        to: 16,
        stopId,
        actionIds: [id],
        questIds: [questId],
        unresolvedQuestIds: [],
      },
    ],
    actions: [
      {
        id,
        legId,
        title: "Important Heirlooms",
        kind: "quests",
        instructions: [instruction],
        positions: [],
        source: null,
        leaderOnly: false,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
        wholeQuestObjectives: true,
        questChanges: [
          {
            questId,
            state: "objectives-complete",
            objectiveIndex: 1,
            title: "Important Heirlooms",
          },
        ],
      },
    ],
  };
}

function gardenDataset(): CombatDataset {
  const original = dataset(),
    method = reviewed.methods[0]!;
  return combatDatasetSchema.parse({
    ...original,
    provider: {
      ...original.provider,
      revision: reviewed.providerRevision,
      questSha256: reviewed.questSha256,
      itemSha256: reviewed.itemSha256,
    },
    npcs: [
      {
        id: 246003,
        name: "Fel Ancient",
        minimumLevel: null,
        maximumLevel: null,
        rank: null,
        zoneIds: [36],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        ...original.quests[0]!,
        questId: method.questId,
        requiredClasses: 0,
        objectiveText: method.objectiveText,
        itemObjectives: [
          {
            objectiveIndex: method.objectiveIndex,
            itemId: method.itemId,
            itemName: method.itemName,
            quantity: method.quantity,
            npcIds: [],
            sharing: "unknown",
          },
        ],
      },
    ],
  });
}

describe("reviewed dungeon garden collection", () => {
  it("qualifies the plant while retaining its guarding encounter and full item quota", () => {
    const plan = route(
      "Retrieve a Fel Infused Blossom from Dalaran's central garden.",
      92456,
      "dalaran",
    );
    const data = gardenDataset(),
      before = JSON.stringify({ plan, data });
    const result = attachCampaignCombat(plan, [], data, "reviewed-ground-test");
    const objective = result.combat!.activities[0]!.objectives[0]!;
    expect(objective).toMatchObject({
      questId: 92456,
      objectiveIndex: 1,
      credit: "non-combat",
      npcIds: [],
      requiredKills: null,
      combatAccess: { npcIds: [246003], itemId: 251983, quantity: 1 },
    });
    expect(objective.loot).toBeUndefined();
    expect(result.itemRequirements).toContainEqual({
      questId: 92456,
      objectiveIndex: 1,
      itemId: 251983,
      quantity: 1,
    });
    expect(result.combat!.npcs).toEqual([{ ...data.npcs[0]!, minimumLevel: 29, maximumLevel: 29 }]);
    expect(result.combat!.npcMetadataReferences).toContainEqual(expect.objectContaining({
      npcId: 246003, levelSource: expect.objectContaining({ kind: "owner-confirmed-creature-level" }),
    }));
    const readiness = createCampaignCombatReadiness(result)(result.actions[0]!);
    expect(readiness.unknownNpcIds).toEqual([]);
    expect(readiness.targetLevel).toBe(25);
    expect(result.actions[0]!.instructions.join(" ")).toContain("Magus Fansy Goodbringer");
    expect(result.actions[0]!.instructions.join(" ")).toContain("Every player needs one");
    expect(result.actions[0]!.questChanges).toEqual(plan.actions[0]!.questChanges);
    expect(JSON.stringify({ plan, data })).toBe(before);
    expect(attachCampaignCombat(result, [], data, "reviewed-ground-test")).toEqual(result);
  });

  it("retains the enemy limit and skips the encounter only when the required item is already held", () => {
    const data = gardenDataset();
    Object.assign(data.npcs[0]!, { minimumLevel: 37, maximumLevel: 37, rank: 1 });
    const result = attachCampaignCombat(
      route("Collect the blossom.", 92456, "dalaran"),
      [],
      data,
      "test",
    );
    const check = createCampaignCombatReadiness(result),
      action = result.actions[0]!;
    expect(check(action).targetLevel).toBe(33);
    const member = emptyPremadeProgress().members[0]!;
    expect(
      check(action, [
        {
          execute: true,
          questStates: { "92456": "accepted" },
          confirmations: {},
          minimumItems: new Map([[251983, 1]]),
          combat: createCampaignCombatState(result.combat, member),
        },
      ]).targetLevel,
    ).toBeNull();
  });

  it.each(["provider", "item", "quantity", "class", "enemy", "source", "dungeon", "build"])(
    "keeps changed or unbound methods unqualified (%s)",
    (change) => {
      let plan = route("Collect the blossom.", 92456, "dalaran");
      const data = gardenDataset();
      if (change === "provider") data.provider.revision = "f".repeat(40);
      if (change === "item") data.quests[0]!.itemObjectives![0]!.itemId = 123;
      if (change === "quantity") data.quests[0]!.itemObjectives![0]!.quantity = 2;
      if (change === "class") data.quests[0]!.requiredClasses = 1;
      if (change === "enemy") data.npcs = [];
      if (change === "source")
        plan = {
          ...plan,
          actions: plan.actions.map((action) => ({
            ...action,
            source: { chapterId: "test", version: "test", stepId: "test" },
          })),
        };
      if (change === "dungeon") plan = route("Collect the blossom.", 92456, "blackfathom");
      if (change === "build") {
        plan = { ...plan, targetBuild: 70450 };
        data.targetBuild = 70450;
      }
      const result = attachCampaignCombat(plan, [], data, "unqualified-method-test");
      expect(
        result
          .combat!.activities.flatMap((activity) => activity.objectives)
          .some((objective) => objective.credit === "non-combat" || objective.combatAccess),
      ).toBe(false);
    },
  );
});

describe("generated dungeon world-object collection", () => {
  it.each([
    "Recover the Lorgalis Manuscript from Blackfathom Deeps.",
    "Retrieve the Lorgalis Manuscript from Blackfathom Deeps.",
    "Recover 1 Lorgalis Manuscript from Blackfathom Deeps.",
  ])("recognizes the exact one-item world-object instruction: %s", (instruction) => {
    const data = dataset();
    data.quests[0] = {
      ...data.quests[0]!,
      questId: 971,
      objectiveText: ["Bring the Lorgalis Manuscript to Gerrig Bonegrip in Ironforge."],
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 5359,
          itemName: "Lorgalis Manuscript",
          quantity: 1,
          npcIds: [],
          objectIds: [13949],
          sharing: "unknown",
        },
      ],
    };
    const result = attachCampaignCombat(route(instruction, 971, "blackfathom"), [], data, "test");
    expect(result.combat?.activities).toEqual([]);
    expect(result.itemRequirements).toContainEqual({
      questId: 971,
      objectiveIndex: 1,
      itemId: 5359,
      quantity: 1,
    });
    expect(result.actions[0]!.questChanges).toHaveLength(1);
  });

  it("requires an explicit matching count for a multi-item recovery", () => {
    for (const instruction of [
      "Recover the Dwarven Heirlooms from the Hall of Thanes.",
      "Recover 7 Dwarven Heirlooms from the Hall of Thanes.",
    ])
      expect(
        attachCampaignCombat(route(instruction), [], dataset(), "test").combat?.activities,
      ).toHaveLength(1);
    expect(
      attachCampaignCombat(
        route("Recover 8 Dwarven Heirlooms from the Hall of Thanes."),
        [],
        dataset(),
        "test",
      ).combat?.activities,
    ).toEqual([]);
  });

  it("retains eight objects per player without inventing a loot fight", () => {
    const plan = route(),
      data = dataset(),
      before = JSON.stringify({ plan, data });
    const result = attachCampaignCombat(plan, [], data, "test");
    expect(result.combat?.activities).toEqual([]);
    expect(result.itemRequirements).toContainEqual({
      questId: 96403,
      objectiveIndex: 1,
      itemId: 274289,
      quantity: 8,
    });
    expect(result.actions[0]!.questChanges).toEqual(plan.actions[0]!.questChanges);
    expect(JSON.stringify({ plan, data })).toBe(before);
  });

  it("requires positive object, item, quantity and non-combat instructions", () => {
    const missing = dataset();
    delete missing.quests[0]!.itemObjectives![0]!.objectIds;
    const wrong = dataset();
    wrong.quests[0]!.itemObjectives![0]!.itemName = "Different Item";
    const kills = dataset();
    kills.quests[0]!.creatureIds = [100];
    const drops = dataset();
    drops.quests[0]!.itemObjectives![0]!.npcIds = [100];
    for (const [plan, data] of [
      [route(), missing],
      [route(), wrong],
      [route(), kills],
      [route(), drops],
      [route("Collect 7 Dwarven Heirlooms from the Hall of Thanes."), dataset()],
      [route("Kill enemies and collect 8 Dwarven Heirlooms."), dataset()],
      [route("Buy 8 Dwarven Heirlooms."), dataset()],
    ] as const)
      expect(attachCampaignCombat(plan, [], data, "test").combat?.activities).toHaveLength(1);
  });
});
