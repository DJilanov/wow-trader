import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import type { CombatObjective } from "./combat-model.js";
import type { QuestLootDrop } from "./quest-loot.js";
import { partyQuestLootCost } from "./party-quest-cost.js";

function fixture(
  sharing: "pooled" | "independent" | "unknown",
  probability: number,
  quantity: number,
): CampaignPlan {
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
