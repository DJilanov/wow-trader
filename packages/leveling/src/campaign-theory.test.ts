import { describe, expect, it } from "vitest";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";
import { forecastCampaignSteps } from "./campaign-theory.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { applyCampaignCombat, createCampaignCombatState } from "./campaign-combat.js";
import { resolveCombatQuota } from "./combat-loot.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import type { CampaignPlan, CampaignAction, CampaignQuestChange } from "./campaign.js";
import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";

function change(questId: number, state: CampaignQuestChange["state"]): CampaignQuestChange {
  return {
    questId,
    state,
    title: `Quest ${questId}`,
    objectiveIndex: state === "objectives-complete" ? 1 : null,
  };
}
function action(id: string, questChanges: readonly CampaignQuestChange[]): CampaignAction {
  return {
    id,
    legId: "starter",
    title: id,
    instructions: [],
    questChanges,
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
const npc = {
  id: 257,
  name: "Kobold Worker",
  minimumLevel: 3,
  maximumLevel: 3,
  rank: 0,
  xpEligibility: "assumed" as const,
  zoneIds: [12],
};
const objective: CombatObjective = {
  questId: 300001,
  objectiveIndex: 1,
  npcIds: [257],
  requiredKills: 10,
  credit: "shared-kills",
  source: "synthetic quota",
  reason: null,
};
function route(loot = false): CampaignPlan {
  const actions = [
    action("accept", [change(300001, "accepted")]),
    action("kill", [change(300001, "objectives-complete")]),
    action("handoff", [change(300001, "rewarded"), change(96627, "accepted")]),
  ];
  const fact = (questId: number, xp: number, minimumLevel: number): QuestRewardFact => ({
    questId,
    fullXp: xp,
    minimumLevel,
    questLevel: 6,
    xpByLevel: [],
    status: "available",
    evidenceKind: "published-forever",
    sourceUrl: `https://example.test/quest=${questId}`,
    capturedAt: "2026-10-20T00:00:00.000Z",
  });
  const combat: CampaignCombatPlan = {
    revision: "test",
    sourceRevision: "a".repeat(40),
    targetBuild: 70205,
    npcs: [npc],
    notice: null,
    activities: [
      {
        id: "combat-kill",
        actionId: "kill",
        environment: "outdoor",
        profile: null,
        objectives: [
          loot
            ? {
                ...objective,
                requiredKills: null,
                credit: "personal-loot",
                loot: { itemId: 750, quantity: 8, sharing: "unknown" },
              }
            : objective,
        ],
      },
    ],
    lootDrops: [
      {
        itemId: 750,
        npcId: 257,
        probability: 0.4,
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/item=750",
        sourceSha256: "a".repeat(64),
        capturedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
  };
  return {
    release: "theory-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Starter",
        from: 1,
        to: 6,
        kind: "starter",
        stopId: null,
        actionIds: actions.map((a) => a.id),
        questIds: [300001, 96627],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [fact(300001, 2680, 1), fact(96627, 410, 4)],
    combat,
  };
}
describe("chronological theoretical progress", () => {
  it("keeps addon pickup checkpoints aligned with the combat-funded browser plan", () => {
    const raw = route();
    const actions: readonly CampaignAction[] = [
      ...raw.actions,
      action("next-objective", [change(96627, "objectives-complete")]),
      action("next-turnin", [change(96627, "rewarded")]),
      {
        ...action("party-rejoin", []),
        leaderOnly: false,
        kind: "instructions",
        instructions: ["Record actual party XP."],
      },
    ];
    const plan = {
      ...raw,
      actions,
      legs: [{ ...raw.legs[0]!, actionIds: actions.map((entry) => entry.id) }],
    };
    const { combat: _, ...withoutCombat } = plan;
    const funded = compileCampaignPickupGates(plan);
    const questOnly = compileCampaignPickupGates(withoutCombat);
    const options = {
      version: "0.2.0-test.1",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.26",
    };
    const addon = compileCampaignAddon(funded, funded.actions, options);
    const fallback = compileCampaignAddon(questOnly, questOnly.actions, options);
    expect(funded.actions.some((entry) => entry.pickupQuestId === 96627)).toBe(false);
    expect(questOnly.actions.some((entry) => entry.pickupQuestId === 96627)).toBe(true);
    expect(addon.lua).not.toContain("#label kfc-starter-level-4-96627");
    expect(fallback.lua).toContain("#label kfc-starter-level-4-96627");
    expect(addon.lua).toContain(".accept 96627");
    expect(addon.readme).toContain("The addon cannot see all five players' XP bars");
  });
  it("holds missing loot counts and known mismatching source builds", () => {
    const combat = route(true).combat!,
      loot = combat.activities[0]!.objectives[0]!;
    expect(
      resolveCombatQuota(
        { ...loot, loot: { ...loot.loot!, quantity: null } },
        combat,
        1,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("quantity") });
    expect(
      resolveCombatQuota(
        loot,
        { ...combat, lootDrops: [{ ...combat.lootDrops![0]!, sourceBuild: 99999 }] },
        1,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("different client build") });
    expect(resolveCombatQuota(loot, combat, 1, "expected").kills).toBe(20);
  });
  it("does not interpret sampled item totals as a drop-event rate for multi-item stacks", () => {
    const combat = route(true).combat!,
      loot = combat.activities[0]!.objectives[0]!;
    expect(
      resolveCombatQuota(
        loot,
        {
          ...combat,
          lootDrops: [
            {
              ...combat.lootDrops![0]!,
              probabilityBasis: "sample-ratio",
              minimumQuantity: 2,
              maximumQuantity: 2,
            },
          ],
        },
        1,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("multi-item") });
  });
  it("uses a reported variable-stack distribution but not a sampled multi-item count ratio", () => {
    const combat = route(true).combat!,
      loot = combat.activities[0]!.objectives[0]!;
    const drop = {
      ...combat.lootDrops![0]!,
      probability: 1,
      minimumQuantity: null,
      maximumQuantity: null,
      quantityDistribution: [
        { quantity: 1, percent: 50 },
        { quantity: 2, percent: 50 },
      ],
    };
    const objective = { ...loot, loot: { ...loot.loot!, quantity: 2 } };
    expect(resolveCombatQuota(objective, { ...combat, lootDrops: [drop] }, 1, "fast").kills).toBe(
      1,
    );
    expect(
      resolveCombatQuota(objective, { ...combat, lootDrops: [drop] }, 1, "expected").kills,
    ).toBe(2);
    expect(resolveCombatQuota(objective, { ...combat, lootDrops: [drop] }, 1, "slow").kills).toBe(
      2,
    );
    expect(
      resolveCombatQuota(
        objective,
        { ...combat, lootDrops: [{ ...drop, probabilityBasis: "sample-ratio" }] },
        1,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("multi-item") });
  });
  it("uses reported one-item acquisition chances without inventing stack or sharing evidence", () => {
    const base = route(true).combat!;
    const loot = base.activities[0]!.objectives[0]!;
    const single = { ...loot, loot: { ...loot.loot!, quantity: 1 } };
    const drop = {
      ...base.lootDrops![0]!,
      probabilityBasis: "reported-override" as const,
      minimumQuantity: null,
      maximumQuantity: null,
    };
    const combat = { ...base, lootDrops: [drop] };
    expect(resolveCombatQuota(single, combat, 1, "expected")).toMatchObject({
      kills: 3,
      lootEstimate: { minimumKills: 1, expectedKills: 2.5 },
    });
    expect(resolveCombatQuota(single, combat, 5, "expected")).toMatchObject({
      kills: null,
      reason: expect.stringContaining("sharing"),
    });
    expect(
      resolveCombatQuota(
        { ...single, loot: { ...single.loot, sharing: "pooled" } },
        combat,
        5,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("Items per") });
    expect(
      resolveCombatQuota(
        single,
        { ...combat, lootDrops: [{ ...drop, probabilityBasis: "sample-ratio" }] },
        1,
        "expected",
      ),
    ).toMatchObject({ kills: null, reason: expect.stringContaining("Sample item counts") });
    expect(
      resolveCombatQuota(
        single,
        {
          ...combat,
          lootDrops: [
            { ...drop, probabilityBasis: "sample-ratio", minimumQuantity: 1, maximumQuantity: 1 },
          ],
        },
        1,
        "expected",
      ).kills,
    ).toBe(3);
  });
  it("carries reported single-success loot scenarios into chronological XP with unknown stacks", () => {
    const raw = route(true);
    const combat = raw.combat!;
    const plan = {
      ...raw,
      combat: {
        ...combat,
        activities: combat.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => ({
            ...objective,
            loot: { ...objective.loot!, quantity: 1 },
          })),
        })),
        lootDrops: [
          {
            ...combat.lootDrops![0]!,
            probabilityBasis: "reported-override" as const,
            minimumQuantity: null,
            maximumQuantity: null,
          },
        ],
      },
    };
    const state = emptyPremadeProgress();
    const before = JSON.stringify({ plan, state });
    const result = forecastCampaignSteps(plan, state, { basis: "route-start" })[0]!;
    expect(result.steps.find((step) => step.phase === "objectives-complete")).toMatchObject({
      combatXp: 165,
      after: { level: 1, currentXp: 165 },
      fastLoot: { level: 1, currentXp: 55 },
      slowLoot: { level: 1, currentXp: 275 },
    });
    expect(JSON.stringify({ plan, state })).toBe(before);
  });
  it("counts objectives before rewards and the same-visit reward before pickup, without invented grind", () => {
    const plan = compileCampaignPickupGates(route());
    expect(plan.actions.some((a) => a.pickupQuestId === 96627)).toBe(false);
    const state = emptyPremadeProgress(),
      before = JSON.stringify(state);
    const projection = forecastCampaignSteps(plan, state, { basis: "route-start" })[0]!;
    const pickup = projection.steps.find((s) => s.questId === 96627)!;
    expect(pickup.before.level).toBeGreaterThanOrEqual(4);
    expect(pickup.shortfallXp).toBe(0);
    expect(
      projection.steps.find((s) => s.phase === "objectives-complete")!.combatXp,
    ).toBeGreaterThan(0);
    expect(projection.steps.find((s) => s.phase === "rewarded")!.questXp).toBe(2680);
    expect(JSON.stringify(state)).toBe(before);
    expect(plan.bookmarkAliases?.["starter-level-4-96627"]).toBe("handoff");
  });
  it("carries reported variable-stack luck through per-step XP without changing actual progress", () => {
    const raw = route(true);
    const plan = {
      ...raw,
      combat: {
        ...raw.combat!,
        lootDrops: [
          {
            ...raw.combat!.lootDrops![0]!,
            probability: 1,
            minimumQuantity: 1,
            maximumQuantity: 2,
            quantityDistribution: [
              { quantity: 1, percent: 50 },
              { quantity: 2, percent: 50 },
            ],
          },
        ],
      },
    };
    const state = emptyPremadeProgress(),
      before = JSON.stringify({ plan, state });
    const projection = forecastCampaignSteps(plan, state, { basis: "route-start" })[0]!;
    expect(projection.steps.find((step) => step.phase === "objectives-complete")).toMatchObject({
      combatXp: 330,
      after: { level: 1, currentXp: 330 },
      fastLoot: { level: 1, currentXp: 275 },
      slowLoot: { level: 1, currentXp: 385 },
    });
    expect(JSON.stringify({ plan, state })).toBe(before);
  });
  it("places a hand-in before a genuine remaining gate rather than adding the hand-in to the gap", () => {
    const raw = route();
    const { combat: _, ...withoutCombat } = raw;
    const plan = compileCampaignPickupGates(withoutCombat);
    const index = plan.actions.findIndex((a) => a.pickupQuestId === 96627);
    expect(plan.actions[index - 1]!.questChanges).toEqual([change(300001, "rewarded")]);
    const state = emptyPremadeProgress();
    state.members = state.members.map((m) => ({
      ...m,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(forecastCampaignXp(plan, state)[0]!.members[0]!.estimatedCombatXp).toBe(20);
    const projected = forecastCampaignSteps(plan, state)[0]!;
    expect(projected.steps.at(-1)).toMatchObject({
      questId: 96627,
      shortfallXp: 20,
      status: "blocked",
    });
    expect(projected.steps.at(-1)!.before).toEqual({ level: 3, currentXp: 1380 });
  });
  it("does not add a previous quest reward or unknown partial kills on top of a saved actual bar", () => {
    const plan = compileCampaignPickupGates(route());
    const state = emptyPremadeProgress();
    state.members[0] = {
      ...state.members[0]!,
      level: 4,
      currentXp: 77,
      xpNeedsUpdate: false,
      questStates: { "300001": "rewarded" },
    };
    const projected = forecastCampaignSteps(plan, state, { fromActionId: "handoff" })[0]!;
    expect(projected.steps).toHaveLength(1);
    expect(projected.steps[0]!.before).toEqual({ level: 4, currentXp: 77 });
    expect(projected.steps[0]!.questXp).toBe(0);
  });
  it("shows distinct loot-luck scenarios and respects the persisted multiplier", () => {
    const plan = compileCampaignPickupGates(route(true));
    const state = emptyPremadeProgress();
    const projection = forecastCampaignSteps(plan, state, { basis: "route-start" })[0]!;
    const row = projection.steps.find((s) => s.phase === "objectives-complete")!;
    expect(row.fastLoot).not.toEqual(row.slowLoot);
    state.combatPlanning = { outdoorXpMultiplier: 0 };
    const zero = forecastCampaignSteps(plan, state, { basis: "route-start" })[0]!;
    expect(zero.steps.find((s) => s.phase === "objectives-complete")!.combatXp).toBe(0);
    expect(zero.steps.at(-1)!.shortfallXp).toBe(20);
  });
  it("shares an overlapping kill batch rather than charging full kills for both loot and kill quests", () => {
    const combat = route(true).combat!;
    const loot = combat.activities[0]!.objectives[0]!;
    const direct = { ...objective, questId: 300002, requiredKills: 5 };
    const activities = [
      combat.activities[0]!,
      {
        id: "direct",
        actionId: "direct",
        environment: "outdoor" as const,
        profile: null,
        objectives: [direct],
      },
    ];
    const both = { ...combat, activities };
    const state = createCampaignCombatState(both, emptyPremadeProgress().members[0]!);
    const first = applyCampaignCombat({
      combat: both,
      activity: activities[0]!,
      state,
      partySize: 1,
      questStates: { "300001": "accepted", "300002": "accepted" },
      position: { level: 1, currentXp: 0 },
    });
    expect(first.rows[0]!.lootEstimate).toMatchObject({ expectedKills: 20 });
    expect(
      applyCampaignCombat({
        combat: both,
        activity: activities[1]!,
        state,
        partySize: 1,
        questStates: { "300001": "objectives-complete", "300002": "accepted" },
        position: { level: 3, currentXp: 0 },
      }).xp,
    ).toBe(0);
    expect(loot.loot?.itemId).toBe(750);
  });
});
