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
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";

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
  it("keeps a correction anchored at the next task when its old XP reminder is removed", () => {
    const base = route();
    const reminder: CampaignAction = {
      ...base.actions[1]!,
      id: "world-entry-xp",
      kind: "xp-check",
      questChanges: [],
    };
    const oldPlan = {
      ...base,
      actions: [base.actions[0]!, reminder, ...base.actions.slice(1)],
    };
    const progress = recordCampaignGuideXp(oldPlan, emptyPremadeProgress(), 0, 5, 100, reminder.id);
    const before = JSON.stringify(progress);
    const plan = compileCampaignPickupGates(oldPlan);
    const result = forecastCampaignGuide(plan, progress);
    expect(result.recordedPlayers).toEqual([1]);
    expect(result.sections[1]!.forecast.members[0]!.start).toEqual({ level: 5, currentXp: 100 });
    expect(result.sections[1]!.forecast.members[0]!.endpoint).toEqual({
      level: 5,
      currentXp: 2400,
    });
    progress.campaigns[plan.release] = { selectedActionId: "c", completion: {} };
    expect(forecastCampaignGuide(plan, progress)).toBe(result);
    delete progress.campaigns[plan.release];
    expect(JSON.stringify(progress)).toBe(before);
    expect(progress.members[0]!.guideXpAnchor?.actionId).toBe(reminder.id);
  });
  it("projects independent starters before the party joins, without granting actual quest credit", () => {
    const base = route();
    const shared: CampaignAction = {
      ...base.actions[2]!,
      id: "join",
      legId: "rendezvous",
      leaderOnly: false,
      requiredQuestIds: [300001],
    };
    const plan: CampaignPlan = {
      ...base,
      actions: [...base.actions.slice(0, 2), shared],
      legs: [
        ...base.legs,
        {
          id: "rendezvous",
          title: "Dun Morogh",
          from: 3,
          to: 4,
          kind: "preparation",
          actionIds: ["join"],
          questIds: [300003],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
    };
    const progress = emptyPremadeProgress();
    const before = JSON.stringify(progress);
    const result = forecastCampaignGuide(plan, progress);
    const join = result.sections.find((section) => section.chapter.legIds.includes("rendezvous"))!;
    expect(join.chapter.legIds).toEqual(["rendezvous"]);
    expect(join.forecast.members.map((member) => member.start)).toEqual(
      Array.from({ length: 5 }, () => ({ level: 3, currentXp: 0 })),
    );
    expect(join.forecast.members.every((member) => member.blockedReason === null)).toBe(true);
    expect(join.forecast.members.every((member) => member.referenceQuestXp === 1400)).toBe(true);
    expect(JSON.stringify(progress)).toBe(before);
    expect(forecastCampaignXp(plan, progress)[0]!.members[1]!.referenceQuestXp).toBe(0);
  });
  it("does not copy a leader's recorded starter bar into the other players' forecasts", () => {
    const plan = route();
    const progress = recordCampaignGuideXp(plan, emptyPremadeProgress(), 0, 10, 100, "b");
    const section = forecastCampaignGuide(plan, progress).sections[1]!;
    expect(section.forecast.members[0]!.start).toEqual({ level: 10, currentXp: 100 });
    expect(section.forecast.members[1]!.start).toEqual({ level: 2, currentXp: 0 });
    expect(section.forecast.members[1]!.endpoint).toEqual({ level: 4, currentXp: 0 });
    const corrected = recordCampaignGuideXp(plan, progress, 1, 6, 200, "b");
    expect(
      forecastCampaignGuide(plan, corrected).sections[1]!.forecast.members[1]!.endpoint,
    ).toEqual({ level: 6, currentXp: 2500 });
  });

  it("uses a different character's own starter quests and carries their prerequisite ledger into the party", () => {
    const base = route();
    const dwarf = {
      ...base.actions[0]!,
      id: "dwarf-quest",
      legId: "dwarf",
      questChanges: base.actions[0]!.questChanges.map((change) => ({ ...change, questId: 300004 })),
    };
    const join = {
      ...base.actions[2]!,
      id: "join",
      legId: "rendezvous",
      leaderOnly: false,
      requiredQuestIds: [300004],
      questChanges: base.actions[2]!.questChanges.map((change) => ({ ...change, questId: 300005 })),
    };
    const leg = { ...base.legs[0]!, id: "dwarf", actionIds: [dwarf.id] };
    const plan: CampaignPlan = {
      ...base,
      actions: [...base.actions, join],
      legs: [...base.legs, { ...leg, id: "rendezvous", kind: "preparation", actionIds: [join.id] }],
      rewardFacts: [
        ...base.rewardFacts!,
        { ...base.rewardFacts![0]!, questId: 300004, fullXp: 1300 },
        { ...base.rewardFacts![2]!, questId: 300005 },
      ],
      starters: {
        entries: [{ action: dwarf, activities: [] }],
        routes: [{ race: "dwarf", classSlug: "priest", legs: [leg], actionIndexes: [0] }],
      },
    };
    const progress = emptyPremadeProgress();
    progress.members[1] = { ...progress.members[1]!, raceId: "dwarf", classSlug: "priest" };
    const before = JSON.stringify(progress);
    const result = forecastCampaignGuide(plan, progress);
    const shared = result.sections.at(-1)!;
    expect(shared.forecast.members[1]!.start).toEqual({ level: 3, currentXp: 0 });
    expect(shared.forecast.members[1]!.blockedReason).toBeNull();
    expect(shared.forecast.members[1]!.referenceQuestXp).toBe(1400);
    expect(shared.forecast.members[0]!.blockedReason).not.toBeNull();
    expect(shared.assumedStarterPlayers).not.toContain(2);
    expect(JSON.stringify(progress)).toBe(before);
    const updated = recordCampaignGuideXp(plan, progress, 1, 8, 100, "join");
    expect(
      forecastCampaignGuide(plan, updated).sections.at(-1)!.forecast.members[1]!.endpoint,
    ).toEqual({ level: 8, currentXp: 1500 });
  });

  it("does not invent a level-1 catch-up grind when a different starter path is unavailable", () => {
    const base = route();
    const shared = {
      ...base.actions[2]!,
      id: "join",
      legId: "rendezvous",
      leaderOnly: false,
      questChanges: [],
      kind: "xp-check" as const,
      targetLevel: 16,
    };
    const plan: CampaignPlan = {
      ...base,
      actions: [...base.actions, shared],
      legs: [
        ...base.legs,
        { ...base.legs[0]!, id: "rendezvous", kind: "preparation", actionIds: [shared.id] },
      ],
    };
    const progress = emptyPremadeProgress();
    progress.members[1] = { ...progress.members[1]!, raceId: "dwarf", classSlug: "priest" };
    const result = forecastCampaignGuide(plan, progress).sections.at(-1)!;
    expect(result.unavailableStarterPlayers).toEqual([2]);
    expect(result.forecast.members[1]!.start).toBeNull();
    expect(result.forecast.members[1]!.estimatedCombatXp).toBe(0);
    const updated = recordCampaignGuideXp(plan, progress, 1, 16, 100, "join");
    expect(forecastCampaignGuide(plan, updated).sections.at(-1)!.unavailableStarterPlayers).toEqual(
      [],
    );
  });
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
    expect(result.sections[1]!.targetLevel).toBe(4);
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
    expect(personal.forecast.members[1]!.referenceQuestXp).toBe(2300);
    expect(
      forecastCampaignXp(route(), emptyPremadeProgress())[1]!.members[1]!.referenceQuestXp,
    ).toBe(0);
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
