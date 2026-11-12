import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { activeCampaignActions } from "./campaign.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { stageRazorfenEntrance } from "./campaign-razorfen-entrance.js";
import fixture from "./fixtures/razorfen-entrance-70205.json" with { type: "json" };

function control(): CampaignPlan {
  const phases = fixture.actions as readonly CampaignAction[];
  const actions: readonly CampaignAction[] = [
    { ...phases[0]!, id: "theramore-handoff", legId: "desolace", optionalForQuestIds: [],
      questChanges: [{ questId: 1267, state: "rewarded", title: "The Missing Diplomat", objectiveIndex: null }],
      positions: [{ sourceLine: 0, position: { zone: "1445", x: 66.5, y: 49.5, floor: null, space: "map-percent" } }] },
    { ...phases[0]!, id: "desolace-journey", legId: "desolace", questChanges: [], optionalForQuestIds: [],
      positions: [{ sourceLine: 0, position: { zone: "1443", x: 66.5, y: 7.9, floor: null, space: "map-percent" } }] },
    ...phases,
  ];
  return { release: "outdoor-entrance-regression", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sourceArchiveSha256: fixture.sourceArchiveSha256, sharedQuestsOnly: true,
    rewardFacts: questRewardFactSchema.array().parse(fixture.rewardFacts) as readonly QuestRewardFact[], actions,
    legs: ["desolace", "dungeon-razorfen-downs"].map((id) => ({ id, title: id, from: 33, to: 40,
      kind: id === "desolace" ? "preparation" : "dungeon", stopId: id === "desolace" ? null : "razorfen-downs",
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: id === "desolace" ? [1267] : [6626], unresolvedQuestIds: [] })) };
}

describe("the outdoor Razorfen entrance", () => {
  it("moves the three existing phases between Theramore and Desolace without duplicating them", () => {
    const input = control(), original = structuredClone(input);
    const result = stageRazorfenEntrance(input, questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat));
    expect(result).not.toBe(input);
    expect(result.actions.map((action) => action.id)).toEqual([
      "theramore-handoff", "razorfen-outdoor-entrance-travel", "razorfen-outdoor-entrance-entry",
      ...fixture.actions.map((action) => action.id), "razorfen-outdoor-entrance-onward", "desolace-journey",
    ]);
    expect(result.actions.find((action) => action.id === "razorfen-outdoor-entrance-entry")?.targetLevel).toBe(30);
    expect(result.actions.filter((action) => action.questChanges.some((change) => change.questId === 6626)))
      .toEqual(fixture.actions.map((action) => ({ ...action, legId: "desolace",
        combatEnvironment: "outdoor", location: { zone: "1413", visitOverride: true } })));
    expect(result.legs.flatMap((leg) => leg.actionIds)).toEqual(result.actions.map((action) => action.id));
    expect(result.legs[1]!.questIds).not.toContain(6626);
    expect(stageRazorfenEntrance(result, questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat))).toBe(result);
    expect(input).toEqual(original);
  });

  it("credits exactly 24 shared outdoor kills and one 8,200-XP reward to all five actual classes", () => {
    const data = combatDatasetSchema.parse(fixture.combat), staged = stageRazorfenEntrance(control(), questCatalogSchema.parse(fixture.catalog), data);
    const plan = attachCampaignCombat(staged, [], data, "pinned-outdoor-entrance");
    expect(plan.combat?.activities).toHaveLength(1);
    expect(plan.combat?.activities[0]?.environment).toBe("outdoor");
    expect(plan.combat?.activities[0]?.objectives.map((objective) => objective.requiredKills)).toEqual([8, 8, 8]);
    const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    const progress = { ...initial, members: initial.members.map((member, index) => ({ ...member,
      raceId: "human" as const, classSlug: classes[index]!, level: 34, currentXp: 0, xpNeedsUpdate: false })) };
    const forecast = forecastCampaignXp(plan, progress, { fromActionId: "razorfen-outdoor-entrance-travel" });
    for (let index = 0; index < 5; index++) {
      const rows = forecast.map((section) => section.members[index]!);
      expect(rows.find((row) => row.blockedReason)?.blockedReason).toBeUndefined();
      expect(rows.flatMap((row) => row.rewards).filter((reward) => reward.questId === 6626).map((reward) => reward.xp)).toEqual([8200]);
      expect(rows.flatMap((row) => row.combatRows).reduce((sum, row) => sum + row.kills, 0)).toBe(24);
      expect(rows.flatMap((row) => row.combatRows).every((row) => row.environment === "outdoor")).toBe(true);
    }
  });

  it("uses the actual departure after intervening couriers instead of silently leaving the quest for RFD", () => {
    const initial = control();
    const courier: CampaignAction = {
      ...initial.actions[1]!, id: "duskwood-courier", title: "Finish the Duskwood courier",
      instructions: ["Finish the selected courier in Darkshire."],
      positions: [{ sourceLine: 0, position: { zone: "1431", x: 74, y: 44, floor: null, space: "map-percent" } }],
    };
    const actions = [initial.actions[0]!, courier, ...initial.actions.slice(1)];
    const input: CampaignPlan = { ...initial, actions, legs: initial.legs.map((leg) => ({ ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id) })) };
    const result = stageRazorfenEntrance(input, questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat));
    expect(result).not.toBe(input);
    expect(result.actions.map((action) => action.id).slice(0, 4)).toEqual([
      "theramore-handoff", "duskwood-courier", "razorfen-outdoor-entrance-travel", "razorfen-outdoor-entrance-entry",
    ]);
    const trip = result.actions.find((action) => action.id === "razorfen-outdoor-entrance-travel")!;
    expect(trip.instructions[0]).toContain("Duskwood");
    expect(result.actions.findIndex((action) => action.id === "dungeon-razorfen-downs-rewarded-6626"))
      .toBeLessThan(result.actions.findIndex((action) => action.id === "desolace-journey"));
    expect(result.actions.filter((action) => action.questChanges.some((change) => change.questId === 6626))).toHaveLength(3);
  });

  it.each(["another leg", "ambiguous departure"])("does not guess a journey across %s", (kind) => {
    const initial = control();
    const intervening: CampaignAction = { ...initial.actions[1]!, id: "intervening",
      ...(kind === "another leg" ? { legId: "unrelated-visit" } : {
        positions: [...initial.actions[0]!.positions, ...initial.actions[1]!.positions],
      }),
    };
    const input = { ...initial, actions: [initial.actions[0]!, intervening, ...initial.actions.slice(1)] };
    expect(stageRazorfenEntrance(input, questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat))).toBe(input);
  });

  it("respects the existing opt-out for all travel and quest phases", () => {
    const result = stageRazorfenEntrance(control(), questCatalogSchema.parse(fixture.catalog), combatDatasetSchema.parse(fixture.combat));
    const initial = emptyPremadeProgress(), progress = { ...initial, selectedExtras: { ...initial.selectedExtras, "6626": false } };
    expect(activeCampaignActions(result, progress).some((action) => action.id.startsWith("razorfen-outdoor-") ||
      action.questChanges.some((change) => change.questId === 6626))).toBe(false);
  });

  it.each(["inside spawn", "unknown level", "class restriction", "changed quota", "different provider", "missing handoff"])("holds an unqualified entrance program: %s", (kind) => {
    const input = control(), catalog = questCatalogSchema.parse(fixture.catalog), data = combatDatasetSchema.parse(fixture.combat);
    if (kind === "inside spawn") data.npcs[0]!.zoneIds = [722];
    if (kind === "unknown level") data.npcs[0]!.maximumLevel = null;
    if (kind === "class restriction") catalog.quests[0]!.requiredClasses = 1;
    if (kind === "changed quota") data.quests[0]!.killQuotas![0]!.kills = 9;
    if (kind === "different provider") data.provider.revision = "f".repeat(40);
    const plan = kind === "missing handoff" ? { ...input, actions: input.actions.slice(1) } : input;
    expect(stageRazorfenEntrance(plan, catalog, data)).toBe(plan);
  });
});
