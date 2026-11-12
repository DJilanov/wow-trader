import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { unsafePartyFundingScenarios } from "./campaign-funding-quality.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { emptyPremadeProgress } from "./premade-model.js";
import fixture from "./fixtures/reclaimers-multi-item-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function input(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const guide = importedChapterSchema.parse(fixture.guide);
  const rewards = questRewardFactSchema.array().parse(fixture.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward } = fact;
    return { ...reward,
      ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
    };
  });
  return {
    sources: [{ guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! }],
    catalog: questCatalogSchema.parse(fixture.catalog),
    combat: combatDatasetSchema.parse(fixture.combat),
    plan: {
      release: "captured-multi-item-collection",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [1466, 1467],
      actions: [],
      legs: [],
      rewardFacts: rewards,
    },
  };
}

function progress(level: number): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  return {
    ...base,
    difficultyPolicy: "experienced-premade",
    members: base.members.map((member, index) => ({
      ...member,
      raceId: "human",
      classSlug: classes[index]!,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: { "1453": "rewarded" as const, "1458": "rewarded" as const, "1459": "rewarded" as const },
    })),
  };
}

function qualify(data: ReturnType<typeof input>): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(data.plan, data.sources, data.combat, data.catalog);
}

function batch(data: ReturnType<typeof input>, level: number): ReturnType<typeof campaignFundingBatch> {
  return campaignFundingBatch(data.catalog.quests.find((row) => row.questId === 1466)!,
    data.catalog, data.combat, progress(level), {
      legId: "desolace", checkpointId: "departure", targetLevel: 40,
      previous: { zone: "1443", x: 66.2, y: 9.62 },
      resumeZone: "1443", maximumQuestLevel: 99, forbiddenQuestIds: new Set(),
      leaderOnly: false, sharedQuestsOnly: true, sourceCollections: qualify(data),
    });
}

function component(data: ReturnType<typeof input>): CampaignPlan {
  const collection = qualify(data).get(1466);
  if (!collection) throw new Error("Captured Reclaimers collection did not qualify");
  const actions = collection.actions.map((action) => ({ ...action, legId: "desolace" }));
  return attachCampaignCombat({ ...data.plan, actions,
    legs: [{ id: "desolace", title: "Desolace", kind: "preparation", from: 36, to: 40,
      actionIds: actions.map((action) => action.id), questIds: [1466], stopId: null,
      unresolvedQuestIds: [] }],
  }, data.sources, data.combat, "multi-item-review");
}

describe("complete multi-item collection lifecycles", () => {
  it("retains all three captured item counters and the full pooled five-player workload", () => {
    const data = input(), before = structuredClone(data);
    const collection = qualify(data).get(1466);
    expect(collection).toBeDefined();
    expect(collection!.actions.map((action) => action.questChanges[0]!.state))
      .toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(collection!.actions.slice(1, -1).flatMap((action) => action.questChanges.map((change) => change.objectiveIndex)))
      .toEqual([1, 2, 3]);
    expect(collection!.retainedByDropRate).toBe(true);
    expect(collection!.expectedKills).toBeGreaterThan(150);
    expect(batch(data, 36)?.requiredKills).toBe(collection!.expectedKills);
    expect(data).toEqual(before);
  });

  it("forecasts each reward once and emits every native counter for leader and party", () => {
    const data = input(), plan = component(data);
    const objectives = plan.combat!.activities.flatMap((activity) => activity.objectives);
    expect(objectives.map((objective) => [objective.objectiveIndex, objective.loot?.itemId,
      objective.loot?.quantity, objective.credit]))
      .toEqual([[1, 6250, 10, "personal-loot"], [2, 6251, 10, "personal-loot"], [3, 6252, 10, "personal-loot"]]);
    const forecast = forecastCampaignXp(plan, progress(36));
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([1466]);
      expect(member.combatXp).toBeGreaterThan(0);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.questLog.peak).toBeLessThanOrEqual(40);
    }
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.multi-item",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27",
      nativeSources: data.sources });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      for (const index of [1, 2, 3])
        expect(text.match(new RegExp(`\\.complete 1466,${index}\\b`, "g"))).toHaveLength(1);
      expect(text).not.toContain(".accept 1467");
      const expectedWaypoints = ["source-step-0011", "source-step-0017", "source-step-0050"].flatMap((id) =>
        data.sources[0]!.guide.steps.find((step) => step.id === id)!.directives
          .filter((row) => row.tag === ".goto").map((row) => row.arguments));
      expect([...text.matchAll(/^\s+\.goto (.*)$/gm)].map((row) => row[1])).toEqual(expectedWaypoints);
    }
  });

  it("keeps every selected camp within the enemy-level limit", () => {
    const data = input();
    expect(batch(data, 33)).toBeNull();
    expect(batch(data, 36)).not.toBeNull();
  });

  it.each([4678, 4679, 4680])("independently checks every loot camp's level: %i", (npcId) => {
    const data = input(), plan = component(data), state = progress(36);
    const forecast = forecastCampaignXp(plan, state);
    expect(unsafePartyFundingScenarios(data.plan, [{ difficultyPolicy: "experienced-premade",
      starterMode: "together", strategy: "dungeons", optionalStops: true, lootScenario: "expected",
      progress: state, actions: plan.actions, forecast,
    }], data.catalog, { ...data.combat, npcs: data.combat.npcs.map((npc) => npc.id === npcId
      ? { ...npc, minimumLevel: 45, maximumLevel: 45 } : npc) }, qualify(data)))
      .toEqual(["experienced-premade/together/dungeons/true/expected"]);
  });

  it("requires the real preceding Reclaimers quests before forecasting a reward", () => {
    const data = input(), state = progress(36);
    state.members = state.members.map((member) => ({ ...member, questStates: {} }));
    for (const member of forecastCampaignXp(component(data), state)[0]!.members) {
      expect(member.blockedAtActionId).not.toBeNull();
      expect(member.rewards).toEqual([]);
    }
  });

  it.each(["missing-counter", "missing-quota", "unknown-sharing", "missing-rate", "unknown-npc",
    "quota-conflict", "functional-tool", "class-only", "wrong-build", "non-quest-item"])(
    "does not accept a partly established multi-item quest: %s", (reason) => {
      const data = input(), source = data.sources[0]!, quest = data.combat.quests.find((row) => row.questId === 1466)!;
      if (reason === "missing-counter") source.guide.steps = source.guide.steps.map((step) => ({ ...step,
        directives: step.directives.filter((row) => row.tag !== ".complete" || row.arguments !== "1466,2"),
      }));
      if (reason === "missing-quota") quest.itemObjectives![1]!.quantity = null;
      if (reason === "unknown-sharing") quest.itemObjectives![1]!.sharing = "unknown";
      if (reason === "missing-rate") data.combat.lootDrops = data.combat.lootDrops!.filter((row) => row.itemId !== 6251);
      if (reason === "unknown-npc") data.combat.npcs = data.combat.npcs.filter((row) => row.id !== 4680);
      if (reason === "quota-conflict") quest.killQuotaConflicts = [2];
      if (reason === "functional-tool") {
        const step = source.guide.steps.find((step) => step.id === "source-step-0017")!;
        step.directives.push({ ...step.directives[0]!, tag: ".use", arguments: "12345" });
      }
      if (reason === "class-only") data.catalog.quests.find((row) => row.questId === 1466)!.requiredClasses = 1;
      if (reason === "wrong-build") data.combat.targetBuild = 70450;
      if (reason === "non-quest-item") data.combat.lootDrops = data.combat.lootDrops!.map((row) => ({ ...row,
        probabilityReference: { ...row.probabilityReference!, questOnly: false },
      }));
      expect(qualify(data).has(1466)).toBe(false);
    },
  );
});
