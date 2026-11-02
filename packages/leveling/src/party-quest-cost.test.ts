import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import type { CombatObjective } from "./combat-model.js";
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

describe("five-player quest-item cost", () => {
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
