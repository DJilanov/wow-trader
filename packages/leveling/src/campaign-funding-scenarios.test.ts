import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { auditCampaignGuideFunding } from "./campaign-funding-audit.js";
import { campaignFundingScenarioKey } from "./campaign-funding-scenarios.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { guidePartyScenario } from "./campaign-guide-party.js";

const position = { zone: "1429", x: 50, y: 50 };

function work(id: string, legId: string, questId: number): CampaignAction {
  return {
    id,
    legId,
    title: "Complete the patrol",
    instructions: [],
    positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId,
      title: "Patrol",
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
}

function gate(id: string, legId: string, targetLevel: number): CampaignAction {
  return { ...work(id, legId, 300001), kind: "xp-check", questChanges: [], targetLevel };
}

function leg(
  id: string,
  kind: CampaignLeg["kind"],
  from: number,
  to: number,
  actions: readonly CampaignAction[],
  stopId: CampaignLeg["stopId"] = null,
): CampaignLeg {
  return {
    id,
    title: "Elwynn Forest",
    kind,
    from,
    to,
    stopId,
    actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
    questIds: actions
      .filter((action) => action.legId === id)
      .flatMap((action) => action.questChanges.map((change) => change.questId)),
    unresolvedQuestIds: [],
  };
}

function candidate(questId: number, minimumLevel = 1): QuestCatalogEntry {
  const giver = {
    npcId: 234,
    name: "Patrol Captain",
    friendlyToAlliance: true,
    positions: [position],
  };
  return {
    questId,
    title: "Forest patrol",
    minimumLevel,
    questLevel: Math.max(3, minimumLevel),
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [giver],
    ends: [giver],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "shared-kills",
    objectives: [{ index: 1, npcId: 114, count: 5, positions: [position] }],
    unsupportedRequirements: [],
  };
}

function catalog(quests: readonly QuestCatalogEntry[]): QuestCatalog {
  return {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [...quests],
  };
}

function combat(quests: readonly QuestCatalogEntry[], level: number): CombatDataset {
  return {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    provider: {
      repository: "https://example.test/data",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic regression fixture"],
    },
    npcs: [
      {
        id: 114,
        name: "Forest Spider",
        minimumLevel: level,
        maximumLevel: level,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      ...quests.map((quest) => ({
        questId: quest.questId,
        creatureIds: [114],
        itemCreatureIds: [],
        objectiveText: ["Kill 5 Forest Spiders."],
        onlyCreatureObjectives: true,
      })),
      ...[300001, 300004]
        .filter((questId) => !quests.some((quest) => quest.questId === questId))
        .map((questId) => ({
          questId,
          creatureIds: [],
          itemCreatureIds: [],
          objectiveText: ["Speak to the captain."],
          onlyCreatureObjectives: false,
          onlyInteractionObjectives: true,
        })),
    ],
    dungeons: [],
    killXpEvidence: [],
  };
}

function plan(
  actions: readonly CampaignAction[],
  legs: readonly CampaignLeg[],
  rewards: readonly { readonly questId: number; readonly xp: number; readonly minimum?: number }[],
): CampaignPlan {
  return {
    release: "scenario-funding-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs,
    rewardFacts: rewards.map(({ questId, xp, minimum = 1 }) => ({
      questId,
      fullXp: xp,
      questLevel: 60,
      minimumLevel: minimum,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
  };
}

function xpAtLevel(level: number): number {
  let xp = 0;
  for (let at = 1; at < level; at++) xp += FOREVER_XP_CURVE[at]!;
  return xp;
}

function laterFundingFixture(reward = 600): {
  readonly initial: CampaignPlan;
  readonly quests: readonly QuestCatalogEntry[];
  readonly data: CombatDataset;
} {
  const later = work("later-fallback", "prepare", 300002);
  const actions: readonly CampaignAction[] = [
    { ...work("start", "starter", 300001), leaderOnly: true },
    { ...gate("starter-gate", "starter", 3), leaderOnly: true },
    ...later.questChanges.map((change) => ({
      ...later,
      id: `later-fallback-${change.state}`,
      questChanges: [change],
      fundingCheckpointId: "later-gate",
      xpOptional: true,
      xpTargetLevel: 4,
    })),
    gate("later-gate", "prepare", 4),
    { ...gate("entry", "dungeon", 4), kind: "checkpoint" },
  ];
  const quests = [candidate(300001), candidate(300002)];
  const data = combat(quests, 2);
  const initial = plan(
    actions,
    [
      leg("starter", "starter", 1, 3, actions),
      leg("prepare", "preparation", 3, 4, actions),
      leg("dungeon", "dungeon", 4, 4, actions),
    ],
    [
      { questId: 300001, xp: 1100 },
      { questId: 300002, xp: reward },
    ],
  );
  return {
    quests,
    data,
    initial: attachCampaignCombat(
      {
        ...initial,
        questFunding: {
          revision: "explicit-quest-funding-20261101-v22",
          providerRevision: "a".repeat(40),
          addedQuestIds: [300002],
          remaining: [],
          scenarios: [],
        },
      },
      [],
      data,
      "later-funding-fixture",
    ),
  };
}

describe("scenario-aware explicit quest funding", () => {
  it("reuses later generated work for a shared starter while retaining the personal-starter fallback", () => {
    const { initial, quests, data } = laterFundingFixture();
    const funded = fundCampaignQuestGaps(initial, [], data, catalog(quests));
    const early = funded.actions.filter(
      (action) =>
        action.fundingCheckpointId === "starter-gate" &&
        action.questChanges.some((change) => change.questId === 300002),
    );
    expect(early).toHaveLength(3);
    expect(early.every((action) => action.leaderOnly && action.xpTargetLevel === 3)).toBe(true);
    for (const action of initial.actions.filter((entry) => entry.id.startsWith("later-fallback-")))
      expect(funded.actions.find((entry) => entry.id === action.id)).toEqual(action);
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    expect(new Set(funded.actions.map((action) => action.id)).size).toBe(funded.actions.length);
    for (const starterMode of ["separate", "together"] as const) {
      const progress = emptyPremadeProgress();
      const forecast = forecastCampaignGuide(funded, progress, { starterMode });
      const scenario = guidePartyScenario(funded, progress, starterMode);
      expect(
        auditCampaignQuestLog(scenario.plan, scenario.progress, scenario).every(
          (member) => member.withinCapacity,
        ),
      ).toBe(true);
      for (let player = 0; player < 5; player++) {
        const rows = forecast.sections.map((section) => section.forecast.members[player]!);
        const completion = rows
          .flatMap((row) => row.steps)
          .find(
            (step) =>
              step.questId === 300002 && step.phase === "rewarded" && step.status === "projected",
          );
        expect(completion?.actionId).toContain(
          starterMode === "together" ? "quest-funding-starter-gate-" : "later-fallback-",
        );
        expect(
          rows.flatMap((row) => row.rewards).filter((reward) => reward.questId === 300002),
        ).toHaveLength(1);
        expect(
          rows
            .flatMap((row) => row.combatRows)
            .filter(
              (row) =>
                row.activityId.includes("300002") || row.activityId.includes("later-fallback"),
            )
            .reduce((sum, row) => sum + (row.kills ?? 0), 0),
        ).toBe(5);
      }
      expect(
        forecast.sections
          .flatMap((section) => section.forecast.members[0]!.checkpoints)
          .find((checkpoint) => checkpoint.actionId === "starter-gate")?.ready,
      ).toBe(true);
      expect(auditCampaignGuideFunding(funded, progress, forecast).witnessPassed).toBe(true);
    }
  });

  it("does not duplicate the earlier opportunity indefinitely when its reward cannot fund the gate", () => {
    const { initial, quests, data } = laterFundingFixture(1);
    const funded = fundCampaignQuestGaps(initial, [], data, catalog(quests));
    expect(
      funded.actions.filter((action) => action.fundingCheckpointId === "starter-gate"),
    ).toHaveLength(3);
    const forecast = forecastCampaignGuide(funded, emptyPremadeProgress(), {
      starterMode: "together",
    });
    const rows = forecast.sections.map((section) => section.forecast.members[0]!);
    expect(
      rows
        .flatMap((row) => row.checkpoints)
        .find((checkpoint) => checkpoint.actionId === "starter-gate"),
    ).toMatchObject({ ready: false });
    expect(
      rows.flatMap((row) => row.rewards).filter((reward) => reward.questId === 300002),
    ).toHaveLength(1);
  });

  it("does not copy an unallocated source quest into another audience", () => {
    const { initial, quests, data } = laterFundingFixture();
    const source: CampaignPlan = {
      ...initial,
      actions: initial.actions.map((action) => {
        if (!action.id.startsWith("later-fallback-")) return action;
        const { fundingCheckpointId: _checkpoint, ...rest } = action;
        return rest;
      }),
    };
    const funded = fundCampaignQuestGaps(source, [], data, catalog(quests));
    expect(funded.actions.some((action) => action.fundingCheckpointId === "starter-gate")).toBe(
      false,
    );
  });

  it.each([1, 2, null] as const)(
    "does not reuse a later enemy with rank %s as an earlier normal-kill task",
    (rank) => {
      const fixture = laterFundingFixture();
      const data: CombatDataset = {
        ...fixture.data,
        npcs: [
          { ...fixture.data.npcs[0]!, rank },
          { ...fixture.data.npcs[0]!, id: 115, rank: 0 },
        ],
        quests: fixture.data.quests.map((quest) =>
          quest.questId === 300001 ? { ...quest, creatureIds: [115] } : quest,
        ),
      };
      const initial = attachCampaignCombat(fixture.initial, [], data, "later-funding-rank-fixture");
      const funded = fundCampaignQuestGaps(initial, [], data, catalog(fixture.quests));
      expect(funded.actions.some((action) => action.fundingCheckpointId === "starter-gate")).toBe(
        false,
      );
    },
  );

  it("preserves required source work when another starter mode needs it earlier", () => {
    const actions: readonly CampaignAction[] = [
      { ...work("start", "starter", 300001), leaderOnly: true },
      { ...gate("starter-gate", "starter", 3), leaderOnly: true },
      { ...work("source-patrol", "starter", 300003), leaderOnly: true },
      { ...gate("entry", "dungeon", 3), kind: "checkpoint" },
    ];
    const initial = plan(
      actions,
      [leg("starter", "starter", 1, 3, actions), leg("dungeon", "dungeon", 3, 3, actions)],
      [
        { questId: 300001, xp: 1200 },
        { questId: 300002, xp: 0 },
        { questId: 300003, xp: 0 },
      ],
    );
    const quests = [candidate(300002), candidate(300003)];
    const funded = fundCampaignQuestGaps(initial, [], combat(quests, 2), catalog(quests));
    const moved = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 300003),
    );
    expect(moved).toHaveLength(3);
    expect(moved.every((action) => action.libraryBackbone && !action.xpOptional)).toBe(true);
    for (const starterMode of ["separate", "together"] as const) {
      const progress = emptyPremadeProgress();
      const forecast = forecastCampaignGuide(funded, progress, { starterMode });
      const member = forecast.sections[0]!.forecast.members[0]!;
      expect(member.rewards.filter((reward) => reward.questId === 300003)).toHaveLength(1);
      const kills = member.combatRows.filter((row) => row.activityId.includes("-300003-"));
      expect(kills).toHaveLength(1);
      expect(kills[0]?.kills).toBe(5);
      expect(member.endpoint?.level).toBe(3);
      expect(auditCampaignGuideFunding(funded, progress, forecast).witnessPassed).toBe(true);
    }
  });

  it("scores the return to the route rather than selecting a cheap outward detour", () => {
    const actions = [
      work("start", "prepare", 300001),
      {
        ...gate("gate", "prepare", 3),
        positions: [
          {
            sourceLine: 0,
            position: { ...position, x: 55, floor: null, space: "map-percent" as const },
          },
        ],
      },
      { ...gate("entry", "dungeon", 3), kind: "checkpoint" as const },
    ];
    const initial = plan(
      actions,
      [leg("prepare", "preparation", 1, 3, actions), leg("dungeon", "dungeon", 3, 3, actions)],
      [
        { questId: 300001, xp: 400 },
        { questId: 300002, xp: 1000 },
        { questId: 300003, xp: 1000 },
      ],
    );
    const quests = [candidate(300002), candidate(300003)].map((quest, index) => ({
      ...quest,
      objectives: quest.objectives.map((objective) => ({
        ...objective,
        positions: [{ ...position, x: index === 0 ? 49 : 52 }],
      })),
      ends: quest.ends.map((giver) => ({
        ...giver,
        positions: [{ ...position, x: index === 0 ? 48 : 53 }],
      })),
    }));
    const funded = fundCampaignQuestGaps(initial, [], combat(quests, 2), catalog(quests));
    expect(funded.questFunding?.addedQuestIds).toEqual([300003]);
    expect(auditCampaignGuideFunding(funded, emptyPremadeProgress()).witnessPassed).toBe(true);
  });

  it("keeps a party gap unresolved when the departure location is unknown", () => {
    const actions = [
      work("start", "prepare", 300001),
      gate("gate", "prepare", 3),
      { ...gate("entry", "dungeon", 3), kind: "checkpoint" as const },
    ].map((action) => ({ ...action, positions: [] }));
    const initial = plan(
      actions,
      [leg("prepare", "preparation", 1, 3, actions), leg("dungeon", "dungeon", 3, 3, actions)],
      [
        { questId: 300001, xp: 400 },
        { questId: 300002, xp: 1000 },
      ],
    );
    const quests = [candidate(300002)];
    const funded = fundCampaignQuestGaps(initial, [], combat(quests, 2), catalog(quests));
    expect(funded.questFunding?.addedQuestIds).toEqual([]);
    expect(funded.questFunding?.remaining[0]).toMatchObject({
      checkpointId: "gate",
      missingXpByPlayer: [900, 900, 900, 900, 900],
    });
  });

  it("funds a reachable experienced-policy frontier even while the default policy is blocked earlier", () => {
    const actions: readonly CampaignAction[] = [
      work("start", "prepare", 300001),
      { ...gate("first-gate", "prepare", 19), targetStopId: "lordaeron" },
      { ...gate("first-entry", "dungeon", 19), kind: "checkpoint", targetStopId: "lordaeron" },
      work("dungeon-work", "dungeon", 300004),
      {
        ...gate("later-instructions", "later-prepare", 21),
        kind: "instructions",
        targetLevel: null,
      },
      gate("later-gate", "later-prepare", 21),
      { ...gate("later-entry", "later-dungeon", 21), kind: "checkpoint" },
    ];
    const initial = plan(
      actions,
      [
        leg("prepare", "preparation", 1, 18, actions),
        leg("dungeon", "dungeon", 18, 20, actions, "lordaeron"),
        leg("later-prepare", "preparation", 20, 21, actions),
        leg("later-dungeon", "dungeon", 21, 22, actions),
      ],
      [
        { questId: 300001, xp: xpAtLevel(18) },
        { questId: 300004, xp: xpAtLevel(20) - xpAtLevel(18) },
        { questId: 300002, xp: FOREVER_XP_CURVE[20]!, minimum: 20 },
      ],
    );
    const quests = [candidate(300002, 20)];
    const before = JSON.stringify(initial);
    const funded = fundCampaignQuestGaps(initial, [], combat(quests, 20), catalog(quests));
    expect(funded.questFunding?.addedQuestIds).toEqual([300002]);
    expect(
      funded.actions.filter((action) => action.fundingCheckpointId === "later-gate"),
    ).toHaveLength(3);
    const progress = {
      ...emptyPremadeProgress(),
      difficultyPolicy: "experienced-premade" as const,
    };
    const forecast = forecastCampaignGuide(funded, progress);
    expect(forecast.sections.at(-1)?.forecast.members[0]?.blockedReason).toBeNull();
    expect(forecast.sections.at(-1)?.forecast.members[0]?.endpoint?.level).toBe(21);
    expect(auditCampaignGuideFunding(funded, progress, forecast).witnessPassed).toBe(true);
    expect(funded.questFunding?.scenarios).toHaveLength(16);
    expect(new Set(funded.questFunding?.scenarios.map(campaignFundingScenarioKey)).size).toBe(16);
    expect(
      funded.questFunding?.scenarios.find((scenario) => scenario.difficultyPolicy === "at-level")
        ?.remaining[0]?.checkpointId,
    ).toBe("first-gate");
    expect(JSON.stringify(initial)).toBe(before);
  });

  it.each(["checkpoint", "pickup"] as const)(
    "funds a shared starter at its %s gate without paying the extra patrol on separate starters",
    (gateKind) => {
      const fundingActionId = gateKind === "checkpoint" ? "starter-gate" : "locked-pickup";
      const actions: readonly CampaignAction[] = [
        { ...work("start", "starter", 300001), leaderOnly: true },
        gateKind === "checkpoint"
          ? { ...gate(fundingActionId, "starter", 3), leaderOnly: true }
          : { ...work(fundingActionId, "starter", 300004), leaderOnly: true },
        { ...gate("entry", "dungeon", 3), kind: "checkpoint" },
      ];
      const initial = plan(
        actions,
        [leg("starter", "starter", 1, 3, actions), leg("dungeon", "dungeon", 3, 3, actions)],
        [
          { questId: 300001, xp: 1200 },
          { questId: 300002, xp: 0 },
          { questId: 300003, xp: 0 },
          { questId: 300004, xp: 0, minimum: 3 },
        ],
      );
      const quests = [candidate(300002), candidate(300003)];
      const held = fundCampaignQuestGaps(initial, [], combat([], 2), catalog([]));
      const sharedHeld = held.questFunding?.scenarios.find(
        (scenario) => scenario.starterMode === "together",
      );
      expect(sharedHeld?.remaining[0]).toMatchObject({
        checkpointId: fundingActionId,
        missingXpByPlayer: [100, 100, 100, 100, 100],
      });
      expect(sharedHeld?.blockedReasonsByPlayer.every((reason) => reason !== null)).toBe(true);
      const funded = fundCampaignQuestGaps(initial, [], combat(quests, 2), catalog(quests));
      expect(funded.questFunding?.addedQuestIds).toEqual([300002, 300003]);
      for (const starterMode of ["separate", "together"] as const) {
        const progress = emptyPremadeProgress();
        const forecast = forecastCampaignGuide(funded, progress, { starterMode });
        const starter = forecast.sections[0]!.forecast;
        expect(starter.members[0]?.endpoint?.level).toBe(3);
        expect(starter.members[0]?.blockedReason).toBeNull();
        expect(auditCampaignGuideFunding(funded, progress, forecast).witnessPassed).toBe(true);
        const second = starter.members[0]!.rewards.filter((reward) => reward.questId === 300003);
        expect(second).toHaveLength(starterMode === "together" ? 1 : 0);
      }
      expect(
        funded.actions
          .filter((action) => action.fundingCheckpointId === fundingActionId)
          .every((action) => action.leaderOnly),
      ).toBe(true);
    },
  );
});
