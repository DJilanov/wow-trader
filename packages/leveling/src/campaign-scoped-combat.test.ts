import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import { combatDatasetSchema } from "./combat-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { expandCampaignDungeonObjectives } from "./campaign-dungeon-objectives.js";
import fixture from "./fixtures/scarlet-library-70205.json" with { type: "json" };

function work(id: string, indices: readonly number[]): CampaignAction {
  return { id, legId: id, title: id, instructions: [], kind: "quests", source: null, positions: [],
    questChanges: indices.map((objectiveIndex) => ({ questId: 1053, state: "objectives-complete", title: "In the Name of the Light", objectiveIndex })),
    combatObjectiveScope: "listed", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    location: { zone: "1420", insideDungeon: id === "early" ? "sm-library" : "scarlet-monastery" } };
}
function plan(actions: readonly CampaignAction[]): CampaignPlan {
  const pickup: CampaignAction = { ...work("pickup", []),
    questChanges: [{ questId: 1053, state: "accepted", title: "In the Name of the Light", objectiveIndex: null }] };
  const entries = [pickup, ...actions];
  return { release: "scoped-combat-regression", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sharedQuestsOnly: true, sourceArchiveSha256: fixture.sourceArchiveSha256, actions: entries,
    dungeonCollectionPolicy: "selected-clear", acquisitionXpPolicy: "exclude-unpriced-extra", incidentalKillXpPercent: 10,
    legs: entries.map((action) => ({ id: action.legId, title: action.title, kind: "dungeon", from: 34, to: 40,
      stopId: null, dungeonVisitId: action.legId === "early" ? "sm-library" : "scarlet-monastery",
      actionIds: [action.id], questIds: [1053], unresolvedQuestIds: [] })),
    rewardFacts: [{ questId: 1053, fullXp: 1000, questLevel: 40, minimumLevel: 34, xpByLevel: [],
      status: "available", evidenceKind: "published-forever", sourceUrl: "https://example.test/scoped-counter-regression", capturedAt: "2026-11-04T00:00:00Z" }] };
}
function progress() {
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, members: initial.members.map((member, index) => ({ ...member, raceId: "human" as const, classSlug: classes[index]!,
    level: 34, currentXp: 0, xpNeedsUpdate: false, questStates: { "261": "rewarded" as const, "1052": "rewarded" as const } })) };
}

describe("explicit generated counter scopes", () => {
  it("binds the early Library action only to Loksey, preserving the future boss counters", () => {
    const data = combatDatasetSchema.parse(fixture.combat), early = work("early", [4]), later = work("later", [3, 1, 2]);
    const attached = attachCampaignCombat(plan([early, later]), [], data, "fixture");
    expect(attached.combat?.activities.find((activity) => activity.actionId === "early")?.objectives.map((objective) => objective.npcIds)).toEqual([[3974]]);
    expect(attached.combat?.activities.find((activity) => activity.actionId === "early")?.questWide).toBe(false);
    expect(createCampaignCombatReadiness(attached)(early).targetLevel).toBeLessThanOrEqual(34);
    expect(createCampaignCombatReadiness(attached)(later).targetLevel).toBeGreaterThan(34);
    expect(attached.combat?.questObjectiveIndexes?.["1053"]).toEqual([1, 2, 3, 4]);
    const forecast = forecastCampaignXp(attached, progress(), { throughActionId: "early" });
    const earlyResult = forecast.find((section) => section.sectionId === "early")!;
    for (const member of earlyResult.members) {
      expect(member.blockedReason, JSON.stringify(member.combatRows)).toBeNull();
      expect(member.rewards).toEqual([]);
    }
    expect(earlyResult.members[0]?.combatRows.filter((row) => row.kills > 0).map((row) => row.npcId)).toEqual([3974]);
  });

  it("keeps the legacy whole-quest safety check when no explicit scope is supplied", () => {
    const { combatObjectiveScope, ...unscoped } = work("early", [4]);
    expect(combatObjectiveScope).toBe("listed");
    const attached = attachCampaignCombat(plan([unscoped]), [], combatDatasetSchema.parse(fixture.combat), "fixture");
    expect(createCampaignCombatReadiness(attached)(unscoped).targetLevel).toBeGreaterThan(34);
  });

  it("does not turn one completed counter into a whole quest or grant an early reward", () => {
    const early = work("early", [4]), handin: CampaignAction = { ...work("later", []), id: "handin",
      questChanges: [{ questId: 1053, title: "In the Name of the Light", state: "rewarded", objectiveIndex: null }] };
    const attached = attachCampaignCombat(plan([early, handin]), [], combatDatasetSchema.parse(fixture.combat), "fixture");
    const forecast = forecastCampaignXp(attached, progress());
    expect(forecast.at(-1)?.members[0]?.rewards).toEqual([]);
    expect(forecast.at(-1)?.members[0]?.blockedAtActionId).toBe("handin");
  });

  it("rejects contradictory whole-quest and listed-counter declarations", () => {
    const data = combatDatasetSchema.parse(fixture.combat), input = plan([{ ...work("early", [4]), wholeQuestObjectives: true }]);
    expect(() => attachCampaignCombat(input, [], data, "fixture")).toThrow("simultaneously");
    expect(() => expandCampaignDungeonObjectives(input, data)).toThrow("simultaneously");
  });
});
