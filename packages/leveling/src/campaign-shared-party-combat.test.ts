import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { forecastCampaignSteps } from "./campaign-theory.js";
import {
  campaignFundingProgressBefore,
  campaignFundingXpBoundsBefore,
} from "./campaign-funding-scenarios.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastSharedPartyCombat } from "./campaign-shared-party-combat.js";
import type { CombatActivity, CombatObjective } from "./combat-model.js";
import { indexSharedPartyCombat } from "./campaign-shared-combat-index.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatXpPosition,
} from "./combat-xp.js";

function control(): CampaignPlan {
  const objective: CampaignAction = {
    id: "party-objective",
    legId: "world",
    title: "Shared patrol",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [
      { questId: 300001, title: "Shared patrol", state: "objectives-complete", objectiveIndex: 1 },
    ],
  };
  const actions: CampaignAction[] = [
    {
      ...objective,
      id: "pickup",
      questChanges: [{ ...objective.questChanges[0]!, state: "accepted", objectiveIndex: null }],
    },
    objective,
    {
      ...objective,
      id: "hand-in",
      questChanges: [{ ...objective.questChanges[0]!, state: "rewarded", objectiveIndex: null }],
    },
  ];
  return {
    release: "shared-party-combat-control",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "world",
        title: "Shared patrol",
        kind: "preparation",
        from: 1,
        to: 2,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [300001],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 300001,
        fullXp: 100,
        questLevel: 1,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/shared-party-control",
        capturedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    combat: {
      revision: "synthetic-control",
      sourceRevision: "synthetic-control",
      targetBuild: 70205,
      notice: "Synthetic exact-payout control, not actual-server calibration.",
      npcs: [
        {
          id: 114,
          name: "Control Creature",
          minimumLevel: 1,
          maximumLevel: 1,
          rank: 0,
          zoneIds: [12],
          xpEligibility: "assumed",
        },
      ],
      activities: [
        {
          id: "shared-five-kills",
          actionId: objective.id,
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              questId: 300001,
              objectiveIndex: 1,
              npcIds: [114],
              requiredKills: 5,
              credit: "shared-kills",
              source: "Synthetic five-kill quota",
              reason: null,
            },
          ],
        },
      ],
      killXpEvidence: [
        {
          npcId: 114,
          build: 70205,
          playerLevel: 1,
          mobLevel: 1,
          partySize: 5,
          partyLevels: [1, 1, 1, 1, 1],
          environment: "outdoor",
          unrestedXpPerPlayer: 10,
          sampleCount: 3,
          source: "Synthetic calibration for an isolated unit test",
          contextVerified: true,
        },
      ],
    },
  };
}

function progress(finished: number, xp = 300): ReturnType<typeof emptyPremadeProgress> {
  const result = emptyPremadeProgress();
  result.members = result.members.map((member, index) => ({
    ...member,
    level: 1,
    currentXp: xp,
    xpNeedsUpdate: false,
    raceId: "human",
    classSlug: "warrior",
    questStates: index >= 5 - finished ? { "300001": "rewarded" } : {},
  }));
  return result;
}

describe("required party combat independent of individual quest history", () => {
  it("keeps a stale bar unknown when constructing a continuation", () => {
    const plan = control(),
      input = progress(0, 345);
    input.members[0] = { ...input.members[0]!, xpNeedsUpdate: true };
    const state = {
      difficultyPolicy: input.difficultyPolicy,
      starterMode: "together" as const,
      strategy: input.dungeonFinish.strategy,
      optionalStops: input.raidGoals,
      progress: input,
      actions: plan.actions,
      forecast: forecastCampaignXp(plan, input),
    };
    expect(campaignFundingProgressBefore(state, "pickup").members[0]!.level).toBeNull();
    expect(campaignFundingXpBoundsBefore(state, "pickup")[0]).toBeNull();
  });
  it("carries ranged party bars through another quest, hand-in and physical combat stream", () => {
    const original = control(),
      input = progress(0, 0);
    input.members[0] = { ...input.members[0]!, currentXp: 390 };
    const second = original.actions.map((action) => ({
      ...action,
      id: `${action.id}-second`,
      questChanges: action.questChanges.map((change) => ({ ...change, questId: 300002 })),
    }));
    const actions = [...original.actions, ...second];
    const firstActivity = {
      ...original.combat!.activities[0]!,
      objectives: original.combat!.activities[0]!.objectives.map((objective) => ({
        ...objective,
        requiredKills: 3,
      })),
    };
    const tested: CampaignPlan = {
      ...original,
      actions,
      legs: original.legs.map((leg) => ({
        ...leg,
        actionIds: actions.map((action) => action.id),
        questIds: [300001, 300002],
      })),
      rewardFacts: [...original.rewardFacts!, { ...original.rewardFacts![0]!, questId: 300002 }],
      combat: {
        ...original.combat!,
        killXpEvidence: [],
        npcs: original.combat!.npcs.map((npc) => ({ ...npc, maximumLevel: 3 })),
        activities: [
          firstActivity,
          {
            ...firstActivity,
            id: `${firstActivity.id}-second`,
            actionId: `${firstActivity.actionId}-second`,
            objectives: firstActivity.objectives.map((objective) => ({
              ...objective,
              questId: 300002,
            })),
          },
        ],
      },
    };
    const result = forecastCampaignXp(tested, input)[0]!.members;
    expect(
      result.every(
        (member) =>
          member.combatRows.length === 2 && member.combatRows.every((row) => row.xp !== null),
      ),
    ).toBe(true);
    expect(result.every((member) => member.rewards.length === 2 && !member.blockedAtActionId)).toBe(
      true,
    );
    const total = (bar: CombatXpPosition): number =>
      bar.currentXp +
      Array.from({ length: bar.level - 1 }, (_value, index) => FOREVER_XP_CURVE[index + 1]!).reduce(
        (sum, xp) => sum + xp,
        0,
      );
    let outcomes: readonly (readonly CombatXpPosition[])[] = [
      input.members.map((member) => ({ level: member.level!, currentXp: member.currentXp! })),
    ];
    for (let round = 0; round < 2; round++) {
      for (let kill = 0; kill < 3; kill++)
        outcomes = outcomes.flatMap((bars) =>
          [1, 2, 3].map((level) => {
            const payouts = bars.map((position, playerIndex) =>
              estimateCreatureKills({
                npc: { ...tested.combat!.npcs[0]!, minimumLevel: level, maximumLevel: level },
                kills: 1,
                position,
                environment: "outdoor",
                partySize: 5,
                partyLevels: bars.map((bar) => bar.level),
                playerIndex,
              }),
            );
            return bars.map((bar, player) => advanceCombatPosition(bar, payouts[player]!.xp!));
          }),
        );
      outcomes = outcomes.map((bars) => bars.map((bar) => advanceCombatPosition(bar, 100)));
    }
    expect(outcomes).toHaveLength(729);
    for (const bars of outcomes)
      bars.forEach((bar, player) => {
        expect(
          total(result[player]!.xpBounds?.finish?.minimum ?? result[player]!.knownEndpoint!),
        ).toBeLessThanOrEqual(total(bar));
        expect(
          total(result[player]!.xpBounds?.finish?.maximum ?? result[player]!.knownEndpoint!),
        ).toBeGreaterThanOrEqual(total(bar));
      });
  });

  it("holds a pickup when the propagated range crosses its minimum level", () => {
    const original = control(),
      input = progress(0, 345);
    const last = {
      ...original.actions[0]!,
      id: "level-two-pickup",
      questChanges: [
        {
          questId: 300002,
          title: "Level-two quest",
          state: "accepted" as const,
          objectiveIndex: null,
        },
      ],
    };
    const actions = [...original.actions, last];
    const tested: CampaignPlan = {
      ...original,
      actions,
      legs: original.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
      rewardFacts: [
        { ...original.rewardFacts![0]!, fullXp: 0 },
        { ...original.rewardFacts![0]!, questId: 300002, minimumLevel: 2 },
      ],
      combat: {
        ...original.combat!,
        killXpEvidence: [],
        npcs: original.combat!.npcs.map((npc) => ({ ...npc, maximumLevel: 3 })),
      },
    };
    for (const member of forecastCampaignXp(tested, input)[0]!.members) {
      expect(member.xpBounds!.finish).toEqual({
        minimum: { level: 1, currentXp: 395 },
        maximum: { level: 2, currentXp: 0 },
      });
      expect(member.blockedAtActionId).toBe(last.id);
      expect(member.issues.some((issue) => issue.code === "xp-range-ambiguous")).toBe(true);
      expect(member.questLog.used).toBe(0);
      expect(member.rewards.some((row) => row.questId === 300002)).toBe(false);
    }
    const state = {
      difficultyPolicy: input.difficultyPolicy,
      starterMode: "together" as const,
      strategy: input.dungeonFinish.strategy,
      optionalStops: input.raidGoals,
      progress: input,
      actions,
      forecast: forecastCampaignXp(tested, input),
    };
    const continued = campaignFundingProgressBefore(state, last.id);
    const initialBounds = campaignFundingXpBoundsBefore(state, last.id);
    expect(
      initialBounds.every((bounds) => bounds?.minimum.level === 1 && bounds.maximum.level === 2),
    ).toBe(true);
    const resumed = forecastCampaignXp(tested, continued, {
      fromActionId: last.id,
      initialBounds,
    })[0]!.members;
    expect(
      resumed.every((member) => member.issues.some((issue) => issue.code === "xp-range-ambiguous")),
    ).toBe(true);
  });
  it("gives a helping player physical XP when its own source quest step skips", () => {
    const plan = control(),
      input = progress(1);
    const step = parseGuideChapter(
      "step\n.complete 300001,1\n.isOnQuest 300001",
      "source-control",
      "a".repeat(64),
      70205,
    ).steps[0]!;
    const tested: CampaignPlan = {
      ...plan,
      actions: plan.actions.map((action, index) =>
        index === 1
          ? {
              ...action,
              source: campaignActionSource(
                { chapterId: "source-control", version: "test" },
                step,
                step.directives,
              ),
            }
          : action,
      ),
    };
    const members = forecastCampaignXp(tested, input)[0]!.members;
    expect(members.map((member) => member.combatXp)).toEqual([50, 50, 50, 50, 50]);
    expect(members[4]!.rewards).toEqual([]);
    expect(members[4]!.sourceSkips).toEqual([{ actionId: "party-objective", decision: "skip" }]);
    expect(members[4]!.steps.map((event) => event.phase)).toEqual(["combat"]);
  });

  it("uses one physical stream when an external source condition differs among equally progressed members", () => {
    const plan = control(),
      input = progress(0);
    input.members = input.members.map((member, index) => ({
      ...member,
      questStates: index < 4 ? { "300099": "rewarded" as const } : {},
    }));
    const step = parseGuideChapter(
      "step\n.complete 300001,1\n.isQuestTurnedIn 300099",
      "source-control",
      "a".repeat(64),
      70205,
    ).steps[0]!;
    const tested: CampaignPlan = {
      ...plan,
      actions: plan.actions.map((action, index) =>
        index === 1
          ? {
              ...action,
              source: campaignActionSource(
                { chapterId: "source-control", version: "test" },
                step,
                step.directives,
              ),
            }
          : action,
      ),
    };
    const members = forecastCampaignXp(tested, input)[0]!.members;
    expect(members.map((member) => member.combatXp)).toEqual([50, 50, 50, 50, 50]);
    expect(members[4]!.rewards).toEqual([]);
    expect(members[4]!.issues.some((issue) => issue.code === "quest-objectives-incomplete")).toBe(
      true,
    );
  });
  it("preserves the identical-history exact-payout control", () => {
    const members = forecastCampaignXp(control(), progress(0))[0]!.members;
    expect(members.map((member) => member.combatXp)).toEqual([50, 50, 50, 50, 50]);
    expect(members.map((member) => member.referenceQuestXp)).toEqual([100, 100, 100, 100, 100]);
  });

  it.each([1, 2])(
    "gives helping members kill XP when %i already rewarded the quest, without paying their hand-in again",
    (finished) => {
      const input = progress(finished),
        plan = control(),
        before = JSON.stringify({ input, plan });
      const members = forecastCampaignXp(plan, input)[0]!.members;
      expect(members.map((member) => member.combatXp)).toEqual([50, 50, 50, 50, 50]);
      expect(members.map((member) => member.referenceQuestXp)).toEqual(
        Array.from({ length: 5 }, (_, index) => (index >= 5 - finished ? 0 : 100)),
      );
      for (const member of members) {
        expect(member.combatRows.map((row) => row.kills)).toEqual([5]);
        expect(member.blockedReason).toBeNull();
      }
      for (const member of members.slice(5 - finished)) {
        expect(member.rewards).toEqual([]);
        expect(member.questLog.used).toBe(0);
        expect(member.endpoint).toEqual({ level: 1, currentXp: 350 });
        expect(member.steps).toEqual([
          expect.objectContaining({
            phase: "combat",
            questId: null,
            before: { level: 1, currentXp: 300 },
            after: { level: 1, currentXp: 350 },
            questXp: 0,
            combatXp: 50,
          }),
        ]);
      }
      expect(JSON.stringify({ input, plan })).toBe(before);
    },
  );

  it("does not schedule more kills when the whole party has already finished", () => {
    const members = forecastCampaignXp(control(), progress(5))[0]!.members;
    expect(
      members.every(
        (member) =>
          member.combatXp === 0 && member.steps.length === 0 && member.rewards.length === 0,
      ),
    ).toBe(true);
  });

  it("updates every peer's bar before evaluating the next kill", () => {
    const plan = control(),
      input = progress(1);
    input.members[4] = { ...input.members[4]!, currentXp: 380 };
    const members = forecastCampaignXp(plan, input)[0]!.members;
    // Two observed 10-XP kills, then reference shares of floor(50/6) and floor(40*2/6).
    expect(members.map((member) => member.combatXp)).toEqual([44, 44, 44, 44, 59]);
    expect(members[4]!.endpoint).toEqual({ level: 2, currentXp: 39 });
    expect(members[4]!.rewards).toEqual([]);
  });

  it("keeps a helper's physical XP in funding state without inventing a quest state", () => {
    const plan = control(),
      input = progress(1),
      forecast = forecastCampaignXp(plan, input);
    const beforeHandIn = campaignFundingProgressBefore(
      {
        difficultyPolicy: input.difficultyPolicy,
        starterMode: "together",
        strategy: input.dungeonFinish.strategy,
        optionalStops: true,
        progress: input,
        actions: plan.actions,
        forecast,
      },
      "hand-in",
    );
    expect(beforeHandIn.members[4]).toMatchObject({
      level: 1,
      currentXp: 350,
      questStates: { "300001": "rewarded" },
    });
    expect(Object.keys(beforeHandIn.members[4]!.questStates)).toEqual(["300001"]);
    expect(beforeHandIn.members[0]!.questStates).toEqual({ "300001": "objectives-complete" });
  });

  it("preserves helper combat events in all three theoretical scenarios", () => {
    const projected = forecastCampaignSteps(control(), progress(1))[4]!;
    expect(projected.steps).toHaveLength(1);
    expect(projected.steps[0]).toMatchObject({
      questId: null,
      phase: "combat",
      combatXp: 50,
      questXp: 0,
      after: { level: 1, currentXp: 350 },
      fastLoot: { level: 1, currentXp: 350 },
      slowLoot: { level: 1, currentXp: 350 },
    });
  });

  it("can credit a helper whose 40 occupied slots contain no new quest pickup", () => {
    const input = progress(1);
    input.members[4] = {
      ...input.members[4]!,
      questStates: {
        ...input.members[4]!.questStates,
        ...Object.fromEntries(
          Array.from({ length: 40 }, (_, index) => [String(400000 + index), "accepted" as const]),
        ),
      },
    };
    const helper = forecastCampaignXp(control(), input)[0]!.members[4]!;
    expect(helper.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
    expect(helper.combatXp).toBe(50);
    expect(helper.rewards).toEqual([]);
    expect(helper.blockedReason).toBeNull();
    expect(helper.steps.every((step) => step.phase === "combat")).toBe(true);
  });

  it("does not pay future dungeon combat before the dungeon visit", () => {
    const plan = control();
    const misplaced: CampaignPlan = {
      ...plan,
      combat: {
        ...plan.combat!,
        activities: plan.combat!.activities.map((activity) => ({
          ...activity,
          environment: "dungeon",
        })),
        killXpEvidence: plan.combat!.killXpEvidence!.map((sample) => ({
          ...sample,
          environment: "dungeon",
        })),
      },
    };
    const members = forecastCampaignXp(misplaced, progress(1))[0]!.members;
    expect(members.map((member) => member.combatXp)).toEqual([0, 0, 0, 0, 0]);
    expect(
      members
        .slice(0, 4)
        .every((member) =>
          member.issues.some((issue) => issue.code === "dungeon-objective-misordered"),
        ),
    ).toBe(true);
    expect(members[4]!.steps).toEqual([]);
  });

  it("uses observed dungeon payouts at its visit without applying the outdoor multiplier", () => {
    const plan = control();
    const dungeon: CampaignPlan = {
      ...plan,
      legs: plan.legs.map((leg) => ({ ...leg, kind: "dungeon" })),
      combat: {
        ...plan.combat!,
        activities: plan.combat!.activities.map((activity) => ({
          ...activity,
          environment: "dungeon",
        })),
        killXpEvidence: plan.combat!.killXpEvidence!.map((sample) => ({
          ...sample,
          environment: "dungeon",
        })),
      },
    };
    const members = forecastCampaignXp(dungeon, progress(1), {
      outdoorXpMultiplier: 2,
    })[0]!.members;
    expect(members.map((member) => member.combatXp)).toEqual([50, 50, 50, 50, 50]);
    expect(members.every((member) => member.dungeonCombatXp === 50)).toBe(true);
    expect(members.every((member) => member.outdoorCombatXp === 0)).toBe(true);
    expect(members.every((member) => member.blockedReason === null)).toBe(true);
  });
});

type SharedInput = Parameters<typeof forecastSharedPartyCombat>[0];

function sharedInput(): SharedInput {
  const plan = control();
  return {
    action: plan.actions[1]!,
    activities: plan.combat!.activities,
    combat: plan.combat!,
    participants: Array.from({ length: 5 }, () => ({
      position: { level: 1, currentXp: 100 },
      questStates: { "300001": "accepted" as const },
      state: {
        counters: new Map([["300001:1", 0]]),
        paid: new Set<string>(),
        pathKills: new Map<string, number>(),
      },
    })),
    xpMultiplier: 1,
  };
}

function withObjectives(input: SharedInput, objectives: readonly CombatObjective[]): SharedInput {
  const activity: CombatActivity = { ...input.activities[0]!, objectives };
  return {
    ...input,
    action: {
      ...input.action,
      questChanges: objectives.map((objective) => ({
        questId: objective.questId,
        title: "Required shared objective",
        state: "objectives-complete",
        objectiveIndex: objective.objectiveIndex,
      })),
    },
    activities: [activity],
    combat: { ...input.combat, activities: [activity] },
  };
}

function stateSnapshot(input: SharedInput): string {
  return JSON.stringify(
    input.participants.map((participant) => ({
      position: participant.position,
      quests: participant.questStates,
      counters: [...participant.state.counters],
      paid: [...participant.state.paid],
      paths: [...participant.state.pathKills],
    })),
  );
}

describe("shared physical kill demand", () => {
  it("reuses a plan index across actions without retaining participants or counters", () => {
    const input = sharedInput(),
      references = indexSharedPartyCombat(input.combat);
    const first = forecastSharedPartyCombat({ ...input, references })!;
    const second = forecastSharedPartyCombat({
      ...input,
      references,
      participants: input.participants.map((participant, index) => ({
        ...participant,
        state: first[index]!.state,
      })),
    })!;
    expect(first.every((member) => member.xp === 50)).toBe(true);
    expect(second.every((member) => member.xp === 0 && member.rows.length === 0)).toBe(true);
    expect(input.participants[0]!.state.counters.get("300001:1")).toBe(0);
    expect(() =>
      forecastSharedPartyCombat({
        ...input,
        references: indexSharedPartyCombat({ ...input.combat }),
      }),
    ).toThrow("another plan");
  });

  it("rejects a foreign activity when building an owner-specific index", () => {
    const input = sharedInput();
    expect(() => indexSharedPartyCombat(input.combat, [{ ...input.activities[0]! }])).toThrow(
      "another plan",
    );
    expect(indexSharedPartyCombat(input.combat, input.activities).combat).toBe(input.combat);
  });

  it("keeps a finished helper's personal variant from blocking the other four players", () => {
    const input = sharedInput();
    const unknown: CombatActivity = {
      ...input.activities[0]!,
      id: "helper-personal-variant",
      actionId: "helper-personal-source",
      objectives: [
        {
          ...input.activities[0]!.objectives[0]!,
          npcIds: [],
          requiredKills: null,
          credit: "unknown",
        },
      ],
    };
    const combat = { ...input.combat, activities: [...input.activities, unknown] };
    const own = indexSharedPartyCombat(combat, input.activities);
    const helper = indexSharedPartyCombat(combat);
    const configured: SharedInput = {
      ...input,
      combat,
      participants: input.participants.map((participant, index) => ({
        ...participant,
        references: index === 4 ? helper : own,
        questStates: { "300001": index === 4 ? "rewarded" : "accepted" },
      })),
    };
    const snapshot = stateSnapshot(configured);
    const result = forecastSharedPartyCombat(configured)!;
    expect(result.map((member) => member.xp)).toEqual([50, 50, 50, 50, 50]);
    expect(result.slice(0, 4).every((member) => member.state.counters.get("300001:1") === 5)).toBe(
      true,
    );
    expect(stateSnapshot(configured)).toBe(snapshot);
    expect(
      forecastSharedPartyCombat({
        ...configured,
        participants: configured.participants.map((participant) => ({
          ...participant,
          questStates: { "300001": "accepted" },
        })),
      }),
    ).toBeNull();
  });

  it("advances overlap counters only from the participating owner's reference view", () => {
    const input = sharedInput();
    const personal: CombatActivity = {
      ...input.activities[0]!,
      id: "personal-overlap",
      actionId: "personal-source",
      objectives: [{ ...input.activities[0]!.objectives[0]!, questId: 300003 }],
    };
    const combat = { ...input.combat, activities: [...input.activities, personal] };
    const partyReferences = indexSharedPartyCombat(combat, input.activities);
    const ownerReferences = indexSharedPartyCombat(combat);
    const result = forecastSharedPartyCombat({
      ...input,
      combat,
      participants: input.participants.map((participant, index) => ({
        ...participant,
        references: index === 0 ? ownerReferences : partyReferences,
        questStates: { ...participant.questStates, "300003": "accepted" },
      })),
    })!;
    expect(result.every((member) => member.xp === 50)).toBe(true);
    expect(result[0]!.state.counters.get("300003:1")).toBe(5);
    expect(result.slice(1).every((member) => !member.state.counters.has("300003:1"))).toBe(true);
  });

  it("refuses a participant index from another combat plan", () => {
    const input = sharedInput();
    expect(() =>
      forecastSharedPartyCombat({
        ...input,
        participants: input.participants.map((participant) => ({
          ...participant,
          references: indexSharedPartyCombat({ ...input.combat }),
        })),
      }),
    ).toThrow("another plan");
  });

  it("uses the common plan for participants without an explicit reference view", () => {
    const input = sharedInput();
    const personal: CombatActivity = {
      ...input.activities[0]!,
      id: "extra-reference",
      actionId: "extra-source",
      objectives: [{ ...input.activities[0]!.objectives[0]!, questId: 300003 }],
    };
    const combat = { ...input.combat, activities: [...input.activities, personal] };
    const firstOnly = indexSharedPartyCombat(combat, input.activities);
    const result = forecastSharedPartyCombat({
      ...input,
      combat,
      participants: input.participants.map((participant, index) => ({
        ...participant,
        ...(index === 0 ? { references: firstOnly } : {}),
        questStates: { ...participant.questStates, "300003": "accepted" },
      })),
    })!;
    expect(result[0]!.state.counters.has("300003:1")).toBe(false);
    expect(result.slice(1).every((member) => member.state.counters.get("300003:1") === 5)).toBe(
      true,
    );
    expect(result.every((member) => member.xp === 50)).toBe(true);
  });

  it.each(["quota", "credit", "creature", "conflict"] as const)(
    "retains an active overlapping %s conflict from a later source",
    (reason) => {
      const input = sharedInput(),
        original = { ...input.activities[0]!.objectives[0]!, questId: 300003 };
      const changed: CombatObjective = {
        ...original,
        ...(reason === "quota" ? { requiredKills: 10 } : {}),
        ...(reason === "credit" ? { credit: "unknown" } : {}),
        ...(reason === "creature" ? { npcIds: [115] } : {}),
        ...(reason === "conflict" ? { quotaConflict: true } : {}),
      };
      const combat = {
        ...input.combat,
        activities: [
          ...input.activities,
          { ...input.activities[0]!, id: "other-quest", objectives: [original] },
          { ...input.activities[0]!, id: "conflicting-source", objectives: [changed] },
        ],
      };
      const configured: SharedInput = {
        ...input,
        combat,
        references: indexSharedPartyCombat(combat),
        participants: input.participants.map((participant) => ({
          ...participant,
          questStates: { ...participant.questStates, "300003": "accepted" },
        })),
      };
      const before = stateSnapshot(configured);
      expect(forecastSharedPartyCombat(configured)).toBeNull();
      expect(stateSnapshot(configured)).toBe(before);
    },
  );

  it("retains a personal-loot overlap known only from item drop sources", () => {
    const input = sharedInput();
    const combat: SharedInput["combat"] = {
      ...input.combat,
      activities: [
        ...input.activities,
        {
          ...input.activities[0]!,
          id: "loot-without-direct-target",
          objectives: [
            {
              ...input.activities[0]!.objectives[0]!,
              questId: 300003,
              npcIds: [],
              credit: "personal-loot",
              requiredKills: null,
              loot: { itemId: 1, quantity: 1, sharing: "pooled" },
            },
          ],
        },
      ],
      lootDrops: [
        {
          itemId: 1,
          npcId: 114,
          probability: 0.5,
          minimumQuantity: 1,
          maximumQuantity: 1,
          sampleSize: 100,
          targetBuild: 70205,
          sourceUrl: "https://example.test/synthetic-control",
          sourceSha256: "a".repeat(64),
          capturedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    };
    expect(
      forecastSharedPartyCombat({
        ...input,
        combat,
        references: indexSharedPartyCombat(combat),
        participants: input.participants.map((participant) => ({
          ...participant,
          questStates: { ...participant.questStates, "300003": "accepted" },
        })),
      }),
    ).toBeNull();
  });

  it("uses the slowest known remaining shared quota rather than summing personal quotas", () => {
    const input = sharedInput();
    const configured: SharedInput = {
      ...input,
      participants: input.participants.map((participant, index) => ({
        ...participant,
        state: { ...participant.state, counters: new Map([["300001:1", index]]) },
      })),
    };
    const before = stateSnapshot(configured);
    const forecast = forecastSharedPartyCombat(configured)!;
    expect(forecast.map((member) => member.xp)).toEqual([50, 50, 50, 50, 50]);
    expect(
      forecast.every(
        (member) => member.rows[0]!.kills === 5 && member.state.counters.get("300001:1") === 5,
      ),
    ).toBe(true);
    expect(stateSnapshot(configured)).toBe(before);
  });

  it("merges same-creature shared objectives into one physical stream", () => {
    const input = sharedInput(),
      first = input.activities[0]!.objectives[0]!;
    const configured = withObjectives(input, [
      first,
      { ...first, questId: 300002, requiredKills: 8 },
    ]);
    const ready: SharedInput = {
      ...configured,
      participants: configured.participants.map((participant) => ({
        ...participant,
        questStates: { ...participant.questStates, "300002": "accepted" },
      })),
    };
    const forecast = forecastSharedPartyCombat(ready)!;
    expect(
      forecast.every(
        (member) => member.rows.length === 1 && member.rows[0]!.kills === 8 && member.xp === 80,
      ),
    ).toBe(true);
    expect(forecast[0]!.state.counters.get("300001:1")).toBe(5);
    expect(forecast[0]!.state.counters.get("300002:1")).toBe(8);
    const replay = forecastSharedPartyCombat({
      ...ready,
      participants: ready.participants.map((participant, index) => ({
        ...participant,
        state: forecast[index]!.state,
      })),
    })!;
    expect(replay.every((member) => member.xp === 0 && member.rows.length === 0)).toBe(true);
  });

  it("advances an overlapping later quest once even when several activities mention it", () => {
    const input = sharedInput();
    const later: CombatActivity = {
      ...input.activities[0]!,
      id: "later",
      actionId: "later",
      objectives: [{ ...input.activities[0]!.objectives[0]!, questId: 300003, requiredKills: 20 }],
    };
    const configured: SharedInput = {
      ...input,
      combat: {
        ...input.combat,
        activities: [...input.activities, later, { ...later, id: "same-quota-other-source" }],
      },
      participants: input.participants.map((participant) => ({
        ...participant,
        questStates: { ...participant.questStates, "300003": "accepted" },
      })),
    };
    const forecast = forecastSharedPartyCombat(configured)!;
    expect(
      forecast.every(
        (member) => member.state.counters.get("300003:1") === 5 && member.rows[0]!.kills === 5,
      ),
    ).toBe(true);
  });

  it("does not assume the remaining count of an already-held quest", () => {
    const input = sharedInput();
    input.participants[2]!.state.counters.set("300001:1", null);
    const before = stateSnapshot(input);
    expect(forecastSharedPartyCombat(input)).toBeNull();
    expect(stateSnapshot(input)).toBe(before);
  });

  it("returns no partial state changes when a later creature payout is unresolved", () => {
    const input = sharedInput(),
      first = input.activities[0]!.objectives[0]!;
    const changed = withObjectives(input, [first, { ...first, questId: 300002, npcIds: [999] }]);
    const configured: SharedInput = {
      ...changed,
      combat: {
        ...changed.combat,
        npcs: [...changed.combat.npcs, { ...changed.combat.npcs[0]!, id: 999, rank: null }],
      },
      participants: changed.participants.map((participant) => ({
        ...participant,
        questStates: { ...participant.questStates, "300002": "accepted" },
      })),
    };
    const before = stateSnapshot(configured);
    expect(forecastSharedPartyCombat(configured)).toBeNull();
    expect(stateSnapshot(configured)).toBe(before);
  });

  it("preserves uncertain overlapping loot inventory for the existing joint-loot model", () => {
    const input = sharedInput();
    const loot: CombatActivity = {
      ...input.activities[0]!,
      id: "loot",
      actionId: "later-loot",
      objectives: [
        {
          ...input.activities[0]!.objectives[0]!,
          questId: 300003,
          credit: "personal-loot",
          requiredKills: null,
          loot: { itemId: 1, quantity: 1, sharing: "pooled" },
        },
      ],
    };
    const configured: SharedInput = {
      ...input,
      combat: { ...input.combat, activities: [...input.activities, loot] },
      participants: input.participants.map((participant) => ({
        ...participant,
        questStates: { ...participant.questStates, "300003": "accepted" },
      })),
    };
    expect(forecastSharedPartyCombat(configured)).toBeNull();
  });

  it("records required kills with zero XP at the level cap", () => {
    const input = sharedInput();
    const forecast = forecastSharedPartyCombat({
      ...input,
      participants: input.participants.map((participant) => ({
        ...participant,
        position: { level: 60, currentXp: 0 },
      })),
    })!;
    expect(
      forecast.every(
        (member) =>
          member.xp === 0 && member.rows[0]!.kills === 5 && member.rows[0]!.basis === "excluded",
      ),
    ).toBe(true);
  });

  it.each([
    "personal",
    "path",
    "quest-wide",
    "mixed-phases",
    "quota-conflict",
    "ambiguous-target",
  ] as const)("retains the existing handling for unsupported %s phases", (reason) => {
    const input = sharedInput();
    const configured: SharedInput =
      reason === "personal"
        ? { ...input, action: { ...input.action, leaderOnly: true } }
        : reason === "mixed-phases"
          ? {
              ...input,
              action: {
                ...input.action,
                questChanges: [
                  ...input.action.questChanges,
                  { ...input.action.questChanges[0]!, state: "rewarded", objectiveIndex: null },
                ],
              },
            }
          : reason === "path" || reason === "quest-wide"
            ? {
                ...input,
                activities: [
                  {
                    ...input.activities[0]!,
                    ...(reason === "path" ? { pathId: "clear" } : { questWide: true }),
                  },
                ],
              }
            : withObjectives(input, [
                {
                  ...input.activities[0]!.objectives[0]!,
                  ...(reason === "quota-conflict"
                    ? { quotaConflict: true }
                    : { npcIds: [114, 115] }),
                },
              ]);
    expect(forecastSharedPartyCombat(configured)).toBeNull();
  });
});
