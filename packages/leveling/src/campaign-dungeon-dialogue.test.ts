import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { applyNarrativeEncounterReferences } from "./campaign-narrative-events.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixture from "./fixtures/uldaman-disc-dialogue-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function input(): { plan: CampaignPlan; sources: CampaignSource[]; combat: ReturnType<typeof combatDatasetSchema.parse> } {
  const guide = importedChapterSchema.parse(fixture.guide);
  const reference = CHAPTER_REFERENCES.find((entry) => entry.id === guide.chapterId)!;
  const rewards = questRewardFactSchema.array().parse(fixture.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward } = fact;
    return { ...reward, ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }) };
  });
  const actions: CampaignPlan["actions"] = (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
    id: `discs-${state}`, legId: "uldaman", kind: "quests", title: "The Platinum Discs", instructions: [],
    questChanges: [{ questId: 2278, state, objectiveIndex: state === "objectives-complete" ? 1 : null, title: fixture.quest.title }],
    positions: [], source: null, leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    ...(state === "objectives-complete" ? { wholeQuestObjectives: true } : {}),
  }));
  return { sources: [{ guide, reference }], combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "reviewed-uldaman-dialogue", targetBuild: 70205,
      sourceArchiveSha256: fixture.provenance.sourceArchiveSha256, race: "human", leaderClass: "warrior",
      sharedQuestsOnly: true, sharedSourceQuestIds: [2278], rewardFacts: rewards, actions,
      legs: [{ id: "uldaman", title: "Uldaman", kind: "dungeon", from: 42, to: 45, stopId: "uldaman",
        actionIds: actions.map((action) => action.id), questIds: [2278], unresolvedQuestIds: [] }] } };
}

function progress(level = 42): ReturnType<typeof emptyPremadeProgress> {
  const empty = emptyPremadeProgress();
  return { ...empty, difficultyPolicy: "experienced-premade", members: empty.members.map((member, index) => ({
    ...member, raceId: "human", classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
  })) };
}

describe("source-bound generated dungeon dialogue", () => {
  it("keeps the level60speaker as dialogue and the actual level47boss as access", () => {
    const data = input(), before = structuredClone(data);
    const plan = attachCampaignCombat(data.plan, data.sources, data.combat, "dialogue-test");
    expect(applyNarrativeEncounterReferences(data.combat).npcs.find((npc) => npc.id === 7172))
      .toMatchObject({ maximumLevel: 60 });
    expect(plan.combat!.npcs.find((npc) => npc.id === 2748)).toMatchObject({ maximumLevel: 47 });
    expect(plan.combat!.bossReferences!.find((boss) => boss.npcId === 2748)).toEqual(fixture.provenance.bossReference);
    expect(plan.combat!.activities[0]!.objectives).toEqual([expect.objectContaining({
      questId: 2278, objectiveIndex: 1, credit: "non-combat", npcIds: [], requiredKills: null,
      combatAccess: { kind: "encounter", npcIds: [2748] },
    })]);
    expect(createCampaignCombatReadiness(plan)(plan.actions[1]!)).toEqual({
      targetLevel: 42, nonBossNpcs: [], unknownNpcIds: [],
    });
    expect(data).toEqual(before);
  });

  it("adds encounter metadata idempotently without replacing an existing unknown level", () => {
    const data = input(), augmented = applyNarrativeEncounterReferences(data.combat);
    expect(applyNarrativeEncounterReferences(augmented)).toBe(augmented);
    const changed = { ...data.combat, npcs: [...data.combat.npcs,
      { ...augmented.npcs.find((npc) => npc.id === 2748)!, maximumLevel: null }] };
    expect(applyNarrativeEncounterReferences(changed).npcs.find((npc) => npc.id === 2748)!.maximumLevel).toBeNull();
  });

  it.each(["fast", "expected", "slow"] as const)("pays the complete quest once/player without dialogue kill XP: %s", (lootScenario) => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "dialogue-test");
    const forecast = forecastCampaignXp(plan, progress(), { lootScenario });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([2278]);
      expect(member.rewards[0]!.xp).toBeGreaterThan(0);
      expect(member.combatXp).toBe(0);
      expect(member.estimatedCombatXp).toBe(0);
    }
  });

  it("cannot use the dialogue reward to pay its own boss requirement", () => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "dialogue-test");
    const forecast = forecastCampaignXp(plan, progress(41));
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("discs-objectives-complete");
      expect(member.blockedReason).toContain("level 42");
      expect(member.rewards).toEqual([]);
      expect(member.combatXp).toBe(0);
    }
  });

  it.each(["fast", "expected", "slow"] as const)("keeps the boss access guard after a serialized pickup resume: %s", (lootScenario) => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "dialogue-test");
    const initial = progress(), forecast = forecastCampaignXp(plan, initial, {
      lootScenario, captureCombatAfterActionIds: ["discs-accepted"],
    });
    const handoff = campaignRouteHandoff({ difficultyPolicy: initial.difficultyPolicy, starterMode: "together",
      strategy: "dungeons", optionalStops: true, lootScenario, sourceBuild: plan.targetBuild,
      progress: initial, actions: plan.actions, forecast }, "discs-accepted");
    const saved = premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress)));
    const resumed = forecastCampaignXp(plan, saved, { lootScenario, fromActionId: "discs-objectives-complete",
      initialBounds: handoff.xpBounds,
      ...(handoff.combatProjection ? { initialCombatProjection: handoff.combatProjection } : {}) });
    for (let player = 0; player < 5; player++) expect(resumed[0]!.members[player]!.steps)
      .toEqual(forecast[0]!.members[player]!.steps.filter((step) => step.actionId !== "discs-accepted"));
    const underlevelled = { ...saved, members: saved.members.map((member) => ({ ...member, level: 41, currentXp: 0 })) };
    expect(forecastCampaignXp(plan, underlevelled, { lootScenario, fromActionId: "discs-objectives-complete" })[0]!
      .members.every((member) => member.blockedAtActionId === "discs-objectives-complete" && !member.rewards.length)).toBe(true);
  });

  it.each(["source-dialogue", "source-target", "source-counter", "quest-text", "kill-quota", "wrong-provider", "wrong-dungeon", "partial-objective"])(
    "does not remove combat checks when its qualification is incomplete: %s", (change) => {
      const data = input();
      const step = data.sources[0]!.guide.steps.find((step) => step.ordinal === 126)!;
      if (change === "source-dialogue") step.directives.find((row) => row.tag === ".skipgossip")!.tag = ".use";
      if (change === "source-target") step.directives.find((row) => row.tag === ".target")!.arguments = "Archaedas";
      if (change === "source-counter") step.directives.find((row) => row.tag === ".complete")!.arguments = "2278,2";
      if (change === "quest-text") data.combat.quests[0]!.objectiveText = ["Kill the Lore Keeper of Norgannon."];
      if (change === "kill-quota") data.combat.quests[0]!.killQuotas = [{ objectiveIndex: 1, npcId: 7172, kills: 1, source: "Changed source" }];
      if (change === "wrong-provider") data.combat.provider.revision = "a".repeat(40);
      if (change === "wrong-dungeon") data.plan = { ...data.plan, legs: data.plan.legs.map((leg) => ({ ...leg, stopId: "gnomeregan" })) };
      if (change === "partial-objective") data.plan = { ...data.plan, actions: data.plan.actions.map((action) => {
        const { wholeQuestObjectives: _wholeQuestObjectives, ...partial } = action; return partial;
      }) };
      const plan = attachCampaignCombat(data.plan, data.sources, data.combat, "unqualified-dialogue");
      expect(plan.combat!.activities[0]!.objectives[0]!.credit).not.toBe("non-combat");
      expect(createCampaignCombatReadiness(plan)(plan.actions[1]!).targetLevel).toBe(56);
    },
  );

  it("does not turn a contradictory boss context into an exception", () => {
    const data = input();
    data.combat.bossReferences = [{ ...fixture.provenance.bossReference, instanceMapId: 36,
      dungeonVisitIds: ["deadmines"], identityEvidence: "client-creature-id" }];
    expect(() => attachCampaignCombat(data.plan, data.sources, data.combat, "conflicting-boss"))
      .toThrow("boss identity conflicts");
  });

  it.each(classes)("exports the complete lecture/return sequence for %s in both roles", (classSlug) => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "dialogue-test");
    const addon = compileCampaignAddon({ ...plan, leaderClass: classSlug }, plan.actions, {
      version: "0.2.0-review.dungeon-dialogue", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", nativeSources: data.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      for (const tag of ["accept", "complete", "turnin"]) expect(text.match(new RegExp(`\\.${tag} 2278\\b`, "g"))).toHaveLength(1);
      expect(text).toContain("Kill Archaedas");
      expect(text).toContain("finish every dialogue page");
      expect(text).toContain("Click The Discs of Norgannon");
      expect(text).toContain("every player");
    }
  });
});
