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
describe("quest-eligible loot probability selection", () => {
  it("uses a separate historical quest roll instead of an aggregate sample and preserves the capture", () => {
    const value = drop(),
      before = JSON.stringify(value);
    const result = quota(value);
    expect(result).toMatchObject({ kills: 20, lootEstimate: { expectedKills: 20 } });
    expect(result.source).toContain("quest-roll probability 0.5");
    expect(result.source).toContain("not a measured Forever rate");
    expect(JSON.stringify(value)).toBe(before);
    expect(value.probability).toBe(0.22);
  });
  it("holds aggregate samples whose eligible attempts are unknown", () => {
    const value = drop();
    delete value.probabilityReference;
    expect(quota(value)).toMatchObject({
      kills: null,
      reason: expect.stringContaining("quest eligibility"),
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
