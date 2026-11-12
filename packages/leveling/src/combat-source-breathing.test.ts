import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignQuestChange, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { getGuideStepView, importedChapterSchema } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { combatDatasetSchema } from "./combat-model.js";
import { attachCampaignCombat, indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { questRewardFactSchema } from "./quest-rewards.js";
import fixture from "./fixtures/drowned-sorrows-breathing-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function input(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  combat: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const guide = importedChapterSchema.parse(fixture.guide);
  const sources = [{ guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! }];
  const actions: CampaignAction[] = fixture.actions.map((action) => {
    const step = guide.steps.find((step) => step.id === action.source.stepId)!;
    return { id: action.id, title: action.title, legId: "coast", instructions: [],
      source: campaignActionSource(guide, step, step.directives),
      positions: step.directives.flatMap((row) => row.position
        ? [{ sourceLine: row.sourceLine, position: row.position }] : []),
      questChanges: action.questChanges.map((change): CampaignQuestChange => {
        if (change.state !== "accepted" && change.state !== "objectives-complete" && change.state !== "rewarded")
          throw new Error("Unexpected captured quest phase");
        return { ...change, state: change.state };
      }),
      requiredQuestIds: action.questChanges[0]!.state === "accepted" ? [663] : [],
      kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    };
  });
  const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward }
    = questRewardFactSchema.parse(fixture.reward);
  return { sources, combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-coast", race: "human", leaderClass: "warrior", targetBuild: 70205,
      sourceArchiveSha256: fixture.provenance.sourceArchiveSha256, sharedQuestsOnly: true,
      sharedSourceQuestIds: [662, 663, 664, 666], actions,
      legs: [{ id: "coast", title: "Drowned Sorrows", kind: "preparation", from: 35, to: 41,
        actionIds: actions.map((action) => action.id), questIds: [664], stopId: null, unresolvedQuestIds: [] }],
      rewardFacts: [{ ...reward, minimumLevel: fixture.quest.minimumLevel,
        ...(rewardBasis === undefined ? {} : { rewardBasis }),
        ...(evidenceKind === undefined ? {} : { evidenceKind }),
        ...(clientReference === undefined ? {} : { clientReference }),
        ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
        ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
      }],
    },
  };
}

function progress(level: number): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  return { ...base, difficultyPolicy: "experienced-premade",
    members: base.members.map((member, index) => ({ ...member, raceId: "human",
      classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
      questStates: { "663": "rewarded" as const },
    })),
  };
}

describe("breathing utility on captured death counters", () => {
  it.each(["source-step-0148", "source-step-0155"])(
    "retains both exact kill quotas for all five classes at %s", (stepId) => {
      const data = input(), before = structuredClone(data);
      for (const classSlug of classes) {
        const step = data.sources[0]!.guide.steps.find((row) => row.id === stepId)!;
        const view = getGuideStepView(step, createCampaignSourceProfile("human", classSlug), { dungeons: [] });
        const objectives = resolveCombatObjectives(view.directives, indexCombatReferences(data.combat), "captured-coast");
        expect(objectives.map((row) => [row.objectiveIndex, row.npcIds, row.requiredKills, row.credit]))
          .toEqual([[1, [2595], 10, "shared-kills"], [2, [2596], 3, "shared-kills"]]);
      }
      expect(data).toEqual(before);
    },
  );

  it("classifies the complete source program as shared kills while keeping the native potion hint", () => {
    const data = input();
    const library = buildCampaignQuestLibrary(data.sources, createCampaignSourceProfile("human", "warrior"),
      [], new Set(), data.combat.quests, { ordinaryQuestIds: new Set(data.plan.sharedSourceQuestIds) });
    expect(library.find((quest) => quest.questId === 664)).toMatchObject({ complete: true,
      held: false, objective: "shared-kills" });
    const plan = attachCampaignCombat(data.plan, data.sources, data.combat, "breathing-review");
    const objectives = plan.combat!.activities.flatMap((activity) => activity.objectives);
    expect(objectives.map((row) => [row.npcIds, row.requiredKills, row.credit]))
      .toEqual([[[2595], 10, "shared-kills"], [[2596], 3, "shared-kills"]]);
    for (const member of forecastCampaignXp(plan, progress(36))[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[664, 3150]]);
      expect(member.combatXp).toBeGreaterThan(0);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.questLog.peak).toBeLessThanOrEqual(40);
    }
    const counter = plan.actions[2]!;
    const native = campaignNativeInstructions(plan, data.sources)(counter)!;
    expect(native.directives).toContainEqual(expect.objectContaining({ tag: ".use", arguments: "5996" }));
    expect(counter.source).toEqual(data.plan.actions[2]!.source);
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.breathing", runtimeBuild: 70450,
      interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: data.sources });
    for (const role of ["leader", "party"]) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text.match(/\.complete 664,1\b/g)).toHaveLength(1);
      expect(text.match(/\.complete 664,2\b/g)).toHaveLength(1);
      expect(text.match(/\.use 5996\b/g)).toHaveLength(1);
    }
  });

  it("keeps the ordinary enemy level limit for the three sorceresses", () => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "breathing-review");
    for (const member of forecastCampaignXp(plan, progress(35))[0]!.members) {
      expect(member.blockedAtActionId).toBe(plan.actions[2]!.id);
      expect(member.rewards).toEqual([]);
    }
  });

  it("keeps the native utility only on its own reconciled counter", () => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "breathing-review");
    const hasPotion = (candidate: CampaignPlan, action: CampaignAction): boolean =>
      campaignNativeInstructions(candidate, data.sources)(action)!.directives
        .some((row) => row.tag === ".use" && row.arguments === "5996");
    expect(hasPotion(plan, plan.actions[1]!)).toBe(false);
    expect(hasPotion(data.plan, data.plan.actions[2]!)).toBe(false);
    for (const reason of ["other-action", "unknown-credit", "conflict"]) {
      const held: CampaignPlan = { ...plan, combat: { ...plan.combat!,
        activities: plan.combat!.activities.map((activity) => ({ ...activity,
          ...(reason === "other-action" ? { actionId: "another-action" } : {}),
          objectives: activity.objectives.map((objective) => ({ ...objective,
            ...(reason === "unknown-credit" ? { credit: "unknown" as const } : {}),
            ...(reason === "conflict" ? { quotaConflict: true } : {}),
          })),
        })),
      } };
      expect(hasPotion(held, held.actions[2]!)).toBe(false);
    }
  });

  it.each(["unknown-item", "quest-tool", "cast", "gossip", "interact", "missing-quota", "conflict",
    "interaction-reference", "item-reference", "different-target", "missing-target", "multi-item-use"])(
    "does not excuse a real or unproved method: %s", (reason) => {
      const data = input(), step = data.sources[0]!.guide.steps.find((row) => row.id === "source-step-0148")!;
      let directives = getGuideStepView(step, createCampaignSourceProfile("human", "warrior"), { dungeons: [] }).directives;
      const quest = data.combat.quests[0]!;
      if (reason === "unknown-item" || reason === "quest-tool" || reason === "multi-item-use")
        directives = directives.map((row) => row.tag === ".use" ? { ...row,
          arguments: reason === "quest-tool" ? "7297" : reason === "multi-item-use" ? "5996,7297" : "999999" } : row);
      if (["cast", "gossip", "interact"].includes(reason)) directives = [...directives,
        { ...directives.find((row) => row.tag === ".use")!, tag: "." + reason }];
      if (reason === "missing-quota") data.combat.quests[0] = { ...quest, killQuotas: [] };
      if (reason === "conflict") data.combat.quests[0] = { ...quest, killQuotaConflicts: [2] };
      if (reason === "interaction-reference") data.combat.quests[0] = { ...quest, onlyInteractionObjectives: true };
      if (reason === "item-reference") data.combat.quests[0] = { ...quest, onlyCreatureObjectives: false,
        itemCreatureIds: [2596] };
      if (reason === "different-target" || reason === "missing-target") directives = directives.flatMap((row) =>
        row.tag === ".mob" && row.arguments.includes("Sorceress")
          ? reason === "missing-target" ? [] : [{ ...row, arguments: "+Friendly Wanderer" }] : [row]);
      const objectives = resolveCombatObjectives(directives, indexCombatReferences(data.combat), "negative-coast");
      expect(objectives.find((row) => row.objectiveIndex === 2)?.credit).not.toBe("shared-kills");
    },
  );
});
