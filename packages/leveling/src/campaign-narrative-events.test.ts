import { describe, expect, it, vi } from "vitest";
import * as sharedSources from "./campaign-shared-source.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema, questCatalogRewardFacts } from "./quest-catalog.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { importedChapterSchema } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { applyNarrativeEncounterReferences, attachNarrativeEventGuidance, campaignNarrativeEvents, narrativeEventObjectives } from "./campaign-narrative-events.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { sourceDeliveryFundingCatalog } from "./campaign-source-deliveries.js";
import { fundingDeliveryPickupQuestIds } from "./campaign-funding-deliveries.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import fixtureData from "./fixtures/narrative-events-70205.json" with { type: "json" };

const expectedIds = [1447, 1247, 1248, 1249, 1250, 1264, 1265, 1266, 1324, 1267, 2801, 3441, 3453, 683, 1137, 4442];
const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function fixture(): {
  plan: CampaignPlan;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  sources: CampaignSource[];
} {
  const sources = fixtureData.guides.map((raw): CampaignSource => {
    const guide = importedChapterSchema.parse(raw);
    return { guide, reference: CHAPTER_REFERENCES.find((reference) => reference.id === guide.chapterId)! };
  });
  return {
    plan: {
      release: "reviewed-narrative-events",
      targetBuild: 70205,
      sourceArchiveSha256: fixtureData.sourceArchiveSha256,
      race: "human",
      leaderClass: "warrior",
      sharedQuestsOnly: true,
      sharedSourceQuestIds: expectedIds,
      actions: [], legs: [],
    },
    sources,
    combat: combatDatasetSchema.parse(fixtureData.combat),
    catalog: questCatalogSchema.parse(fixtureData.catalog),
  };
}

function eventPlan(input: ReturnType<typeof fixture>, ids: readonly number[]): CampaignPlan {
  const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
  const actions = ids.flatMap((id) => methods.get(id)!.actions.map((action) => ({ ...action, legId: "events" })));
  return {
    ...input.plan, actions,
    legs: [{ id: "events", title: "Party conversations", kind: "preparation", from: 28, to: 40,
      stopId: null, questIds: [...ids], unresolvedQuestIds: [], actionIds: actions.map((action) => action.id) }],
    rewardFacts: questCatalogRewardFacts(
      questRewardFactSchema.array().parse(fixtureData.rewards).map((fact): QuestRewardFact => {
        const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...required } = fact;
        return { ...required,
          ...(rewardBasis === undefined ? {} : { rewardBasis }),
          ...(evidenceKind === undefined ? {} : { evidenceKind }),
          ...(clientReference === undefined ? {} : { clientReference }),
          ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
          ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
        };
      }).filter((fact) => ids.includes(fact.questId)),
      input.catalog,
    ),
  };
}

function progress(level: number, parent: number): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  return { ...initial, difficultyPolicy: "experienced-premade", members: initial.members.map((member, index) => ({
    ...member, raceId: "human", classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
    questStates: { [parent]: "rewarded" },
  })) };
}

describe("reviewed party dialogue and nonlethal events", () => {
  it("permits carrying the reviewed Samaul courier even when generic wording does not prove it", () => {
    const input = fixture();
    const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
    const original = input.catalog.quests.find((quest) => quest.questId === 1264)!;
    const reference = input.combat.quests.find((quest) => quest.questId === 1264)!;
    expect(npcDeliveryRecipients(original, reference)).toEqual([]);
    expect(fundingDeliveryPickupQuestIds(input.catalog, input.combat, methods).has(1264)).toBe(true);
    const unproved = new Map(methods);
    const { canLeaveAfterPickup, ...courier } = methods.get(1264)!;
    expect(canLeaveAfterPickup).toBe(true);
    unproved.set(1264, courier);
    expect(fundingDeliveryPickupQuestIds(input.catalog, input.combat, unproved).has(1264)).toBe(false);
  });

  it.each([1447, 1249, 1265, 1324, 1267, 2801, 3441, 3453, 4442])(
    "does not certify quest %i's pickup as an ordinary deferred courier", (questId) => {
      const input = fixture();
      const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
      expect(methods.get(questId)!.canLeaveAfterPickup).toBeUndefined();
    },
  );

  it("does not permit a courier departure when the captured pickup evidence changed", () => {
    const input = fixture();
    const source = input.sources.find(({ guide }) => guide.steps.some((step) => step.id === "source-step-0010" &&
      step.directives.some((directive) => directive.tag === ".accept" && directive.questId === 1264)))!;
    const pickup = source.guide.steps.find((step) => step.id === "source-step-0010")!;
    pickup.directives.find((directive) => directive.tag === ".accept" && directive.questId === 1264)!.arguments = "1264,1";
    const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
    expect(methods.has(1264)).toBe(false);
    expect(fundingDeliveryPickupQuestIds(input.catalog, input.combat, methods).has(1264)).toBe(false);
  });

  it("includes all sixteen reviewed programs, preserving the real phases, waits and prerequisites", () => {
    const input = fixture(), before = structuredClone(input);
    const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
    expect([...methods.keys()]).toEqual(expectedIds);
    for (const method of methods.values()) {
      expect(method.actions.every((action) => action.instructions.some((line) => /everyone|every player/.test(line)))).toBe(true);
      expect(method.quest.prerequisites).toEqual(input.catalog.quests.find((quest) => quest.questId === method.quest.questId)!.prerequisites);
    }
    expect(methods.get(1324)!.maximumEnemyLevel).toBe(36);
    expect(methods.get(1267)!.actions.map((action) => action.questChanges[0]!.state)).toEqual(["rewarded"]);
    expect(input).toEqual(before);
  });

  it("fills only missing, provider-bound guards and preserves subsequently recorded levels", () => {
    const input = fixture();
    input.combat.npcs = input.combat.npcs.filter((npc) => npc.id !== 4971 && npc.id !== 5184);
    const before = structuredClone(input.combat);
    const supplemented = applyNarrativeEncounterReferences(input.combat);
    expect(supplemented.npcs.slice(-2).map((npc) => [npc.id, npc.maximumLevel])).toEqual([[4971, 34], [5184, 36]]);
    expect(input.combat).toEqual(before);
    expect(applyNarrativeEncounterReferences(supplemented)).toBe(supplemented);
    const recorded = { ...supplemented, npcs: supplemented.npcs.map((npc) => npc.id === 5184 ? { ...npc, maximumLevel: 37 } : npc) };
    expect(applyNarrativeEncounterReferences(recorded)).toBe(recorded);
    const foreign = { ...input.combat, provider: { ...input.combat.provider, revision: "a".repeat(40) } };
    expect(applyNarrativeEncounterReferences(foreign)).toBe(foreign);
  });

  it("adds the party wait to already-selected source scenes once, without replacing custom instructions", () => {
    const input = fixture(), original = eventPlan(input, [3441]);
    const plan = { ...original, actions: original.actions.map((action) => ({
      ...action, instructions: ["Keep the party together at this waypoint."],
    })) };
    const once = attachNarrativeEventGuidance(plan, input.sources, input.combat);
    expect(once.actions.every((action) => action.instructions[0] === "Keep the party together at this waypoint.")).toBe(true);
    expect(once.actions.every((action) => action.instructions.some((text) => /everyone|every player/.test(text)))).toBe(true);
    expect(attachNarrativeEventGuidance(once, input.sources, input.combat)).toBe(once);
  });

  it.each(["archive", "build", "provider", "class", "objective", "source-version", "source-text", "source-timer", "unknown-guard"])(
    "keeps changed or incompatible evidence unqualified: %s", (change) => {
      const input = fixture();
      const questId = change === "source-timer" ? 3453 : 1249;
      if (change === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "a".repeat(64) };
      if (change === "build") input.plan = { ...input.plan, targetBuild: 70450 };
      if (change === "provider") input.combat.provider.revision = "a".repeat(40);
      if (change === "class") input.catalog.quests.find((quest) => quest.questId === questId)!.requiredClasses = 128;
      if (change === "objective") input.combat.quests.find((quest) => quest.questId === questId)!.objectiveText = ["Slay Tapoke Jahn."];
      const guide = input.sources.find(({ guide }) => guide.steps.some((step) => step.directives.some((directive) => directive.questId === questId)))!.guide;
      if (change === "source-version") guide.version = "unreviewed";
      if (change === "source-text") guide.steps.find((step) => step.directives.some((directive) => directive.questId === questId))!.directives[0]!.text = "Use an unrelated object";
      if (change === "source-timer") guide.steps.flatMap((step) => step.directives).find((directive) => directive.tag === ".timer")!.arguments = "1,Unreviewed scene";
      if (change === "unknown-guard") input.combat.npcs.find((npc) => npc.id === 4971)!.maximumLevel = null;
      expect(campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog).has(questId)).toBe(false);
    },
  );

  it.each([[1447, 1246, 28, 1250], [1249, 1248, 30, 1300], [1324, 1266, 32, 2150]])(
    "counts quest %i once for each real class, with zero deaths and zero combat XP",
    (questId, parent, level, reward) => {
      const input = fixture();
      const plan = attachCampaignCombat(eventPlan(input, [questId]), input.sources, input.combat, "reviewed-events");
      const activities = plan.combat!.activities;
      expect(activities).toHaveLength(1);
      expect(activities[0]!.objectives[0]).toMatchObject({ credit: "non-combat", requiredKills: null, npcIds: [] });
      expect(activities[0]!.objectives[0]!.combatAccess).toMatchObject({ kind: "encounter" });
      for (const member of forecastCampaignXp(plan, progress(level, parent))[0]!.members) {
        expect(member.blockedAtActionId).toBeNull();
        expect(member.combatXp).toBe(0);
        expect(member.rewards.map((row) => [row.questId, row.xp])).toEqual([[questId, reward]]);
        expect(member.knownEndpoint).toEqual({ level, currentXp: reward });
      }
    },
  );

  it("retains the +4 limit for Hendel's guards even though the encounter has no death XP", () => {
    const input = fixture();
    const plan = attachCampaignCombat(eventPlan(input, [1324]), input.sources, input.combat, "reviewed-events");
    for (const member of forecastCampaignXp(plan, progress(31, 1266))[0]!.members) {
      expect(member.blockedAtActionId).not.toBeNull();
      expect(member.rewards).toEqual([]);
    }
  });

  it.each([2801, 3441, 3453])("keeps lecture %i and pays only the conversation hand-in", (questId) => {
    const input = fixture(), base = eventPlan(input, [questId]);
    const plan = attachCampaignCombat(base, input.sources, input.combat, "reviewed-lectures");
    const parent = base.actions[0]!.requiredQuestIds![0]!;
    for (const member of forecastCampaignXp(plan, progress(50, parent))[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((row) => row.questId)).toEqual([questId]);
      expect(member.combatXp).toBe(0);
    }
    const addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508,
      restedXpVersion: "v4.11.27", nativeSources: input.sources,
    });
    const text = addon.documents.filter((document) => document.role === "party").map((document) => document.content).join("\n");
    expect(text.match(new RegExp(`\\.accept ${questId}\\b`, "g"))).toHaveLength(1);
    expect(text.match(new RegExp(`\\.turnin ${questId}\\b`, "g"))).toHaveLength(1);
    if (questId === 3453) expect(text.match(/\.timer 28,The Torch of Retribution RP/g)).toHaveLength(1);
  });

  it("does not fund the event while its guards exceed the party limit", () => {
    const input = fixture();
    const methods = campaignNarrativeEvents(input.plan, input.sources, input.combat, input.catalog);
    const catalog = sourceDeliveryFundingCatalog(input.catalog, methods);
    const run = (level: number): ReturnType<typeof campaignFundingBatch> => campaignFundingBatch(
      catalog.quests.find((quest) => quest.questId === 1324)!, catalog, input.combat, progress(level, 1266), {
        legId: "events", checkpointId: "gate", targetLevel: 33,
        previous: { zone: "1445", x: 45.24, y: 24.66 }, maximumQuestLevel: level + 4,
        leaderOnly: false, forbiddenQuestIds: new Set(), sourceDeliveries: methods,
      },
    );
    expect(run(31)).toBeNull();
    expect(run(32)?.questIds).toEqual([1324]);
  });

  it("emits actual native completion and hand-in commands, preserving RP and the instant final conversation", () => {
    const input = fixture(), plan = eventPlan(input, [1324, 1267]);
    const addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508, restedXpVersion: "v4.11.27", nativeSources: input.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text.match(/\.complete 1324,1\b/g)).toHaveLength(1);
      expect(text.match(/\.turnin 1267\b/g)).toHaveLength(1);
      expect(text).not.toContain(".accept 1267");
    }
  });

  it("does not pay the final conversation before Hendel's hand-in", () => {
    const input = fixture(), plan = eventPlan(input, [1267]);
    for (const member of forecastCampaignXp(plan, progress(38, 1266))[0]!.members) {
      expect(member.rewards).toEqual([]);
      expect(member.sourceSkips?.map((skip) => skip.actionId)).toContain(plan.actions[0]!.id);
    }
    for (const member of forecastCampaignXp(plan, progress(38, 1324))[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((row) => row.questId)).toEqual([1267]);
    }
  });

  it("keeps the complete remaining Diplomat chain connected and pays 12,450 reference XP once per player", () => {
    const input = fixture();
    const ids = [1447, 1247, 1248, 1249, 1250, 1264, 1265, 1266, 1324, 1267];
    const plan = attachCampaignCombat(eventPlan(input, ids), input.sources, input.combat, "reviewed-chain");
    for (const member of forecastCampaignXp(plan, progress(32, 1246))[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual(ids);
      expect(member.rewards.reduce((total, reward) => total + (reward.xp ?? 0), 0)).toBe(12450);
      expect(member.combatXp).toBe(0);
    }
  });

  it.each(["build", "archive"])("does not transfer an instant hand-in to a different %s", (change) => {
    const input = fixture(), original = eventPlan(input, [1267]);
    const plan = { ...original,
      ...(change === "build" ? { targetBuild: 70450 } : { sourceArchiveSha256: "f".repeat(64) }),
    };
    expect(() => compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508,
      restedXpVersion: "v4.11.27", nativeSources: input.sources,
    })).toThrow();
    for (const member of forecastCampaignXp(plan, progress(38, 1324))[0]!.members)
      expect(member.rewards).toEqual([]);
  });

  it("does not apply event credit when the selected action points at another source step", () => {
    const input = fixture(), plan = eventPlan(input, [1447]);
    const action = plan.actions.find((action) => action.questChanges[0]!.state === "objectives-complete")!;
    const changed = { ...plan, actions: plan.actions.map((entry) => entry === action ? { ...entry, source: { ...entry.source!, stepId: "source-step-9999" } } : entry) };
    expect(narrativeEventObjectives(changed, input.sources, input.combat).size).toBe(0);
  });

  it("projects the shared archive once per event operation, rather than once per proof", () => {
    const input = fixture(), plan = eventPlan(input, [1447, 1324]);
    const projection = vi.spyOn(sharedSources, "sharedCampaignQuestSources");
    try {
      expect(campaignNarrativeEvents(plan, input.sources, input.combat, input.catalog).size).toBe(expectedIds.length);
      expect(projection).toHaveBeenCalledTimes(1);
      projection.mockClear();
      attachNarrativeEventGuidance(plan, input.sources, input.combat);
      expect(projection).toHaveBeenCalledTimes(1);
      projection.mockClear();
      expect(narrativeEventObjectives(plan, input.sources, input.combat).size).toBe(2);
      expect(projection).toHaveBeenCalledTimes(1);
    } finally {
      projection.mockRestore();
    }
  });

  it("does not scan event source programs when a candidate contains no selected event", () => {
    const input = fixture(), projection = vi.spyOn(sharedSources, "sharedCampaignQuestSources");
    try {
      expect(attachNarrativeEventGuidance(input.plan, input.sources, input.combat)).toBe(input.plan);
      expect(narrativeEventObjectives(input.plan, input.sources, input.combat).size).toBe(0);
      expect(projection).not.toHaveBeenCalled();
    } finally {
      projection.mockRestore();
    }
  });
});
