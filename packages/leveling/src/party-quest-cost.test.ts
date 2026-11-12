import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import type { CombatObjective } from "./combat-model.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import type { LootSharing, QuestLootDrop } from "./quest-loot.js";
import { partyQuestLootCost } from "./party-quest-cost.js";

function fixture(sharing: LootSharing, probability: number, quantity: number): CampaignPlan {
  const objective: CombatObjective = {
    questId: 102,
    objectiveIndex: 1,
    npcIds: [117],
    requiredKills: null,
    credit: "personal-loot",
    source: "fixture",
    reason: null,
    loot: { itemId: 725, quantity, sharing },
  };
  const drop: QuestLootDrop = {
    itemId: 725,
    npcId: 117,
    probability,
    minimumQuantity: 1,
    maximumQuantity: 1,
    sampleSize: 100,
    targetBuild: 70205,
    sourceUrl: "https://example.test/drop",
    capturedAt: "2026-10-31T00:00:00Z",
    sourceSha256: "a".repeat(64),
  };
  return {
    release: "fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    legs: [],
    actions: [],
    combat: {
      revision: "fixture",
      sourceRevision: "fixture",
      targetBuild: 70205,
      npcs: [],
      notice: null,
      activities: [
        {
          id: "farm",
          actionId: "farm",
          environment: "outdoor",
          objectives: [objective],
          profile: null,
        },
      ],
      lootDrops: [drop],
    },
  };
}

function meatFixture(probability = 0.8, quantity = 8): { plan: CampaignPlan; data: CombatDataset } {
  const original = fixture("pooled", probability, quantity);
  const plan: CampaignPlan = {
    ...original,
    combat: {
      ...original.combat!,
      activities: original.combat!.activities.map((activity) => ({
        ...activity,
        objectives: activity.objectives.map((objective) => ({
          ...objective,
          loot: { ...objective.loot!, itemId: 769 },
        })),
      })),
      lootDrops: original.combat!.lootDrops!.map((drop) => ({ ...drop, itemId: 769 })),
    },
  };
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic meat regression",
    provider: {
      repository: "https://example.test/reference",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    npcs: [],
    dungeons: [],
    quests: [
      {
        questId: 102,
        creatureIds: [],
        itemCreatureIds: [117],
        objectiveText: [],
        itemObjectives: [
          {
            itemId: 769,
            itemName: "Chunk of Boar Meat",
            objectiveIndex: 1,
            quantity,
            npcIds: [117],
            sharing: "pooled",
          },
        ],
      },
    ],
  });
  return { plan, data };
}

describe("five-player quest-item cost", () => {
  it("does not borrow another item's outdoor activity for a source-only material target", () => {
    const original = fixture("pooled", 0.5, 12);
    const objective = original.combat!.activities[0]!.objectives[0]!;
    const plan: CampaignPlan = {
      ...original,
      sharedQuestsOnly: true,
      combat: {
        ...original.combat!,
        npcs: [
          {
            id: 117,
            name: "Camp creature",
            minimumLevel: 3,
            maximumLevel: 4,
            rank: 0,
            zoneIds: [12],
            xpEligibility: "assumed",
          },
        ],
        activities: original.combat!.activities.map((activity) => ({
          ...activity,
          objectives: [{ ...objective, loot: { ...objective.loot!, itemId: 726 } }],
        })),
        materialWork: [
          {
            id: "gather",
            actionId: "gather",
            targets: [
              {
                confirmationKey: "material-102",
                sourceOrdinal: 0,
                sourceBlocksCompletion: true,
                possibleDropNpcIds: [117],
                objective,
              },
            ],
          },
        ],
        lootDrops: [
          ...original.combat!.lootDrops!,
          { ...original.combat!.lootDrops![0]!, itemId: 726 },
        ],
      },
    };
    expect(partyQuestLootCost(102, plan)).toMatchObject({ eligible: false, expectedKills: 240 });
  });
  it("retains captured camp drops above twenty-five percent with the full five-player quota", () => {
    const original = fixture("pooled", 9 / 19, 12);
    const plan: CampaignPlan = {
      ...original,
      sharedQuestsOnly: true,
      combat: {
        ...original.combat!,
        npcs: [
          {
            id: 117,
            name: "Camp creature",
            minimumLevel: 3,
            maximumLevel: 4,
            rank: 0,
            zoneIds: [12],
            xpEligibility: "assumed",
          },
        ],
      },
    };
    const before = structuredClone(plan);
    expect(partyQuestLootCost(102, plan)).toMatchObject({
      eligible: true,
      retainedByDropRate: true,
      expectedKills: 127,
      slowKills: 142,
    });
    expect(plan).toEqual(before);
    for (const probability of [0.25, 0.2, 0.1])
      expect(
        partyQuestLootCost(102, {
          ...plan,
          combat: {
            ...plan.combat!,
            lootDrops: plan.combat!.lootDrops!.map((drop) => ({ ...drop, probability })),
          },
        }).eligible,
      ).toBe(false);
    expect(partyQuestLootCost(102, { ...original, combat: plan.combat! }).eligible).toBe(false);
    expect(
      partyQuestLootCost(102, {
        ...plan,
        combat: {
          ...plan.combat!,
          lootDrops: plan.combat!.lootDrops!.map((drop) => ({ ...drop, probability: 0.2501 })),
        },
      }),
    ).toMatchObject({ eligible: true, retainedByDropRate: true, expectedKills: 240 });
  });

  it("does not infer a normal outdoor camp from a missing rate, unknown creature, elite, or manual override", () => {
    const original = fixture("pooled", 0.5, 12);
    const npc = {
      id: 117,
      name: "Camp creature",
      minimumLevel: 3,
      maximumLevel: 4,
      rank: 0,
      zoneIds: [12],
      xpEligibility: "assumed" as const,
    };
    const plan: CampaignPlan = {
      ...original,
      sharedQuestsOnly: true,
      combat: { ...original.combat!, npcs: [npc] },
    };
    const cases: CampaignPlan[] = [
      { ...plan, combat: { ...plan.combat!, npcs: [] } },
      { ...plan, combat: { ...plan.combat!, npcs: [{ ...npc, rank: 1 }] } },
      { ...plan, combat: { ...plan.combat!, npcs: [{ ...npc, maximumLevel: null }] } },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          activities: plan.combat!.activities.map((activity) => ({
            ...activity,
            environment: "dungeon",
          })),
        },
      },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          lootDrops: plan.combat!.lootDrops!.map((drop) => ({
            ...drop,
            probabilityBasis: "reported-override",
          })),
        },
      },
      { ...plan, combat: { ...plan.combat!, lootDrops: [] } },
    ];
    for (const candidate of cases) expect(partyQuestLootCost(102, candidate).eligible).toBe(false);
    const objective = plan.combat!.activities[0]!.objectives[0]!;
    const mixed: CampaignPlan = {
      ...plan,
      combat: {
        ...plan.combat!,
        activities: [
          {
            ...plan.combat!.activities[0]!,
            objectives: [
              objective,
              { ...objective, objectiveIndex: 2, loot: { ...objective.loot!, itemId: 726 } },
            ],
          },
        ],
        lootDrops: [
          ...plan.combat!.lootDrops!,
          { ...plan.combat!.lootDrops![0]!, itemId: 726, probability: 0.2 },
        ],
      },
    };
    expect(partyQuestLootCost(102, mixed).eligible).toBe(false);
  });

  it("rejects eight personal items at ten percent drop chance for the full five-player group", () => {
    expect(partyQuestLootCost(102, fixture("pooled", 0.1, 8))).toMatchObject({
      eligible: false,
      expectedKills: 400,
    });
  });
  it("retains the complete sausage ingredient list only when every on-route drop qualifies", () => {
    const { plan: original, data: originalData } = meatFixture(0.35, 3);
    const ingredients = [
      [3172, "Boar Intestines"],
      [3173, "Bear Meat"],
      [3174, "Spider Ichor"],
    ] as const;
    const objective = original.combat!.activities[0]!.objectives[0]!;
    const drop = original.combat!.lootDrops![0]!;
    const item = originalData.quests[0]!.itemObjectives![0]!;
    const plan: CampaignPlan = {
      ...original,
      combat: {
        ...original.combat!,
        activities: original.combat!.activities.map((activity) => ({
          ...activity,
          objectives: ingredients.map(([itemId], index) => ({
            ...objective,
            objectiveIndex: index + 1,
            npcIds: [117 + index],
            loot: { ...objective.loot!, itemId },
          })),
        })),
        lootDrops: ingredients.map(([itemId], index) => ({
          ...drop,
          itemId,
          npcId: 117 + index,
        })),
      },
    };
    const data: CombatDataset = {
      ...originalData,
      quests: originalData.quests.map((quest) => ({
        ...quest,
        itemObjectives: ingredients.map(([itemId, itemName], index) => ({
          ...item,
          itemId,
          itemName,
          objectiveIndex: index + 1,
          npcIds: [117 + index],
        })),
      })),
    };
    expect(partyQuestLootCost(102, plan, data)).toMatchObject({
      eligible: true,
      expectedKills: 129,
      auctionItems: ingredients.map(([itemId, name]) => ({ itemId, name, quantityPerPlayer: 3 })),
    });
    const rareIngredient: CampaignPlan = {
      ...plan,
      combat: {
        ...plan.combat!,
        lootDrops: plan.combat!.lootDrops!.map((entry) =>
          entry.itemId === 3174 ? { ...entry, probability: 0.2 } : entry,
        ),
      },
    };
    expect(partyQuestLootCost(102, rareIngredient, data)).toMatchObject({ eligible: false });
    expect(partyQuestLootCost(102, rareIngredient, data).auctionItems).toBeUndefined();
  });
  it("retains ordinary high-drop meat with an AH alternative while preserving the full gathering cost", () => {
    const { plan, data } = meatFixture();
    expect(partyQuestLootCost(102, plan, data)).toMatchObject({
      eligible: true,
      expectedKills: 50,
      auctionItems: [{ itemId: 769, name: "Chunk of Boar Meat", quantityPerPlayer: 8 }],
    });
    expect(partyQuestLootCost(102, plan, data).reason).toContain(
      "listed kill cost applies only to gathering",
    );
  });

  it("does not retain low-rate meat or an excessive personal quota just because it can be traded", () => {
    for (const [probability, quantity] of [
      [0.2, 4],
      [0.8, 40],
    ]) {
      const { plan, data } = meatFixture(probability, quantity);
      const cost = partyQuestLootCost(102, plan, data);
      expect(cost.eligible).toBe(false);
      expect(cost.auctionItems).toBeUndefined();
    }
  });

  it("does not apply a mob-kill budget to a modest AH shopping list", () => {
    const { plan, data } = meatFixture(0.35, 10);
    expect(partyQuestLootCost(102, plan, data)).toMatchObject({
      eligible: true,
      expectedKills: 143,
      auctionItems: [{ itemId: 769, quantityPerPlayer: 10 }],
    });
  });

  it("does not guess AH eligibility from an item name, wrong quantity, or an unmatched identity", () => {
    const { plan, data } = meatFixture();
    for (const correction of [
      { itemId: 725, itemName: "Chunk of Boar Meat" },
      { itemId: 769, itemName: "Quest-only Boar Meat" },
      { quantity: 9 },
      { provided: true },
    ]) {
      const changed = {
        ...data,
        quests: data.quests.map((quest) => ({
          ...quest,
          itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, ...correction })),
        })),
      };
      expect(partyQuestLootCost(102, plan, changed).auctionItems).toBeUndefined();
    }
  });
  it("includes source-backed material gathering when no quest completion activity carries its quota", () => {
    const original = fixture("pooled", 0.8, 8);
    const objective = original.combat!.activities[0]!.objectives[0]!;
    const plan = {
      ...original,
      combat: {
        ...original.combat!,
        activities: [],
        materialWork: [
          {
            id: "gather",
            actionId: "gather",
            targets: [
              {
                confirmationKey: "material-102",
                sourceOrdinal: 0,
                sourceBlocksCompletion: true,
                possibleDropNpcIds: [117],
                objective,
              },
            ],
          },
        ],
      },
    };
    expect(partyQuestLootCost(102, plan, undefined, 1)).toMatchObject({
      eligible: true,
      expectedKills: 10,
    });
    expect(partyQuestLootCost(102, plan)).toMatchObject({ eligible: false, expectedKills: 50 });
    const duplicated = {
      ...plan,
      combat: { ...plan.combat, activities: original.combat!.activities },
    };
    expect(partyQuestLootCost(102, duplicated, undefined, 1).expectedKills).toBe(10);
  });
  it("prices personal starter work separately from a pooled five-player collection", () => {
    const plan = fixture("pooled", 0.8, 8);
    expect(partyQuestLootCost(102, plan, undefined, 1)).toMatchObject({
      eligible: true,
      expectedKills: 10,
    });
    expect(partyQuestLootCost(102, plan)).toMatchObject({ eligible: false, expectedKills: 50 });
    for (const partySize of [0, 6, 1.5, Number.NaN])
      expect(() => partyQuestLootCost(102, plan, undefined, partySize)).toThrow("party size");
  });
  it("prices the complete shared-loot quota, not one player's ten items", () => {
    const decision = partyQuestLootCost(102, fixture("pooled", 0.2, 10));
    expect(decision.expectedKills).toBe(250);
    expect(decision.eligible).toBe(false);
    expect(partyQuestLootCost(102, fixture("pooled", 0.1, 10)).expectedKills).toBe(500);
  });
  it("accepts a small independently looted objective and waits for the slowest member", () => {
    const decision = partyQuestLootCost(102, fixture("independent", 0.8, 4));
    expect(decision.eligible).toBe(true);
    expect(decision.expectedKills).toBeGreaterThanOrEqual(5);
    expect(decision.slowKills).toBeGreaterThanOrEqual(decision.expectedKills!);
  });
  it("does not equate a shareable quest or Group Loot with shared item credit", () => {
    const decision = partyQuestLootCost(102, fixture("unknown", 1, 1));
    expect(decision.eligible).toBe(false);
    expect(decision.expectedKills).toBeNull();
  });
  it("accepts efficient shared-copy collection without multiplying the quota by five", () => {
    expect(partyQuestLootCost(102, fixture("shared-roll", 0.8, 8))).toMatchObject({
      eligible: true,
      expectedKills: 10,
    });
  });
  it("still rejects slow shared-copy collection", () => {
    expect(partyQuestLootCost(102, fixture("shared-roll", 0.1, 8))).toMatchObject({
      eligible: false,
      expectedKills: 80,
    });
  });
  it("counts a repeated source objective once and rejects foreign-build evidence", () => {
    const original = fixture("pooled", 0.2, 10);
    const duplicate = {
      ...original,
      combat: {
        ...original.combat!,
        activities: [...original.combat!.activities, ...original.combat!.activities],
      },
    };
    expect(partyQuestLootCost(102, duplicate).expectedKills).toBe(250);
    expect(
      partyQuestLootCost(102, { ...original, combat: { ...original.combat!, targetBuild: 99999 } })
        .eligible,
    ).toBe(false);
  });
});

describe("shared five-player collection workload", () => {
  it.each([
    { probability: 0.5, quantity: 5, expected: 50 },
    { probability: 0.25, quantity: 5, expected: 100 },
  ])("retains a bounded whole-party quota: $expected expected kills", ({ probability, quantity, expected }) => {
    const plan: CampaignPlan = { ...fixture("pooled", probability, quantity), sharedQuestsOnly: true };
    const cost = partyQuestLootCost(102, plan);
    expect(cost).toMatchObject({ eligible: true, expectedKills: expected });
    expect(cost.slowKills).toBeLessThanOrEqual(150);
    expect(cost.retainedByDropRate).toBeUndefined();
  });

  it("rejects a quota above the whole-party expected-kill budget", () => {
    const plan: CampaignPlan = { ...fixture("pooled", 0.49, 10), sharedQuestsOnly: true };
    const cost = partyQuestLootCost(102, plan);
    expect(cost.eligible).toBe(false);
    expect(cost.expectedKills).toBeGreaterThan(100);
    expect(cost.slowKills).toBeLessThanOrEqual(150);
  });

  it("rejects an excessive slow workload even when the mean fits", () => {
    const plan: CampaignPlan = { ...fixture("pooled", 0.05, 1), sharedQuestsOnly: true };
    const cost = partyQuestLootCost(102, plan);
    expect(cost).toMatchObject({ eligible: false, expectedKills: 100 });
    expect(cost.slowKills).toBeGreaterThan(150);
  });

  it("keeps the smaller budget for an edition outside the shared route", () => {
    expect(partyQuestLootCost(102, fixture("pooled", 0.5, 5))).toMatchObject({
      eligible: false, expectedKills: 50,
    });
  });

  it.each([1, 2, 3, 4])("keeps personal and smaller-party work bounded for %i players", (partySize) => {
    const plan: CampaignPlan = { ...fixture("pooled", 0.5, 12), sharedQuestsOnly: true };
    const cost = partyQuestLootCost(102, plan, undefined, partySize);
    expect(cost.eligible).toBe(false);
    expect(cost.expectedKills).toBeGreaterThan(20);
  });

  it("still rejects ten rare drops per player requiring roughly five hundred kills", () => {
    const plan: CampaignPlan = { ...fixture("pooled", 0.1, 10), sharedQuestsOnly: true };
    expect(partyQuestLootCost(102, plan)).toMatchObject({ eligible: false, expectedKills: 500 });
  });
});


describe("mixed captured camp rates", () => {
  function mixed(quantity = 1): CampaignPlan {
    const original = fixture("pooled", 0.5, 30), base = original.combat!;
    const high = base.activities[0]!.objectives[0]!;
    const rare: CombatObjective = { ...high, objectiveIndex: 2, npcIds: [118],
      loot: { itemId: 726, quantity, sharing: "pooled" } };
    return { ...original, sharedQuestsOnly: true, combat: { ...base,
      npcs: [117, 118].map((id) => ({ id, name: `Camp creature ${id}`,
        minimumLevel: 3, maximumLevel: 4, rank: 0, zoneIds: [12], xpEligibility: "assumed" })),
      activities: [{ ...base.activities[0]!, objectives: [high, rare] }],
      lootDrops: [...base.lootDrops!, { ...base.lootDrops![0]!, npcId: 118, itemId: 726, probability: 0.1 }],
    } };
  }

  it("keeps the complete cost while budgeting the small rare objective separately", () => {
    const plan = mixed(), before = structuredClone(plan);
    expect(partyQuestLootCost(102, plan)).toMatchObject({ eligible: true, expectedKills: 350,
      budgetedKills: { expectedKills: 50 } });
    expect(partyQuestLootCost(102, plan).retainedByDropRate).toBeUndefined();
    expect(plan).toEqual(before);
  });

  it("still rejects a four-hundred-kill rare objective", () => {
    expect(partyQuestLootCost(102, mixed(8))).toMatchObject({ eligible: false, expectedKills: 700,
      budgetedKills: { expectedKills: 400 } });
  });

  it.each(["non-shared", "smaller-party", "unknown-creature", "elite", "override", "duplicate-rate"])(
    "retains the existing camp qualification: %s", (reason) => {
      const original = mixed();
      const { sharedQuestsOnly, ...unshared } = original;
      expect(sharedQuestsOnly).toBe(true);
      const plan: CampaignPlan = { ...(reason === "non-shared" ? unshared : original),
        combat: { ...original.combat!,
          npcs: reason === "unknown-creature" ? [] : original.combat!.npcs.map((npc) =>
            reason === "elite" && npc.id === 117 ? { ...npc, rank: 1 } : npc),
          lootDrops: reason === "duplicate-rate"
            ? [...original.combat!.lootDrops!, original.combat!.lootDrops![0]!]
            : original.combat!.lootDrops!.map((drop) => reason === "override" && drop.npcId === 117
              ? { ...drop, probabilityBasis: "reported-override" } : drop),
        },
      };
      expect(partyQuestLootCost(102, plan, undefined, reason === "smaller-party" ? 2 : 5).eligible).toBe(false);
    },
  );
});
