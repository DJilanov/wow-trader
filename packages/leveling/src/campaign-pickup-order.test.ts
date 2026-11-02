import { describe, expect, it } from "vitest";
import { alignCampaignPickupChecks, deferUnfundedStarterPickups } from "./campaign-pickup-order.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { campaignActionReasons } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function phase(
  id: string,
  questId: number,
  states: readonly ("accepted" | "objectives-complete" | "rewarded")[],
): CampaignAction {
  return {
    id,
    legId: "starter",
    title: id,
    instructions: [id],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: states.map((state) => ({
      questId,
      title: `Quest ${questId}`,
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
}
function fixture(initialXp = 300): CampaignPlan {
  const pickup = phase("pickup", 300002, ["accepted"]);
  const gate: CampaignAction = {
    ...pickup,
    id: "gate",
    questChanges: [],
    kind: "xp-check",
    targetLevel: 2,
    pickupQuestId: 300002,
  };
  const actions = [
    phase("first", 300001, ["accepted", "objectives-complete", "rewarded"]),
    gate,
    pickup,
    phase("independent", 300003, ["accepted", "objectives-complete", "rewarded"]),
    phase("objective", 300002, ["objectives-complete"]),
    phase("return", 300002, ["rewarded"]),
  ];
  return {
    release: "pickup-order-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Elwynn Forest",
        from: 1,
        to: 6,
        kind: "starter",
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [300001, 300002, 300003],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [initialXp, 100, 400].map((fullXp, index) => ({
      questId: 300001 + index,
      fullXp,
      questLevel: 6,
      minimumLevel: index === 1 ? 2 : 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-10-31T00:00:00.000Z",
    })),
  };
}
describe("generated pickup reminder placement", () => {
  function forecast(plan: CampaignPlan): ReturnType<typeof forecastCampaignXp> {
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    return forecastCampaignXp(plan, progress);
  }

  function prepared(initialXp = 300, preparationXp = 400): CampaignPlan {
    const initial = fixture(initialXp);
    const actions = [
      initial.actions[0]!,
      initial.actions[1]!,
      initial.actions[3]!,
      initial.actions[2]!,
      ...initial.actions.slice(4),
    ];
    return {
      ...initial,
      actions,
      legs: initial.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
      rewardFacts: initial.rewardFacts!.map((fact) =>
        fact.questId === 300003 ? { ...fact, fullXp: preparationXp } : fact,
      ),
    };
  }

  it("checks the real pickup bar after inserted preparation without moving a gameplay task", () => {
    const initial = prepared(),
      before = JSON.stringify(initial);
    const ordered = alignCampaignPickupChecks(initial);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "independent",
      "gate",
      "pickup",
      "objective",
      "return",
    ]);
    expect(ordered.actions.filter((action) => action.kind !== "xp-check")).toEqual(
      initial.actions.filter((action) => action.kind !== "xp-check"),
    );
    for (const action of ordered.actions)
      expect(action).toBe(initial.actions.find((entry) => entry.id === action.id));
    expect(ordered.legs[0]!.actionIds).toEqual(ordered.actions.map((action) => action.id));
    const original = forecast(initial)[0]!.members[0]!;
    const current = forecast(ordered)[0]!.members[0]!;
    expect(original.checkpoints[0]).toMatchObject({ missingXp: 100, ready: false });
    expect(current.checkpoints[0]).toMatchObject({
      position: { level: 2, currentXp: 300 },
      missingXp: 0,
      ready: true,
    });
    expect(current.steps).toEqual(original.steps);
    expect(current.endpoint).toEqual(original.endpoint);
    expect(current.referenceQuestXp).toBe(original.referenceQuestXp);
    expect(current.estimatedQuestXp).toBe(original.estimatedQuestXp);
    expect(current.referenceQuestXp + current.estimatedQuestXp).toBe(800);
    expect(current.combatXp).toBe(0);
    expect(JSON.stringify(initial)).toBe(before);
    expect(alignCampaignPickupChecks(ordered)).toBe(ordered);
  });

  it("retains a real shortfall and never borrows a reward after the pickup", () => {
    const ordered = alignCampaignPickupChecks(prepared(300, 40));
    const row = forecast(ordered)[0]!.members[0]!;
    expect(row.checkpoints[0]).toMatchObject({
      position: { level: 1, currentXp: 340 },
      missingXp: 60,
      ready: false,
    });
    expect(row.steps.find((step) => step.actionId === "pickup")).toMatchObject({
      status: "blocked",
      shortfallXp: 60,
    });
    expect(
      row.steps.filter((step) => step.status === "projected").map((step) => step.questId),
    ).not.toContain(300002);
  });

  it("preserves several reminders for one pickup in stable, idempotent order", () => {
    const initial = prepared();
    const extra = { ...initial.actions[1]!, id: "other-gate" };
    const input = {
      ...initial,
      actions: [...initial.actions.slice(0, 3), extra, ...initial.actions.slice(3)],
    };
    const ordered = alignCampaignPickupChecks(input);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "independent",
      "gate",
      "other-gate",
      "pickup",
      "objective",
      "return",
    ]);
    expect(alignCampaignPickupChecks(ordered)).toBe(ordered);
  });

  it("does not cross a leg boundary or change the intended audience", () => {
    for (const change of [
      { legId: "other-leg" },
      { leaderOnly: false },
      { raidOnly: true },
      { dungeonFinishOnly: true },
    ]) {
      const initial = prepared();
      const input = {
        ...initial,
        actions: initial.actions.map((action) =>
          action.id === "pickup" ? { ...action, ...change } : action,
        ),
      };
      expect(alignCampaignPickupChecks(input)).toBe(input);
    }
  });

  it("does not guess a missing or ambiguous pickup or relocate a source-authored check", () => {
    const initial = prepared();
    const inputs: CampaignPlan[] = [
      { ...initial, actions: initial.actions.filter((action) => action.id !== "pickup") },
      {
        ...initial,
        actions: [...initial.actions, { ...initial.actions[3]!, id: "second-pickup" }],
      },
      {
        ...initial,
        actions: initial.actions.map((action) =>
          action.id === "gate"
            ? { ...action, source: { chapterId: "source", version: "v1", stepId: "check" } }
            : action,
        ),
      },
    ];
    for (const input of inputs) expect(alignCampaignPickupChecks(input)).toBe(input);
  });
});

describe("starter pickup timing", () => {
  it("schedules an actual blocked pickup even when no separate reminder was generated", () => {
    const original = fixture();
    const input = {
      ...original,
      actions: original.actions.filter((action) => action.id !== "gate"),
    };
    const result = deferUnfundedStarterPickups(input);
    expect(result.actions.map((action) => action.id)).toEqual([
      "first",
      "independent",
      "pickup",
      "objective",
      "return",
    ]);
    expect(result.actions.every((action) => action.kind !== "xp-check")).toBe(true);
    expect(
      forecastCampaignGuide(result, emptyPremadeProgress()).sections[0]!.forecast.members[0],
    ).toMatchObject({ endpoint: { level: 2, currentXp: 400 }, combatXp: 0, blockedReason: null });
    expect(deferUnfundedStarterPickups(result)).toBe(result);
  });
  it("keeps a ready hand-in at its original visit while deferring the unavailable pickup beside it", () => {
    const original = fixture();
    const combined: CampaignAction = {
      ...phase("combined", 300004, ["rewarded"]),
      source: { chapterId: "source", version: "v1", stepId: "combined" },
      requiredQuestIds: [300004],
      questChanges: [
        ...phase("reward", 300004, ["rewarded"]).questChanges,
        ...phase("pickup", 300002, ["accepted"]).questChanges,
      ],
      instructions: ["Turn in Quest 300004", "Accept Quest 300002"],
    };
    const input: CampaignPlan = {
      ...original,
      actions: [
        original.actions[0]!,
        phase("prepare", 300004, ["accepted", "objectives-complete"]),
        combined,
        original.actions[3]!,
        original.actions[4]!,
        original.actions[5]!,
      ],
      rewardFacts: [
        ...original.rewardFacts!,
        { ...original.rewardFacts![0]!, questId: 300004, fullXp: 50 },
      ],
    };
    const result = deferUnfundedStarterPickups(input);
    expect(result.actions.map((action) => action.id)).toEqual([
      "first",
      "prepare",
      "combined",
      "independent",
      "combined-deferred-300002",
      "objective",
      "return",
    ]);
    expect(result.actions[2]).toMatchObject({
      source: combined.source,
      requiredQuestIds: [],
      instructions: ["Turn in Quest 300004"],
    });
    expect(result.actions[4]).toMatchObject({
      source: combined.source,
      instructions: ["Accept Quest 300002"],
    });
    expect(result.bookmarkAliases?.combined).toBeUndefined();
    expect(
      forecastCampaignGuide(result, emptyPremadeProgress()).sections[0]!.forecast.members[0],
    ).toMatchObject({ endpoint: { level: 2, currentXp: 450 }, blockedReason: null, combatXp: 0 });
  });
  it("earns the pickup level from independent tasks instead of inserting a grind", () => {
    const initial = fixture(),
      before = JSON.stringify(initial);
    const ordered = deferUnfundedStarterPickups(initial);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "independent",
      "pickup",
      "objective",
      "return",
    ]);
    expect(ordered.bookmarkAliases?.gate).toBe("pickup");
    const row = forecastCampaignGuide(ordered, emptyPremadeProgress()).sections[0]!.forecast
      .members[0]!;
    expect(row).toMatchObject({
      endpoint: { level: 2, currentXp: 400 },
      estimatedCombatXp: 0,
      combatXp: 0,
      blockedReason: null,
    });
    expect(JSON.stringify(initial)).toBe(before);
  });
  it("preserves the source order when the pickup is already funded", () => {
    const initial = fixture(500);
    expect(deferUnfundedStarterPickups(initial)).toBe(initial);
  });
  it("cannot move a pickup after its objective or borrow its own reward", () => {
    const initial = fixture();
    const actions = [
      ...initial.actions.slice(0, 3),
      initial.actions[4]!,
      initial.actions[3]!,
      initial.actions[5]!,
    ];
    const input = { ...initial, actions };
    expect(deferUnfundedStarterPickups(input)).toBe(input);
  });
  it("does not move a pickup past an intervening dependent quest", () => {
    const initial = fixture();
    const child = { ...phase("child", 300004, ["accepted"]), requiredQuestIds: [300002] };
    const input = {
      ...initial,
      actions: [...initial.actions.slice(0, 3), child, ...initial.actions.slice(3)],
    };
    expect(deferUnfundedStarterPickups(input)).toBe(input);
  });
  it("keeps an available bundled pickup while delaying only the level-gated quest", () => {
    const initial = fixture();
    const pickup = {
      ...initial.actions[2]!,
      questChanges: [
        ...initial.actions[2]!.questChanges,
        ...phase("other", 300003, ["accepted"]).questChanges,
      ],
      instructions: ["Accept Quest 300002", "Accept Quest 300003", "Talk to the quest givers."],
    };
    const independent = phase("independent", 300003, ["objectives-complete", "rewarded"]);
    const input = {
      ...initial,
      actions: [
        initial.actions[0]!,
        initial.actions[1]!,
        pickup,
        independent,
        ...initial.actions.slice(4),
      ],
    };
    const ordered = deferUnfundedStarterPickups(input);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "pickup",
      "independent",
      "pickup-deferred-300002",
      "objective",
      "return",
    ]);
    expect(ordered.actions[1]!.questChanges.map((change) => change.questId)).toEqual([300003]);
    expect(ordered.actions[1]!.instructions).not.toContain("Accept Quest 300002");
    expect(ordered.actions[3]!.instructions).not.toContain("Accept Quest 300003");
    expect(ordered.bookmarkAliases?.gate).toBe("pickup-deferred-300002");
    expect(
      forecastCampaignGuide(ordered, emptyPremadeProgress()).sections[0]!.forecast.members[0],
    ).toMatchObject({
      endpoint: { level: 2, currentXp: 400 },
      blockedReason: null,
      estimatedCombatXp: 0,
    });
  });
  it("uses an independent hand-in before a gated return in the same source visit", () => {
    const initial = fixture();
    const preparation = phase("prepare-other", 300003, ["accepted", "objectives-complete"]);
    const combined = {
      ...initial.actions[5]!,
      id: "combined-return",
      requiredQuestIds: [300002],
      questChanges: [
        ...phase("other-reward", 300003, ["rewarded"]).questChanges,
        ...phase("gated-reward", 300002, ["objectives-complete", "rewarded"]).questChanges,
        ...phase("child", 300004, ["accepted"]).questChanges,
      ],
    };
    const input = {
      ...initial,
      actions: [
        initial.actions[0]!,
        preparation,
        initial.actions[1]!,
        initial.actions[2]!,
        combined,
      ],
    };
    const ordered = deferUnfundedStarterPickups(input);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "prepare-other",
      "combined-return-before-deferred-300002",
      "pickup",
      "combined-return",
    ]);
    expect(ordered.actions[2]!.requiredQuestIds).toEqual([]);
    expect(ordered.actions[4]!.requiredQuestIds).toEqual([300002]);
    expect(ordered.actions[2]!.questChanges.map((change) => change.questId)).toEqual([300003]);
    const reported = emptyPremadeProgress();
    reported.members[0] = {
      ...reported.members[0]!,
      level: 2,
      currentXp: 300,
      xpNeedsUpdate: false,
      questStates: { "300002": "accepted" },
    };
    expect(campaignActionReasons(ordered.actions[4]!, reported)).toEqual([]);
    expect(
      campaignActionReasons(
        { ...ordered.actions[4]!, questChanges: [...ordered.actions[4]!.questChanges].reverse() },
        reported,
      ),
    ).not.toEqual([]);
    expect(
      forecastCampaignGuide(ordered, emptyPremadeProgress()).sections[0]!.forecast.members[0],
    ).toMatchObject({
      endpoint: { level: 2, currentXp: 400 },
      blockedReason: null,
      estimatedCombatXp: 0,
    });
  });
  it("retains an available follow-up in the independent part of a combined handoff", () => {
    const initial = fixture();
    const combined = {
      ...initial.actions[5]!,
      id: "combined-return",
      questChanges: [
        ...phase("other-reward", 300003, ["rewarded"]).questChanges,
        ...phase("available-child", 300004, ["accepted"]).questChanges,
        ...phase("gated-reward", 300002, ["objectives-complete", "rewarded"]).questChanges,
      ],
    };
    const input = {
      ...initial,
      actions: [
        initial.actions[0]!,
        phase("prepare-other", 300003, ["accepted", "objectives-complete"]),
        initial.actions[1]!,
        initial.actions[2]!,
        combined,
      ],
      rewardFacts: [
        ...initial.rewardFacts!,
        { ...initial.rewardFacts![0]!, questId: 300004, minimumLevel: 1 },
      ],
    };
    const ordered = deferUnfundedStarterPickups(input);
    expect(ordered.actions.map((action) => action.id)).toEqual([
      "first",
      "prepare-other",
      "combined-return-before-deferred-300002",
      "pickup",
      "combined-return",
    ]);
    expect(ordered.actions[2]!.questChanges.map((change) => change.questId)).toEqual([
      300003, 300004,
    ]);
    expect(
      forecastCampaignGuide(ordered, emptyPremadeProgress()).sections[0]!.forecast.members[0]!
        .blockedReason,
    ).toBeNull();
    const unavailable = {
      ...input,
      rewardFacts: input.rewardFacts.map((fact) =>
        fact.questId === 300004 ? { ...fact, minimumLevel: 5 } : fact,
      ),
    };
    expect(deferUnfundedStarterPickups(unavailable)).toBe(unavailable);
  });
});
