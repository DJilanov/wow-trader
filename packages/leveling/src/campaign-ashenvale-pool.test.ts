import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { clientQuestRewardReferenceSchema } from "./quest-client-reward.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import fixture from "./fixtures/ashenvale-insane-druids-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function progress(level = 28): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  return { ...initial, difficultyPolicy: "experienced-premade",
    members: initial.members.map((member, index) => ({ ...member,
      raceId: "human", classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
      questStates: { "1011": "rewarded" as const },
    })),
  };
}

function batch(state = progress()): ReturnType<typeof campaignFundingBatch> {
  const catalog = questCatalogSchema.parse(fixture.catalog);
  const quest = catalog.quests.find((row) => row.questId === 1012)!;
  return campaignFundingBatch(quest, catalog, combatDatasetSchema.parse(fixture.combat), state, {
    legId: "ashenvale", checkpointId: "departure", targetLevel: 33,
    previous: quest.starts[0]!.positions[0]!, resumeZone: "1440", maximumQuestLevel: 32,
    forbiddenQuestIds: new Set(), leaderOnly: false, sharedQuestsOnly: true,
  });
}

function component(): CampaignPlan {
  const selection = batch();
  if (!selection) throw new Error("Captured Insane Druids candidate did not qualify");
  const actions = selection.actions;
  const reward = fixture.reward;
  return attachCampaignCombat({ release: "ashenvale-pool-fixture", race: "human",
    leaderClass: "warrior", targetBuild: 70205,
    sourceArchiveSha256: fixture.catalog.sourceArchiveSha256,
    sharedQuestsOnly: true, sharedSourceQuestIds: [1011, 1012], actions,
    legs: [{ id: "ashenvale", title: "Ashenvale", kind: "preparation", from: 28, to: 33,
      stopId: null, actionIds: actions.map((action) => action.id), questIds: [1012], unresolvedQuestIds: [] }],
    rewardFacts: [{ questId: reward.questId, fullXp: reward.fullXp, rewardBasis: "final-reward",
      questLevel: reward.questLevel, minimumLevel: reward.minimumLevel, xpByLevel: reward.xpByLevel,
      status: "available", evidenceKind: "client-table-reference",
      clientReference: clientQuestRewardReferenceSchema.parse(reward.clientReference),
      referenceBaseXp: reward.referenceBaseXp, capturedAt: reward.capturedAt, sourceUrl: reward.sourceUrl,
    }],
  }, [], combatDatasetSchema.parse(fixture.combat), fixture.provenance.candidate.combat.sha256);
}

describe("ordinary kill quests beyond the solo archive selection", () => {
  it("retains the actual prerequisite and all three captured one-kill counters", () => {
    expect(batch()).toMatchObject({ questIds: [1012], requiredKills: 3 });
    expect(component().combat!.activities.flatMap((activity) => activity.objectives).map((objective) =>
      [objective.npcIds, objective.requiredKills, objective.credit]))
      .toEqual([[[3940], 1, "shared-kills"], [[3941], 1, "shared-kills"], [[3942], 1, "shared-kills"]]);
  });

  it("pays each creature's XP at its own fight instead of the first counter", () => {
    const plan = component();
    const objectives = plan.actions.filter((action) => action.questChanges.some((change) =>
      change.state === "objectives-complete"));
    for (const member of forecastCampaignXp(plan, progress())[0]!.members) {
      const fights = member.steps.filter((step) => step.combatXp > 0);
      expect(fights.map((step) => step.actionId)).toEqual(objectives.map((action) => action.id));
      expect(member.combatRows.filter((row) => row.kills > 0).map((row) => row.npcId))
        .toEqual([3940, 3941, 3942]);
      const first = member.steps.find((step) => step.actionId === objectives[0]!.id && step.combatXp > 0)!;
      expect(first.combatXp).toBeGreaterThan(0);
      expect(first.combatXp).toBeLessThan(member.combatXp);
    }
  });

  it("does not fund its own entry from a +5 enemy", () => {
    const state = progress();
    state.members[4]!.level = 27;
    expect(batch(state)).toBeNull();
  });

  it.each([false, true])("checks the next fight after earlier kills, with a level-up: %s", (levelsUp) => {
    const initial = component(), state = progress();
    const plan: CampaignPlan = { ...initial, combat: { ...initial.combat!,
      npcs: initial.combat!.npcs.map((npc) => npc.id === 3941
        ? { ...npc, minimumLevel: 33, maximumLevel: 33 } : npc),
    } };
    if (levelsUp) state.members = state.members.map((member) => ({ ...member,
      currentXp: FOREVER_XP_CURVE[28]! - 1,
    }));
    const counters = plan.actions.filter((action) => action.questChanges.some((change) =>
      change.state === "objectives-complete"));
    for (const member of forecastCampaignXp(plan, state)[0]!.members) {
      const first = member.steps.find((step) => step.actionId === counters[0]!.id && step.combatXp > 0)!;
      expect(first.status).toBe("projected");
      expect(first.before.level).toBe(28);
      if (levelsUp) {
        expect(first.after!.level).toBe(29);
        expect(member.blockedAtActionId).toBeNull();
        expect(member.rewards.map((reward) => reward.questId)).toEqual([1012]);
      } else {
        expect(member.blockedAtActionId).toBe(counters[1]!.id);
        expect(member.rewards).toEqual([]);
      }
    }
  });

  it("does not invent completion of Forsaken Diseases", () => {
    const state = progress();
    state.members = state.members.map((member) => ({ ...member, questStates: {} }));
    expect(batch(state)).toBeNull();
  });

  it.each(["fast", "expected", "slow"] as const)(
    "preserves all five player bars and saved combat counters: %s", (lootScenario) => {
      const plan = component(), state = progress();
      const boundaries = plan.actions.filter((action) => action.questChanges.some((change) =>
        change.state === "objectives-complete")).map((action) => action.id);
      const forecast = forecastCampaignXp(plan, state, { lootScenario,
        captureCombatAfterActionIds: boundaries });
      for (const member of forecast[0]!.members) {
        expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
        expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[1012, 3200]]);
        expect(member.combatXp).toBeGreaterThan(0);
        expect(member.estimatedCombatXp).toBe(0);
        expect(member.questLog.peak).toBeLessThanOrEqual(40);
      }
      for (const boundary of boundaries) {
        const handoff = campaignRouteHandoff({ difficultyPolicy: "experienced-premade",
          starterMode: "together", strategy: "dungeons", optionalStops: true, lootScenario,
          sourceBuild: 70205, progress: state, actions: plan.actions, forecast,
        }, boundary);
        expect(handoff.combatProjection).toBeDefined();
        const saved = premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress)));
        const index = plan.actions.findIndex((action) => action.id === boundary) + 1;
        const restored = forecastCampaignXp(plan, saved, { lootScenario,
          fromActionId: plan.actions[index]!.id, initialBounds: handoff.xpBounds,
          initialCombatProjection: JSON.parse(JSON.stringify(handoff.combatProjection)),
        });
        for (let player = 0; player < 5; player++)
          expect(restored.flatMap((section) => section.members[player]!.steps)).toEqual(
            forecast.flatMap((section) => section.members[player]!.steps).filter((step) =>
              plan.actions.findIndex((action) => action.id === step.actionId) >= index));
      }
    },
  );

  it("exports the common pickup, every counter and one reward for both roles", () => {
    const plan = component();
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.ashenvale",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: [] });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      for (const tag of ["accept", "turnin"])
        expect(text.match(new RegExp(`\\.${tag} 1012\\b`, "g"))).toHaveLength(1);
      for (const index of [1, 2, 3])
        expect(text.match(new RegExp(`\\.complete 1012,${index}\\b`, "g"))).toHaveLength(1);
    }
  });
});
