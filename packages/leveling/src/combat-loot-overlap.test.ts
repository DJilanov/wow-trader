import { describe, expect, it } from "vitest";
import { applyCampaignCombat, createCampaignCombatState } from "./campaign-combat.js";
import type { CampaignCombatPlan, CombatActivity, CombatObjective } from "./combat-model.js";
import { emptyPremadeProgress } from "./premade-model.js";

function objective(questId: number, npcId = 1): CombatObjective {
  return {
    questId,
    objectiveIndex: 1,
    npcIds: [npcId],
    requiredKills: null,
    credit: "personal-loot",
    source: "Synthetic collection",
    reason: null,
    loot: { itemId: questId, quantity: 1, sharing: "shared-roll" },
  };
}
function activity(id: string, target: CombatObjective): CombatActivity {
  return { id, actionId: id, environment: "outdoor", objectives: [target], profile: null };
}
function fixture(secondNpc = 1): CampaignCombatPlan {
  return {
    revision: "fixture",
    sourceRevision: "fixture",
    targetBuild: 70205,
    notice: null,
    npcs: [1, 2].map((id) => ({
      id,
      name: `Creature ${id}`,
      minimumLevel: 10,
      maximumLevel: 10,
      rank: 0,
      zoneIds: [12],
      xpEligibility: "assumed" as const,
    })),
    activities: [activity("first", objective(100)), activity("second", objective(200, secondNpc))],
    lootDrops: [100, 200].map((itemId, i) => ({
      itemId,
      npcId: i === 0 ? 1 : secondNpc,
      probability: 0.5,
      minimumQuantity: 1,
      maximumQuantity: 1,
      sampleSize: 100,
      targetBuild: 70205,
      sourceUrl: "https://example.test/item",
      sourceSha256: "a".repeat(64),
      capturedAt: "2026-10-31T00:00:00.000Z",
    })),
  };
}

describe("collection XP with overlapping objectives", () => {
  it("counts overlapping guaranteed drops once without holding deterministic inventory", () => {
    const base = fixture();
    const combat = {
      ...base,
      lootDrops: base.lootDrops!.map((drop) => ({ ...drop, probability: 1 })),
    };
    const state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const first = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[0]!,
      questStates: { 100: "accepted", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(first.xp).toBe(95);
    const second = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[1]!,
      questStates: { 100: "objectives-complete", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 95 },
    });
    expect(second.xp).toBe(0);
    expect(second.issues).toEqual([]);
  });
  it("counts the first required collection prefix and holds later uncertain inventory", () => {
    const combat = fixture(),
      state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    // Two independent p=1/2 one-item drops have E[max(T1,T2)]=8/3, not max(2,2)=2.
    const first = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[0]!,
      questStates: { 100: "accepted", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(first.xp).toBe(190);
    expect(first.rows[0]?.kills).toBe(2);
    expect(state.counters.get("200:1")).toBeNull();
    const second = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[1]!,
      questStates: { 100: "objectives-complete", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(second.xp).toBe(0);
  });
  it("still counts deterministic shared kills without inventing remaining loot after them", () => {
    const base = fixture();
    const combat = {
      ...base,
      activities: [
        base.activities[0]!,
        activity("second", {
          ...objective(200),
          credit: "shared-kills" as const,
          requiredKills: 2,
        }),
      ],
    };
    const state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const shared = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[1]!,
      questStates: { 100: "accepted", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(shared.rows[0]?.kills).toBe(2);
    expect(shared.xp).toBe(190);
    expect(
      applyCampaignCombat({
        combat,
        state,
        activity: combat.activities[0]!,
        questStates: { 100: "accepted", 200: "objectives-complete" },
        partySize: 1,
        position: { level: 10, currentXp: shared.xp },
      }).xp,
    ).toBe(0);
  });
  it("keeps separate NPC collections and quests accepted after previous kills calculable", () => {
    for (const secondNpc of [1, 2]) {
      const combat = fixture(secondNpc),
        state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
      const first = applyCampaignCombat({
        combat,
        state,
        activity: combat.activities[0]!,
        questStates: secondNpc === 1 ? { 100: "accepted" } : { 100: "accepted", 200: "accepted" },
        partySize: 1,
        position: { level: 10, currentXp: 0 },
      });
      expect(first.rows[0]?.kills).toBe(2);
      expect(first.xp).toBe(190);
      const second = applyCampaignCombat({
        combat,
        state,
        activity: combat.activities[1]!,
        questStates: { 100: "rewarded", 200: "accepted" },
        partySize: 1,
        position: { level: 10, currentXp: first.xp },
      });
      expect(second.rows[0]?.kills).toBe(2);
      expect(second.xp).toBe(190);
    }
  });
});
