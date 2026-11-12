import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignNarrativeEvents } from "./campaign-narrative-events.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { premadeProgressSchema } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";
import type { CampaignFundingState } from "./campaign-funding-scenarios.js";
import { sourceDeliveryFundingCatalog } from "./campaign-source-deliveries.js";
import fixture from "./fixtures/stormwind-defias-finish-70205.json" with { type: "json" };

const ids = [2746, 434, 394, 395, 396];
const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

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
    plan: { release: "reviewed-stormwind-finish", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: fixture.catalog.quests.map((quest) => quest.questId),
      actions: [], legs: [], rewardFacts: rewards },
  };
}

function component(data: ReturnType<typeof input>): CampaignPlan {
  const methods = campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog);
  const actions = ids.flatMap((id) => {
    const method = methods.get(id);
    if (!method) throw new Error(`Incomplete Stormwind method ${id}`);
    return method.actions.map((action) => ({ ...action, legId: "stormwind" }));
  });
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "stormwind", title: "Finish the Defias investigation", kind: "preparation", from: 30, to: 32,
      stopId: null, actionIds: actions.map((action) => action.id), questIds: ids, unresolvedQuestIds: [] }],
  }, data.sources, data.combat, fixture.provenance.combat.sha256);
}

function previouslyRejectedPolicy(plan: CampaignPlan, providerRevision: string): CampaignPlan {
  return { ...plan,
    partyPolicy: { revision: "five-player-kill-first-20261102-v9", partySize: 5, unresolvedPrerequisiteIds: [],
      decisions: ids.map((questId) => ({ questId, objective: questId === 2746 ? "collection" : "delivery",
        included: false, requiredFor: [], lootCost: null, reason: "The earlier policy did not qualify this source program." })) },
    questFunding: { revision: "explicit-quest-funding-20261105-v81", providerRevision,
      addedQuestIds: ids, remaining: [], scenarios: [] } };
}

describe("the complete common Stormwind Defias finish", () => {
  it("keeps the qualified shopping program selected through the full funding-policy refresh", () => {
    const data = input(), selected = component(data);
    const plan = previouslyRejectedPolicy(selected, data.catalog.providerRevision);
    const funded = fundCampaignQuestGaps(plan, data.sources, data.combat, data.catalog, {
      includeSourceDeliveries: true, includeCatalogApproaches: true,
      fundingExecutor: (candidate: CampaignPlan): readonly CampaignFundingState[] => fixture.handoffs.map(({ lootScenario, handoff }): CampaignFundingState => {
        if (lootScenario !== "fast" && lootScenario !== "expected" && lootScenario !== "slow")
          throw new Error("The fixture must identify a supported loot scenario.");
        const progress = premadeProgressSchema.parse(handoff.progress);
        return { difficultyPolicy: progress.difficultyPolicy, starterMode: "together", strategy: "dungeons",
          optionalStops: true, lootScenario, sourceBuild: candidate.targetBuild,
          itemRequirements: candidate.itemRequirements ?? [], progress, actions: candidate.actions,
          forecast: forecastCampaignXp(candidate, progress, { lootScenario, initialBounds: handoff.xpBounds }) };
      }),
    });
    expect(funded.partyPolicy!.decisions.every((decision) => decision.included)).toBe(true);
    expect(funded.partyPolicy!.decisions.find((decision) => decision.questId === 2746))
      .toMatchObject({ objective: "interaction", lootCost: null });
    expect(funded.itemRequirements?.filter((item) => item.questId === 2746).map((item) => [item.itemId, item.quantity]))
      .toEqual([[4306, 3], [8683, 2]]);
  });

  it.each(["missing", "wrong-quest", "collection"] as const)(
    "does not bypass the ordinary collection check with an unqualified method: %s", (change) => {
      const data = input(), plan = previouslyRejectedPolicy(component(data), data.catalog.providerRevision);
      const methods = new Map(campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog));
      const method = methods.get(2746)!;
      if (change === "missing") methods.delete(2746);
      else methods.set(2746, { ...method, actions: method.actions.map((action) => ({ ...action,
        ...(change === "wrong-quest" ? { libraryQuestId: 1 } : { libraryObjective: "collection" as const }),
      })) });
      expect(() => refreshFundedCampaignPartyPolicy(plan, data.sources, data.combat, data.catalog, methods))
        .toThrow("Selected collection 2746 lost its five-player loot qualification");
    },
  );

  it("retains all five source programs, the material counters and the actual recipient", () => {
    const data = input(), before = structuredClone(data), plan = component(data);
    expect(campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).size).toBe(5);
    expect(plan.itemRequirements?.filter((item) => item.questId === 2746).map((item) => [item.itemId, item.quantity]))
      .toEqual([[4306, 3], [8683, 2]]);
    expect(plan.actions.find((action) => action.questChanges[0]?.questId === 396 &&
      action.questChanges[0]?.state === "rewarded")?.instructions.join("\n")).toContain("Lady Katrana Prestor");
    expect(data).toEqual(before);
  });

  it("counts the conversation separately from the two physical deaths", () => {
    const plan = component(input());
    const changes = plan.actions.filter((action) => action.questChanges[0]?.questId === 434 &&
      action.questChanges[0]?.state === "objectives-complete");
    expect(changes.map((action) => action.questChanges[0]!.objectiveIndex)).toEqual([3, 1, 2]);
    const objectives = plan.combat!.activities.flatMap((activity) => activity.objectives)
      .filter((objective) => objective.questId === 434);
    expect(objectives.map((objective) => [objective.objectiveIndex, objective.credit, objective.npcIds, objective.requiredKills]))
      .toEqual([[3, "non-combat", [], null], [1, "shared-kills", [1754], 1], [2, "shared-kills", [1755], 1]]);
  });

  it.each(["fast", "expected", "slow"] as const)(
    "pays 7150 quest XP to all actual classes after the real sealed30handoff: %s", (lootScenario) => {
      const data = input(), plan = component(data);
      const row = fixture.handoffs.find((row) => row.lootScenario === lootScenario)!;
      const progress = premadeProgressSchema.parse(row.handoff.progress);
      expect(progress.members.map((member) => member.classSlug)).toEqual(classes);
      const forecast = forecastCampaignXp(plan, progress, { lootScenario, initialBounds: row.handoff.xpBounds });
      for (const member of forecast[0]!.members) {
        expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
        expect(member.rewards.map((reward) => reward.questId)).toEqual(ids);
        expect(member.rewards.reduce((sum, reward) => sum + (reward.xp ?? Number.NaN), 0)).toBe(7150);
        expect(member.estimatedCombatXp).toBe(0);
      }
    },
  );

  it.each(["library-quest-2746-objectives-complete-1", "library-quest-434-objectives-complete-3", "library-quest-434-objectives-complete-1"])(
    "preserves personal supplies, dialogue and kill state across a serialized save at %s", (boundary) => {
      const data = input(), plan = component(data), state = fixture.handoffs.find((row) => row.lootScenario === "expected")!.handoff;
      const progress = premadeProgressSchema.parse(state.progress);
      const forecast = forecastCampaignXp(plan, progress, {
        lootScenario: "expected", initialBounds: state.xpBounds, captureCombatAfterActionIds: [boundary],
      });
      const handoff = campaignRouteHandoff({ difficultyPolicy: progress.difficultyPolicy, starterMode: "together",
        strategy: "dungeons", optionalStops: true, lootScenario: "expected", sourceBuild: 70205,
        itemRequirements: plan.itemRequirements ?? [], progress, actions: plan.actions, forecast }, boundary);
      const index = plan.actions.findIndex((action) => action.id === boundary) + 1;
      const restored = forecastCampaignXp(plan, premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress))), {
        lootScenario: "expected", fromActionId: plan.actions[index]!.id, initialBounds: handoff.xpBounds,
        ...(handoff.combatProjection ? { initialCombatProjection: JSON.parse(JSON.stringify(handoff.combatProjection)) } : {}),
      });
      for (let player = 0; player < 5; player++) expect(restored.flatMap((section) => section.members[player]!.steps))
        .toEqual(forecast.flatMap((section) => section.members[player]!.steps).filter((step) =>
          plan.actions.findIndex((action) => action.id === step.actionId) >= index));
    },
  );

  it("constructs the entire real prerequisite closure instead of funding only its last hand-in", () => {
    const data = input(), methods = campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog);
    const catalog = sourceDeliveryFundingCatalog(data.catalog, methods);
    const progress = premadeProgressSchema.parse(fixture.handoffs.find((row) => row.lootScenario === "expected")!.handoff.progress);
    const batch = campaignFundingBatch(catalog.quests.find((quest) => quest.questId === 396)!, catalog, data.combat, progress, {
      legId: "stormwind", checkpointId: "next-dungeon", targetLevel: 32,
      previous: { zone: "1453", x: 73.23, y: 35.58 }, resumeZone: "1453",
      maximumQuestLevel: 34, forbiddenQuestIds: new Set(), leaderOnly: false, sharedQuestsOnly: true,
      sourceDeliveries: methods, includeCatalogApproaches: true,
    });
    expect(batch?.questIds).toEqual(ids);
    expect(batch?.actions.flatMap((action) => action.questChanges).filter((change) => change.state === "rewarded")
      .map((change) => change.questId)).toEqual(ids);
  });

  it("does not use fight XP to qualify a party that is still below the actual enemy limit", () => {
    const plan = component(input());
    const initial = fixture.handoffs.find((row) => row.lootScenario === "expected")!.handoff;
    const state = premadeProgressSchema.parse(initial.progress);
    const progress = { ...state, members: state.members.map((member) => ({ ...member, level: 26, currentXp: 0 })) };
    const forecast = forecastCampaignXp(plan, progress);
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("library-quest-434-objectives-complete-3");
      expect(member.rewards.map((reward) => reward.questId)).toEqual([2746]);
      expect(member.combatXp).toBe(0);
    }
  });

  it.each(["source-tool", "source-counter", "source-event", "wrong-kills", "unknown-level", "class-only", "wrong-recipient"])(
    "keeps incomplete or changed evidence unqualified: %s", (change) => {
      const data = input();
      if (change === "source-tool") data.sources[0]!.guide.steps.find((step) => step.ordinal === 245)!.directives[0]!.text = "Use a separate required tool";
      if (change === "source-counter") data.sources[0]!.guide.steps.find((step) => step.ordinal === 245)!.directives.find((row) => row.tag === ".complete")!.arguments = "2746,7";
      if (change === "source-event") data.sources[0]!.guide.steps.find((step) => step.ordinal === 249)!.directives.find((row) => row.arguments === "434,3")!.arguments = "434,4";
      if (change === "wrong-kills") data.combat.quests.find((quest) => quest.questId === 434)!.killQuotas![0]!.kills = 2;
      if (change === "unknown-level") data.combat.npcs[0]!.maximumLevel = null;
      if (change === "class-only") data.catalog.quests.find((quest) => quest.questId === 434)!.requiredClasses = 128;
      if (change === "wrong-recipient") data.catalog.quests.find((quest) => quest.questId === 396)!.ends[0]!.name = "King Varian Wrynn";
      const methods = campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog);
      expect(methods.has(["source-tool", "source-counter"].includes(change) ? 2746 : change === "wrong-recipient" ? 396 : 434)).toBe(false);
    },
  );

  it.each(classes)("exports every real counter, shopping instruction and hand-in for %s in both roles", (classSlug) => {
    const data = input(), plan = component(data);
    const addon = compileCampaignAddon({ ...plan, leaderClass: classSlug }, plan.actions, {
      version: "0.2.0-review.stormwind-chain", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", nativeSources: data.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      for (const questId of ids) for (const tag of ["accept", "turnin"])
        expect(text.match(new RegExp(`\\.${tag} ${questId}\\b`, "g")), `${role}/${tag}/${questId}`).toHaveLength(1);
      for (const index of [1, 2]) expect(text.match(new RegExp(`\\.complete 2746,${index}\\b`, "g"))).toHaveLength(1);
      for (const index of [1, 2, 3]) expect(text.match(new RegExp(`\\.complete 434,${index}\\b`, "g"))).toHaveLength(1);
      expect(text).toContain("Auction House");
      expect(text).toContain("15 for the five-person party");
      expect(text).toContain("Lady Katrana Prestor");
      expect(text).toContain(".timer 124");
    }
  });
});
