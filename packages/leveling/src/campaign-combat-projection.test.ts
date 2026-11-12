import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignCombatProjectionSchema, type CampaignCombatProjection } from "./campaign-combat-projection.js";
import { campaignRouteHandoff, type CampaignRouteHandoff } from "./campaign-route-handoff.js";
import { forecastCampaignXp, type CampaignXpForecastOptions } from "./campaign-xp.js";
import { activeCampaignActions, type CampaignAction, type CampaignPlan } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { emptyPremadeProgress, premadeProgressSchema, type PremadeProgress } from "./premade-model.js";
import fixture from "./fixtures/sm-split-combat-70205.json" with { type: "json" };

function action(id: string, indices: readonly number[] = []): CampaignAction {
  return { id, legId: "scarlet", title: id, instructions: [], source: null, positions: [],
    kind: indices.length ? "quests" : "instructions", combatObjectiveScope: "listed",
    questChanges: indices.map((objectiveIndex) => ({ questId: 1053, title: "In the Name of the Light",
      state: "objectives-complete", objectiveIndex })), leaderOnly: false, raidOnly: false,
    targetLevel: null, targetStopId: null, location: { zone: "1420", insideDungeon: "scarlet-monastery" } };
}

function plan(): CampaignPlan {
  const actions = [{ ...action("pickup"), kind: "quests" as const, questChanges: [
    { questId: 1053, title: "In the Name of the Light", state: "accepted" as const, objectiveIndex: null },
  ] }, action("library", [4]), action("handoff"), action("other-bosses", [3, 2, 1]),
  { ...action("reward"), kind: "quests" as const, questChanges: [
    { questId: 1053, title: "In the Name of the Light", state: "rewarded" as const, objectiveIndex: null },
  ] }];
  return attachCampaignCombat({ release: "split-combat-regression", race: "human", leaderClass: "warrior",
    targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256, sharedQuestsOnly: true,
    actions, rewardFacts: [], legs: [{ id: "scarlet", title: "Scarlet Monastery", kind: "dungeon",
      dungeonVisitId: "scarlet-monastery", from: 37, to: 40, stopId: null,
      actionIds: actions.map((entry) => entry.id), questIds: [1053], unresolvedQuestIds: [] }] }, [],
  combatDatasetSchema.parse(fixture.combat), "captured-split");
}

function progress(): PremadeProgress {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, difficultyPolicy: "experienced-premade", members: initial.members.map((member, index) => ({
    ...member, raceId: "human", classSlug: classes[index]!, level: 37, currentXp: 0, xpNeedsUpdate: false,
    questStates: { "1052": "rewarded" },
  })) };
}

function capture(options: CampaignXpForecastOptions = {}): {
  route: CampaignPlan; initial: PremadeProgress; handoff: CampaignRouteHandoff;
  forecast: ReturnType<typeof forecastCampaignXp>;
} {
  const route = plan(), initial = progress(), forecast = forecastCampaignXp(route, initial, {
    ...options, captureCombatAfterActionIds: ["handoff"],
  });
  const handoff = campaignRouteHandoff({ progress: initial, forecast, actions: activeCampaignActions(route, initial),
    difficultyPolicy: initial.difficultyPolicy, starterMode: "together", strategy: "dungeons", optionalStops: true,
    lootScenario: options.lootScenario ?? "expected", sourceBuild: route.targetBuild }, "handoff");
  return { route, initial, forecast, handoff: JSON.parse(JSON.stringify(handoff)) as CampaignRouteHandoff };
}

function resume(route: CampaignPlan, handoff: CampaignRouteHandoff,
  options: CampaignXpForecastOptions = {}): ReturnType<typeof forecastCampaignXp> {
  return forecastCampaignXp(route, premadeProgressSchema.parse(handoff.progress), {
    fromActionId: "other-bosses", initialBounds: handoff.xpBounds,
    ...(handoff.combatProjection ? { initialCombatProjection: handoff.combatProjection } : {}), ...options,
  });
}

describe("explicit projected combat handoffs", () => {
  it.each(["fast", "expected", "slow"] as const)("preserves a split quest and its complete remaining forecast (%s)", (lootScenario) => {
    const { route, initial, forecast, handoff } = capture({ lootScenario }), before = structuredClone(handoff);
    expect(handoff.combatProjection).toBeDefined();
    expect(handoff.progress.members[0]!.questStates["1053"]).toBe("accepted");
    expect(handoff.combatProjection!.members[0]!.counters).toEqual({ "1053:1": 0, "1053:2": 0, "1053:3": 0, "1053:4": 1 });
    const restored = resume(route, handoff, { lootScenario });
    for (let player = 0; player < 5; player++) {
      const fresh = forecast.flatMap((section) => section.members[player]!.steps);
      expect(restored.flatMap((section) => section.members[player]!.steps)).toEqual(
        fresh.filter((step) => ["other-bosses", "reward"].includes(step.actionId)));
      expect(restored.at(-1)!.members[player]!.knownEndpoint).toEqual(forecast.at(-1)!.members[player]!.knownEndpoint);
      expect(fresh.filter((step) => step.phase === "rewarded" && step.status === "projected")).toHaveLength(1);
    }
    expect(handoff).toEqual(before);
    expect(initial).toEqual(progress());
    const { combatProjection: _snapshot, ...legacyHandoff } = handoff;
    expect(resume(route, legacyHandoff).at(-1)!.members[0]!.evidenceIssues.join(" ")).toContain("remaining kills are unknown");
  });

  it("does not collect snapshots unless explicitly requested", () => {
    const route = plan(), initial = progress(), before = structuredClone({ route, initial });
    expect(forecastCampaignXp(route, initial).every((section) => !("combatProjections" in section))).toBe(true);
    expect({ route, initial }).toEqual(before);
  });

  it("keeps actual accepted quest counters unknown in a captured projection", () => {
    const route = plan(), initial = progress();
    const actual = { ...initial, members: initial.members.map((member) => ({ ...member,
      questStates: { ...member.questStates, "1053": "accepted" as const },
      confirmations: { "campaign-objective-1053-4": true },
    })) };
    const sections = forecastCampaignXp(route, actual, { fromActionId: "handoff", captureCombatAfterActionIds: ["handoff"] });
    expect(sections[0]!.combatProjections!.handoff!.members[0]!.counters["1053:3"]).toBeNull();
    expect(sections.at(-1)!.members[0]!.evidenceIssues.join(" ")).toContain("remaining kills are unknown");
    const restored = forecastCampaignXp(route, actual, { fromActionId: "other-bosses",
      initialCombatProjection: sections[0]!.combatProjections!.handoff! });
    expect(restored.at(-1)!.members[0]!.evidenceIssues.join(" ")).toContain("remaining kills are unknown");
  });

  it.each(["bar", "identity", "quest", "confirmation", "setting", "build", "release", "bounds", "definition", "paid", "path"])(
    "rejects a mismatched saved projection (%s)", (change) => {
      const { route: original, handoff } = capture();
      let route = original;
      if (change === "bar") handoff.progress.members[0]!.currentXp!++;
      if (change === "identity") handoff.progress.members[0]!.classSlug = "mage";
      if (change === "quest") handoff.progress.members[0]!.questStates["1053"] = "objectives-complete";
      if (change === "confirmation") handoff.progress.members[0]!.confirmations["campaign-objective-1053-3"] = true;
      if (change === "setting") handoff.progress.difficultyPolicy = "at-level";
      if (change === "build") route = { ...route, targetBuild: 70450 };
      if (change === "release") route = { ...route, release: "other" };
      const projection = structuredClone(handoff.combatProjection!);
      if (change === "bounds") projection.members[0]!.maximumPosition.currentXp++;
      if (change === "definition") projection.members[0]!.definitions["1053:3"] = "changed";
      if (change === "paid") projection.members[0]!.paid.push("foreign-activity");
      if (change === "path") projection.members[0]!.pathKills["foreign-path:123"] = 1;
      expect(() => resume(route, { ...handoff, combatProjection: projection })).toThrow();
    },
  );

  it("rejects changed workload and invalid continuation boundaries", () => {
    const { route, handoff } = capture();
    expect(() => resume(route, handoff, { lootScenario: "slow" })).toThrow("settings or party");
    expect(() => resume(route, handoff, { fromActionId: "handoff" })).toThrow("start after");
    expect(() => resume(route, handoff, { fromActionId: "library" })).toThrow("start after");
    expect(() => resume(route, handoff, { fromActionId: "reward" })).toThrow("next active task");
    expect(() => forecastCampaignXp(route, progress(), { captureCombatAfterActionIds: ["handoff", "handoff"] })).toThrow("unique");
    expect(() => forecastCampaignXp(route, progress(), { captureCombatAfterActionIds: ["missing"] })).toThrow("active");
  });

  it("rejects malformed or duplicate member states at the serialization boundary", () => {
    const { handoff } = capture(), snapshot: CampaignCombatProjection = structuredClone(handoff.combatProjection!);
    snapshot.members[1]!.player = 1;
    expect(campaignCombatProjectionSchema.safeParse(snapshot).success).toBe(false);
    expect(campaignCombatProjectionSchema.safeParse({ ...handoff.combatProjection, extra: true }).success).toBe(false);
  });
});
