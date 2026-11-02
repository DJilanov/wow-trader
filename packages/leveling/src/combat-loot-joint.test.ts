import { describe, expect, it } from "vitest";
import type { CampaignCombatPlan, CombatActivity, CombatObjective } from "./combat-model.js";
import { applyCampaignCombat, createCampaignCombatState } from "./campaign-combat.js";
import { resolveJointCombatQuota } from "./combat-loot-joint.js";
import { emptyPremadeProgress } from "./premade-model.js";

function fixture(questIds: readonly number[] = [100, 200]): CampaignCombatPlan {
  const objectives: CombatObjective[] = questIds.map((questId) => ({
    questId,
    objectiveIndex: 1,
    npcIds: [1],
    requiredKills: null,
    credit: "personal-loot",
    source: "Synthetic joint step",
    reason: null,
    loot: { itemId: questId, quantity: 1, sharing: "shared-roll" },
  }));
  const activity: CombatActivity = {
    id: "joint",
    actionId: "joint",
    environment: "outdoor",
    objectives,
    profile: null,
  };
  return {
    revision: "fixture",
    sourceRevision: "fixture",
    targetBuild: 70205,
    notice: null,
    activities: [activity],
    npcs: [
      {
        id: 1,
        name: "Creature",
        minimumLevel: 10,
        maximumLevel: 10,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    lootDrops: questIds.map((itemId) => ({
      itemId,
      npcId: 1,
      probability: 0.5,
      probabilityBasis: "reported",
      minimumQuantity: 1,
      maximumQuantity: 1,
      sampleSize: 100,
      targetBuild: 70205,
      sourceUrl: "https://example.test/item",
      sourceSha256: "a".repeat(64),
      capturedAt: "2026-11-01T00:00:00.000Z",
      probabilityReference: {
        kind: "classic-1.12-reference",
        repository: "https://github.com/cmangos/classic-db",
        revision: "b".repeat(40),
        file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
        sha256: "c".repeat(64),
        sourceBuild: 5875,
        referencedAt: "2026-11-01T00:00:00.000Z",
        itemId,
        npcId: 1,
        lootEntry: 1,
        probability: 0.5,
        questOnly: true,
        rateMultiplier: 1,
      },
    })),
  };
}
describe("joint collection quotas in chronological combat", () => {
  it("applies a required kill floor without fabricating a second quest objective", () => {
    const combat = fixture([100]);
    const result = resolveJointCombatQuota(
      combat.activities[0]!.objectives,
      combat,
      1,
      "expected",
      3,
    );
    expect(result).toMatchObject({
      status: "estimated",
      kills: 4,
      estimate: { expectedKills: 3.25 },
    });
    for (const floor of [-1, 0.5, Number.NaN, 10001])
      expect(() =>
        resolveJointCombatQuota(combat.activities[0]!.objectives, combat, 1, "expected", floor),
      ).toThrow("kill floor");
  });
  it("counts one compound kill budget and never pays the second objective again", () => {
    const combat = fixture(),
      state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const result = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[0]!,
      questStates: { 100: "accepted", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kills: 3, xp: 285 });
    expect(result.rows[0]!.lootEstimate?.expectedKills).toBeCloseTo(8 / 3, 9);
    const repeated = applyCampaignCombat({
      combat,
      state,
      activity: {
        ...combat.activities[0]!,
        id: "second",
        objectives: [combat.activities[0]!.objectives[1]!],
      },
      questStates: { 100: "objectives-complete", 200: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 285 },
    });
    expect(repeated).toMatchObject({ xp: 0, rows: [], issues: [] });
  });
  it("does not multiply shared-copy drops by party size", () => {
    const combat = fixture(),
      state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const result = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[0]!,
      questStates: { 100: "accepted", 200: "accepted" },
      partySize: 5,
      synchronizedParty: true,
      partyLevels: [10, 10, 10, 10, 10],
      position: { level: 10, currentXp: 0 },
    });
    expect(result.rows[0]).toMatchObject({ kills: 3, xp: 57 });
  });
  it("holds unknown starting inventory and does not assume independence from marginal rates", () => {
    for (const kind of ["inventory", "dependence"] as const) {
      const combat = fixture();
      if (kind === "dependence")
        for (const drop of combat.lootDrops!) delete drop.probabilityReference;
      const member = emptyPremadeProgress().members[0]!;
      const state = createCampaignCombatState(
        combat,
        kind === "inventory"
          ? { ...member, questStates: { 100: "accepted", 200: "accepted" } }
          : member,
      );
      const result = applyCampaignCombat({
        combat,
        state,
        activity: combat.activities[0]!,
        questStates: { 100: "accepted", 200: "accepted" },
        partySize: 1,
        position: { level: 10, currentXp: 0 },
      });
      expect(result.xp).toBe(0);
      expect(result.rows).toEqual([]);
    }
  });
  it("rejects shared item consumption and incompatible reference templates", () => {
    const combat = fixture(),
      objectives = combat.activities[0]!.objectives;
    expect(
      resolveJointCombatQuota(
        [objectives[0]!, { ...objectives[1]!, loot: { ...objectives[1]!.loot!, itemId: 100 } }],
        combat,
        1,
        "expected",
      ),
    ).toMatchObject({ status: "unknown", reason: expect.stringContaining("same item") });
    combat.lootDrops![1]!.probabilityReference!.lootEntry = 2;
    expect(resolveJointCombatQuota(objectives, combat, 1, "expected")).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("independent"),
    });
  });
  it("combines a deterministic kill count with a single random collection without a correlation assumption", () => {
    const combat = fixture(),
      first = combat.activities[0]!.objectives[0]!;
    const second: CombatObjective = {
      ...combat.activities[0]!.objectives[1]!,
      credit: "shared-kills",
      requiredKills: 3,
    };
    delete combat.lootDrops![0]!.probabilityReference;
    const result = resolveJointCombatQuota([first, second], combat, 1, "expected");
    expect(result).toMatchObject({
      status: "estimated",
      kills: 4,
      estimate: { expectedKills: 3.25 },
    });
  });
  it("counts the known collection prefix while preserving unknown overlapping inventory", () => {
    const base = fixture(),
      other: CombatObjective = {
        questId: 300,
        objectiveIndex: 1,
        npcIds: [1, 2],
        requiredKills: null,
        credit: "personal-loot",
        source: "Unknown additional collection",
        reason: null,
        loot: { itemId: 300, quantity: 6, sharing: "unknown" },
      };
    const combat = {
      ...base,
      activities: [
        ...base.activities,
        { ...base.activities[0]!, id: "later", actionId: "later", objectives: [other] },
      ],
    };
    const state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const first = applyCampaignCombat({
      combat,
      state,
      activity: combat.activities[0]!,
      questStates: { 100: "accepted", 200: "accepted", 300: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(first.xp).toBe(285);
    expect(state.counters.get("300:1")).toBeNull();
    const upgraded = fixture([100, 200, 300]);
    const later = applyCampaignCombat({
      combat: upgraded,
      state,
      activity: {
        ...upgraded.activities[0]!,
        id: "later",
        objectives: [upgraded.activities[0]!.objectives[2]!],
      },
      questStates: { 100: "objectives-complete", 200: "objectives-complete", 300: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: first.xp },
    });
    expect(later.xp).toBe(0);
    expect(later.issues.join(" ")).toContain("already in progress");
  });
  it("does not invalidate a completed objective when another pair is collected", () => {
    const combat = fixture([100, 200, 300]),
      state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    state.counters.set("100:1", 2);
    const result = applyCampaignCombat({
      combat,
      state,
      activity: { ...combat.activities[0]!, objectives: combat.activities[0]!.objectives.slice(1) },
      questStates: { 100: "accepted", 200: "accepted", 300: "accepted" },
      partySize: 1,
      position: { level: 10, currentXp: 0 },
    });
    expect(result.xp).toBe(285);
    expect(state.counters.get("100:1")).toBe(2);
  });
});
