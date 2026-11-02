import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  campaignOptionalXpReady,
  type CampaignAction,
  type CampaignPlan,
  type CampaignSource,
} from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";

const questId = 420002;
const position = { zone: "1429", x: 50, y: 50 };
const giver = {
  npcId: 234,
  name: "Patrol Captain",
  friendlyToAlliance: true,
  positions: [position],
};

function fixture(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: QuestCatalog;
  combat: CombatDataset;
} {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 116)!;
  const guide = parseGuideChapter(
    [
      "step",
      ".goto Elwynn Forest,50,50",
      ".accept 420002 >>Accept Spider Trophy",
      ".target Patrol Captain",
      "step",
      ".goto 1429/0,-9465,74",
      ".complete 420002,1 >>Spider Gland (1)",
      ">>Kill Forest Spiders and loot a Spider Gland",
      ".mob Forest Spider",
      "step",
      ".goto Elwynn Forest,50,50",
      ".turnin 420002 >>Turn in Spider Trophy",
      ".target Patrol Captain",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    70205,
  );
  const start: CampaignAction = {
    id: "start",
    legId: "prepare",
    title: "First task",
    instructions: [],
    source: null,
    positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }],
    kind: "quests",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 420001,
      title: "First task",
      state,
      objectiveIndex: null,
    })),
  };
  const gate: CampaignAction = {
    ...start,
    id: "gate",
    kind: "xp-check",
    questChanges: [],
    targetLevel: 3,
  };
  const plan: CampaignPlan = {
    release: "collection-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "f".repeat(64),
    actions: [start, gate],
    legs: [
      {
        id: "prepare",
        title: "Elwynn Forest",
        kind: "preparation",
        from: 1,
        to: 3,
        stopId: null,
        actionIds: [start.id, gate.id],
        questIds: [420001],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [400, 1000].map((fullXp, offset) => ({
      questId: 420001 + offset,
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
  const quest: QuestCatalogEntry = {
    questId,
    title: "Spider Trophy",
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
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests: [quest],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    provider: {
      repository: "https://example.test/data",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256!,
      limitations: ["Synthetic fixture"],
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
        questId,
        creatureIds: [],
        itemCreatureIds: [114],
        objectiveText: ["Bring a Spider Gland."],
        onlyCreatureObjectives: false,
        requiredClasses: 0,
        prerequisites: quest.prerequisites,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 725,
            itemName: "Spider Gland",
            quantity: 1,
            npcIds: [114],
            sharing: "shared-roll",
          },
        ],
      },
    ],
    lootDrops: [
      {
        itemId: 725,
        npcId: 114,
        probability: 1,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/drop",
        sourceSha256: "0".repeat(64),
        capturedAt: "2026-11-01T00:00:00.000Z",
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "0".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: "0".repeat(64),
          sourceBuild: 5875,
          referencedAt: "2026-11-01T00:00:00.000Z",
          itemId: 725,
          npcId: 114,
          lootEntry: 114,
          probability: 1,
          questOnly: true,
          rateMultiplier: 1,
        },
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  return { plan, sources: [{ reference, guide }], catalog, combat };
}

function qualify(input: ReturnType<typeof fixture>): ReturnType<typeof campaignFundingCollections> {
  return campaignFundingCollections(input.plan, input.sources, input.combat, input.catalog);
}
function batch(input: ReturnType<typeof fixture>): ReturnType<typeof campaignFundingBatch> {
  const progress = emptyPremadeProgress();
  progress.members = progress.members.map((member) => ({
    ...member,
    level: 2,
    currentXp: 0,
    xpNeedsUpdate: false,
  }));
  return campaignFundingBatch(input.catalog.quests[0]!, input.catalog, input.combat, progress, {
    legId: "prepare",
    checkpointId: "gate",
    targetLevel: 3,
    previous: position,
    resumePosition: position,
    maximumQuestLevel: 5,
    forbiddenQuestIds: new Set(),
    leaderOnly: false,
    sourceCollections: qualify(input),
  });
}

describe("source-backed five-player collection funding", () => {
  it("qualifies optional cleanup only after the complete source lifecycle without exporting abandonment", () => {
    const input = fixture();
    const source = input.sources[0]!;
    const guide = parseGuideChapter(
      [
        "step",
        ".goto Elwynn Forest,50,50",
        ".accept 420002 >>Accept Spider Trophy",
        "step",
        ".goto Elwynn Forest,51,51",
        ".complete 420002,1 >>Spider Gland (1)",
        ">>Kill Forest Spiders and loot a Spider Gland",
        ".mob Forest Spider",
        "step",
        ".goto Elwynn Forest,50,50",
        ".turnin 420002 >>Turn in Spider Trophy",
        "step",
        "#optional",
        "#season 0",
        "#completewith NextTown",
        ".abandon 420002 >>Abandon Spider Trophy if unfinished",
      ].join("\n"),
      source.reference.id,
      "f".repeat(64),
      70205,
    );
    input.sources = [{ ...source, guide }];
    const frozen = JSON.stringify(input);
    expect(qualify(input).get(questId)).toMatchObject({ expectedKills: 1, slowKills: 1 });
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([questId]);
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.cleanup",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(addon.lua).toContain(".turnin 420002");
    expect(addon.lua).not.toContain(".abandon 420002");
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it("preserves source waypoints and prices the full party sharing rule", () => {
    const input = fixture(),
      frozen = JSON.stringify(input);
    expect(qualify(input).get(questId)).toMatchObject({
      npcId: 114,
      expectedKills: 1,
      slowKills: 1,
    });
    const selected = batch(input)!;
    expect(selected.requiredKills).toBe(1);
    expect(
      selected.actions.every((action) => action.xpOptional && action.xpTargetLevel === 3),
    ).toBe(true);
    const ready = emptyPremadeProgress();
    ready.members = ready.members.map((member) => ({
      ...member,
      level: 3,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignOptionalXpReady(input.plan, ready, selected.actions[0]!)).toBe(true);
    expect(selected.travelCost).toBeCloseTo(2 * Math.SQRT2);
    expect(selected.actions[1]!.positions[0]!.position).toEqual({
      zone: "1429",
      floor: 0,
      x: -9465,
      y: 74,
      space: "world",
    });
    const native = campaignNativeInstructions(
      { ...input.plan, actions: selected.actions },
      input.sources,
    )(selected.actions[1]!);
    expect(native?.directives.find((directive) => directive.tag === ".goto")?.arguments).toBe(
      "1429/0,-9465,74",
    );
    expect(JSON.stringify(input)).toBe(frozen);
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, sharing: "pooled" })),
      })),
    };
    expect(qualify(input).get(questId)).toMatchObject({ expectedKills: 5, slowKills: 5 });
    expect(batch(input)?.requiredKills).toBe(5);
  });

  it("funds all five players once and compiles the actual source quest phases", () => {
    const input = fixture(),
      frozen = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([questId]);
    expect(funded.questFunding?.readyVisitReview?.stages.at(-1)).toMatchObject({
      policy: "source-collections",
      accepted: true,
    });
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.rewards.filter((reward) => reward.questId === questId)).toHaveLength(1);
      expect(member.endpoint?.level).toBeGreaterThanOrEqual(3);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.collection",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(addon.lua).toContain(".accept 420002");
    expect(addon.lua).toContain(".complete 420002,1");
    expect(addon.lua).toContain(".turnin 420002");
    expect(addon.lua).toContain(".goto 1429/0,-9465,74");
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it.each([
    "sharing",
    "cost",
    "target",
    "level",
    "rank",
    "item",
    "provider",
    "archive",
    "guard",
    "use",
    "incomplete",
    "coordinates",
    "ordinary-item",
    "duplicate-item",
  ] as const)("holds an unsupported collection: %s", (reason) => {
    const input = fixture();
    if (reason === "ordinary-item")
      input.combat = {
        ...input.combat,
        lootDrops: input.combat.lootDrops!.map((drop) => ({
          ...drop,
          probabilityReference: { ...drop.probabilityReference!, questOnly: false },
        })),
      };
    if (reason === "duplicate-item")
      input.combat = {
        ...input.combat,
        quests: [...input.combat.quests, { ...input.combat.quests[0]!, questId: 420003 }],
      };
    if (["sharing", "cost", "target"].includes(reason))
      input.combat = {
        ...input.combat,
        quests: input.combat.quests.map((quest) => ({
          ...quest,
          itemObjectives: quest.itemObjectives!.map((item) => ({
            ...item,
            ...(reason === "sharing" ? { sharing: "unknown" as const } : {}),
            ...(reason === "cost" ? { quantity: 50, sharing: "pooled" as const } : {}),
            ...(reason === "target" ? { npcIds: [114, 115] } : {}),
          })),
        })),
      };
    if (reason === "target")
      input.combat = {
        ...input.combat,
        npcs: [...input.combat.npcs, { ...input.combat.npcs[0]!, id: 115, name: "Forest Spider" }],
      };
    if (reason === "level" || reason === "rank")
      input.combat = {
        ...input.combat,
        npcs: input.combat.npcs.map((npc) => ({
          ...npc,
          ...(reason === "level" ? { maximumLevel: null } : { rank: 3 }),
        })),
      };
    if (reason === "item" || reason === "provider" || reason === "archive")
      input.catalog = {
        ...input.catalog,
        ...(reason === "item" ? { itemSha256: "0".repeat(64) } : {}),
        ...(reason === "provider" ? { providerRevision: "0".repeat(40) } : {}),
        ...(reason === "archive" ? { sourceArchiveSha256: "0".repeat(64) } : {}),
      };
    if (["guard", "use", "incomplete", "coordinates"].includes(reason)) {
      const source = input.sources[0]!;
      const guide = parseGuideChapter(
        [
          "step",
          ".goto Elwynn Forest,50,50",
          ".accept 420002 >>Accept Spider Trophy",
          "step",
          ...(reason === "coordinates" ? [] : [".goto Elwynn Forest,51,51"]),
          ...(reason === "guard" ? [".isOnQuest 999999"] : []),
          ...(reason === "use" ? [".use 123"] : []),
          ".complete 420002,1 >>Spider Gland (1)",
          ".mob Forest Spider",
          ...(reason === "incomplete"
            ? []
            : ["step", ".goto Elwynn Forest,50,50", ".turnin 420002"]),
        ].join("\n"),
        source.reference.id,
        "f".repeat(64),
        70205,
      );
      input.sources = [{ reference: source.reference, guide }];
    }
    expect(qualify(input).size).toBe(0);
  });

  it("keeps unknown prior inventory, personal work and incomplete parties out of fresh quotas", () => {
    const input = fixture(),
      sourceCollections = qualify(input),
      progress = emptyPremadeProgress();
    const root = input.catalog.quests[0]!;
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
      sourceCollections,
    };
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: { [questId]: "accepted" },
    }));
    expect(campaignFundingBatch(root, input.catalog, input.combat, progress, options)).toBeNull();
    progress.members = progress.members.map((member) => ({ ...member, questStates: {} }));
    expect(
      campaignFundingBatch(root, input.catalog, input.combat, progress, {
        ...options,
        leaderOnly: true,
      }),
    ).toBeNull();
    expect(
      campaignFundingBatch(
        root,
        input.catalog,
        input.combat,
        { ...progress, members: progress.members.slice(0, 4) },
        options,
      ),
    ).toBeNull();
  });

  it("rejects a cheap trophy when its required personal-drop parent is unqualified", () => {
    const input = fixture(),
      parentId = 420003;
    input.catalog = {
      ...input.catalog,
      quests: [
        { ...input.catalog.quests[0]!, prerequisites: { allOf: [parentId], anyOf: [] } },
        { ...input.catalog.quests[0]!, questId: parentId, title: "Rare paws" },
      ],
    };
    input.combat = {
      ...input.combat,
      quests: [
        { ...input.combat.quests[0]!, prerequisites: { allOf: [parentId], anyOf: [] } },
        {
          ...input.combat.quests[0]!,
          questId: parentId,
          itemObjectives: input.combat.quests[0]!.itemObjectives!.map((item) => ({
            ...item,
            itemId: 726,
            quantity: 10,
            sharing: "pooled",
          })),
        },
      ],
      lootDrops: [
        ...input.combat.lootDrops!,
        {
          ...input.combat.lootDrops![0]!,
          itemId: 726,
          probabilityReference: {
            ...input.combat.lootDrops![0]!.probabilityReference!,
            itemId: 726,
          },
        },
      ],
    };
    const source = input.sources[0]!;
    const extra = parseGuideChapter(
      "step\n.goto Elwynn Forest,50,50\n.accept 420003\nstep\n.goto Elwynn Forest,51,51\n.complete 420003,1 >>Rare Paw (10)\n.mob Forest Spider\nstep\n.goto Elwynn Forest,50,50\n.turnin 420003",
      source.reference.id,
      "f".repeat(64),
      70205,
    );
    input.sources = [
      {
        reference: source.reference,
        guide: {
          ...source.guide,
          steps: [
            ...source.guide.steps,
            ...extra.steps.map((step) => ({ ...step, id: `parent-${step.id}` })),
          ],
        },
      },
    ];
    expect(qualify(input).has(questId)).toBe(true);
    expect(qualify(input).has(parentId)).toBe(false);
    expect(batch(input)).toBeNull();
  });

  it("applies the loot budget to the complete chain, even when each quest fits separately", () => {
    const input = fixture(),
      parentId = 420003;
    input.catalog = {
      ...input.catalog,
      quests: [
        { ...input.catalog.quests[0]!, prerequisites: { allOf: [parentId], anyOf: [] } },
        { ...input.catalog.quests[0]!, questId: parentId },
      ],
    };
    const reference = input.combat.quests[0]!;
    input.combat = {
      ...input.combat,
      quests: [questId, parentId].map((id) => ({
        ...reference,
        questId: id,
        prerequisites: { allOf: id === questId ? [parentId] : [], anyOf: [] },
        itemObjectives: reference.itemObjectives!.map((item) => ({
          ...item,
          itemId: id === questId ? 725 : 726,
          quantity: 3,
          sharing: "pooled",
        })),
      })),
      lootDrops: [
        ...input.combat.lootDrops!,
        {
          ...input.combat.lootDrops![0]!,
          itemId: 726,
          probabilityReference: {
            ...input.combat.lootDrops![0]!.probabilityReference!,
            itemId: 726,
          },
        },
      ],
    };
    const source = input.sources[0]!;
    const guide = parseGuideChapter(
      [parentId, questId]
        .flatMap((id) => [
          "step",
          ".goto Elwynn Forest,50,50",
          `.accept ${id} >>Accept Spider Trophy`,
          "step",
          ".goto Elwynn Forest,51,51",
          `.complete ${id},1 >>Spider Gland (3)`,
          ".mob Forest Spider",
          "step",
          ".goto Elwynn Forest,50,50",
          `.turnin ${id}`,
        ])
        .join("\n"),
      source.reference.id,
      "f".repeat(64),
      70205,
    );
    input.sources = [{ reference: source.reference, guide }];
    const choices = qualify(input);
    expect(choices.get(questId)?.expectedKills).toBe(15);
    expect(choices.get(parentId)?.expectedKills).toBe(15);
    expect(batch(input)).toBeNull();
  });
});
