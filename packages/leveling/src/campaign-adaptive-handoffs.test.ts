import { describe, expect, it } from "vitest";
import {
  activeCampaignActions,
  campaignActionReasons,
  campaignCatchUpTarget,
  campaignOptionalXpReady,
  currentCampaignAction,
  updateCampaignAction,
  type CampaignAction,
  type CampaignPlan,
} from "./campaign.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import {
  campaignSections,
  campaignSectionTarget,
  campaignSectionXpGap,
} from "./campaign-sections.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, premadeEntryLevel, updatePremadeDungeonBundle } from "./premade.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { getDungeonBundle } from "./dungeon-bundles.js";

function action(id: string, legId: string): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function party(level: number, currentXp = 0): PremadeProgress {
  const base = emptyPremadeProgress();
  return {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level,
      currentXp,
      xpNeedsUpdate: false,
    })),
  };
}

function starterPlan(): CampaignPlan {
  const actions: CampaignAction[] = [
    action("northshire-work", "northshire"),
    {
      ...action("source-grind", "northshire"),
      source: { chapterId: "northshire", version: "test", stepId: "source-step-0002" },
      kind: "xp-check",
      targetLevel: 6,
      targetCurrentXp: 200,
      xpOptional: true,
    },
    {
      ...action("goldshire-work", "elwynn"),
      kind: "quests",
      questChanges: ["accepted", "objectives-complete", "rewarded"].map((state) => ({
        questId: 62,
        state: state as "accepted" | "objectives-complete" | "rewarded",
        title: "The Fargodeep Mine",
        objectiveIndex: null,
      })),
    },
  ];
  return {
    release: "adaptive-handoff-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      { id: "northshire", title: "Northshire", from: 1, to: 6 },
      { id: "elwynn", title: "Elwynn Forest", from: 6, to: 11 },
    ].map((leg) => ({
      ...leg,
      kind: "starter",
      actionIds: actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
      questIds: leg.id === "elwynn" ? [62] : [],
      unresolvedQuestIds: [],
      stopId: null,
    })),
    rewardFacts: [
      {
        questId: 62,
        questLevel: 7,
        minimumLevel: 4,
        fullXp: 480,
        xpByLevel: [],
        sourceUrl: "https://www.wowhead.com/forever/quest=62/the-fargodeep-mine",
        capturedAt: "2026-10-20T00:00:00.000Z",
        status: "available",
      },
    ],
  };
}

function dungeonPlan(): CampaignPlan {
  const work = { ...action("world-work", "world"), leaderOnly: false, xpOptional: true };
  const entry = {
    ...action("ruins-entry", "ruins"),
    kind: "checkpoint" as const,
    leaderOnly: false,
    targetLevel: null,
    targetStopId: "lordaeron" as const,
  };
  return {
    ...starterPlan(),
    actions: [work, entry],
    legs: [
      { id: "world", title: "World", from: 16, to: 20, kind: "xp-bridge" as const, stopId: null },
      {
        id: "ruins",
        title: "Ruins",
        from: 18,
        to: 20,
        kind: "dungeon" as const,
        stopId: "lordaeron" as const,
      },
    ].map((leg) => ({
      ...leg,
      actionIds: [leg.id === "world" ? work.id : entry.id],
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [],
  };
}

describe("task-first zone handoffs", () => {
  it("lets a level-5 player leave Northshire and accept eligible Goldshire quests", () => {
    const plan = compileCampaignPickupGates(starterPlan());
    const state = party(5, 123);
    expect(plan.actions.map((entry) => entry.id)).toEqual([
      "northshire-work",
      "elwynn-level-4-62",
      "goldshire-work",
    ]);
    expect(plan.actions.some((entry) => entry.targetLevel === 6)).toBe(false);
    expect(campaignActionReasons(plan.actions.at(-1)!, state, plan.rewardFacts)).toEqual([]);
    const updated = updateCampaignAction(plan, state, "northshire-work", true);
    expect(updated.members).toEqual(state.members);
    expect(updated.campaigns[plan.release]?.selectedActionId).toBe("goldshire-work");
    const section = campaignSections(plan)[0]!;
    expect(campaignSectionTarget([section], 0, state)).toEqual({ level: 5, kind: "actual-xp" });
    expect(campaignSectionXpGap(section, state)).toBeNull();
  });

  it("carries the actual bar across zones without forecasting the source's suggested grind", () => {
    const plan = compileCampaignPickupGates(starterPlan());
    const state = party(5, 123);
    const before = JSON.stringify(state);
    const forecast = forecastCampaignXp(plan, state);
    const northshire = forecast[0]!.members[0]!;
    const elwynn = forecast[1]!.members[0]!;
    expect(northshire.endpoint).toEqual({ level: 5, currentXp: 123 });
    expect(northshire.estimatedCombatXp).toBe(0);
    expect(northshire.residualXp).toBe(0);
    expect(elwynn.start).toEqual(northshire.endpoint);
    expect(elwynn.knownEndpoint).toEqual({ level: 5, currentXp: 603 });
    expect(elwynn.estimatedCombatXp).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("removes targetless reminders rather than making the player complete an empty task", () => {
    const base = starterPlan();
    const reminder = {
      ...action("record-xp", "elwynn"),
      kind: "xp-check" as const,
    };
    const plan = compileCampaignPickupGates({
      ...base,
      actions: [...base.actions.slice(0, -1), reminder, base.actions.at(-1)!],
      bookmarkAliases: { "old-reminder": "record-xp" },
    });
    expect(plan.actions.some((entry) => entry.id === reminder.id)).toBe(false);
    expect(plan.bookmarkAliases?.[reminder.id]).toBe("goldshire-work");
    expect(plan.bookmarkAliases?.["old-reminder"]).toBe("goldshire-work");
    expect(plan.bookmarkAliases?.["source-grind"]).toBe("goldshire-work");
  });

  it("does not force another XP form when a zone changes after a hand-in", () => {
    const plan = compileCampaignPickupGates(starterPlan());
    const state = party(5);
    state.members[0]!.xpNeedsUpdate = true;
    expect(updateCampaignAction(plan, state, "northshire-work", true).members).toEqual(
      state.members,
    );
    expect(
      plan.actions.every((entry) => entry.targetLevel !== null || entry.kind !== "xp-check"),
    ).toBe(true);
  });

  it("does not remove quest work or a real stop requirement just because it also tracks XP", () => {
    const base = starterPlan();
    const questWork = { ...base.actions.at(-1)!, kind: "xp-check" as const };
    const stopGate: CampaignAction = {
      ...base.actions[1]!,
      id: "real-stop-gate",
      targetStopId: "thanes",
      targetLevel: null,
    };
    const plan = compileCampaignPickupGates({ ...base, actions: [questWork, stopGate] });
    expect(plan.actions.find((entry) => entry.id === questWork.id)?.questChanges).toEqual(
      questWork.questChanges,
    );
    expect(plan.actions.some((entry) => entry.id === stopGate.id)).toBe(true);
    expect(campaignActionReasons(stopGate, party(5), plan.rewardFacts).length).toBeGreaterThan(0);
  });

  it("removes a reminder-only phase without leaving an empty chapter in the route", () => {
    const base = starterPlan();
    const reminder: CampaignAction = {
      ...action("empty-entry-xp", "empty"),
      kind: "xp-check",
    };
    const plan = compileCampaignPickupGates({
      ...base,
      actions: [base.actions[0]!, reminder, ...base.actions.slice(1)],
      legs: [
        base.legs[0]!,
        { ...base.legs[0]!, id: "empty", actionIds: [reminder.id] },
        base.legs[1]!,
      ],
    });
    expect(plan.legs.some((leg) => leg.id === "empty")).toBe(false);
    expect(plan.bookmarkAliases?.[reminder.id]).toBe("goldshire-work");
  });

  it("never moves a trailing XP correction backwards onto an earlier reward", () => {
    const base = starterPlan();
    const reminder: CampaignAction = {
      ...action("trailing-xp", "elwynn"),
      kind: "xp-check",
    };
    const plan = compileCampaignPickupGates({ ...base, actions: [...base.actions, reminder] });
    expect(plan.actions.some((entry) => entry.id === reminder.id)).toBe(false);
    expect(plan.bookmarkAliases?.[reminder.id]).toBeUndefined();
  });

  it("retains real pickup minima instead of assuming the chapter's entry level", () => {
    const base = starterPlan();
    const plan = compileCampaignPickupGates({
      ...base,
      rewardFacts: base.rewardFacts!.map((fact) => ({ ...fact, minimumLevel: 6 })),
    });
    const gate = plan.actions.find((entry) => entry.id === "elwynn-level-6-62")!;
    expect(gate).toBeDefined();
    expect(campaignActionReasons(gate, party(5), plan.rewardFacts)[0]).toContain("level 6");
    expect(campaignActionReasons(gate, party(6), plan.rewardFacts)).toEqual([]);
  });

  it.each([
    "source-grind",
    "elwynn-entry-xp",
    "elwynn-entry-level-6",
    "northshire-departure-level-6-before-elwynn",
  ])("migrates the saved legacy checkpoint %s without changing actual XP", (selectedActionId) => {
    const plan = compileCampaignPickupGates(starterPlan());
    const state = party(5);
    state.campaigns[plan.release] = {
      selectedActionId,
      completion: { [selectedActionId]: "done" },
    };
    const before = JSON.stringify(state);
    expect(currentCampaignAction(plan, state).id).toBe("goldshire-work");
    expect(state.members[0]?.level).toBe(5);
    expect(state.campaigns[plan.release]!.completion["goldshire-work"]).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("does not export a mandatory .xp directive for a source-only grind recommendation", () => {
    const plan = compileCampaignPickupGates(starterPlan());
    const actions = [
      ...activeCampaignActions(plan, party(5)),
      { ...action("party-route-note", "elwynn"), leaderOnly: false },
    ];
    const artifact = compileCampaignAddon(plan, actions, {
      version: "0.1.0",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.26",
    });
    expect(artifact.lua).not.toContain(".xp 6");
    expect(artifact.lua).not.toContain(".xp 6+200");
    expect(artifact.lua).toContain(".xp 4");
    expect(artifact.lua).not.toContain("Record actual");
    expect(artifact.guides.flatMap((guide) => guide.actionIds)).not.toContain("source-grind");
  });
});

describe("required next-stop XP only", () => {
  it("drops an excluded optional dungeon's departure check as well as its entry", () => {
    const base = dungeonPlan();
    const optionalEntry = {
      ...action("optional-entry", "optional"),
      kind: "checkpoint" as const,
      leaderOnly: false,
      targetStopId: "drowned-city" as const,
    };
    const plan = compileCampaignPickupGates({
      ...base,
      actions: [base.actions[0]!, optionalEntry, base.actions[1]!],
      legs: [
        base.legs[0]!,
        {
          id: "optional",
          title: "Drowned City",
          from: 37,
          to: 38,
          kind: "dungeon",
          stopId: "drowned-city",
          bundleId: "drowned-city",
          actionIds: [optionalEntry.id],
          questIds: [],
          unresolvedQuestIds: [],
        },
        base.legs[1]!,
      ],
    });
    const state = updatePremadeDungeonBundle(party(38), {
      ...getDungeonBundle("drowned-city", "alliance")!,
      included: false,
    });
    const actions = activeCampaignActions(plan, state);
    expect(actions.some((entry) => entry.targetStopId === "drowned-city")).toBe(false);
    expect(campaignCatchUpTarget(plan, state, "world")).toBe(
      premadeEntryLevel(
        PREMADE_STOPS.find((entry) => entry.id === "lordaeron")!,
        state,
      ),
    );
  });

  it("migrates a legacy conservative departure bookmark to the selected-policy check", () => {
    const plan = compileCampaignPickupGates(dungeonPlan());
    const state = { ...party(17), difficultyPolicy: "experienced-premade" as const };
    state.campaigns[plan.release] = {
      selectedActionId: "world-departure-level-19-before-lordaeron",
      completion: {},
    };
    expect(currentCampaignAction(plan, state)).toMatchObject({
      id: "world-departure-level-18-before-lordaeron",
      targetLevel: 18,
    });
    state.members = state.members.map((member) => ({ ...member, level: 18 }));
    expect(currentCampaignAction(plan, state).id).toBe("ruins-entry");
  });

  it("does not let one lagging or stale player silently skip the next stop's requirement", () => {
    const plan = compileCampaignPickupGates(dungeonPlan());
    const state = { ...party(18), difficultyPolicy: "experienced-premade" as const };
    state.members[4]!.level = 17;
    const gate = activeCampaignActions(plan, state).find(
      (entry) => entry.targetStopId === "lordaeron",
    )!;
    expect(campaignActionReasons(gate, state, plan.rewardFacts)[0]).toContain("level 18");
    state.members[4]!.level = 18;
    state.members[4]!.xpNeedsUpdate = true;
    expect(campaignActionReasons(gate, state, plan.rewardFacts)[0]).toContain(
      "Confirm everyone is level 18",
    );
    expect(campaignOptionalXpReady(plan, state, gate)).toBe(false);
  });

  it.each(["at-level", "experienced-premade"] as const)(
    "uses the selected %s dungeon gate in execution, forecasts and optional filler",
    (difficultyPolicy) => {
      const plan = compileCampaignPickupGates(dungeonPlan());
      const state = { ...party(18, 123), difficultyPolicy };
      const stop = PREMADE_STOPS.find((entry) => entry.id === "lordaeron")!;
      const required = premadeEntryLevel(stop, state, plan.rewardFacts);
      expect(required).toBe(difficultyPolicy === "at-level" ? 19 : 18);
      const actions = activeCampaignActions(plan, state);
      const gate = actions.find((entry) => entry.id.includes("departure-level"))!;
      expect(gate.targetLevel).toBe(required);
      expect(gate.targetStopId).toBe("lordaeron");
      expect(campaignCatchUpTarget(plan, state, "world")).toBe(required);
      expect(
        campaignOptionalXpReady(
          plan,
          state,
          actions.find((entry) => entry.id === "world-work")!,
        ),
      ).toBe(difficultyPolicy === "experienced-premade");
      const forecast = forecastCampaignXp(plan, state);
      expect(forecast[0]!.members[0]!.knownEndpoint?.level).toBe(required);
      if (difficultyPolicy === "experienced-premade") {
        expect(campaignActionReasons(gate, state, plan.rewardFacts)).toEqual([]);
        expect(forecast[0]!.members[0]!.estimatedCombatXp).toBe(0);
        expect(forecast[0]!.members[0]!.knownEndpoint?.currentXp).toBe(123);
      } else {
        expect(campaignActionReasons(gate, state, plan.rewardFacts)[0]).toContain("level 19");
        expect(forecast[0]!.members[0]!.estimatedCombatXp).toBeGreaterThan(0);
      }
      expect(state.members[0]?.level).toBe(18);
      expect(state.members[0]?.currentXp).toBe(123);
    },
  );
});
