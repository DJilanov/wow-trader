import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignNarrativeEvents } from "./campaign-narrative-events.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/desolace-supplied-tools-70205.json" with { type: "json" };

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
    catalog, combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-supplied-tools", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: catalog.quests.map((quest) => quest.questId),
      actions: [], legs: [], rewardFacts: rewards },
  };
}

function component(data: ReturnType<typeof input>, questId: number): CampaignPlan {
  const method = questId === 6134
    ? campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog).get(questId)
    : campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).get(questId);
  if (!method) throw new Error(`Incomplete supplied-tool method ${questId}`);
  const actions = method.actions.map((action) => ({ ...action, legId: "tools" }));
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "tools", title: "Desolace", kind: "preparation", from: 35, to: 40,
      stopId: null, actionIds: actions.map((action) => action.id), questIds: [questId], unresolvedQuestIds: [] }],
  }, data.sources, data.combat, fixture.provenance.inputs.combat.sha256);
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, difficultyPolicy: "experienced-premade",
    members: initial.members.map((member, index) => ({ ...member, raceId: "human", classSlug: classes[index]!,
      level: 35, currentXp: 0, xpNeedsUpdate: false })),
  };
}

describe("complete source methods using quest-supplied tools", () => {
  it("retains the full five-player Ghost-o-plasm quota and its supplied-item instructions", () => {
    const data = input(), before = structuredClone(data);
    const method = campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog).get(6134);
    expect(method).toMatchObject({ expectedKills: 40, slowKills: 40, maximumEnemyLevel: 39 });
    expect(method?.actions.map((action) => action.questChanges[0]!.state))
      .toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(method?.actions[1]!.instructions.join("\n")).toContain("Use the [Crate of Ghost Magnets]");
    expect(data).toEqual(before);
  });

  it.each([6134, 5561])("replays quest %i and a saved objective for all five classes", (questId) => {
    const data = input(), plan = component(data, questId), state = progress();
    for (const lootScenario of ["fast", "expected", "slow"] as const) {
      const boundary = plan.actions.find((action) => action.questChanges[0]?.state === "objectives-complete")!;
      const forecast = forecastCampaignXp(plan, state, { lootScenario, captureCombatAfterActionIds: [boundary.id] });
      for (const member of forecast[0]!.members) {
        expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
        expect(member.rewards.map((reward) => [reward.questId, reward.xp]))
          .toEqual([[questId, questId === 6134 ? 2250 : 2000]]);
        if (questId === 5561) {
          expect(member.combatXp).toBe(0);
          expect(member.estimatedCombatXp).toBe(0);
        }
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
    }
  });

  it("keeps Kodo capture credit separate from creature deaths", () => {
    const data = input(), plan = component(data, 5561);
    expect(plan.actions[1]!.instructions.join("\n")).toContain("Each player must capture and return 5 Tamed Kodos personally");
    expect(plan.combat!.activities[0]!.objectives[0]).toMatchObject({
      credit: "non-combat", requiredKills: null, npcIds: [],
      combatAccess: { kind: "encounter", npcIds: [4701, 4702] },
    });
  });

  it.each(["missing-use", "wrong-tool", "wrong-target", "extra-counter", "unknown-level", "class-only", "other-requirement"])(
    "does not admit an incomplete collection method: %s", (change) => {
      const data = input();
      const step = data.sources.flatMap(({ guide }) => guide.steps).find((step) =>
        step.directives.some((row) => row.tag === ".complete" && row.questId === 6134))!;
      if (change === "missing-use") step.directives = step.directives.filter((row) => !row.text.startsWith("Use the [Crate"));
      if (change === "wrong-tool") data.catalog.quests.find((quest) => quest.questId === 6134)!.providedItem!.name = "Other Tool";
      if (change === "wrong-target") step.directives.find((row) => row.tag === ".mob")!.arguments = "Other Spectre";
      if (change === "extra-counter") step.directives.find((row) => row.tag === ".complete")!.arguments = "6134,2";
      if (change === "unknown-level") data.combat.npcs.find((npc) => npc.id === 11560)!.maximumLevel = null;
      if (change === "class-only") data.catalog.quests.find((quest) => quest.questId === 6134)!.requiredClasses = 128;
      if (change === "other-requirement") data.catalog.quests.find((quest) => quest.questId === 6134)!.unsupportedRequirements.push("unresolved-objective-text");
      expect(campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog).has(6134)).toBe(false);
    },
  );

  it.each(["source-use", "source-counter", "source-version", "source-return", "class-only"])(
    "retains capture source and access requirements: %s", (change) => {
      const data = input();
      const source = data.sources.find(({ guide }) => guide.chapterId === "chapter-18-35-37-desolace")!;
      if (change === "source-use") source.guide.steps[1]!.directives.find((row) => row.tag === ".use")!.arguments = "1";
      if (change === "source-counter") source.guide.steps[1]!.directives.find((row) => row.tag === ".complete")!.arguments = "5561,2";
      if (change === "source-version") source.guide.version = "changed";
      if (change === "source-return") source.guide.steps[2]!.directives.find((row) => row.tag === ".target")!.arguments = "Other NPC";
      if (change === "class-only") data.catalog.quests.find((quest) => quest.questId === 5561)!.requiredClasses = 128;
      expect(campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).has(5561)).toBe(false);
    },
  );

  it.each([6134, 5561])("exports quest %i's tool method for both addon roles", (questId) => {
    const data = input(), plan = component(data, questId);
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.supplied-tools",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: data.sources });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text.match(new RegExp(`\\.complete ${questId},1\\b`, "g"))).toHaveLength(1);
      expect(text).toContain(questId === 6134 ? "Use the [Crate of Ghost Magnets]" : ".use 13892");
      if (questId === 5561) {
        expect(text).toContain("one at a time");
        expect(text).toContain("5 Tamed Kodos personally");
      }
    }
  });
});
