import { describe, expect, it } from "vitest";
import type {
  CampaignAction,
  CampaignPlan,
  CampaignQuestChange,
  CampaignSource,
} from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { batchFundedCampaignVisits } from "./campaign-funded-visits.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { unsafePartyFundingScenarios } from "./campaign-funding-quality.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { batchCampaignVisitWindows } from "./campaign-visit-windows.js";

const seedId = 420001,
  farId = 420002,
  nearId = 420003,
  finalId = 420004;

function change(questId: number, state: CampaignQuestChange["state"]): CampaignQuestChange {
  return {
    questId,
    title: `Quest ${questId}`,
    state,
    objectiveIndex: state === "objectives-complete" ? 1 : null,
  };
}
function action(id: string, zone: string, questId: number, funded = true): CampaignAction {
  return {
    id,
    legId: "prepare",
    kind: "quests",
    title: id,
    instructions: [],
    source: null,
    positions: [
      { sourceLine: 0, position: { zone, x: 50, y: 50, floor: null, space: "map-percent" } },
    ],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    ...(funded ? { fundingCheckpointId: "departure" } : {}),
    questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) =>
      change(questId, state),
    ),
  };
}
function fixture(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: QuestCatalog;
  combat: CombatDataset;
} {
  const locations = new Map([
    [seedId, "1453"],
    [farId, "1436"],
    [nearId, "1429"],
    [finalId, "1436"],
  ]);
  const quests: QuestCatalogEntry[] = [...locations].map(([questId, zone]) => {
    const giver = {
      npcId: 234,
      name: "Patrol Captain",
      friendlyToAlliance: true,
      positions: [{ zone, x: 50, y: 50 }],
    };
    return {
      questId,
      title: `Quest ${questId}`,
      minimumLevel: 1,
      questLevel: 3,
      requiredRaces: 4294967373,
      requiredClasses: 0,
      starts: [giver],
      ends: [giver],
      prerequisites: { allOf: [], anyOf: [] },
      exclusiveWith: [],
      category: questId === seedId ? "delivery" : "shared-kills",
      objectives:
        questId === seedId
          ? []
          : [{ index: 1, npcId: 114, count: 1, positions: [{ zone, x: 50, y: 50 }] }],
      unsupportedRequirements: [],
    };
  });
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic scheduling fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests,
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic scheduling fixture",
    provider: {
      repository: "https://example.test/data",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256!,
      limitations: ["Synthetic scheduling fixture"],
    },
    npcs: [
      {
        id: 114,
        name: "Patrol Gnoll",
        minimumLevel: 2,
        maximumLevel: 2,
        rank: 0,
        zoneIds: [40, 12],
        xpEligibility: "assumed",
      },
    ],
    quests: [farId, nearId, finalId].map((questId) => ({
      questId,
      creatureIds: [114],
      itemCreatureIds: [],
      objectiveText: ["Slay 1 Patrol Gnoll."],
      onlyCreatureObjectives: true,
      killQuotas: [{ objectiveIndex: 1, npcId: 114, kills: 1, source: "Synthetic death counter" }],
    })),
    dungeons: [],
    killXpEvidence: [],
  };
  const seed = {
    ...action("seed", "1453", seedId, false),
    legId: "start",
    questChanges: [change(seedId, "accepted"), change(seedId, "rewarded")],
  };
  const departure: CampaignAction = {
    ...action("departure", "1436", farId, false),
    kind: "checkpoint",
    targetLevel: 3,
    questChanges: [],
  };
  const exit: CampaignAction = {
    ...action("exit", "1453", seedId, false),
    legId: "finish",
    kind: "instructions",
    questChanges: [],
  };
  const actions = [
    seed,
    action("far-first", "1436", farId),
    action("near", "1429", nearId),
    action("far-second", "1436", finalId),
    departure,
    exit,
  ];
  const plan: CampaignPlan = {
    release: "funded-visits-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    actions,
    legs: ["start", "prepare", "finish"].map((id) => ({
      id,
      title: id,
      kind: id === "start" ? "starter" : id === "finish" ? "finish" : "preparation",
      from: 1,
      to: 3,
      stopId: null,
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [seedId, farId, nearId, finalId].map((questId) => ({
      questId,
      fullXp: questId === seedId ? 400 : 40,
      questLevel: 3,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
  };
  return {
    plan: attachCampaignCombat(plan, [], combat, "test-revision"),
    sources: [],
    catalog,
    combat,
  };
}
function batch(input: ReturnType<typeof fixture>): CampaignPlan {
  return batchFundedCampaignVisits(input.plan, input.sources, input.combat, input.catalog);
}
function replace(
  input: ReturnType<typeof fixture>,
  id: string,
  replacement: (action: CampaignAction) => CampaignAction,
): void {
  input.plan = {
    ...input.plan,
    actions: input.plan.actions.map((entry) => (entry.id === id ? replacement(entry) : entry)),
  };
}
function sourceStep(input: ReturnType<typeof fixture>, body: string): CampaignAction["source"] {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(body, reference.id, "f".repeat(64), 70205);
  input.sources = [{ reference, guide }];
  return { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id };
}

describe("funded visits preserve reached levels and source work", () => {
  it("batches generated tasks without relying on pre-attached locations or changing rewards and action identities", () => {
    const input = fixture(),
      frozen = JSON.stringify(input);
    expect(input.plan.actions.every((entry) => !entry.location)).toBe(true);
    const next = batch(input);
    expect(next.actions.map((entry) => entry.id)).toEqual([
      "seed",
      "near",
      "far-first",
      "far-second",
      "departure",
      "exit",
    ]);
    for (const entry of next.actions)
      expect(entry).toBe(input.plan.actions.find((original) => original.id === entry.id));
    expect(next.rewardFacts).toBe(input.plan.rewardFacts);
    expect(next.legs[1]!.actionIds).toEqual(["near", "far-first", "far-second", "departure"]);
    const before = campaignFundingStates(input.plan),
      after = campaignFundingStates(next);
    expect(after).toHaveLength(16);
    expect(
      after.map((state) => state.forecast.at(-1)!.members.map((member) => member.knownEndpoint)),
    ).toEqual(
      before.map((state) => state.forecast.at(-1)!.members.map((member) => member.knownEndpoint)),
    );
    expect(batchFundedCampaignVisits(next, input.sources, input.combat, input.catalog)).toBe(next);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it("keeps a reward that crosses a level fixed", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === nearId ? { ...fact, fullXp: 850 } : fact,
      ),
    };
    expect(batch(input)).toBe(input.plan);
  });

  it("keeps a level crossing fixed even when only the omitted-raid-goals configurations reach it", () => {
    const input = fixture();
    replace(input, "seed", (entry) => ({ ...entry, raidOnly: true }));
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === nearId ? { ...fact, fullXp: 350 } : fact,
      ),
    };
    expect(batch(input)).toBe(input.plan);
  });

  it("preserves class training as a barrier", () => {
    const input = fixture();
    const source = sourceStep(input, "step\n.goto Stormwind City,50,50\n.train 116");
    const utility: CampaignAction = {
      ...input.plan.actions[1]!,
      id: "train",
      kind: "instructions",
      source,
      questChanges: [],
      positions: input.plan.actions[0]!.positions,
    };
    input.plan = {
      ...input.plan,
      actions: [...input.plan.actions.slice(0, 2), utility, ...input.plan.actions.slice(2)],
    };
    expect(batch(input)).toBe(input.plan);
  });

  it.each([".use 123", ".timer 5", ".isOnQuest 400099", ".complete 420003,1 << UnknownPredicate"])(
    "holds unsupported source context: %s",
    (directive) => {
      const input = fixture();
      const source = sourceStep(
        input,
        `step\n.goto Elwynn Forest,50,50\n.accept 420003\n${directive}\n.complete 420003,1\n.turnin 420003`,
      );
      replace(input, "near", (entry) => ({ ...entry, source }));
      expect(batch(input)).toBe(input.plan);
    },
  );

  it("retains actual prerequisite order while consolidating nearby work", () => {
    const input = fixture();
    input.catalog.quests.find((quest) => quest.questId === nearId)!.prerequisites.allOf = [farId];
    replace(input, "near", (entry) => ({ ...entry, requiredQuestIds: [farId] }));
    const next = batch(input);
    expect(next.actions.map((entry) => entry.id)).toEqual([
      "seed",
      "far-first",
      "far-second",
      "near",
      "departure",
      "exit",
    ]);
  });

  it("does not let an unrelated uncalibrated transport disable a verified local journey", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: [
        ...input.plan.actions,
        {
          ...input.plan.actions.at(-1)!,
          id: "later-moonglade",
          positions: [
            {
              sourceLine: 0,
              position: { zone: "1450", x: 50, y: 50, floor: null, space: "map-percent" },
            },
          ],
        },
      ],
    };
    expect(
      batch(input)
        .actions.slice(0, 4)
        .map((entry) => entry.id),
    ).toEqual(["seed", "near", "far-first", "far-second"]);
  });

  it.each([null, 3, 4])(
    "does not move unqualified creature rank %s into an earlier encounter",
    (rank) => {
      const input = fixture();
      input.combat.npcs[0]!.rank = rank;
      input.plan = attachCampaignCombat(input.plan, input.sources, input.combat, "test-revision");
      expect(batch(input)).toBe(input.plan);
    },
  );

  it("rechecks existing action IDs when a combat action is rescheduled", () => {
    const input = fixture();
    input.combat.npcs[0]!.maximumLevel = 6;
    const states = campaignFundingStates(input.plan);
    expect(unsafePartyFundingScenarios(input.plan, states, input.catalog, input.combat)).toEqual(
      [],
    );
    expect(
      unsafePartyFundingScenarios(
        input.plan,
        states,
        input.catalog,
        input.combat,
        undefined,
        new Set(["near"]),
      ),
    ).toHaveLength(16);
  });

  it("rejects a pickup that would become the forty-first active quest", () => {
    const input = fixture();
    const held = Array.from({ length: 39 }, (_, index) => 600000 + index);
    replace(input, "seed", (entry) => ({
      ...entry,
      questChanges: [
        ...entry.questChanges,
        ...held.map((id) => change(id, "accepted")),
        change(farId, "accepted"),
      ],
    }));
    input.plan = {
      ...input.plan,
      rewardFacts: [
        ...input.plan.rewardFacts!,
        ...held.map((questId) => ({ ...input.plan.rewardFacts![0]!, questId, fullXp: 0 })),
      ],
    };
    const state = campaignFundingStates(input.plan)[0]!,
      party = guidePartyScenario(input.plan, state.progress, state.starterMode);
    expect(
      auditCampaignQuestLog(party.plan, party.progress, party).every(
        (member) => member.peakUpperBound === 40,
      ),
    ).toBe(true);
    expect(batch(input)).toBe(input.plan);
  });

  it("leaves interleaved leg entries intact", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: [
        ...input.plan.actions.slice(0, 2),
        input.plan.actions.at(-1)!,
        ...input.plan.actions.slice(2, -1),
      ],
    };
    expect(batch(input)).toBe(input.plan);
  });

  it("keeps the sorter origin out of real legs with similar names", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((entry) =>
        entry.legId === "prepare" ? { ...entry, legId: "visit-window-origin" } : entry,
      ),
      legs: input.plan.legs.map((leg) =>
        leg.id === "prepare" ? { ...leg, id: "visit-window-origin" } : leg,
      ),
    };
    const next = batch(input);
    expect(next.actions.map((entry) => entry.id)).toEqual([
      "seed",
      "near",
      "far-first",
      "far-second",
      "departure",
      "exit",
    ]);
  });

  it("rejects an XP gap caused by combining compatible kills after a reordered pickup", () => {
    const input = fixture();
    replace(input, "near", (entry) => ({
      ...entry,
      questChanges: [change(nearId, "accepted"), change(nearId, "rewarded")],
    }));
    input.combat.quests = input.combat.quests
      .filter((quest) => quest.questId !== nearId)
      .map((quest) => ({
        ...quest,
        objectiveText: ["Slay 10 Patrol Gnolls."],
        killQuotas: quest.killQuotas!.map((quota) => ({ ...quota, kills: 10 })),
      }));
    input.catalog.quests = input.catalog.quests.map((quest) =>
      quest.questId === farId || quest.questId === finalId
        ? {
            ...quest,
            objectives: quest.objectives.map((objective) => ({ ...objective, count: 10 })),
          }
        : quest,
    );
    const last = input.plan.actions.find((entry) => entry.id === "far-second")!;
    const pickup: CampaignAction = {
      ...last,
      id: "city-pickup",
      positions: input.plan.actions[0]!.positions,
      questChanges: [change(finalId, "accepted")],
    };
    const work: CampaignAction = {
      ...last,
      id: "last-kills",
      questChanges: [change(finalId, "objectives-complete")],
    };
    const handIn: CampaignAction = {
      ...last,
      id: "last-handin",
      questChanges: [change(finalId, "rewarded")],
    };
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.flatMap((entry) =>
        entry.id === last.id ? [pickup, work, handIn] : [entry],
      ),
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === seedId ? fact : { ...fact, fullXp: fact.questId === finalId ? 680 : 0 },
      ),
    };
    input.plan = attachCampaignCombat(input.plan, input.sources, input.combat, "test-revision");
    const baseline = campaignFundingStates(input.plan);
    expect(baseline[0]!.forecast[1]!.members[0]!.knownEndpoint).toEqual({ level: 3, currentXp: 0 });
    const located = attachCampaignLocations(input.plan, input.sources);
    const unguarded = {
      ...located,
      actions: batchCampaignVisitWindows(
        located,
        input.sources,
        "prepare",
        new Set(["last-handin", "departure"]),
      ),
    };
    expect(campaignFundingStates(unguarded)[0]!.forecast[1]!.members[0]!.knownEndpoint).toEqual({
      level: 2,
      currentXp: 790,
    });
    expect(
      baseline.every((state) =>
        state.forecast[1]!.members.every((member) => member.endpoint?.level === 3),
      ),
    ).toBe(true);
    expect(batch(input)).toBe(input.plan);
  });

  it.each([
    "build",
    "archive",
    "provider",
    "quests",
    "npcs",
    "items",
    "combat",
    "attached-build",
    "attached-provider",
  ] as const)("retains the input when %s provenance does not match", (field) => {
    const input = fixture();
    if (field === "build") input.catalog.targetBuild++;
    if (field === "archive") input.catalog.sourceArchiveSha256 = "0".repeat(64);
    if (field === "provider") input.catalog.providerRevision = "0".repeat(40);
    if (field === "quests") input.catalog.questSha256 = "0".repeat(64);
    if (field === "npcs") input.catalog.npcSha256 = "0".repeat(64);
    if (field === "items") input.catalog.itemSha256 = "0".repeat(64);
    if (field === "attached-build")
      input.plan = { ...input.plan, combat: { ...input.plan.combat!, targetBuild: 70450 } };
    if (field === "attached-provider")
      input.plan = {
        ...input.plan,
        combat: { ...input.plan.combat!, sourceRevision: "0".repeat(40) },
      };
    if (field === "combat") {
      const { combat: priorCombat, ...withoutCombat } = input.plan;
      expect(priorCombat).toBeDefined();
      input.plan = withoutCombat;
    }
    expect(batch(input)).toBe(input.plan);
  });
});
