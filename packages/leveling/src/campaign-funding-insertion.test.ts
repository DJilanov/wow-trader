import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { activeCampaignActions } from "./campaign.js";
import { fundingInsertionActions } from "./campaign-funding-insertion.js";
import type { CampaignFundingState } from "./campaign-funding-scenarios.js";
import { campaignFundingProgressBefore } from "./campaign-funding-scenarios.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";

function fixture(lowestLevel = 31): { plan: CampaignPlan; state: CampaignFundingState; gate: CampaignAction } {
  const reward: CampaignAction = { id: "wetlands-reward", legId: "wetlands", title: "Deliver the letter",
    kind: "quests", instructions: [], positions: [{ sourceLine: 0, position: {
      zone: "1437", x: 10, y: 60, floor: null, space: "map-percent",
    } }], source: null, leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    questChanges: [{ questId: 300001, title: "Letter", state: "rewarded", objectiveIndex: null }] };
  const leave: CampaignAction = { ...reward, id: "leave-wetlands", kind: "instructions", questChanges: [] };
  const library: CampaignAction = { ...leave, id: "library", legId: "library", positions: [] };
  const gate: CampaignAction = { ...leave, id: "late-gate", legId: "later", kind: "xp-check", targetLevel: 35 };
  const actions = [reward, leave, library, gate];
  const plan: CampaignPlan = { release: "earlier-visit-test", targetBuild: 70205, race: "human", leaderClass: "warrior",
    sharedQuestsOnly: true, actions, legs: ["wetlands", "library", "later"].map((id) => ({
      id, title: id, from: 31, to: 35, kind: id === "library" ? "dungeon" : "preparation",
      stopId: null, actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: id === "wetlands" ? [300001] : [], unresolvedQuestIds: [],
    })), rewardFacts: [{ questId: 300001, fullXp: 100, minimumLevel: 1, questLevel: 31, xpByLevel: [],
      status: "available", sourceUrl: "https://example.test/quest", capturedAt: "2026-11-04T00:00:00Z" }] };
  const initial = emptyPremadeProgress();
  const progress = { ...initial, members: initial.members.map((member, index) => ({ ...member,
    level: index === 4 ? lowestLevel : 31, currentXp: 0, xpNeedsUpdate: false,
    questStates: { "300001": "objectives-complete" as const },
  })) };
  const state: CampaignFundingState = { progress, starterMode: "together", difficultyPolicy: progress.difficultyPolicy,
    strategy: "dungeons", optionalStops: true, lootScenario: "expected", actions: activeCampaignActions(plan, progress),
    forecast: forecastCampaignXp(plan, progress) };
  return { plan, state, gate };
}

function capturedExchange(): ReturnType<typeof fixture> & { readonly sources: readonly CampaignSource[] } {
  const input = fixture(), reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
  const guide = parseGuideChapter("step\n.goto 1437,10,60\n.turnin 300001\n.accept 300002",
    reference.id, "f".repeat(64), 70205);
  const reward: CampaignAction = { ...input.plan.actions[0]!,
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id } };
  const pickup: CampaignAction = { ...reward, id: "pickup-followup", questChanges: [
    { ...reward.questChanges[0]!, questId: 300002, state: "accepted" },
  ] };
  const actions = [reward, pickup, ...input.plan.actions.slice(1)];
  const plan: CampaignPlan = { ...input.plan, actions,
    rewardFacts: [...input.plan.rewardFacts!, { ...input.plan.rewardFacts![0]!, questId: 300002 }],
    legs: input.plan.legs.map((leg) => ({ ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id) })),
  };
  return { ...input, plan, sources: [{ reference, guide }], state: { ...input.state,
    actions: activeCampaignActions(plan, input.state.progress),
    forecast: forecastCampaignXp(plan, input.state.progress) } };
}

describe("funding during an earlier reached visit", () => {
  it.each(["preparation", "dungeon"] as const)("passes an inactive %s action to reach the next actual departure", (kind) => {
    const input = fixture();
    const inactive: CampaignAction = { ...input.plan.actions[1]!, id: "inactive-raid-extra", raidOnly: true,
      legId: kind === "dungeon" ? "library" : "wetlands" };
    const actions = [input.plan.actions[0]!, inactive, ...input.plan.actions.slice(1)];
    const plan: CampaignPlan = { ...input.plan, actions, legs: input.plan.legs.map((leg) => ({ ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id) })) };
    const progress = { ...input.state.progress, raidGoals: false };
    const state: CampaignFundingState = { ...input.state, progress,
      actions: activeCampaignActions(plan, progress), forecast: forecastCampaignXp(plan, progress) };
    expect(state.actions.some((action) => action.id === inactive.id)).toBe(false);
    const offered = fundingInsertionActions(plan, [], input.gate, { state, minimumIndex: 0, targetLevel: 35 });
    expect(offered.map((action) => action.id)).toEqual(["late-gate", "leave-wetlands"]);
    for (const action of offered) expect(() => campaignFundingProgressBefore(state, action.id)).not.toThrow();
  });

  it("does not offer an inactive flight instruction inside the blocked preparation leg", () => {
    const input = fixture(), reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
    const guide = parseGuideChapter("step\n.fly Ironforge", reference.id, "f".repeat(64), 70205);
    const flight: CampaignAction = { ...input.plan.actions[1]!, id: "inactive-flight", legId: "later", raidOnly: true,
      source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id } };
    const actions = [...input.plan.actions.slice(0, -1), flight, input.gate];
    const plan: CampaignPlan = { ...input.plan, actions, legs: input.plan.legs.map((leg) => ({ ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id) })) };
    const progress = { ...input.state.progress, raidGoals: false };
    const state: CampaignFundingState = { ...input.state, progress,
      actions: activeCampaignActions(plan, progress), forecast: forecastCampaignXp(plan, progress) };
    const offered = fundingInsertionActions(plan, [{ reference, guide }], input.gate, {
      state, minimumIndex: 0, targetLevel: 35,
    });
    expect(offered.map((action) => action.id)).toEqual(["late-gate", "leave-wetlands"]);
    for (const action of offered) expect(() => campaignFundingProgressBefore(state, action.id)).not.toThrow();
  });

  it("finishes a split captured NPC exchange before offering a new journey", () => {
    const { plan, state, gate, sources } = capturedExchange(), before = structuredClone(plan);
    const ids = fundingInsertionActions(plan, sources, gate, { state, minimumIndex: 0, targetLevel: 35,
      safePickupQuestIds: new Set([300002]) }).map((action) => action.id);
    expect(ids).toEqual(["late-gate", "leave-wetlands"]);
    expect(ids).not.toContain("pickup-followup");
    expect(plan).toEqual(before);
  });

  it("does not offer a trip during an unqualified event or escort acceptance", () => {
    const { plan, state, gate, sources } = capturedExchange();
    expect(fundingInsertionActions(plan, sources, gate, { state, minimumIndex: 0, targetLevel: 35 }))
      .toEqual([gate]);
  });

  it("does not treat an already interrupted captured exchange as a fresh travel opportunity", () => {
    const input = capturedExchange(), detour: CampaignAction = { ...input.plan.actions[2]!,
      id: "existing-interruption", source: null };
    const actions = [input.plan.actions[0]!, detour, ...input.plan.actions.slice(1)];
    const plan = { ...input.plan, actions };
    const state = { ...input.state, actions: activeCampaignActions(plan, input.state.progress),
      forecast: forecastCampaignXp(plan, input.state.progress) };
    expect(fundingInsertionActions(plan, input.sources, input.gate, { state, minimumIndex: 0,
      targetLevel: 35, safePickupQuestIds: new Set([300002]) })).toEqual([input.gate]);
  });

  it.each(["leg", "zone", "leader"])("does not combine a captured NPC exchange across another %s", (kind) => {
    const { plan, state, gate, sources } = capturedExchange();
    const changed = { ...plan, actions: plan.actions.map((action, index) => index !== 1 ? action : {
      ...action,
      ...(kind === "leg" ? { legId: "later" } : kind === "leader" ? { leaderOnly: true } : {
        positions: action.positions.map((entry) => ({ ...entry, position: { ...entry.position, zone: "1453" } })),
      }),
    }) };
    expect(fundingInsertionActions(changed, sources, gate, { state, minimumIndex: 0, targetLevel: 35,
      safePickupQuestIds: new Set([300002]) })).toEqual([gate]);
  });

  it("offers the earlier handoff across a dungeon without moving it or assuming its later rewards", () => {
    const { plan, state, gate } = fixture(), before = structuredClone(plan);
    expect(fundingInsertionActions(plan, [], gate).map((action) => action.id)).toEqual(["late-gate"]);
    expect(fundingInsertionActions(plan, [], gate, { state, minimumIndex: 0, targetLevel: 35 })
      .map((action) => action.id)).toEqual(["late-gate", "leave-wetlands"]);
    expect(plan).toEqual(before);
  });

  it.each([[1, ["late-gate", "leave-wetlands"]], [2, ["late-gate"]]] as const)(
    "keeps new work at or after protected action index %i", (minimumIndex, expected) => {
      const { plan, state, gate } = fixture();
      expect(fundingInsertionActions(plan, [], gate, { state, minimumIndex, targetLevel: 35 })
        .map((action) => action.id)).toEqual(expected);
    },
  );

  it("requires all five reached players to be within the preparation level band", () => {
    const { plan, state, gate } = fixture(30);
    expect(fundingInsertionActions(plan, [], gate, { state, minimumIndex: 0, targetLevel: 35 })).toEqual([gate]);
  });

  it("offers both ends of a repeated town visit so a later gray-enemy range cannot hide the earlier opportunity", () => {
    const initial = fixture();
    const second = { ...initial.plan.actions[0]!, id: "second-handoff", questChanges: [
      { ...initial.plan.actions[0]!.questChanges[0]!, questId: 300002 },
    ] };
    const onward = { ...initial.plan.actions[1]!, id: "second-departure" };
    const actions = [...initial.plan.actions.slice(0, 2), second, onward, ...initial.plan.actions.slice(2)];
    const plan: CampaignPlan = { ...initial.plan, actions,
      legs: initial.plan.legs.map((leg) => ({ ...leg, actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id) })),
      rewardFacts: [...initial.plan.rewardFacts!, { ...initial.plan.rewardFacts![0]!, questId: 300002 }],
    };
    const progress = { ...initial.state.progress, members: initial.state.progress.members.map((member) => ({
      ...member, questStates: { ...member.questStates, "300002": "objectives-complete" as const },
    })) };
    const state: CampaignFundingState = { ...initial.state, progress, actions: activeCampaignActions(plan, progress),
      forecast: forecastCampaignXp(plan, progress) };
    expect(fundingInsertionActions(plan, [], initial.gate, { state, minimumIndex: 0, targetLevel: 35 })
      .map((action) => action.id)).toEqual(["late-gate", "second-departure", "leave-wetlands"]);
  });

  it.each(["inside", "next dungeon", "accepts event", "unreached"])("does not insert a trip into %s", (kind) => {
    const input = fixture();
    let plan = input.plan, state = input.state;
    if (kind === "inside") plan = { ...plan, actions: plan.actions.map((action, index) => index === 0 ? {
      ...action, location: { zone: "1437", insideDungeon: "the-stockade" },
    } : action) };
    if (kind === "next dungeon") plan = { ...plan, actions: plan.actions.map((action, index) => index === 1 ? { ...action, legId: "library" } : action) };
    if (kind === "accepts event") plan = { ...plan, actions: plan.actions.map((action, index) => index === 0 ? {
      ...action, questChanges: [...action.questChanges, { ...action.questChanges[0]!, questId: 300002, state: "accepted" }],
    } : action) };
    if (kind === "unreached") state = { ...state, forecast: [] };
    expect(fundingInsertionActions(plan, [], input.gate, { state, minimumIndex: 0, targetLevel: 35 })).toEqual([input.gate]);
  });

  it("does not interrupt a captured timer after a hand-in", () => {
    const { plan, state, gate } = fixture();
    const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
    const guide = parseGuideChapter("step\n.goto 1437,10,60\n.turnin 300001\n.timer 10,Wait for the NPC", reference.id, "f".repeat(64), 70205);
    const sources: CampaignSource[] = [{ reference, guide }];
    const timed = { ...plan, actions: plan.actions.map((action, index) => index === 0 ? {
      ...action, source: { chapterId: reference.id, version: guide.version, stepId: guide.steps[0]!.id },
    } : action) };
    expect(fundingInsertionActions(timed, sources, gate, { state, minimumIndex: 0, targetLevel: 35 })).toEqual([gate]);
  });
});
