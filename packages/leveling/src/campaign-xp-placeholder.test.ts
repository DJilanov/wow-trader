import { describe, expect, it } from "vitest";
import { attachRivergladesXpPlaceholder, RIVERGLADES_XP_PLACEHOLDER } from "./campaign-xp-placeholder.js";
import { activeCampaignActions, type CampaignAction, type CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignRouteHandoff } from "./campaign-route-handoff.js";
import { emptyPremadeProgress, premadeProgressSchema, type PremadeProgress } from "./premade-model.js";
import { auditCampaignGuideFunding } from "./campaign-funding-audit.js";
import { compileCampaignAddon } from "./campaign-addon.js";

function fixture(): CampaignPlan {
  const legId = "scarlet-northern-return";
  const gate: CampaignAction = { id: "north-departure", legId, title: "Check entry",
    instructions: [], questChanges: [], positions: [], source: null, kind: "xp-check",
    leaderOnly: false, raidOnly: false, targetLevel: 38, targetStopId: "scarlet-monastery" };
  return { release: "placeholder-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sharedQuestsOnly: true, actions: [gate],
    legs: [{ id: legId, title: "Northern preparation", kind: "preparation", from: 36, to: 38,
      actionIds: [gate.id], questIds: [], unresolvedQuestIds: [], stopId: null }] };
}

function progress(level = 36, currentXp = 32371): PremadeProgress {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, difficultyPolicy: "experienced-premade",
    combatPlanning: { outdoorXpMultiplier: 10, incidentalKillXpPercent: 100, outdoorIncidentalKillXpPercent: 30 },
    members: initial.members.map((member, index) => ({ ...member, raceId: "human", classSlug: classes[index]!,
      level, currentXp, xpNeedsUpdate: false })) };
}

describe("owner-requested Riverglades XP placeholder", () => {
  it("adds one visible temporary task before the SM departure without inventing quests or coordinates", () => {
    const original = fixture(), before = structuredClone(original), plan = attachRivergladesXpPlaceholder(original);
    expect(plan.actions.map((action) => action.id)).toEqual(["riverglades-farm-to-37-placeholder", "north-departure"]);
    expect(plan.actions[0]).toMatchObject({ title: "Farm to level 37 · temporary Riverglades placeholder",
      xpPlaceholder: RIVERGLADES_XP_PLACEHOLDER, questChanges: [], positions: [], source: null });
    expect(plan.actions[0]!.instructions.join(" ")).toContain("five Riverglades quests");
    expect(plan.legs[0]!.actionIds).toEqual(plan.actions.map((action) => action.id));
    expect(attachRivergladesXpPlaceholder(plan)).toBe(plan);
    expect(original).toEqual(before);
    const personal = { ...original, sharedQuestsOnly: undefined };
    const { sharedQuestsOnly: _shared, ...notShared } = personal;
    expect(attachRivergladesXpPlaceholder(notShared)).toBe(notShared);
    const starter = { ...original, actions: [], legs: [] };
    expect(attachRivergladesXpPlaceholder(starter)).toBe(starter);
  });

  it("farms only each remaining gap to37 without group division or incidental multipliers", () => {
    const plan = attachRivergladesXpPlaceholder(fixture()), forecast = forecastCampaignXp(plan, progress());
    for (const member of forecast[0]!.members) {
      expect(member.knownEndpoint).toEqual({ level: 37, currentXp: 0 });
      expect(member.combatXp).toBe(39229);
      expect(member.estimatedCombatXp).toBe(39229);
      expect(member.outdoorCombatXp).toBe(39229);
      expect(member.incidentalCombatXp).toBe(0);
      expect(member.referenceQuestXp).toBe(0);
      expect(member.estimatedQuestXp).toBe(0);
      expect(member.rewards).toEqual([]);
      expect(member.combatRows).toEqual([]);
      expect(member.steps).toHaveLength(1);
      expect(member.issues.some((issue) => issue.code === "combat-scenario-estimated" &&
        issue.message.includes("placeholder"))).toBe(true);
    }
    const audit = auditCampaignGuideFunding(plan, progress());
    expect(audit.witnessPassed).toBe(true);
    expect(audit.chapters[0]!.players.every((player) => player.plannedFarmXp === 39229 &&
      player.requiredKillXp === 0 && player.usesEstimates)).toBe(true);
  });

  it("carries XP bounds and a serialized handoff without adding the placeholder twice", () => {
    const plan = attachRivergladesXpPlaceholder(fixture()), state = progress();
    const initialBounds = state.members.map(() => ({ minimum: { level: 36, currentXp: 32371 },
      maximum: { level: 36, currentXp: 47310 } }));
    const forecast = forecastCampaignXp(plan, state, { initialBounds });
    expect(forecast[0]!.members[0]!.xpBounds?.finish).toEqual({ minimum: { level: 37, currentXp: 0 },
      maximum: { level: 37, currentXp: 0 } });
    const handoff = campaignRouteHandoff({ progress: state, forecast, actions: activeCampaignActions(plan, state),
      difficultyPolicy: state.difficultyPolicy, starterMode: "together", strategy: "dungeons",
      optionalStops: true, lootScenario: "expected", sourceBuild: plan.targetBuild }, plan.actions[0]!.id);
    const saved = premadeProgressSchema.parse(JSON.parse(JSON.stringify(handoff.progress)));
    const restored = forecastCampaignXp(plan, saved, { initialBounds: handoff.xpBounds, fromActionId: "north-departure" });
    for (const member of restored[0]!.members) {
      expect(member.knownEndpoint).toEqual({ level: 37, currentXp: 0 });
      expect(member.estimatedCombatXp).toBe(0);
    }
  });

  it("does not invent XP when one participant's starting bar is unknown", () => {
    const plan = attachRivergladesXpPlaceholder(fixture()), initial = progress();
    const state = { ...initial, members: initial.members.map((member, index) =>
      index === 2 ? { ...member, level: null, currentXp: null, xpNeedsUpdate: true } : member) };
    expect(forecastCampaignXp(plan, state)[0]!.members.every((member) => member.estimatedCombatXp === 0)).toBe(true);
  });

  it("keeps higher-level players' bars and calculates a different gap for every lower player", () => {
    const plan = attachRivergladesXpPlaceholder(fixture()), initial = progress();
    const bars = [{ level: 36, currentXp: 32371 }, { level: 36, currentXp: 60000 },
      { level: 37, currentXp: 8000 }, { level: 35, currentXp: 5000 }, { level: 37, currentXp: 0 }];
    const state = { ...initial, members: initial.members.map((member, index) => ({ ...member, ...bars[index]! })) };
    const members = forecastCampaignXp(plan, state)[0]!.members;
    expect(members.map((member) => member.estimatedCombatXp)).toEqual([39229, 11600, 0, 133700, 0]);
    expect(members.map((member) => member.knownEndpoint)).toEqual([
      { level: 37, currentXp: 0 }, { level: 37, currentXp: 0 }, { level: 37, currentXp: 8000 },
      { level: 37, currentXp: 0 }, { level: 37, currentXp: 0 },
    ]);
  });

  it("stops planned XP at the level60 cap", () => {
    const plan = attachRivergladesXpPlaceholder(fixture());
    for (const member of forecastCampaignXp(plan, progress(60, 0))[0]!.members) {
      expect(member.knownEndpoint).toEqual({ level: 60, currentXp: 0 });
      expect(member.estimatedCombatXp).toBe(0);
    }
  });

  it("exports a real level37 RestedXP checkpoint for the temporary task", () => {
    const plan = attachRivergladesXpPlaceholder(fixture());
    const compiled = compileCampaignAddon(plan, activeCampaignActions(plan, progress()), {
      version: "0.2.0-placeholder-test", runtimeBuild: 70450, interfaceVersion: 16001,
      restedXpVersion: "v4.11.27", partyStarter: { race: "human", classSlug: "warrior" },
    });
    expect(compiled.lua).toContain(".xp 37 >> Farm to level 37");
    expect(compiled.lua).toContain("five Riverglades quests");
  });

  it.each([0, -1, 1.5, 61])("rejects an invalid placeholder level%s", (amount) => {
    const plan = attachRivergladesXpPlaceholder(fixture());
    const invalid = { ...plan, actions: plan.actions.map((action) => action.xpPlaceholder
      ? { ...action, xpPlaceholder: { ...action.xpPlaceholder, targetLevel: amount } } : action) };
    expect(() => forecastCampaignXp(invalid, progress())).toThrow("Invalid shared farming XP placeholder");
  });
});
