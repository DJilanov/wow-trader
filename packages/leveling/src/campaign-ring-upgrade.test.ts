import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema, questCatalogRewardFacts } from "./quest-catalog.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { attachCampaignRingUpgrade } from "./campaign-ring-upgrade.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixtureData from "./fixtures/gnomeregan-ring-70205.json" with { type: "json" };

function fixture(): { plan: CampaignPlan; data: ReturnType<typeof combatDatasetSchema.parse> } {
  const data = combatDatasetSchema.parse(fixtureData.combat);
  const catalog = questCatalogSchema.parse(fixtureData.catalog);
  const ids = [2945, 2947, 2948];
  const actions = ids.flatMap((questId) => {
    const quest = campaignDungeonQuest(questId)!;
    return (["accepted", "objectives-complete", "rewarded"] as const).map((state): CampaignAction => ({
      id: `ring-${questId}-${state}`, legId: "ring", title: quest.title,
      instructions: [state === "accepted" ? quest.pickup! : state === "rewarded" ? quest.turnin! : quest.objective!],
      questChanges: [{ questId, state, title: quest.title, objectiveIndex: state === "objectives-complete" ? 1 : null }],
      ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
      positions: [], source: null, kind: "quests", leaderOnly: false, raidOnly: false,
      targetLevel: null, targetStopId: null,
    }));
  });
  const facts = questRewardFactSchema.array().parse(fixtureData.rewards).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...required } = fact;
    return { ...required,
      ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(clientReference === undefined ? {} : { clientReference }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
    };
  });
  const base: CampaignPlan = {
    release: "ring-component", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sourceArchiveSha256: fixtureData.sourceArchiveSha256, sharedQuestsOnly: true,
    dungeonCollectionPolicy: "selected-clear", acquisitionXpPolicy: "exclude-unpriced-extra",
    rewardFacts: questCatalogRewardFacts(facts, catalog), actions,
    legs: [{ id: "ring", title: "Gnomeregan ring and Ironforge return", kind: "dungeon", from: 29, to: 30,
      stopId: "gnomeregan", questIds: ids, unresolvedQuestIds: [], actionIds: actions.map((action) => action.id) }],
  };
  const routed = batchCampaignDungeonFlow(attachCampaignLocations(base, []));
  return { data, plan: expandCampaignDungeonObjectives(routed, data) };
}

describe("complete owner-selected Gnomeregan ring chain", () => {
  it("accepts Return of the Ring inside and handles the upgrade on the Ironforge return", () => {
    const { plan } = fixture(), order = plan.actions.map((action) => action.id);
    expect(order).not.toContain("ring-2945-objectives-complete");
    expect(order).not.toContain("ring-2947-objectives-complete");
    expect(order.indexOf("ring-2945-rewarded")).toBeLessThan(order.indexOf("ring-2947-accepted"));
    expect(order.indexOf("ring-2947-rewarded")).toBeLessThan(order.indexOf("ring-2948-accepted"));
    expect(plan.actions.find((action) => action.id === "ring-2947-accepted")!.location?.insideDungeon).toBe("gnomeregan");
    expect(plan.actions.find((action) => action.id === "ring-2948-objectives-complete")!.location).toEqual({ zone: "1455" });
  });

  it("retains both material counters and the full cash fee, without inventing mining, drops or free supplies", () => {
    const input = fixture(), before = structuredClone(input);
    const plan = attachCampaignCombat(input.plan, [], input.data, "ring-fixture");
    const work = plan.actions.find((action) => action.id === "ring-2948-objectives-complete")!;
    expect(work.questChanges.map((change) => change.objectiveIndex)).toEqual([1, 2]);
    expect(plan.itemRequirements?.filter((item) => item.questId === 2948)).toEqual([
      { questId: 2948, objectiveIndex: 1, itemId: 2842, quantity: 1 },
      { questId: 2948, objectiveIndex: 2, itemId: 1206, quantity: 1 },
    ]);
    expect(plan.combat?.activities.some((activity) => activity.objectives.some((objective) => objective.questId === 2948))).toBe(false);
    expect(plan.actions.find((action) => action.id === "ring-2948-rewarded")!.minimumMoneyCopper).toBe(3000);
    expect(plan.actions.find((action) => action.id === "ring-2945-rewarded")!.minimumMoneyCopper).toBe(300);
    expect(plan.actions.some((action) => action.itemCollections?.some((target) => target.itemId === 9326 && target.quantity === 1))).toBe(true);
    expect(work.instructions.join(" ")).toContain("Buy or trade for 1 Silver Bar and 1 Moss Agate per player");
    expect(input).toEqual(before);
    expect(attachCampaignRingUpgrade(plan, input.data).plan).toBe(plan);
  });

  it.each(["quantity", "item", "profession", "provider", "archive", "class", "partial"])("rejects unreviewed procurement changes: %s", (change) => {
    const input = fixture();
    const enriched = attachCampaignCombat(input.plan, [], input.data, "ring-fixture");
    const reference = input.data.quests.find((quest) => quest.questId === 2948)!;
    if (change === "quantity") reference.itemObjectives![0]!.quantity = 2;
    if (change === "item") reference.itemObjectives![0]!.itemId = 2841;
    if (change === "profession") reference.objectiveText = ["Mine the Silver Bar yourself."];
    if (change === "provider") input.data.provider.revision = "a".repeat(40);
    if (change === "class") reference.requiredClasses = 128;
    let plan = change === "archive" ? { ...enriched, sourceArchiveSha256: "a".repeat(64) } : enriched;
    if (change === "partial") plan = { ...plan, actions: plan.actions.map((action) => action.id === "ring-2948-objectives-complete"
      ? { ...action, questChanges: action.questChanges.slice(0, 1) } : action) };
    expect(attachCampaignRingUpgrade(plan, input.data).objectives.size).toBe(0);
  });

  it("pays the real three rewards once per class after all required work, with zero assumed acquisition XP", () => {
    const input = fixture(), plan = attachCampaignCombat(input.plan, [], input.data, "ring-fixture");
    const base = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    const progress = { ...base, difficultyPolicy: "experienced-premade" as const,
      members: base.members.map((member, index) => ({ ...member, raceId: "human" as const, classSlug: classes[index]!,
        level: 29, currentXp: 0, xpNeedsUpdate: false })) };
    for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([2945, 2947, 2948]);
      expect(member.rewards.reduce((sum, reward) => sum + (reward.xp ?? 0), 0)).toBe(14000);
      expect(member.combatXp).toBe(0);
    }
  });

  it("keeps full material requirements when one of the two work counters is missing", () => {
    const input = fixture(), full = attachCampaignCombat(input.plan, [], input.data, "ring-fixture");
    const plan = { ...full, actions: full.actions.map((action) => action.id === "ring-2948-objectives-complete"
      ? { ...action, questChanges: action.questChanges.slice(0, 1) } : action) };
    const base = emptyPremadeProgress();
    const progress = { ...base, members: base.members.map((member) => ({ ...member, level: 35, currentXp: 0, xpNeedsUpdate: false })) };
    for (const member of forecastCampaignXp(plan, progress)[0]!.members)
      expect(member.rewards.some((reward) => reward.questId === 2948)).toBe(false);
  });

  it("exports both real item counters and separate cash checkpoints, without fake ring counters or abandonment", () => {
    const input = fixture(), plan = attachCampaignCombat(input.plan, [], input.data, "ring-fixture");
    const addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508, restedXpVersion: "v4.11.27",
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text).toContain(".complete 2948,1");
      expect(text).toContain(".complete 2948,2");
      expect(text).toContain(".money >0.03");
      expect(text).toContain(".money >0.3");
      for (const id of [2945, 2947, 2948]) {
        expect(text.match(new RegExp(`\\.accept ${id}\\b`, "g"))).toHaveLength(1);
        expect(text.match(new RegExp(`\\.turnin ${id}\\b`, "g"))).toHaveLength(1);
      }
      expect(text).not.toContain(".complete 2945");
      expect(text).not.toContain(".complete 2947");
      expect(text).not.toContain(".abandon 2948");
      expect(text.indexOf(".money >0.3")).toBeLessThan(text.indexOf(".turnin 2948"));
    }
  });
});
