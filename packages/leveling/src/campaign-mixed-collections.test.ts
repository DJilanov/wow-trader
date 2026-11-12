import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import type { CampaignFundingState } from "./campaign-funding-scenarios.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { capturedFundingObjectiveLocations } from "./campaign-funding-approach.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { unsafePartyFundingScenarios } from "./campaign-funding-quality.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const point = { zone: "1437", x: 15, y: 40 };
const sourceBody = [
  "step",
  ".goto Wetlands,10,50",
  ".accept 279",
  ".target Karl Boran",
  "step",
  "#sticky",
  "#label Gobbler",
  "#completewith Murlocs",
  ".goto Wetlands,14,42",
  ">>Kill Gobbler. Loot him for his Head",
  ".complete 279,2",
  ".unitscan Gobbler",
  "step",
  "#label Murlocs",
  ".goto Wetlands,18,40",
  ">>Kill Bluegill Murlocs",
  ".complete 279,1",
  ".mob Bluegill Murloc",
  "step",
  ".goto Wetlands,10,50",
  ".turnin 279",
  ".target Karl Boran",
].join("\n");

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
  sources: CampaignSource[];
}

function fixture(body = sourceBody): Fixture {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 23)!;
  const guide = parseGuideChapter(body, reference.id, "f".repeat(64), 70205);
  const giver = { npcId: 1242, name: "Karl Boran", friendlyToAlliance: true, positions: [point] };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic complete mixed-method fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests: [
      {
        questId: 279,
        title: "Claws from the Deep",
        minimumLevel: 20,
        questLevel: 22,
        requiredClasses: 0,
        requiredRaces: 4294967373,
        starts: [giver],
        ends: [giver],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "unsupported",
        objectives: [{ index: 1, npcId: 1024, count: 12, positions: [point] }],
        unsupportedRequirements: [],
      },
    ],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic mixed-method fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256!,
      limitations: ["Synthetic fixture"],
    },
    npcs: [
      {
        id: 1024,
        name: "Bluegill Murloc",
        minimumLevel: 20,
        maximumLevel: 21,
        rank: 0,
        zoneIds: [11],
        xpEligibility: "assumed",
      },
      {
        id: 1259,
        name: "Gobbler",
        minimumLevel: 22,
        maximumLevel: 22,
        rank: 0,
        zoneIds: [11],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 279,
        creatureIds: [1024],
        itemCreatureIds: [1259],
        requiredClasses: 0,
        objectiveText: ["Kill 12 Bluegill Murlocs.", "Slay Gobbler and take his head."],
        onlyCreatureObjectives: false,
        killQuotas: [
          { objectiveIndex: 1, npcId: 1024, kills: 12, source: "Synthetic captured counter" },
        ],
        itemObjectives: [
          {
            objectiveIndex: 2,
            itemId: 3618,
            itemName: "Gobbler's Head",
            quantity: 1,
            npcIds: [1259],
            sharing: "pooled",
          },
        ],
      },
    ],
    lootDrops: [
      {
        itemId: 3618,
        npcId: 1259,
        probability: 0.8,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/head",
        sourceSha256: "0".repeat(64),
        capturedAt: "2026-11-03T00:00:00.000Z",
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "0".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: "0".repeat(64),
          sourceBuild: 5875,
          referencedAt: "2026-11-03T00:00:00.000Z",
          itemId: 3618,
          npcId: 1259,
          lootEntry: 1259,
          probability: 1,
          questOnly: true,
          rateMultiplier: 1,
        },
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  const plan: CampaignPlan = {
    release: "mixed-method-fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [279],
    actions: [],
    legs: [],
    rewardFacts: [
      {
        questId: 279,
        fullXp: 1000,
        questLevel: 22,
        minimumLevel: 20,
        xpByLevel: [],
        status: "available",
        evidenceKind: "historical-reference",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-03T00:00:00.000Z",
      },
    ],
  };
  return { plan, catalog, combat, sources: [{ reference, guide }] };
}

function qualify(input: Fixture): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(input.plan, input.sources, input.combat, input.catalog);
}

function progress(level = 20): ReturnType<typeof emptyPremadeProgress> {
  const base = emptyPremadeProgress();
  return {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      raceId: "human",
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

function batch(input: Fixture, state = progress()): ReturnType<typeof campaignFundingBatch> {
  return campaignFundingBatch(input.catalog.quests[0]!, input.catalog, input.combat, state, {
    legId: "prepare",
    checkpointId: "departure",
    targetLevel: 25,
    previous: point,
    resumePosition: point,
    forbiddenQuestIds: new Set(),
    maximumQuestLevel: 99,
    leaderOnly: false,
    sourceCollections: qualify(input),
  });
}

function component(input: Fixture): CampaignPlan {
  const collection = qualify(input).get(279);
  if (!collection) throw new Error("Missing qualified synthetic mixed method");
  const actions = collection.actions.map((action) => ({ ...action, legId: "prepare" }));
  return attachCampaignCombat(
    {
      ...input.plan,
      actions,
      legs: [
        {
          id: "prepare",
          title: "Mixed method",
          kind: "preparation",
          from: 20,
          to: 25,
          stopId: null,
          questIds: [279],
          unresolvedQuestIds: [],
          actionIds: actions.map((a) => a.id),
        },
      ],
    },
    input.sources,
    input.combat,
    "mixed-fixture",
  );
}

describe("complete mixed collection funding", () => {
  it("uses a separate catalog approach for a proved shared counter without changing source coordinates", () => {
    const input = fixture(sourceBody.replace(".goto Wetlands,18,40\n", ""));
    const before = structuredClone(input), collection = qualify(input).get(279)!;
    expect(collection).toBeDefined();
    const counter = collection.actions.find((action) => action.questChanges[0]?.objectiveIndex === 1)!;
    expect(counter.positions).toEqual([]);
    const quest = input.catalog.quests[0]!;
    expect(capturedFundingObjectiveLocations(counter, quest, input.combat)).toBeNull();
    expect(capturedFundingObjectiveLocations(counter, quest, input.combat, collection.sharedKills))
      .toEqual([{ name: "Bluegill Murloc", maximumEnemyLevel: 21, positions: [point] }]);
    expect(capturedFundingObjectiveLocations(counter, quest, input.combat,
      [{ objectiveIndex: 1, npcId: 1024, kills: 11 }])).toBeNull();
    expect(capturedFundingObjectiveLocations(counter, quest, input.combat,
      [{ objectiveIndex: 2, npcId: 1024, kills: 12 }])).toBeNull();
    expect(batch(input)).toBeNull();
    const selected = campaignFundingBatch(quest, input.catalog, input.combat, progress(), {
      legId: "prepare", checkpointId: "departure", targetLevel: 25,
      previous: point, resumePosition: point, forbiddenQuestIds: new Set(),
      maximumQuestLevel: 99, leaderOnly: false, includeCatalogApproaches: true,
      sourceCollections: qualify(input),
    })!;
    expect(selected).not.toBeNull();
    const index = selected.actions.findIndex((action) =>
      action.questChanges[0]?.objectiveIndex === 1);
    expect(selected.actions[index - 1]).toMatchObject({ source: null, kind: "instructions", questChanges: [] });
    expect(selected.actions[index]!.positions).toEqual([]);
    expect(input).toEqual(before);
  });

  it("preserves all four source phases and includes the shared kills once in selection cost", () => {
    const input = fixture(),
      before = structuredClone(input),
      collection = qualify(input).get(279);
    expect(collection).toMatchObject({
      objectiveIndex: 2,
      npcId: 1259,
      maximumEnemyLevel: 22,
      sharedKills: [{ objectiveIndex: 1, npcId: 1024, kills: 12 }],
    });
    const selected = batch(input)!;
    expect(selected).not.toBeNull();
    expect(
      selected.actions.flatMap((action) =>
        action.questChanges.map((change) => [change.state, change.objectiveIndex]),
      ),
    ).toEqual([
      ["accepted", null],
      ["objectives-complete", 2],
      ["objectives-complete", 1],
      ["rewarded", null],
    ]);
    expect(selected.requiredKills).toBe(collection!.expectedKills + 12);
    expect(selected.actions.map((a) => a.source)).toEqual(collection!.actions.map((a) => a.source));
    expect(input).toEqual(before);
  });

  it("retains one head per character, twelve shared murlocs and no duplicate physical combat payments", () => {
    const input = fixture(),
      plan = component(input);
    expect(plan.itemRequirements).toEqual([
      { questId: 279, objectiveIndex: 2, itemId: 3618, quantity: 1 },
    ]);
    const forecast = forecastCampaignXp(plan, progress());
    for (const member of forecast[0]!.members) {
      expect(member.blockedReason).toBeNull();
      expect(member.rewards.filter((reward) => reward.questId === 279)).toHaveLength(1);
      expect(
        member.combatRows
          .filter((row) => row.npcId === 1024)
          .reduce((n, row) => n + (row.kills ?? 0), 0),
      ).toBe(12);
      expect(
        member.combatRows
          .filter((row) => row.npcId === 1259)
          .reduce((n, row) => n + (row.kills ?? 0), 0),
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it.each([
    [1024, 24, true],
    [1024, 25, false],
    [1259, 24, true],
    [1259, 25, false],
  ] as const)(
    "checks every creature against the lowest player's +4 ceiling (npc %i, level %i)",
    (npcId, level, allowed) => {
      const input = fixture();
      input.combat.npcs = input.combat.npcs.map((npc) =>
        npc.id === npcId ? { ...npc, minimumLevel: level, maximumLevel: level } : npc,
      );
      const state = progress(21);
      state.members = state.members.map((member, index) =>
        index === 4 ? { ...member, level: 20 } : member,
      );
      expect(batch(input, state) !== null).toBe(allowed);
    },
  );

  it("rejects a +5 shared stream even if its own XP levels everyone before the objective event", () => {
    const input = fixture();
    input.combat.npcs = input.combat.npcs.map((npc) =>
      npc.id === 1024 ? { ...npc, minimumLevel: 25, maximumLevel: 25 } : npc,
    );
    const original = component(input),
      state = progress();
    const [pickup, head, kills, reward] = original.actions;
    const actions = [pickup!, kills!, head!, reward!];
    const plan: CampaignPlan = {
      ...original,
      actions,
      combat: {
        ...original.combat!,
        activities: original.combat!.activities.map((activity) => {
          const standalone = { ...activity };
          delete standalone.pathId;
          return standalone;
        }),
      },
      legs: original.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
    };
    state.members = state.members.map((member) => ({
      ...member,
      currentXp: FOREVER_XP_CURVE[20]! - 1,
    }));
    const forecast = forecastCampaignXp(plan, state);
    const encounterAction = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.state === "objectives-complete" && change.objectiveIndex === 1,
      ),
    )!;
    const steps = forecast[0]!.members[0]!.steps.filter(
      (step) => step.actionId === encounterAction.id,
    );
    expect(steps.find((step) => step.phase === "combat")?.before.level).toBe(20);
    expect(steps.find((step) => step.phase === "combat")?.status).toBe("blocked");
    expect(steps.some((step) => step.phase === "objectives-complete")).toBe(false);
    expect(forecast[0]!.members[0]!.combatXp).toBe(0);
    const scenario: CampaignFundingState = {
      difficultyPolicy: "at-level",
      starterMode: "together",
      strategy: "dungeons",
      optionalStops: true,
      lootScenario: "expected" as const,
      progress: state,
      actions: plan.actions,
      forecast,
    };
    expect(
      unsafePartyFundingScenarios(
        input.plan,
        [scenario],
        input.catalog,
        input.combat,
        qualify(input),
      ),
    ).toEqual(["at-level/together/dungeons/true/expected"]);
  });

  it.each([1, 0.8])(
    "avoids duplicate kills and preserves uncertain overlap when the item probability is %s",
    (probability) => {
      const input = fixture(
        sourceBody
          .replace("Kill Bluegill Murlocs", "Kill Gobblers")
          .replace(".mob Bluegill Murloc", ".mob Gobbler"),
      );
      input.catalog.quests[0]!.objectives = [
        { index: 1, npcId: 1259, count: 12, positions: [point] },
      ];
      input.combat.quests[0] = {
        ...input.combat.quests[0]!,
        creatureIds: [1259],
        objectiveText: ["Kill 12 Gobblers.", "Slay Gobbler and take his head."],
        killQuotas: [
          { objectiveIndex: 1, npcId: 1259, kills: 12, source: "Synthetic combined counter" },
        ],
      };
      input.combat.lootDrops = input.combat.lootDrops!.map((drop) => ({ ...drop, probability }));
      const collection = qualify(input).get(279)!;
      expect(collection).toBeDefined();
      expect(batch(input)?.requiredKills).toBe(Math.max(12, collection.expectedKills));
      const forecast = forecastCampaignXp(component(input), progress());
      for (const member of forecast[0]!.members) {
        const paidKills = member.combatRows
          .filter((row) => row.npcId === 1259)
          .reduce((n, row) => n + (row.kills ?? 0), 0);
        if (probability === 1) {
          expect(member.blockedReason).toBeNull();
          expect(paidKills).toBe(12);
        } else {
          expect(member.blockedReason).toContain("XP range");
          expect(member.rewards.every((reward) => reward.xp === null)).toBe(true);
          expect(paidKills).toBeLessThanOrEqual(12);
        }
      }
    },
  );

  it.each(["accepted", "objectives-complete", "rewarded"] as const)(
    "refuses a fresh five-player quota when one character already has the quest %s",
    (questState) => {
      const input = fixture(),
        state = progress();
      state.members[4] = { ...state.members[4]!, questStates: { "279": questState } };
      expect(batch(input, state)).toBeNull();
    },
  );

  it.each([39, 40])("retains the journal limit with %i existing quests", (count) => {
    const input = fixture(),
      state = progress();
    const questStates = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [String(10000 + index), "accepted" as const]),
    );
    state.members = state.members.map((member) => ({ ...member, questStates }));
    const forecast = forecastCampaignXp(component(input), state);
    for (const member of forecast[0]!.members) {
      expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(count === 40);
      expect(member.questLog.peak).toBe(40);
      expect(member.rewards.filter((reward) => reward.questId === 279)).toHaveLength(
        count === 40 ? 0 : 1,
      );
      if (count === 40) expect(member.combatRows).toEqual([]);
    }
  });

  it.each([
    "missing-quota",
    "wrong-quota",
    "missing-head-index",
    "colliding-index",
    "unknown-rank",
    "boss",
    "unknown-level",
    "foreign-drop",
    "nonquest-item",
    "conflicting-source",
    "unknown-guard",
  ] as const)("holds incomplete or incompatible %s evidence", (reason) => {
    const input = fixture(
      reason === "conflicting-source"
        ? sourceBody.replace(".complete 279,1", ".complete 279,1 >>Bluegill Murloc slain (13)")
        : reason === "unknown-guard"
          ? sourceBody.replace(".complete 279,1", ".complete 279,1\n.isOnQuest 999")
          : sourceBody,
    );
    const ref = input.combat.quests[0]!;
    if (reason === "missing-quota") ref.killQuotas = [];
    if (reason === "wrong-quota")
      ref.killQuotas = ref.killQuotas!.map((row) => ({ ...row, kills: 13 }));
    if (reason === "missing-head-index")
      ref.itemObjectives = ref.itemObjectives!.map((item) => ({ ...item, objectiveIndex: null }));
    if (reason === "colliding-index")
      ref.itemObjectives = ref.itemObjectives!.map((item) => ({ ...item, objectiveIndex: 1 }));
    if (["unknown-rank", "boss", "unknown-level"].includes(reason))
      input.combat.npcs = input.combat.npcs.map((npc) =>
        npc.id === 1024
          ? {
              ...npc,
              ...(reason === "unknown-level"
                ? { maximumLevel: null }
                : { rank: reason === "boss" ? 3 : null }),
            }
          : npc,
      );
    if (reason === "foreign-drop") input.combat.lootDrops![0]!.targetBuild = 70450;
    if (reason === "nonquest-item")
      input.combat.lootDrops![0]!.probabilityReference!.questOnly = false;
    expect(qualify(input).has(279)).toBe(false);
  });
});
