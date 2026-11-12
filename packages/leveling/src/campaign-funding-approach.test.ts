import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import type { CombatDataset } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { existingFundingPrerequisite } from "./campaign-funding-prerequisites.js";
import { capturedFundingObjectiveLocations } from "./campaign-funding-approach.js";

interface Fixture {
  readonly plan: CampaignPlan;
  readonly catalog: QuestCatalog;
  readonly combat: CombatDataset;
  readonly sources: readonly CampaignSource[];
}

function fixture(): Fixture {
  const point = { zone: "1429", x: 50, y: 50 };
  const giver = {
    npcId: 234,
    name: "Patrol Captain",
    friendlyToAlliance: true,
    positions: [point],
  };
  const quest: QuestCatalogEntry = {
    questId: 300002,
    title: "Forest patrol",
    minimumLevel: 1,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [giver],
    ends: [giver],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "shared-kills",
    objectives: [{ index: 1, npcId: 114, count: 10, positions: [point] }],
    unsupportedRequirements: [],
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic promotion fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [quest],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic promotion fixture",
    provider: {
      repository: "https://example.test",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      npcSha256: catalog.npcSha256,
      questSha256: catalog.questSha256,
      itemSha256: "f".repeat(64),
      limitations: ["Synthetic test data"],
    },
    npcs: [
      {
        id: 114,
        name: "Forest Spider",
        minimumLevel: 2,
        maximumLevel: 2,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 300001,
        requiredClasses: 0,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: ["Speak to the captain."],
        onlyCreatureObjectives: false,
        onlyInteractionObjectives: true,
      },
      {
        questId: 300002,
        requiredClasses: 0,
        creatureIds: [114],
        itemCreatureIds: [],
        objectiveText: ["Kill 10 Forest Spiders."],
        onlyCreatureObjectives: true,
        killQuotas: [
          { objectiveIndex: 1, npcId: 114, kills: 10, source: "Synthetic captured quota" },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(
    [
      "step\n.goto 1429,50,50\n.accept 300002 >> Accept Forest patrol\n.target Patrol Captain",
      "step\n.isOnQuest 300002\n.goto 1429,51,50\n.complete 300002,1 >> Forest Spider slain (10)\n.mob Forest Spider",
      "step\n.goto 1429,50,50\n.turnin 300002 >> Turn in Forest patrol\n.target Patrol Captain",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    70205,
  );
  const base: CampaignAction = {
    id: "base",
    legId: "prepare",
    title: "First task",
    instructions: [],
    positions: [{ sourceLine: 0, position: { ...point, floor: null, space: "map-percent" } }],
    source: null,
    kind: "quests",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      questId: 300001,
      title: "First task",
      state,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
  };
  const gate: CampaignAction = {
    ...base,
    id: "gate",
    kind: "xp-check",
    targetLevel: 3,
    questChanges: [],
  };
  const entry: CampaignAction = { ...gate, id: "entry", legId: "dungeon", kind: "checkpoint" };
  const later = guide.steps.map((step, index): CampaignAction => ({
    ...base,
    id: `later-${index}`,
    legId: "later",
    title: "Forest patrol",
    source: campaignActionSource(guide, step, step.directives),
    positions: step.directives.flatMap((row) =>
      row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
    ),
    questChanges: [
      {
        questId: 300002,
        title: "Forest patrol",
        state: (["accepted", "objectives-complete", "rewarded"] as const)[index]!,
        objectiveIndex: index === 1 ? 1 : null,
      },
    ],
  }));
  const actions = [base, gate, entry, ...later];
  const plan: CampaignPlan = {
    release: "selected-funding-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedSourceQuestIds: [300001, 300002],
    actions,
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      unresolvedPrerequisiteIds: [],
      decisions: [
        {
          questId: 300002,
          objective: "shared-kills",
          included: true,
          requiredFor: [],
          lootCost: null,
          reason: "Synthetic selected program",
        },
      ],
    },
    legs: ["prepare", "dungeon", "later"].map((id) => ({
      id,
      title: id,
      from: id === "later" ? 3 : 1,
      to: 4,
      kind: id === "dungeon" ? "dungeon" : "preparation",
      stopId: null,
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: id === "later" ? [300002] : [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [400, 1000].map((fullXp, index) => ({
      questId: 300001 + index,
      fullXp,
      minimumLevel: 1,
      questLevel: 3,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-02T00:00:00Z",
    })),
  };
  return { plan, sources: [{ reference, guide }], catalog, combat };
}

describe("selected ordinary quest funding", () => {
  it("does not insert unrelated quest work inside an optional dungeon trip", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      legs: input.plan.legs.map((leg) =>
        leg.id === "prepare"
          ? { ...leg, optionalQuestId: 959, dungeonVisitId: "wailing-caverns" }
          : leg,
      ),
    };
    const funded = fundCampaignQuestGaps(plan, input.sources, input.combat, input.catalog);
    expect(funded.actions.filter((action) => action.id.startsWith("later-"))).toHaveLength(3);
    expect(
      funded.actions.filter((action) => action.legId === "prepare").map((action) => action.id),
    ).toEqual(["base", "gate"]);
  });

  it("gives a map-less captured kill counter a separate catalog approach without rewriting its source", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.id === "later-1" ? { ...action, positions: [] } : action,
      ),
    };
    const sources = input.sources.map((source) => ({
      ...source,
      guide: {
        ...source.guide,
        steps: source.guide.steps.map((step, index) =>
          index === 1
            ? { ...step, directives: step.directives.filter((row) => row.tag !== ".goto") }
            : step,
        ),
      },
    }));
    const legacy = fundCampaignQuestGaps(plan, sources, input.combat, input.catalog);
    expect(legacy.actions.some((action) => action.id === "later-1")).toBe(true);
    const funded = fundCampaignQuestGaps(plan, sources, input.combat, input.catalog, {
      includeCatalogApproaches: true,
    });
    const approach = funded.actions.find((action) => action.id.includes("300002-approach-"))!;
    expect(approach).toBeDefined();
    expect(approach.source).toBeNull();
    expect(approach.questChanges).toEqual([]);
    expect(approach.positions).toEqual([
      {
        sourceLine: 0,
        position: {
          ...input.catalog.quests[0]!.objectives[0]!.positions[0]!,
          floor: null,
          space: "map-percent",
        },
      },
    ]);
    const counter = funded.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 300002 && change.state === "objectives-complete",
      ),
    )!;
    expect(counter.positions).toEqual([]);
    expect(counter.source).toEqual(plan.actions.find((action) => action.id === "later-1")!.source);
    expect(funded.actions.indexOf(approach)).toBe(funded.actions.indexOf(counter) - 1);
    expect(
      campaignNativeInstructions(
        funded,
        sources,
      )(counter)!.directives.some((row) => row.tag === ".complete" && row.arguments === "300002,1"),
    ).toBe(true);
  });

  it("does not replace an existing unmatched position with guessed source coordinates", () => {
    const input = fixture(),
      counter = input.plan.actions.find((action) => action.id === "later-1")!;
    expect(
      capturedFundingObjectiveLocations(counter, input.catalog.quests[0]!, input.combat),
    ).toBeNull();
    expect(
      capturedFundingObjectiveLocations(
        {
          ...counter,
          positions: [],
          questChanges: [{ ...counter.questChanges[0]!, objectiveIndex: 99 }],
        },
        input.catalog.quests[0]!,
        input.combat,
      ),
    ).toBeNull();
  });

  it("splits same-title follow-up instructions by phase and retains waiting without optional grinding", () => {
    const input = fixture(),
      quest = input.catalog.quests[0]!;
    const later = input.plan.actions
      .filter((action) => action.id.startsWith("later-"))
      .map((action) =>
        action.id !== "later-2"
          ? action
          : {
              ...action,
              questChanges: [
                ...action.questChanges,
                { ...action.questChanges[0]!, questId: 300003, state: "accepted" as const },
              ],
              instructions: [
                "Turn in Forest patrol",
                "Accept Forest patrol",
                "She may be dead or busy fighting Stitches if he attacks Darkshire. If that happens consider grinding mobs near the town until she respawns or changing your layer (if possible)",
              ],
            },
      );
    const selected = existingFundingPrerequisite(
      quest,
      new Map([
        [300002, quest],
        [300003, { ...quest, questId: 300003 }],
      ]),
      later,
    )!;
    expect(selected[2]!.instructions).toEqual([
      "Turn in Forest patrol",
      "If Stitches has killed the quest giver, wait for them to respawn before continuing.",
    ]);
  });

  it("moves a complete selected source program once, preserving its native guards and bookmarks", () => {
    const input = fixture(),
      original = structuredClone(input);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    const own = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 300002),
    );
    expect(own).toHaveLength(3);
    const gateAt = funded.actions.findIndex((action) => action.id === "gate");
    expect(
      own.every(
        (action) =>
          funded.actions.indexOf(action) < gateAt &&
          action.libraryBackbone &&
          action.xpOptional === false,
      ),
    ).toBe(true);
    for (const [index, action] of own.entries()) {
      const prior = input.plan.actions.find((entry) => entry.id === `later-${index}`)!;
      expect(action.source).toEqual(prior.source);
      expect(action.positions).toEqual(prior.positions);
      expect(action.questChanges).toEqual(prior.questChanges);
      expect(funded.bookmarkAliases?.[prior.id]).toBe(action.id);
    }
    const native = campaignNativeInstructions(funded, input.sources);
    expect(
      native(own[1]!)!.directives.some(
        (row) => row.tag === ".isOnQuest" && row.arguments === "300002",
      ),
    ).toBe(true);
    const states = campaignFundingStates(funded);
    expect(states).toHaveLength(24);
    for (const state of states)
      for (const member of state.forecast.flatMap((section) => section.members)) {
        expect(member.blockedAtActionId).toBeNull();
        if (member.rewards.length)
          expect(member.rewards.filter((row) => row.questId === 300002)).toHaveLength(1);
      }
    expect(input).toEqual(original);
  });

  it.each([
    "missing-source",
    "missing-counter",
    "wrong-phase",
    "class",
    "unknown-level",
    "unknown-eligibility",
    "elite",
    "dungeon",
    "bundle",
  ])("does not invent an approach for %s evidence", (kind) => {
    const input = fixture(),
      original = input.plan.actions.find((action) => action.id === "later-1")!;
    const action: CampaignAction = {
      ...original,
      positions: [],
      ...(kind === "missing-source" ? { source: null } : {}),
      ...(kind === "missing-counter" ? { questChanges: [] } : {}),
      ...(kind === "wrong-phase"
        ? { questChanges: [{ ...original.questChanges[0]!, state: "rewarded" as const }] }
        : {}),
      ...(kind === "dungeon" ? { location: { zone: "1429", insideDungeon: "test" } } : {}),
      ...(kind === "bundle" ? { bundleId: "alcaz" } : {}),
    };
    const quest: QuestCatalogEntry = {
      ...input.catalog.quests[0]!,
      ...(kind === "class" ? { requiredClasses: 16 } : {}),
    };
    const combat: CombatDataset = {
      ...input.combat,
      npcs: input.combat.npcs.map((npc) => ({
        ...npc,
        ...(kind === "unknown-level" ? { maximumLevel: null } : {}),
        ...(kind === "unknown-eligibility" ? { xpEligibility: "unknown" as const } : {}),
        ...(kind === "elite" ? { rank: 1 } : {}),
      })),
    };
    expect(capturedFundingObjectiveLocations(action, quest, combat)).toBeNull();
  });

  it("keeps actual pickup and enemy-level limits during source-program funding", () => {
    const input = fixture();
    const combat: CombatDataset = {
      ...input.combat,
      npcs: input.combat.npcs.map((npc) => ({ ...npc, minimumLevel: 10, maximumLevel: 10 })),
    };
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.id === "later-1" ? { ...action, positions: [] } : action,
      ),
    };
    const sources = input.sources.map((source) => ({
      ...source,
      guide: {
        ...source.guide,
        steps: source.guide.steps.map((step, index) =>
          index === 1
            ? { ...step, directives: step.directives.filter((row) => row.tag !== ".goto") }
            : step,
        ),
      },
    }));
    const funded = fundCampaignQuestGaps(plan, sources, combat, input.catalog, {
      includeCatalogApproaches: true,
    });
    expect(funded.actions.filter((action) => action.id.startsWith("later-"))).toHaveLength(3);
    expect(funded.bookmarkAliases?.["later-0"]).toBeUndefined();
  });
});
