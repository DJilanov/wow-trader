import { describe, expect, it } from "vitest";
import { applyReviewedCombatNpcLevels } from "./combat-reviewed-npc-levels.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { combatNpcMetadataReferenceSchema } from "./combat-npc-metadata.js";
import { estimateCreatureKills } from "./combat-xp.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CampaignPlan } from "./campaign.js";
import ownerLevels from "./combat-owner-confirmed-levels.json" with { type: "json" };

function dataset(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    publication: "private-reference",
    authorizationNote: "Test stub with owner-confirmed level; no payout sample.",
    targetBuild: 70205,
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic stub; no rank or payout evidence."],
    },
    npcs: [
      {
        id: 250660,
        name: "The Baron",
        minimumLevel: null,
        maximumLevel: null,
        rank: 0,
        zoneIds: [16611],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 95250,
        creatureIds: [],
        itemCreatureIds: [250660],
        objectiveText: ["Collect the Head of the Baron in the Ruins of Lordaeron."],
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 268518,
            itemName: "Head of the Baron",
            quantity: 1,
            npcIds: [250660],
            sharing: "unknown",
          },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}

describe("owner-confirmed Baron level", () => {
  it("fills level 17 and keeps rank, boss identity and payout unqualified", () => {
    const input = dataset(),
      before = JSON.stringify(input);
    const result = applyReviewedCombatNpcLevels(input);
    expect(result.npcs[0]).toEqual({
      ...input.npcs[0],
      minimumLevel: 17,
      maximumLevel: 17,
      rank: null,
    });
    expect(result.npcMetadataReferences?.[0]).toMatchObject({
      npcId: 250660,
      rank: null,
      rankSource: null,
      levelSource: { kind: "owner-confirmed-creature-level", statement: "Baron is level 17" },
    });
    expect(result.bossReferences).toBeUndefined();
    expect(result.killXpEvidence).toEqual([]);
    const estimate = estimateCreatureKills({
      npc: result.npcs[0]!,
      position: { level: 16, currentXp: 0 },
      kills: 1,
      partySize: 5,
      partyLevels: [16, 16, 16, 16, 16],
      playerIndex: 0,
      environment: "dungeon",
      build: 70205,
      dungeonMultiplier: null,
    });
    expect(estimate).toMatchObject({ xp: null, maximumXp: null, basis: "unknown" });
    expect(applyReviewedCombatNpcLevels(result)).toBe(result);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    "absent",
    "other-name",
    "other-zone",
    "known-level",
    "partial-level",
    "known-rank",
    "excluded",
  ])("preserves unrelated and subsequently sourced data (%s)", (change) => {
    const input = dataset(),
      npc = input.npcs[0]!;
    if (change === "absent") npc.id = 1;
    if (change === "other-name") npc.name = "Other Baron";
    if (change === "other-zone") npc.zoneIds = [1];
    if (change === "known-level") npc.minimumLevel = npc.maximumLevel = 18;
    if (change === "partial-level") npc.maximumLevel = 18;
    if (change === "known-rank") npc.rank = 1;
    if (change === "excluded") npc.xpEligibility = "excluded";
    expect(applyReviewedCombatNpcLevels(input)).toBe(input);
  });

  it("validates level-only provenance and rejects detached or invented rank evidence", () => {
    const result = applyReviewedCombatNpcLevels(dataset());
    const reference = result.npcMetadataReferences![0]!;
    expect(combatDatasetSchema.safeParse(result).success).toBe(true);
    expect(combatNpcMetadataReferenceSchema.safeParse({ ...reference, rank: 1 }).success).toBe(
      false,
    );
    expect(
      combatNpcMetadataReferenceSchema.safeParse({ ...reference, maximumLevel: 18 }).success,
    ).toBe(false);
    result.npcs[0]!.maximumLevel = 18;
    expect(combatDatasetSchema.safeParse(result).success).toBe(false);
  });

  it("uses level 17 in production attachment and the ordinary +4 readiness rule", () => {
    const action = {
      id: "baron",
      legId: "lordaeron",
      title: "The Baron",
      instructions: [],
      positions: [],
      source: null,
      kind: "quests" as const,
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
      questChanges: [
        {
          questId: 95250,
          title: "Abominable Creatures",
          state: "objectives-complete" as const,
          objectiveIndex: 1,
        },
      ],
    };
    const plan: CampaignPlan = {
      release: "owner-level-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [
        {
          id: "lordaeron",
          title: "Ruins of Lordaeron",
          from: 16,
          to: 20,
          kind: "dungeon",
          stopId: "lordaeron",
          actionIds: ["baron"],
          questIds: [95250],
          unresolvedQuestIds: [],
        },
      ],
    };
    const result = attachCampaignCombat(plan, [], dataset(), "owner-level-test");
    const readiness = createCampaignCombatReadiness(result)(action);
    expect(readiness.unknownNpcIds).toEqual([]);
    expect(readiness.targetLevel).toBe(13);
    expect(readiness.nonBossNpcs).toContainEqual(
      expect.objectContaining({ id: 250660, maximumLevel: 17 }),
    );
  });
});

describe("owner-confirmed Excavation and Dalaran levels", () => {
  it.each(ownerLevels)("fills $name at $maximumLevel without granting rank or payout evidence", (reference) => {
    const initial = dataset();
    initial.npcs = [{ id: reference.npcId, name: reference.name, minimumLevel: null, maximumLevel: null,
      rank: 0, zoneIds: reference.expectedZoneIds, xpEligibility: "assumed" }];
    const before = structuredClone(initial);
    const result = applyReviewedCombatNpcLevels(initial);
    expect(result.npcs[0]).toMatchObject({ id: reference.npcId, minimumLevel: reference.minimumLevel,
      maximumLevel: reference.maximumLevel, rank: null });
    expect(result.npcMetadataReferences?.[0]).toMatchObject({ npcId: reference.npcId,
      rank: null, rankSource: null, levelSource: { kind: "owner-confirmed-creature-level", confirmedOn: "2026-11-04" } });
    expect(result.killXpEvidence).toEqual([]);
    expect(result.bossReferences).toBeUndefined();
    expect(combatDatasetSchema.safeParse(result).success).toBe(true);
    expect(applyReviewedCombatNpcLevels(result)).toBe(result);
    expect(initial).toEqual(before);
  });

  it.each(ownerLevels)("keeps subsequently sourced or partially known levels for $name", (reference) => {
    for (const minimumLevel of [null, reference.minimumLevel + 1]) {
      const initial = dataset();
      initial.npcs = [{ id: reference.npcId, name: reference.name, minimumLevel,
        maximumLevel: reference.maximumLevel + 1, rank: 1, zoneIds: reference.expectedZoneIds, xpEligibility: "assumed" }];
      expect(applyReviewedCombatNpcLevels(initial)).toBe(initial);
    }
  });
});
