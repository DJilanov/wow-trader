import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/bangalash-optional-flash-bomb-70205.json" with { type: "json" };

function input(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const rewards = questRewardFactSchema.array().parse(fixture.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward } = fact;
    return { ...reward, ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
    };
  });
  const catalog = questCatalogSchema.parse(fixture.catalog);
  return {
    sources: fixture.guides.map((raw) => {
      const guide = importedChapterSchema.parse(raw);
      return { guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! };
    }),
    catalog,
    combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-optional-trophy-utility", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: catalog.quests.map((quest) => quest.questId),
      actions: [], legs: [], rewardFacts: rewards },
  };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, difficultyPolicy: "experienced-premade",
    members: initial.members.map((member, index) => ({ ...member, raceId: "human", classSlug: classes[index]!,
      level: 39, currentXp: 0, xpNeedsUpdate: false,
      questStates: { "188": "rewarded", "193": "rewarded", "197": "rewarded" },
    })),
  };
}

function collection(data: ReturnType<typeof input>): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog);
}

function component(data: ReturnType<typeof input>): CampaignPlan {
  const selected = collection(data).get(208);
  if (!selected) throw new Error("Captured optional trophy utility did not qualify");
  const actions = selected.actions.map((action) => ({ ...action, legId: "trophy" }));
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "trophy", title: "Big Game Hunter", kind: "preparation", from: 39, to: 43,
      stopId: null, actionIds: actions.map((action) => action.id), questIds: [208], unresolvedQuestIds: [] }],
  }, data.sources, data.combat, fixture.provenance.combat.sha256);
}

describe("captured optional trophy consumables", () => {
  it("keeps the optional Flash Bomb separate from the complete trophy objective", () => {
    const data = input(), before = structuredClone(data), selected = collection(data).get(208);
    expect(selected).toMatchObject({ expectedKills: 2, maximumEnemyLevel: 43 });
    expect(selected?.actions.map((action) => action.questChanges[0]!.state))
      .toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(data).toEqual(before);
  });

  it.each(["fast", "expected", "slow"] as const)("preserves the five-player reward and saved trophy: %s", (lootScenario) => {
    const data = input(), plan = component(data), state = progress();
    const boundary = plan.actions.find((action) => action.questChanges[0]?.state === "objectives-complete")!;
    const forecast = forecastCampaignXp(plan, state, { lootScenario, captureCombatAfterActionIds: [boundary.id] });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[208, 5350]]);
      expect(member.estimatedCombatXp).toBe(0);
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

  it.each(["mandatory-tool", "contradictory-tool", "other-tool", "other-creature", "personal-heads", "two-heads", "wrong-counter", "unknown-level"] as const)(
    "does not discard a real requirement: %s", (reason) => {
      const data = input();
      for (const source of data.sources) for (const step of source.guide.steps) {
        for (const directive of step.directives) {
          if (reason === "mandatory-tool" && directive.tag === "text" && directive.text.startsWith("If you saved"))
            directive.text = "Use the Flash Bomb to summon King Bangalash before fighting.";
          if (reason === "contradictory-tool" && directive.tag === "text" && directive.text.startsWith("If you saved"))
            directive.text += ". You must use the bomb to complete the quest.";
          if (reason === "other-tool" && directive.tag === ".use") directive.arguments = "7297";
          if (reason === "other-creature" && directive.tag === ".mob") directive.arguments = "Another Tiger";
          if (reason === "wrong-counter" && directive.tag === ".complete") directive.arguments = "208,2";
        }
      }
      const item = data.combat.quests[0]!.itemObjectives![0]!;
      if (reason === "personal-heads") item.sharing = "pooled";
      if (reason === "two-heads") item.quantity = 2;
      if (reason === "unknown-level") data.combat.npcs[0]!.maximumLevel = null;
      expect(collection(data).has(208)).toBe(false);
    },
  );

  it("exports the original optional advice and use button in both roles", () => {
    const data = input(), plan = component(data);
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.optional-trophy",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: data.sources });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text.match(/\.complete 208,1\b/g)).toHaveLength(1);
      expect(text).toContain(".use 4852");
      expect(text).toContain("If you saved the [Flash Bomb]");
    }
  });
});
