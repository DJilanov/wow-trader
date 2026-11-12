import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { clientQuestRewardReferenceSchema } from "./quest-client-reward.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/vahlarriel-vengeance-70205.json" with { type: "json" };

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, difficultyPolicy: "experienced-premade",
    members: initial.members.map((member, index) => ({ ...member, raceId: "human",
      classSlug: classes[index]!, level: 30, currentXp: 0, xpNeedsUpdate: false })),
  };
}

function batch(state = progress()): ReturnType<typeof campaignFundingBatch> {
  const catalog = questCatalogSchema.parse(fixture.catalog), quest = catalog.quests[0]!;
  return campaignFundingBatch(quest, catalog, combatDatasetSchema.parse(fixture.combat), state, {
    legId: "desolace", checkpointId: "departure", targetLevel: 34,
    previous: quest.starts[0]!.positions[0]!, resumeZone: "1443", maximumQuestLevel: 34,
    forbiddenQuestIds: new Set(), leaderOnly: false, sharedQuestsOnly: true,
  });
}

function component(): CampaignPlan {
  const selected = batch();
  if (!selected) throw new Error("Captured Vahlarriel candidate did not qualify");
  const reward = fixture.reward;
  return attachCampaignCombat({ release: "vahlarriel-pool-fixture", race: "human", leaderClass: "warrior",
    targetBuild: 70205, sourceArchiveSha256: fixture.catalog.sourceArchiveSha256,
    sharedQuestsOnly: true, sharedSourceQuestIds: [97284], actions: selected.actions,
    legs: [{ id: "desolace", title: "Desolace", kind: "preparation", from: 30, to: 34, stopId: null,
      actionIds: selected.actions.map((action) => action.id), questIds: [97284], unresolvedQuestIds: [] }],
    rewardFacts: [{ questId: reward.questId, fullXp: reward.fullXp, rewardBasis: "final-reward",
      questLevel: reward.questLevel, minimumLevel: reward.minimumLevel, xpByLevel: reward.xpByLevel,
      status: "available", evidenceKind: "client-table-reference",
      clientReference: clientQuestRewardReferenceSchema.parse(reward.clientReference),
      referenceBaseXp: reward.referenceBaseXp, capturedAt: reward.capturedAt, sourceUrl: reward.sourceUrl,
    }],
  }, [], combatDatasetSchema.parse(fixture.combat), fixture.provenance.candidate.combat.sha256);
}

describe("sourced shared kill quests outside the solo archive", () => {
  it("retains all four captured counters and counts sixteen group kills", () => {
    expect(batch()).toMatchObject({ questIds: [97284], requiredKills: 16 });
    expect(component().combat!.activities.flatMap((activity) => activity.objectives)
      .map((objective) => [objective.npcIds, objective.requiredKills, objective.credit]))
      .toEqual([4663, 4664, 4665, 4666].map((id) => [[id], 4, "shared-kills"]));
  });

  it("enforces the actual minimum for every party member", () => {
    const state = progress();
    state.members[4]!.level = 29;
    expect(batch(state)).toBeNull();
  });

  it.each(["fast", "expected", "slow"] as const)("retains the full reward and kill workload: %s", (lootScenario) => {
    for (const member of forecastCampaignXp(component(), progress(), { lootScenario })[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[97284, 2650]]);
      expect(member.combatRows.reduce((sum, row) => sum + row.kills, 0)).toBe(16);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.questLog.peak).toBeLessThanOrEqual(40);
    }
  });

  it("exports each original counter once in both native roles", () => {
    const plan = component(), addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.2.0-review.vahlarriel", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", nativeSources: [],
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      for (const index of [1, 2, 3, 4])
        expect(text.match(new RegExp(`\\.complete 97284,${index}\\b`, "g"))).toHaveLength(1);
    }
  });
});
