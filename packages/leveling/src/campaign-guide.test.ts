import { describe, expect, it } from "vitest";
import {
  forecastCampaignGuide,
  initializeCampaignGuideAnchors,
  recordCampaignGuideXp,
} from "./campaign-guide.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { recordPremadeXp, updatePremadeDungeonBundle } from "./premade.js";
import { getDungeonBundle } from "./dungeon-bundles.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

function route(personal = true): CampaignPlan {
  const actions = ["a", "b", "c"].map((id, index): CampaignAction => ({
    id,
    legId: index === 0 ? "start" : "world",
    title: `Quest ${index + 1}`,
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: personal,
    questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
      questId: 300001 + index,
      title: id,
      state: state as "accepted" | "objectives-complete" | "rewarded",
      objectiveIndex: null,
    })),
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
  return {
    release: "guide-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      { id: "start", title: "Northshire", from: 1, to: 6 },
      { id: "world", title: "Elwynn", from: 6, to: 11 },
    ].map((leg) => ({
      ...leg,
      kind: "starter",
      stopId: null,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [400, 900, 1400].map((fullXp, index) => ({
      questId: 300001 + index,
      fullXp,
      questLevel: 10,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: `https://example.test/quest=${300001 + index}`,
      capturedAt: "2026-10-21T00:00:00.000Z",
    })),
  };
}

describe("continuous player-facing leveling plan", () => {
  it("keeps modeled earlier chains when resuming without marking them actually complete", () => {
    const base = route();
    const plan = {
      ...base,
      actions: base.actions.map((action) =>
        action.id === "c" ? { ...action, requiredQuestIds: [300001] } : action,
      ),
    };
    const progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 5, 100, "b");
    expect(
      forecastCampaignGuide(plan, progress).sections[1]!.forecast.members[0]!.blockedReason,
    ).toBeNull();
    expect(progress.members[0]!.questStates).toEqual({});
    const incomplete = emptyPremadeProgress();
    incomplete.members[0]!.questStates["300001"] = "not-started";
    const corrected = recordCampaignGuideXp(plan, incomplete, 0, 5, 100, "b");
    expect(
      forecastCampaignGuide(plan, corrected).sections[1]!.forecast.members[0]!.blockedReason,
    ).not.toBeNull();
  });
  it("reuses a forecast while browsing, but invalidates it for changed planning settings", () => {
    const plan = route();
    const progress = emptyPremadeProgress();
    const first = forecastCampaignGuide(plan, progress);
    progress.campaigns[plan.release] = { selectedActionId: "b", completion: { a: "done" } };
    expect(forecastCampaignGuide(plan, progress)).toBe(first);
    progress.combatPlanning = { outdoorXpMultiplier: 2 };
    expect(forecastCampaignGuide(plan, progress)).not.toBe(first);
  });

  it("rounds a partial starter exit bar into a useful suggested level without adding grinding XP", () => {
    const plan = route();
    const updated = {
      ...plan,
      rewardFacts: plan.rewardFacts!.map((fact, index) =>
        index === 0 ? { ...fact, fullXp: 600 } : fact,
      ),
    };
    const guide = forecastCampaignGuide(updated, emptyPremadeProgress()).sections[0]!;
    expect(guide.targetLevel).toBe(3);
    expect(guide.forecast.members[0]!.endpoint).toEqual({ level: 2, currentXp: 200 });
    expect(guide.forecast.members[0]!.estimatedCombatXp).toBe(0);
  });
  it("defaults blank progress to level 1 / 0 and carries every XP overflow into the next chapter", () => {
    const progress = emptyPremadeProgress();
    const before = JSON.stringify(progress);
    const result = forecastCampaignGuide(route(), progress);
    expect(result.sections[0]!.forecast.members[0]!.start).toEqual({ level: 1, currentXp: 0 });
    expect(result.sections[0]!.forecast.members[0]!.endpoint).toEqual({ level: 2, currentXp: 0 });
    expect(result.sections[1]!.forecast.members[0]!.start).toEqual({ level: 2, currentXp: 0 });
    expect(result.sections[1]!.forecast.members[0]!.endpoint).toEqual({ level: 4, currentXp: 0 });
    expect(result.sections[0]!.targetLevel).toBe(2);
    expect(result.sections[1]!.targetLevel).toBe(60);
    expect(result.sections[0]!.audience).toBe("personal");
    expect(JSON.stringify(progress)).toBe(before);
    expect(forecastCampaignXp(route(), progress)[0]!.members[0]!.endpoint).toBeNull();
  });

  it("does not move the XP anchor when the player browses to another step or reloads", () => {
    const plan = route();
    let progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 5, 100, "b");
    const first = forecastCampaignGuide(plan, progress);
    progress = premadeProgressSchema.parse({
      ...progress,
      campaigns: { [plan.release]: { selectedActionId: "c", completion: {} } },
    });
    expect(forecastCampaignGuide(plan, progress)).toEqual(first);
    expect(first.sections[1]!.forecast.members[0]!.start).toEqual({ level: 5, currentXp: 100 });
    expect(first.sections[1]!.forecast.members[0]!.endpoint).toEqual({ level: 5, currentXp: 2400 });
    expect(first.sections[0]!.targetLevel).toBe(2);
  });

  it("projects hand-ins after an update once, without adding them to recorded XP", () => {
    const plan = route();
    const progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 5, 100, "b");
    progress.members[0]!.questStates["300002"] = "rewarded";
    progress.members[0]!.xpNeedsUpdate = true;
    const before = JSON.stringify(progress);
    const member = forecastCampaignGuide(plan, progress).sections[1]!.forecast.members[0]!;
    expect(member.referenceQuestXp).toBe(2300);
    expect(member.endpoint).toEqual({ level: 5, currentXp: 2400 });
    expect(progress.members[0]!.currentXp).toBe(100);
    expect(JSON.stringify(progress)).toBe(before);
  });

  it("does not repay a quest that was already rewarded when the XP bar was recorded", () => {
    const plan = route();
    const progress = emptyPremadeProgress();
    progress.members[0]!.questStates["300002"] = "rewarded";
    const next = recordCampaignGuideXp(plan, progress, 0, 5, 100, "b");
    expect(
      forecastCampaignGuide(plan, next).sections[1]!.forecast.members[0]!.referenceQuestXp,
    ).toBe(1400);
  });

  it("migrates an existing fresh bar once and preserves actual reports and other players", () => {
    const plan = route();
    const progress = recordPremadeXp(emptyPremadeProgress(), 0, 5, 100);
    progress.campaigns[plan.release] = { selectedActionId: "b", completion: {} };
    const migrated = initializeCampaignGuideAnchors(plan, progress);
    expect(migrated.members[0]!.guideXpAnchor?.actionId).toBe("b");
    expect(migrated.members[0]!.level).toBe(5);
    expect(migrated.members[0]!.currentXp).toBe(100);
    expect(migrated.members.slice(1)).toEqual(progress.members.slice(1));
    expect(initializeCampaignGuideAnchors(plan, migrated)).toBe(migrated);
    expect(progress.members[0]!.guideXpAnchor).toBeUndefined();
  });

  it("supports different recorded bars and checkpoint steps without crediting a personal quest to the party", () => {
    const plan = route(false);
    let progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 5, 100, "b");
    progress = recordCampaignGuideXp(plan, progress, 1, 6, 200, "c");
    const result = forecastCampaignGuide(plan, progress);
    expect(result.recordedPlayers).toEqual([1, 2]);
    expect(result.sections[1]!.forecast.members[0]!.endpoint).toEqual({
      level: 5,
      currentXp: 2400,
    });
    expect(result.sections[1]!.forecast.members[1]!.endpoint).toEqual({
      level: 6,
      currentXp: 1600,
    });
    expect(result.sections[1]!.forecast.members[2]!.endpoint).toEqual({ level: 4, currentXp: 0 });
    const personal = forecastCampaignGuide(route(), emptyPremadeProgress()).sections[1]!;
    expect(personal.forecast.members[1]!.referenceQuestXp).toBe(0);
  });

  it("keeps absent reward data unresolved and still supplies a useful numeric target", () => {
    const plan = {
      ...route(),
      rewardFacts: route().rewardFacts!.map((fact) => ({
        ...fact,
        fullXp: null,
        status: "unknown" as const,
      })),
    };
    const guide = forecastCampaignGuide(plan, emptyPremadeProgress());
    expect(guide.sections[0]!.forecast.members[0]!.endpoint).toBeNull();
    expect(guide.sections[0]!.missingCombat).toBe(true);
    expect(guide.sections[0]!.targetLevel).toBeGreaterThanOrEqual(1);
  });

  it("lets a later recorded bar recover the remaining forecast without claiming earlier missing XP", () => {
    const plan = { ...route(), rewardFacts: route().rewardFacts!.slice(1) };
    const progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 5, 100, "b");
    const guide = forecastCampaignGuide(plan, progress);
    expect(guide.sections[0]!.forecast.members[0]!.endpoint).toBeNull();
    expect(guide.sections[1]!.forecast.members[0]!.endpoint).toEqual({ level: 5, currentXp: 2400 });
    expect(guide.sections[1]!.basis).toBe("saved-update");
  });

  it("preserves optional dungeon choices, saved data and explicit starting levels", () => {
    const plan = route();
    const progress = updatePremadeDungeonBundle(emptyPremadeProgress(), {
      ...getDungeonBundle("drowned-city", "alliance")!,
      included: false,
    });
    const before = JSON.stringify(progress);
    expect(
      forecastCampaignGuide(plan, progress, { startingLevel: 5 }).sections[0]!.forecast.members[0]!
        .start?.level,
    ).toBe(5);
    expect(JSON.stringify(progress)).toBe(before);
    expect(() => forecastCampaignGuide(plan, progress, { startingLevel: 0 })).toThrow();
  });

  it("retains the level-60 cap, rejects invalid updates, and clears a displaced generic XP checkpoint", () => {
    const plan = route();
    const progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 60, 0, "a");
    expect(
      forecastCampaignGuide(plan, progress).sections.at(-1)!.forecast.members[0]!.endpoint,
    ).toEqual({ level: 60, currentXp: 0 });
    expect(() => recordCampaignGuideXp(plan, progress, 0, 60, 1, "a")).toThrow();
    expect(() => recordCampaignGuideXp(plan, progress, 0, 5, 0, "missing")).toThrow();
    expect(recordPremadeXp(progress, 0, 59, 0).members[0]!.guideXpAnchor).toBeUndefined();
  });
});
