import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, isSharedFundingQuest, type QuestCatalog } from "./quest-catalog.js";

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const position = { zone: "1429", x: 50, y: 50 };
  const groundPickup = {
    questId: 410002,
    itemId: 1309,
    objectiveIndex: 1 as const,
    objectId: 32,
    objectName: "Sunken Chest",
    positions: [{ ...position, x: 52 }],
    sourceArchiveSha256: "f".repeat(64),
    source: { chapterId: "chapter-test", version: "source-v1", stepId: "source-step-0001" },
  };
  const giver = { npcId: 234, name: "Foreman", friendlyToAlliance: true, positions: [position] };
  const action: CampaignAction = {
    id: "start",
    legId: "prepare",
    title: "First message",
    instructions: [],
    source: null,
    positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }],
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 410001,
      title: "First message",
      state,
      objectiveIndex: null,
    })),
  };
  const gate: CampaignAction = {
    ...action,
    id: "gate",
    kind: "xp-check",
    targetLevel: 3,
    questChanges: [],
  };
  const plan: CampaignPlan = {
    release: "ground-funding-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "f".repeat(64),
    actions: [action, gate],
    legs: [
      {
        id: "prepare",
        title: "Elwynn Forest",
        kind: "preparation",
        from: 1,
        to: 3,
        stopId: null,
        actionIds: ["start", "gate"],
        questIds: [410001],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [400, 1000].map((fullXp, index) => ({
      questId: 410001 + index,
      fullXp,
      questLevel: 3,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
  };
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    objectSha256: "e".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests: [
      {
        questId: 410002,
        title: "Recover the tools",
        minimumLevel: 1,
        questLevel: 3,
        requiredRaces: 4294967373,
        requiredClasses: 0,
        starts: [giver],
        ends: [giver],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "unsupported",
        objectives: [],
        unsupportedRequirements: [],
        groundPickup,
      },
    ],
  });
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    provider: {
      repository: "https://example.test/data",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      questSha256: "b".repeat(64),
      npcSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      objectSha256: "e".repeat(64),
      limitations: ["Synthetic regression fixture"],
    },
    npcs: [],
    dungeons: [],
    killXpEvidence: [],
    questCatalogReference: {
      sha256: "0".repeat(64),
      providerRevision: "a".repeat(40),
      sourceArchiveSha256: "f".repeat(64),
    },
    quests: [
      {
        questId: 410002,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: ["Recover the toolbox."],
        onlyCreatureObjectives: false,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 1309,
            itemName: "Toolbox",
            quantity: 1,
            npcIds: [],
            sharing: "pooled",
            groundPickup,
          },
        ],
      },
    ],
  });
  return { plan, catalog, combat };
}

describe("source-backed ground-object preparation", () => {
  it("retains a real collection step for every player, awards the hand-in once and generates no kills", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([410002]);
    expect(
      funded.questFunding?.readyVisitReview?.stages.find(
        (stage) => stage.policy === "ground-pickups",
      ),
    ).toMatchObject({
      policy: "ground-pickups",
      accepted: true,
    });
    const tasks = funded.actions.filter((a) => a.libraryQuestId === 410002);
    expect(tasks.map((a) => a.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(tasks[1]!.positions[0]!.position).toMatchObject({ zone: "1429", x: 52, y: 50 });
    expect(tasks[1]!.instructions.join(" ")).toContain("Each player must loot one Toolbox");
    expect(tasks[1]!.instructions.join(" ")).toContain("wait for it to return");
    for (const mode of ["separate", "together"] as const) {
      const forecast = forecastCampaignGuide(funded, emptyPremadeProgress(), { starterMode: mode });
      for (const member of forecast.sections[0]!.forecast.members) {
        expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
        expect(member.combatRows).toEqual([]);
        expect(member.rewards.filter((r) => r.questId === 410002)).toHaveLength(1);
      }
    }
    const native = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.ground",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(native.lua).toContain(".accept 410002");
    expect(native.lua).toContain(".complete 410002,1");
    expect(native.lua).toContain(".turnin 410002");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("requires the explicit ground stage, agrees with the combat reference and includes the return journey", () => {
    const input = fixture(),
      quest = input.catalog.quests[0]!,
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((m) => ({
      ...m,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: { zone: "1429", x: 50, y: 50 },
      resumePosition: { zone: "1429", x: 50, y: 50 },
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    };
    expect(isSharedFundingQuest(quest)).toBe(false);
    expect(campaignFundingBatch(quest, input.catalog, input.combat, progress, options)).toBeNull();
    const batch = campaignFundingBatch(quest, input.catalog, input.combat, progress, {
      ...options,
      includeGroundPickups: true,
    });
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.travelCost).toBeCloseTo(0.04);
    const other = {
      ...input.combat,
      quests: input.combat.quests.map((q) => ({
        ...q,
        itemObjectives: q.itemObjectives!.map((item) => ({
          ...item,
          groundPickup: { ...item.groundPickup!, objectId: 33 },
        })),
      })),
    };
    expect(
      campaignFundingBatch(quest, input.catalog, other, progress, {
        ...options,
        includeGroundPickups: true,
      }),
    ).toBeNull();
  });

  it("keeps every possible object location and directs players to search rather than wait at an empty marker", () => {
    const input = fixture();
    const quest = input.catalog.quests[0]!;
    const near = quest.groundPickup!.positions[0]!;
    const ground = { ...quest.groundPickup!, positions: [{ ...near, x: 70 }, near] };
    input.catalog = { ...input.catalog, quests: [{ ...quest, groundPickup: ground }] };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((entry) => ({
        ...entry,
        itemObjectives: entry.itemObjectives!.map((item) => ({ ...item, groundPickup: ground })),
      })),
    };
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const batch = campaignFundingBatch(
      input.catalog.quests[0]!,
      input.catalog,
      input.combat,
      progress,
      {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: { zone: "1429", x: 50, y: 50 },
        resumeZone: "1429",
        forbiddenQuestIds: new Set<number>(),
        maximumQuestLevel: 5,
        leaderOnly: false,
        includeGroundPickups: true,
      },
    )!;
    const objective = batch.actions.find((action) =>
      action.questChanges.some((change) => change.state === "objectives-complete"),
    )!;
    expect(objective.positions.map(({ position }) => [position.x, position.y])).toEqual([
      [52, 50],
      [70, 50],
    ]);
    expect(objective.instructions.join(" ")).toContain(
      "If one location is empty, check the others",
    );
    expect(batch.requiredKills).toBe(0);
    const plan = {
      ...input.plan,
      actions: batch.actions,
      legs: input.plan.legs.map((leg) => ({
        ...leg,
        actionIds: batch.actions.map((action) => action.id),
        questIds: batch.questIds,
      })),
    };
    const compiled = compileCampaignAddon(plan, batch.actions, {
      version: "0.2.0-review.locations",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    for (const role of ["leader", "party"] as const) {
      const content = compiled.documents
        .filter((document) => document.role === role)
        .map((document) => document.content)
        .join("\n");
      expect(content).toContain(".goto 1429,52,50");
      expect(content).toContain(".goto 1429,70,50");
      expect(content.match(/\.complete 410002,1/g)).toHaveLength(1);
    }
  });

  it.each(["class", "race", "minimum", "reward", "prerequisite", "restriction"] as const)(
    "holds an ineligible ground task: %s",
    (reason) => {
      const input = fixture();
      input.catalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((q) => ({
          ...q,
          ...(reason === "class" ? { requiredClasses: 8 } : {}),
          ...(reason === "race" ? { requiredRaces: 2 } : {}),
          ...(reason === "minimum" ? { minimumLevel: 4 } : {}),
          ...(reason === "prerequisite" ? { prerequisites: { allOf: [999], anyOf: [] } } : {}),
          ...(reason === "restriction" ? { unsupportedRequirements: ["requiredMinRep"] } : {}),
        })),
      };
      if (reason === "reward")
        input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(0, 1) };
      expect(
        fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog).questFunding
          ?.addedQuestIds,
      ).toEqual([]);
    },
  );

  it("rejects absent export provenance and incompatible ground/item/archive bindings at the schema boundary", () => {
    const { catalog, combat } = fixture();
    for (const value of [
      { ...catalog, objectSha256: undefined },
      { ...catalog, itemSha256: undefined },
      { ...catalog, sourceArchiveSha256: "0".repeat(64) },
      {
        ...catalog,
        quests: catalog.quests.map((q) => ({
          ...q,
          groundPickup: { ...q.groundPickup!, questId: 999 },
        })),
      },
    ])
      expect(questCatalogSchema.safeParse(value).success).toBe(false);
    for (const value of [
      { ...combat, provider: { ...combat.provider, objectSha256: undefined } },
      { ...combat, questCatalogReference: undefined },
      ...[{ quantity: 2 }, { npcIds: [10] }, { provided: true }].map((change) => ({
        ...combat,
        quests: combat.quests.map((q) => ({
          ...q,
          itemObjectives: q.itemObjectives!.map((item) => ({ ...item, ...change })),
        })),
      })),
    ])
      expect(combatDatasetSchema.safeParse(value).success).toBe(false);
  });
});
