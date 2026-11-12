import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { clientQuestRewardReferenceSchema } from "./quest-client-reward.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/kurzen-loot-approach-70205.json" with { type: "json" };

function input(): {
  sources: CampaignSource[];
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
  plan: CampaignPlan;
} {
  const sources = fixture.sources.map((entry): CampaignSource => ({
    reference: CHAPTER_REFERENCES.find((row) => row.id === entry.referenceId)!,
    guide: importedChapterSchema.parse(entry.guide),
  }));
  const reward = fixture.reward;
  return { sources, catalog: questCatalogSchema.parse(fixture.catalog),
    combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-loot-approach", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixture.catalog.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: fixture.catalog.quests.map((quest) => quest.questId),
      actions: [], legs: [], rewardFacts: [{ questId: reward.questId, fullXp: reward.fullXp,
        rewardBasis: "final-reward", questLevel: reward.questLevel, minimumLevel: reward.minimumLevel,
        xpByLevel: reward.xpByLevel, status: "available", evidenceKind: "client-table-reference",
        clientReference: clientQuestRewardReferenceSchema.parse(reward.clientReference),
        referenceBaseXp: reward.referenceBaseXp, capturedAt: reward.capturedAt, sourceUrl: reward.sourceUrl,
      }],
    },
  };
}

function progress(level = 36): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...base, difficultyPolicy: "experienced-premade",
    members: base.members.map((member, index) => ({ ...member,
      raceId: "human", classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
      questStates: { "574": "rewarded" as const },
    })),
  };
}

function qualify(data: ReturnType<typeof input>): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog);
}

function batch(data: ReturnType<typeof input>, state = progress()): ReturnType<typeof campaignFundingBatch> {
  return campaignFundingBatch(data.catalog.quests.find((quest) => quest.questId === 202)!,
    data.catalog, data.combat, state, { legId: "kurzen", checkpointId: "departure", targetLevel: 40,
      previous: { zone: "1434", x: 38.04, y: 3.01 }, resumeZone: "1434", maximumQuestLevel: 99,
      forbiddenQuestIds: new Set(), leaderOnly: false, sharedQuestsOnly: true,
      sourceCollections: qualify(data), includeCatalogApproaches: true,
    });
}

describe("separate sourced approaches for waypoint-free loot counters", () => {
  it("qualifies every captured counter without inventing a third creature-kill objective", () => {
    const data = input(), before = structuredClone(data);
    expect(data.catalog.quests.find((quest) => quest.questId === 202)!.objectives.map((row) => row.index))
      .toEqual([1, 2]);
    expect(qualify(data).get(202)).toMatchObject({ npcId: 813, objectiveIndex: 3,
      expectedKills: 1, slowKills: 1, maximumEnemyLevel: 40 });
    expect(batch(data)).toMatchObject({ questIds: [202], requiredKills: 11 });
    expect(data).toEqual(before);
  });

  it("keeps the NPC approach separate from the original source counter", () => {
    const data = input(), selected = batch(data);
    expect(selected).not.toBeNull();
    expect(selected!.actions.find((action) => action.questChanges.some((change) =>
      change.questId === 202 && change.state === "accepted"))?.source?.stepId)
      .toBe("source-step-0080");
    const index = selected!.actions.findIndex((action) => action.questChanges.some((change) =>
      change.questId === 202 && change.state === "objectives-complete" && change.objectiveIndex === 3));
    const counter = selected!.actions[index]!, approach = selected!.actions[index - 1]!;
    expect(counter.source?.stepId).toBe("source-step-0059");
    expect(counter.positions).toEqual([]);
    expect(approach.source).toBeNull();
    expect(approach.questChanges).toEqual([]);
    expect(approach.positions.map((row) => ({ zone: row.position.zone, x: row.position.x, y: row.position.y })))
      .toEqual(fixture.catalog.quests.find((quest) => quest.questId === 202)!.itemObjectiveLocations![0]!.positions);
  });

  it("keeps every fight within +4 for the lowest party member", () => {
    const data = input(), state = progress();
    state.members[4]!.level = 35;
    expect(batch(data, state)).toBeNull();
    expect(batch(data)).not.toBeNull();
  });

  it.each(["fast", "expected", "slow"] as const)("preserves the shared kills, loot and native counters: %s", (lootScenario) => {
    const data = input(), selected = batch(data)!;
    expect(selected).not.toBeNull();
    const actions = selected.actions;
    const plan = attachCampaignCombat({ ...data.plan, actions,
      legs: [{ id: "kurzen", title: "Kurzen's cave", kind: "preparation", from: 36, to: 40,
        actionIds: actions.map((action) => action.id), questIds: [202], stopId: null, unresolvedQuestIds: [] }],
    }, data.sources, data.combat, "loot-approach-fixture");
    for (const member of forecastCampaignXp(plan, progress(), { lootScenario })[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([202]);
      expect(member.combatRows.reduce((sum, row) => sum + row.kills, 0)).toBe(11);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.questLog.peak).toBeLessThanOrEqual(40);
    }
    const addon = compileCampaignAddon(plan, actions, { version: "0.2.0-review.loot-approach",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: data.sources });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      for (const index of [1, 2, 3])
        expect(text.match(new RegExp(`\\.complete 202,${index}\\b`, "g"))).toHaveLength(1);
    }
  });

  it.each(["missing-location", "wrong-item", "wrong-npc", "wrong-counter", "unknown-level", "rare-npc",
    "class-only", "unknown-item-counter", "quota-conflict"])("does not accept an unproved method: %s", (reason) => {
    const data = input(), quest = data.catalog.quests.find((quest) => quest.questId === 202)!;
    if (reason === "missing-location") delete quest.itemObjectiveLocations;
    if (reason === "wrong-item") quest.itemObjectiveLocations![0]!.itemId = 99999;
    if (reason === "wrong-npc") quest.itemObjectiveLocations![0]!.npcId = 939;
    if (reason === "wrong-counter") quest.itemObjectiveLocations![0]!.index = 2;
    if (reason === "unknown-level") data.combat.npcs.find((npc) => npc.id === 813)!.maximumLevel = null;
    if (reason === "rare-npc") data.combat.npcs.find((npc) => npc.id === 813)!.rank = 4;
    if (reason === "class-only") quest.requiredClasses = 1;
    if (reason === "unknown-item-counter") data.combat.quests.find((row) => row.questId === 202)!.itemObjectives![0]!.objectiveIndex = null;
    if (reason === "quota-conflict") data.combat.quests.find((row) => row.questId === 202)!.killQuotaConflicts = [1];
    expect(qualify(data).has(202)).toBe(false);
  });
  it.each(["duplicate", "creature-counter", "missing-provider-pin", "non-collection"])(
    "rejects invalid catalog loot locations: %s", (reason) => {
      const data = input(), quest = data.catalog.quests.find((row) => row.questId === 202)!;
      if (reason === "duplicate") quest.itemObjectiveLocations!.push({ ...quest.itemObjectiveLocations![0]! });
      if (reason === "creature-counter") quest.itemObjectiveLocations![0]!.index = 1;
      if (reason === "missing-provider-pin") delete data.catalog.itemSha256;
      if (reason === "non-collection") quest.category = "shared-kills";
      expect(questCatalogSchema.safeParse(data.catalog).success).toBe(false);
    },
  );

  it("retains a guard when the independent repeated handoff cannot be proved", () => {
    const data = input();
    data.combat.quests = data.combat.quests.filter((row) => row.questId !== 329);
    expect(qualify(data).has(202)).toBe(false);
  });

});
