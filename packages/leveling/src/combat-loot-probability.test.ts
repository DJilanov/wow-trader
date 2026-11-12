import { describe, expect, it } from "vitest";
import { questLootDropSchema, type QuestLootDrop } from "./quest-loot.js";
import { resolveCombatQuota } from "./combat-loot.js";
import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";

function drop(questOnly = true): QuestLootDrop {
  return questLootDropSchema.parse({
    itemId: 773,
    npcId: 40,
    probability: 0.22,
    probabilityBasis: "sample-ratio",
    minimumQuantity: 1,
    maximumQuantity: 1,
    sampleSize: 100,
    targetBuild: 70205,
    sourceBuild: null,
    sourceUrl: "https://example.test/item=773",
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
      itemId: 773,
      npcId: 40,
      lootEntry: 40,
      probability: 0.5,
      questOnly,
      rateMultiplier: 1,
    },
  });
}
function quota(value: QuestLootDrop): ReturnType<typeof resolveCombatQuota> {
  const objective: CombatObjective = {
    questId: 47,
    objectiveIndex: 1,
    npcIds: [40],
    requiredKills: null,
    credit: "personal-loot",
    source: "Synthetic quest step",
    reason: null,
    loot: { itemId: 773, quantity: 10, sharing: "pooled" },
  };
  const combat: CampaignCombatPlan = {
    revision: "fixture",
    sourceRevision: "fixture",
    targetBuild: 70205,
    npcs: [],
    activities: [],
    notice: null,
    lootDrops: [value],
  };
  return resolveCombatQuota(objective, combat, 1, "expected");
}
describe("captured loot probability selection", () => {
  it("uses the captured bandana rate for the full party instead of the historical eighty percent", () => {
    const value = drop();
    const bandana: QuestLootDrop = {
      ...value,
      itemId: 752,
      npcId: 38,
      probability: 9 / 19,
      sampleSize: 19,
      sourceUrl: "https://www.wowhead.com/forever/item=752/red-burlap-bandana",
      capturedAt: "2026-10-20T07:02:34.980Z",
      probabilityReference: {
        ...value.probabilityReference!,
        itemId: 752,
        npcId: 38,
        probability: 0.8,
      },
    };
    const objective: CombatObjective = {
      questId: 18,
      objectiveIndex: 1,
      npcIds: [38],
      requiredKills: null,
      credit: "personal-loot",
      source: "Northshire bandana objective",
      reason: null,
      loot: { itemId: 752, quantity: 12, sharing: "pooled" },
    };
    const combat: CampaignCombatPlan = {
      revision: "fixture",
      sourceRevision: "fixture",
      targetBuild: 70205,
      npcs: [],
      activities: [],
      notice: null,
      lootDrops: [bandana],
    };
    const before = structuredClone(bandana);
    const result = resolveCombatQuota(objective, combat, 5, "expected");
    expect(result).toMatchObject({ kills: 127 });
    expect(result.lootEstimate!.expectedKills).toBeCloseTo(60 / (9 / 19));
    expect(result.source).toContain("Captured drop-table estimate");
    expect(result.source).toContain(bandana.sourceUrl);
    expect(bandana).toEqual(before);
  });

  it("uses the captured estimate ahead of historical context and preserves both records", () => {
    const value = drop(),
      before = JSON.stringify(value);
    const result = quota(value);
    expect(result).toMatchObject({ kills: 46, lootEstimate: { expectedKills: 10 / 0.22 } });
    expect(result.source).toContain("Captured drop-table estimate 0.22");
    expect(result.source).toContain(value.capturedAt);
    expect(result.source).toContain(value.sourceUrl);
    expect(result.source).not.toContain("quest-roll probability");
    expect(JSON.stringify(value)).toBe(before);
    expect(value.probability).toBe(0.22);
  });
  it("labels a fixed-one captured sample as an estimate without requiring a historical rate", () => {
    const value = drop();
    delete value.probabilityReference;
    expect(quota(value)).toMatchObject({
      kills: 46,
      reason: null,
      source: expect.stringContaining("Captured drop-table estimate 0.22"),
    });
  });
  it("retains the sample rate when historical context establishes an ordinary drop", () => {
    expect(quota(drop(false))).toMatchObject({
      kills: 46,
      lootEstimate: { expectedKills: 10 / 0.22 },
    });
  });
  it("preserves reported/override priority over a historical quest rate", () => {
    for (const probabilityBasis of ["reported", "reported-override"] as const)
      expect(quota({ ...drop(), probability: 0.25, probabilityBasis })).toMatchObject({
        kills: 40,
      });
  });
  it("retains the captured-build guard independently of the historical source build", () => {
    expect(quota({ ...drop(), sourceBuild: 70450 })).toMatchObject({
      kills: null,
      reason: "The drop reference was captured for a different client build.",
    });
  });
  it("rejects mismatched item, creature, stack and unsupported rate context", () => {
    for (const override of [
      { itemId: 1 },
      { npcId: 1 },
      { minimumQuantity: 2, maximumQuantity: 2 },
    ])
      expect(questLootDropSchema.safeParse({ ...drop(), ...override }).success).toBe(false);
    const value = drop();
    expect(
      questLootDropSchema.safeParse({
        ...value,
        probabilityReference: { ...value.probabilityReference, rateMultiplier: 2 },
      }).success,
    ).toBe(false);
  });
});
