import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignNarrativeEvents } from "./campaign-narrative-events.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/screecher-spirit-scene-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function input(): { plan: CampaignPlan; sources: CampaignSource[];
  combat: ReturnType<typeof combatDatasetSchema.parse>; catalog: ReturnType<typeof questCatalogSchema.parse> } {
  const sources = fixture.guides.map((raw): CampaignSource => {
    const guide = importedChapterSchema.parse(raw);
    return { guide, reference: CHAPTER_REFERENCES.find((entry) => entry.id === guide.chapterId)! };
  });
  const rewards = questRewardFactSchema.array().parse(fixture.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward } = fact;
    return { ...reward, ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }) };
  });
  return { sources, combat: combatDatasetSchema.parse(fixture.combat), catalog: questCatalogSchema.parse(fixture.catalog),
    plan: { release: "reviewed-screecher-scene", targetBuild: 70205,
      sourceArchiveSha256: fixture.provenance.sourceArchiveSha256, race: "human", leaderClass: "warrior",
      sharedQuestsOnly: true, sharedSourceQuestIds: [3520], rewardFacts: rewards, actions: [], legs: [] } };
}

function component(data: ReturnType<typeof input>): CampaignPlan {
  const method = campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).get(3520);
  if (!method) throw new Error("The captured spirit scene must qualify.");
  const actions = method.actions.map((action) => ({ ...action, legId: "screecher" }));
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "screecher", title: "Screecher Spirits", kind: "preparation", from: 42, to: 44, stopId: null,
      actionIds: actions.map((action) => action.id), questIds: [3520], unresolvedQuestIds: [] }],
  }, data.sources, data.combat, "captured-spirit-scene");
}

function progress(level = 42): ReturnType<typeof emptyPremadeProgress> {
  const empty = emptyPremadeProgress();
  return { ...empty, difficultyPolicy: "experienced-premade", members: empty.members.map((member, index) => ({
    ...member, raceId: "human", classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
  })) };
}

describe("the complete supplied-bramble spirit scene", () => {
  it("keeps corpse use, conversation, all personal credits and the real physical screechers", () => {
    const data = input(), before = structuredClone(data), plan = component(data);
    expect(plan.combat!.activities[0]!.objectives[0]!).toMatchObject({
      questId: 3520, objectiveIndex: 1, credit: "non-combat", npcIds: [], requiredKills: null,
      combatAccess: { kind: "encounter", npcIds: [5307, 5308] },
    });
    expect(plan.actions[1]!.instructions.join("\n")).toContain("Each player needs credit for 3 spirits");
    expect(data).toEqual(before);
  });

  it.each(["fast", "expected", "slow"] as const)("does not invent corpse counts, sharing or kill XP for %s", (lootScenario) => {
    const plan = component(input()), forecast = forecastCampaignXp(plan, progress(), { lootScenario });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([3520]);
      expect(member.rewards[0]!.xp).toBeGreaterThan(0);
      expect(member.combatXp).toBe(0);
      expect(member.estimatedCombatXp).toBe(0);
    }
  });

  it("does not let the neutral spirit remove the actual bird difficulty check", () => {
    const forecast = forecastCampaignXp(component(input()), progress(41));
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("tanaris-rfd-crossing-31-source-step-0037");
      expect(member.blockedReason).toContain("level 42");
      expect(member.rewards).toEqual([]);
    }
  });

  it.each(["fast", "expected", "slow"] as const)("restores the accepted scene and exact remaining events: %s", (lootScenario) => {
    const plan = component(input()), initial = progress(), boundary = plan.actions[0]!.id;
    const forecast = forecastCampaignXp(plan, initial, { lootScenario, captureCombatAfterActionIds: [boundary] });
    const handoff = campaignRouteHandoff({ difficultyPolicy: initial.difficultyPolicy, starterMode: "together",
      strategy: "dungeons", optionalStops: true, lootScenario, sourceBuild: plan.targetBuild,
      progress: initial, actions: plan.actions, forecast }, boundary);
    const resumed = forecastCampaignXp(plan, premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress))), {
      lootScenario, fromActionId: plan.actions[1]!.id, initialBounds: handoff.xpBounds,
      ...(handoff.combatProjection ? { initialCombatProjection: handoff.combatProjection } : {}) });
    for (let player = 0; player < 5; player++) expect(resumed[0]!.members[player]!.steps)
      .toEqual(forecast[0]!.members[player]!.steps.filter((step) => step.actionId !== boundary));
  });

  it.each(["tool", "target", "counter", "provided-item", "enemy-level", "class-only"])(
    "keeps changed or incomplete scene evidence unqualified: %s", (change) => {
      const data = input(), step = data.sources.find(({ guide }) => guide.chapterId === "chapter-31-44-48-feralas")!
        .guide.steps.find((step) => step.ordinal === 37)!;
      if (change === "tool") step.directives.find((row) => row.tag === ".use")!.arguments = "1";
      if (change === "target") step.directives.find((row) => row.tag === ".target")!.arguments = "Vale Screecher";
      if (change === "counter") step.directives.find((row) => row.tag === ".complete")!.arguments = "3520,2";
      if (change === "provided-item") data.catalog.quests[0]!.providedItem!.itemId = 1;
      if (change === "enemy-level") data.combat.npcs.push({
        ...combatDatasetSchema.shape.npcs.element.parse(fixture.provenance.encounters[0]), maximumLevel: null,
      });
      if (change === "class-only") data.catalog.quests[0]!.requiredClasses = 128;
      expect(campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).has(3520)).toBe(false);
    },
  );

  it.each(classes)("exports the supplied tool, spirit target and counter for %s in both roles", (classSlug) => {
    const data = input(), plan = component(data);
    const addon = compileCampaignAddon({ ...plan, leaderClass: classSlug }, plan.actions, {
      version: "0.2.0-review.screecher-scene", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", nativeSources: data.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      for (const tag of ["accept", "complete", "turnin"]) expect(text.match(new RegExp(`\\.${tag} 3520\\b`, "g"))).toHaveLength(1);
      expect(text).toContain(".use 10699");
      expect(text).toContain(".target Screecher Spirit");
      expect(text).toContain("Each player needs credit for 3 spirits");
      expect(text).toContain(".mob Vale Screecher");
      expect(text).toContain(".mob Rogue Vale Screecher");
    }
  });
});
