import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/arathi-mixed-camp-691-70205.json" with { type: "json" };

function input(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const guide = importedChapterSchema.parse(fixture.guide);
  const rewards = questRewardFactSchema.array().parse(fixture.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward } = fact;
    return { ...reward, ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
    };
  });
  return { sources: [{ guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! }],
    catalog: questCatalogSchema.parse(fixture.catalog), combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-mixed-camp-collection", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: [691], actions: [], legs: [], rewardFacts: rewards },
  };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...base, difficultyPolicy: "experienced-premade",
    members: base.members.map((member, index) => ({ ...member, raceId: "human", classSlug: classes[index]!,
      level: 35, currentXp: 0, xpNeedsUpdate: false })),
  };
}

function collection(data: ReturnType<typeof input>): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog);
}

function component(data: ReturnType<typeof input>): CampaignPlan {
  const selected = collection(data).get(691);
  if (!selected) throw new Error("Captured mixed-camp collection did not qualify");
  const actions = selected.actions.map((action) => ({ ...action, legId: "arathi" }));
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "arathi", title: "Arathi", kind: "preparation", from: 35, to: 39, stopId: null,
      actionIds: actions.map((action) => action.id), questIds: [691], unresolvedQuestIds: [] }],
  }, data.sources, data.combat, fixture.provenance.combat.sha256);
}

describe("complete quests with separately qualified high and low drop camps", () => {
  it("preserves the full party workload while bounding only the small rare objective", () => {
    const data = input(), before = structuredClone(data), selected = collection(data).get(691);
    expect(selected).toMatchObject({ expectedKills: 277, slowKills: 341,
      budgetedKills: { expectedKills: 51, slowKills: 79 } });
    expect(selected?.retainedByDropRate).toBeUndefined();
    const plan = component(data), objectives = plan.combat!.activities.flatMap((activity) => activity.objectives);
    expect(objectives.map((objective) => [objective.npcIds, objective.loot?.quantity, objective.loot?.sharing]))
      .toEqual([[[2552], 10, "pooled"], [[2555], 4, "pooled"], [[2557], 1, "pooled"]]);
    expect(data).toEqual(before);
  });

  it("keeps the ordinary enemy limit for the lowest participant", () => {
    const data = input(), state = progress();
    state.members[4]!.level = 31;
    expect(campaignFundingBatch(data.catalog.quests[0]!, data.catalog, data.combat, state, {
      legId: "arathi", checkpointId: "departure", targetLevel: 39, previous: { zone: "1417", x: 46.2, y: 47.75 },
      resumeZone: "1417", maximumQuestLevel: 39, forbiddenQuestIds: new Set(), leaderOnly: false,
      sharedQuestsOnly: true, sourceCollections: collection(data),
    })).toBeNull();
  });

  it.each(["fast", "expected", "slow"] as const)("preserves XP and saved item counters: %s", (lootScenario) => {
    const data = input(), plan = component(data), state = progress();
    const boundary = plan.actions.find((action) => action.questChanges.some((change) => change.state === "objectives-complete"))!;
    const forecast = forecastCampaignXp(plan, state, { lootScenario, captureCombatAfterActionIds: [boundary.id] });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[691, 3500]]);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.questLog.peak).toBeLessThanOrEqual(40);
    }
    const handoff = campaignRouteHandoff({ difficultyPolicy: state.difficultyPolicy, starterMode: "together",
      strategy: "dungeons", optionalStops: true, lootScenario, sourceBuild: 70205,
      progress: state, actions: plan.actions, forecast }, boundary.id);
    const index = plan.actions.findIndex((action) => action.id === boundary.id) + 1;
    const restored = forecastCampaignXp(plan, premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress))), {
      lootScenario, fromActionId: plan.actions[index]!.id, initialBounds: handoff.xpBounds,
      initialCombatProjection: JSON.parse(JSON.stringify(handoff.combatProjection)),
    });
    for (let player = 0; player < 5; player++) expect(restored.flatMap((section) => section.members[player]!.steps))
      .toEqual(forecast.flatMap((section) => section.members[player]!.steps).filter((step) =>
        plan.actions.findIndex((action) => action.id === step.actionId) >= index));
  });

  it.each(["missing-rate", "large-rare-quota"])("does not accept %s", (reason) => {
    const data = input();
    if (reason === "missing-rate") data.combat.lootDrops = data.combat.lootDrops!.filter((drop) => drop.itemId !== 5040);
    else data.combat.quests[0]!.itemObjectives![2]!.quantity = 8;
    expect(collection(data).has(691)).toBe(false);
  });

  it("exports each original counter once and retains the three selected camps", () => {
    const data = input(), plan = component(data), addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.2.0-review.mixed-camp", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", nativeSources: data.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      for (const index of [1, 2, 3]) expect(text.match(new RegExp(`\\.complete 691,${index}\\b`, "g"))).toHaveLength(1);
      for (const name of ["Witherbark Troll", "Witherbark Witch Doctor", "Witherbark Shadow Hunter"])
        expect(text).toContain(name);
      expect(text).not.toContain(".maxlevel 40");
    }
  });
});
