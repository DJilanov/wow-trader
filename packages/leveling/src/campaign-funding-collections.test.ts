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
import { campaignCollectionContinuations } from "./campaign-collection-continuations.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const questId = 420002;
const position = { zone: "1429", x: 50, y: 50 };
const giver = {
  npcId: 234,
  name: "Patrol Captain",
  friendlyToAlliance: true,
  positions: [position],
};

function fixture(collectionQuestId: number = questId): {
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
      `.accept ${collectionQuestId} >>Accept Spider Trophy`,
      ".target Patrol Captain",
      "step",
      ".goto 1429/0,-9465,74",
      `.complete ${collectionQuestId},1 >>Spider Gland (1)`,
      ">>Kill Forest Spiders and loot a Spider Gland",
      ".mob Forest Spider",
      "step",
      ".goto Elwynn Forest,50,50",
      `.turnin ${collectionQuestId} >>Turn in Spider Trophy`,
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
      questId: offset === 0 ? 420001 : collectionQuestId,
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
    questId: collectionQuestId,
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
        questId: collectionQuestId,
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

function carriedCollectionFixture(mixedPickup: boolean = false): ReturnType<typeof fixture> {
  const input = fixture();
  if (mixedPickup) {
    input.catalog.quests.push({ ...input.catalog.quests[0]!, questId: 420001,
      title: "First task", category: "delivery" });
    const source = input.sources[0]!;
    input.sources = [{ ...source, guide: parseGuideChapter([
      "step", ".goto Elwynn Forest,50,50", ".turnin 420001 >>Turn in First task",
      ".accept 420002 >>Accept Spider Trophy", ".target Patrol Captain",
      "step", ".goto 1429/0,-9465,74", ".complete 420002,1 >>Spider Gland (1)",
      ">>Kill Forest Spiders and loot a Spider Gland", ".mob Forest Spider",
      "step", ".goto Elwynn Forest,50,50", ".turnin 420002 >>Turn in Spider Trophy",
      ".target Patrol Captain",
    ].join("\n"), source.reference.id, "f".repeat(64), 70205) }];
  }
  const [pickup, ...remaining] = qualify(input).get(questId)!.actions;
  const gate = input.plan.actions[1]!;
  const first = mixedPickup ? { ...input.plan.actions[0]!,
    questChanges: input.plan.actions[0]!.questChanges.filter((change) => change.state === "accepted") }
    : input.plan.actions[0]!;
  const capturedPickup = { ...pickup!, legId: gate.legId, ...(mixedPickup ? {
    questChanges: [input.plan.actions[0]!.questChanges.find((change) => change.state === "rewarded")!,
      ...pickup!.questChanges],
  } : {}) };
  input.plan = {
    ...input.plan,
    sharedQuestsOnly: true,
    actions: [first, capturedPickup, gate,
      ...remaining.map((action) => ({ ...action, legId: "later" }))],
    legs: [
      { ...input.plan.legs[0]!, actionIds: [input.plan.actions[0]!.id, pickup!.id, gate.id],
        questIds: [420001, questId] },
      { id: "later", title: "Later source visit", kind: "xp-bridge", from: 3, to: 4,
        stopId: null, actionIds: remaining.map((action) => action.id), questIds: [questId],
        unresolvedQuestIds: [] },
    ],
  };
  return input;
}

function mixedCollectionAlternatives(change: string = ""): ReturnType<typeof fixture> {
  const input = fixture();
  input.combat.quests[0]!.itemObjectives![0]!.sharing = "pooled";
  const reference = input.sources[0]!.reference;
  let completion = [
    ".goto Elwynn Forest,50,50",
    ">>Kill Forest Spiders and loot a Spider Gland",
    `.complete ${questId},1 >>Spider Gland (1)`,
    ".mob Forest Spider",
    ".complete 420003,1 >>Unselected creature slain (10)",
    ".mob Unselected creature",
  ];
  if (change === "missing-position")
    completion = completion.filter((line) => !line.startsWith(".goto"));
  if (change === "own-guard") completion.push(`.isOnQuest ${questId}`);
  if (change === "other-guard") completion.push(".isOnQuest 420003");
  if (change === "use-device") completion.push(".use 725");
  if (change === "duplicate-counter") completion.push(`.complete ${questId},1 >>Spider Gland (1)`);
  if (change === "lifecycle") completion.push(".accept 420003 >>Accept unrelated work");
  const pickupAlternative = change.startsWith("pickup-");
  const alternativePickup = pickupAlternative
    ? [
        change === "pickup-class-condition" ? "step << Mage" : "step",
        ".goto Elwynn Forest,50,50",
        `.accept ${questId} >>Accept Spider Trophy`,
        ".target Patrol Captain",
        ".accept 420006 >>Accept unselected companion",
        ...(change === "pickup-other-guard" ? [".isOnQuest 420006"] : []),
        ...(change === "pickup-lifecycle" ? [".turnin 420007 >>Turn in unrelated work"] : []),
        ...(change === "pickup-duplicate" ? [`.accept ${questId} >>Accept duplicate`] : []),
      ]
    : [];
  const guide = parseGuideChapter(
    [
      "step",
      ".goto Elwynn Forest,50,50",
      `.accept ${questId} >>Accept Spider Trophy`,
      ".target Patrol Captain",
      ...(pickupAlternative
        ? [".accept 420008 >>Accept guarded companion", ".isOnQuest 420005"]
        : []),
      ...alternativePickup,
      "step",
      "#optional",
      ".goto Elwynn Forest,50,50",
      `.complete ${questId},1 >>Spider Gland (1)`,
      ".mob Forest Spider",
      ".complete 420003,1 >>Unselected creature slain (10)",
      ".isOnQuest 420004",
      change === "class-condition" ? "step << Mage" : "step",
      ...completion,
      "step",
      ".goto Elwynn Forest,50,50",
      `.turnin ${questId} >>Turn in Spider Trophy`,
      ".target Patrol Captain",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    change === "wrong-build" ? 70450 : 70205,
  );
  input.sources = [{ reference, guide }];
  return input;
}

describe("collection alternatives in combined quest steps", () => {
  it("uses the independently captured pickup and completion alternatives together", () => {
    const input = mixedCollectionAlternatives("pickup-alternative");
    const collection = qualify(input).get(questId)!;
    expect(collection).toBeDefined();
    expect(collection.actions.map((action) => action.source?.stepId)).toEqual([
      "source-step-0002",
      "source-step-0004",
      "source-step-0005",
    ]);
    expect(
      collection.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).toEqual([questId, questId, questId]);
    expect(collection.expectedKills).toBe(5);
    expect(collection.actions[0]!.instructions.join(" ")).not.toContain("unselected companion");
  });

  it.each(["pickup-other-guard", "pickup-lifecycle", "pickup-class-condition", "pickup-duplicate"])(
    "does not discard a pickup restriction or conflicting phase (%s)",
    (change) => {
      expect(qualify(mixedCollectionAlternatives(change)).has(questId)).toBe(false);
    },
  );

  it.each(["", "own-guard"])(
    "uses the later complete counter without taking unrelated objectives (%s)",
    (change) => {
      const input = mixedCollectionAlternatives(change),
        before = structuredClone(input);
      const collection = qualify(input).get(questId)!;
      expect(collection).toBeDefined();
      expect(collection.actions[1]!.source?.stepId).toBe("source-step-0003");
      expect(
        collection.actions.flatMap((action) => action.questChanges).map((row) => row.questId),
      ).toEqual([questId, questId, questId]);
      expect(collection.expectedKills).toBe(5);
      expect(collection.slowKills).toBe(5);
      expect(collection.actions[1]!.instructions.join(" ")).not.toContain("Unselected creature");
      if (change === "own-guard")
        expect(collection.actions[1]!.source?.conditions?.checks).toEqual([
          expect.objectContaining({ tag: ".isOnQuest", arguments: String(questId) }),
        ]);
      expect(input).toEqual(before);
    },
  );

  it.each([
    "other-guard",
    "use-device",
    "duplicate-counter",
    "lifecycle",
    "class-condition",
    "missing-position",
    "wrong-build",
  ])("keeps the method unresolved when its alternative is unsupported (%s)", (change) => {
    expect(qualify(mixedCollectionAlternatives(change)).has(questId)).toBe(false);
  });

  it("funds only the full selected item counter and preserves the native party inventory", () => {
    const input = mixedCollectionAlternatives();
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding!.addedQuestIds).toContain(questId);
    expect(
      funded.actions.some((action) =>
        action.questChanges.some((change) => change.questId === 420003),
      ),
    ).toBe(false);
    expect(funded.itemRequirements).toContainEqual({
      questId,
      objectiveIndex: 1,
      itemId: 725,
      quantity: 1,
    });
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.1.0",
      runtimeBuild: 70450,
      interfaceVersion: 11508,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents
        .filter((document) => document.role === role)
        .map((document) => document.content)
        .join("\n");
      expect(text.match(new RegExp(`\\.complete ${questId},1\\b`, "g"))).toHaveLength(1);
      expect(text).not.toContain(".complete 420003");
      expect(text).not.toContain("Unselected creature");
      expect(text).not.toContain(".isOnQuest 420004");
    }
  });
});

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
    ...(input.plan.sharedQuestsOnly ? { sharedQuestsOnly: true as const } : {}),
  });
}

describe("source-backed five-player collection funding", () => {
  it.each(["valid", "early", "late", "wrong-npc", "unrelated-child", "duplicate"])(
    "qualifies a captured post-hand-in NPC wait only when bound: %s", (mode) => {
      const input = fixture(), source = input.sources[0]!, childId = 420003;
      const next: QuestCatalogEntry = { ...input.catalog.quests[0]!, questId: childId,
        title: "Continue the report", category: "delivery", objectives: [],
        starts: [{ ...giver, npcId: mode === "wrong-npc" ? 999 : giver.npcId }],
        prerequisites: { allOf: mode === "unrelated-child" ? [] : [questId], anyOf: [] },
      };
      input.catalog = { ...input.catalog, quests: [...input.catalog.quests, next] };
      const handoff = [`.turnin ${questId}`, ".timer 20,Report RP", `.accept ${childId}`];
      if (mode === "early") handoff.unshift(handoff.splice(1, 1)[0]!);
      if (mode === "late") handoff.push(handoff.splice(1, 1)[0]!);
      if (mode === "duplicate") handoff.splice(2, 0, ".timer 20,Another wait");
      input.sources = [{ ...source, guide: parseGuideChapter([
        "step", ".goto Elwynn Forest,50,50", `.accept ${questId}`, ".target Patrol Captain",
        "step", ".goto 1429/0,-9465,74", `.complete ${questId},1 >>Spider Gland (1)`, ".mob Forest Spider",
        "step", ".goto Elwynn Forest,50,50", ...handoff, ".target Patrol Captain",
      ].join("\n"), source.reference.id, "f".repeat(64), 70205) }];
      const before = structuredClone(input);
      expect(qualify(input).has(questId)).toBe(mode === "valid");
      if (mode === "valid") {
        const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
        expect(funded.questFunding?.addedQuestIds).toContain(questId);
        const native = compileCampaignAddon(funded, funded.actions, { version: "0.2.0-review.npc-wait",
          runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: input.sources });
        expect(native.lua).toContain(`.turnin ${questId}`);
        expect(native.lua).not.toContain(`.accept ${childId}`);
      }
      expect(input).toEqual(before);
    },
  );

  it("funds a bounded whole-party collection without reducing anyone's item quota", () => {
    const input = fixture(), source = input.sources[0]!;
    input.plan = { ...input.plan, sharedQuestsOnly: true };
    input.sources = [{ ...source, guide: parseGuideChapter([
      "step", ".goto Elwynn Forest,50,50", `.accept ${questId}`, ".target Patrol Captain",
      "step", ".goto 1429/0,-9465,74", `.complete ${questId},1 >>Spider Gland (5)`,
      ">>Kill Forest Spiders and loot Spider Glands", ".mob Forest Spider",
      "step", ".goto Elwynn Forest,50,50", `.turnin ${questId}`, ".target Patrol Captain",
    ].join("\n"), source.reference.id, "f".repeat(64), 70205) }];
    input.combat = { ...input.combat,
      quests: input.combat.quests.map((quest) => ({ ...quest,
        itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, quantity: 5, sharing: "pooled" })),
      })),
      lootDrops: input.combat.lootDrops!.map((drop) => ({ ...drop, probability: 0.25,
        probabilityReference: { ...drop.probabilityReference!, probability: 0.25 },
      })),
    };
    const before = structuredClone(input);
    expect(qualify(input).get(questId)).toMatchObject({ expectedKills: 100 });
    expect(batch(input)?.requiredKills).toBe(100);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toContain(questId);
    const completion = funded.actions.find((action) => action.questChanges.some(
      (change) => change.questId === questId && change.state === "objectives-complete",
    ))!;
    const native = campaignNativeInstructions(funded, input.sources)(completion)!;
    expect(native.directives.find((row) => row.tag === ".complete")?.text).toBe("Spider Gland (5)");
    expect(input).toEqual(before);
  });

  it.each(["#softcore", "#softcoreserver"])("accepts the matching ordinary-server marker %s", (tag) => {
    const input = fixture();
    const reward = input.sources[0]!.guide.steps.at(-1)!;
    reward.directives.unshift({ ...reward.directives[0]!, tag, arguments: "" });
    expect(campaignFundingCollections(input.plan, input.sources, input.combat, input.catalog).has(questId))
      .toBe(true);
  });

  it.each(["#hardcore", "#hardcoreserver"])("keeps excluded server mode %s unavailable", (tag) => {
    const input = fixture();
    const reward = input.sources[0]!.guide.steps.at(-1)!;
    reward.directives.unshift({ ...reward.directives[0]!, tag, arguments: "" });
    expect(campaignFundingCollections(input.plan, input.sources, input.combat, input.catalog).has(questId))
      .toBe(false);
  });

  it("chooses a collection that stays priced across a level-spanning loot forecast", () => {
    const input = fixture();
    const safeId = 420003,
      seedLootId = 420004;
    const reference = input.sources[0]!.reference;
    input.sources = [
      {
        reference,
        guide: parseGuideChapter(
          [
            ...[
              [questId, "Forest Spider", "Spider Gland"],
              [safeId, "Young Wolf", "Wolf Token"],
            ].flatMap(([id, npc, item]) => [
              `step\n.goto Elwynn Forest,50,50\n.accept ${id} >>Accept Trophy\n.target Patrol Captain`,
              `step\n.goto Elwynn Forest,50,50\n.complete ${id},1 >>${item} (1)\n>>Kill ${npc} and loot a ${item}\n.mob ${npc}`,
              `step\n.goto Elwynn Forest,50,50\n.turnin ${id} >>Turn in Trophy\n.target Patrol Captain`,
            ]),
          ].join("\n"),
          reference.id,
          "f".repeat(64),
          70205,
        ),
      },
    ];
    const first = input.plan.actions[0]!;
    const loot: CampaignAction = {
      ...first,
      id: "seed-loot",
      wholeQuestObjectives: true,
      questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
        questId: seedLootId,
        title: "Seed loot",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      })),
    };
    // Expected loot spans levels 7–8; gray-sensitive low creatures must not break that workload.
    const seedXp =
      Array.from({ length: 6 }, (_, index) => FOREVER_XP_CURVE[index + 1]!).reduce(
        (sum, xp) => sum + xp,
        0,
      ) +
      FOREVER_XP_CURVE[7]! -
      165;
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      actions: [first, loot, { ...input.plan.actions[1]!, targetLevel: 8 }],
      legs: [{ ...input.plan.legs[0]!, to: 8, actionIds: [first.id, loot.id, "gate"] }],
      rewardFacts: [
        { ...input.plan.rewardFacts![0]!, fullXp: seedXp },
        { ...input.plan.rewardFacts![1]!, fullXp: 1000 },
        { ...input.plan.rewardFacts![1]!, questId: safeId, fullXp: 800 },
        { ...input.plan.rewardFacts![1]!, questId: seedLootId, fullXp: 0 },
      ],
    };
    input.catalog = {
      ...input.catalog,
      quests: [
        ...[questId, safeId].map((id) => ({
          ...input.catalog.quests[0]!,
          questId: id,
          minimumLevel: 7,
          questLevel: 7,
          prerequisites: { allOf: [seedLootId], anyOf: [] },
        })),
        { ...input.catalog.quests[0]!, questId: seedLootId },
      ],
    };
    const creature = input.combat.npcs[0]!,
      item = input.combat.quests[0]!.itemObjectives![0]!;
    input.combat = {
      ...input.combat,
      npcs: [
        { ...creature, minimumLevel: 3, maximumLevel: 4 },
        { ...creature, id: 115, name: "Young Wolf", minimumLevel: 7, maximumLevel: 7 },
        { ...creature, id: 116, name: "Seed creature", minimumLevel: 7, maximumLevel: 9 },
      ],
      quests: [
        { ...input.combat.quests[0]!, prerequisites: { allOf: [seedLootId], anyOf: [] } },
        {
          ...input.combat.quests[0]!,
          questId: safeId,
          itemCreatureIds: [115],
          prerequisites: { allOf: [seedLootId], anyOf: [] },
          itemObjectives: [{ ...item, itemId: 726, itemName: "Wolf Token", npcIds: [115] }],
        },
        {
          ...input.combat.quests[0]!,
          questId: seedLootId,
          itemCreatureIds: [116],
          itemObjectives: [
            { ...item, itemId: 727, itemName: "Seed token", npcIds: [116], sharing: "pooled" },
          ],
        },
      ],
      lootDrops: [
        ...input.combat.lootDrops!,
        {
          ...input.combat.lootDrops![0]!,
          itemId: 726,
          npcId: 115,
          probabilityReference: {
            ...input.combat.lootDrops![0]!.probabilityReference!,
            itemId: 726,
            npcId: 115,
            lootEntry: 115,
          },
        },
        {
          ...input.combat.lootDrops![0]!,
          itemId: 727,
          npcId: 116,
          probability: 0.5,
          probabilityReference: {
            ...input.combat.lootDrops![0]!.probabilityReference!,
            itemId: 727,
            npcId: 116,
            lootEntry: 116,
            probability: 0.5,
          },
        },
      ],
    };
    input.plan = attachCampaignCombat(
      input.plan,
      input.sources,
      input.combat,
      "cross-workload-test",
    );
    const before = campaignFundingStates(input.plan);
    expect(
      before.find((state) => state.lootScenario === "fast")!.forecast.at(-1)!.members[0]!
        .knownEndpoint!.level,
    ).toBe(7);
    const expected = before.find((state) => state.lootScenario === "expected")!.forecast.at(-1)!
      .members[0]!;
    expect(expected.knownEndpoint!.level).toBe(7);
    expect(expected.xpBounds!.finish!.maximum.level).toBe(8);
    expect([...qualify(input).keys()].sort()).toEqual([questId, safeId]);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding!.addedQuestIds).toEqual([safeId]);
    expect(funded.questFunding!.scenarios.every((state) => state.remaining.length === 0)).toBe(
      true,
    );
    for (const state of campaignFundingStates(funded))
      for (const member of state.forecast.at(-1)!.members) {
        expect(member.blockedAtActionId).toBeNull();
        expect(member.knownEndpoint!.level).toBeGreaterThanOrEqual(8);
      }
  });

  it("retains a complete group method, shared loot and split pickup guards without unused solo cleanup", () => {
    const input = fixture(),
      owner = input.sources[0]!;
    input.plan = { ...input.plan, sharedQuestsOnly: true, sharedSourceQuestIds: [questId] };
    input.sources = [
      {
        ...owner,
        guide: parseGuideChapter(
          [
            "step << Hunter/Warlock",
            ".solo",
            ".accept 420002",
            ".maxlevel 27",
            "step",
            ".group",
            ".goto Elwynn Forest,50,50",
            ".accept 420002 >>Accept Spider Trophy",
            ".accept 420003 >>Accept companion task",
            ".isNotOnQuest 420002",
            ".maxlevel 27",
            "step",
            ".group 3",
            ".goto Elwynn Forest,51,51",
            ".complete 420002,1 >>Spider Gland (1)",
            ">>Kill Forest Spiders and loot a Spider Gland",
            ".mob Forest Spider",
            ".isOnQuest 420002",
            "step << Hunter/Warlock",
            ".solo",
            ".complete 420002,1",
            ">>Cast Fear to kite the spider",
            "step",
            ".goto Elwynn Forest,50,50",
            ".turnin 420002 >>Turn in Spider Trophy",
            ".isQuestComplete 420002",
            "step",
            "#optional",
            ".abandon 420002",
          ].join("\n"),
          owner.reference.id,
          "f".repeat(64),
          70205,
        ),
      },
      {
        reference: CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 115)!,
        guide: parseGuideChapter(
          "step\n.abandon 420002",
          CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 115)!.id,
          "e".repeat(64),
          70205,
        ),
      },
    ];
    input.combat = {
      ...input.combat,
      lootDrops: input.combat.lootDrops!.map((drop) => ({ ...drop, probability: 0.5 })),
    };
    const original = structuredClone(input);
    const collection = qualify(input).get(questId)!;
    expect(collection).toMatchObject({ npcId: 114, expectedKills: 2, slowKills: 4 });
    expect(collection.actions.map((action) => action.source!.stepId)).toEqual([
      "source-step-0002",
      "source-step-0003",
      "source-step-0005",
    ]);
    expect(collection.actions[0]!.source!.conditions!.phases.map((row) => row.questId)).toEqual([
      questId,
      420003,
    ]);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding!.addedQuestIds).toContain(questId);
    const selected = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === questId),
    );
    const native = campaignNativeInstructions(funded, input.sources);
    expect(native(selected[0]!)!.directives.map((row) => [row.tag, row.arguments])).toContainEqual([
      ".isNotOnQuest",
      "420002",
    ]);
    for (const leaderClass of ["warrior", "priest", "mage", "rogue", "warlock"] as const) {
      const addon = compileCampaignAddon({ ...funded, leaderClass }, funded.actions, {
        version: "0.2.0-review.group-method",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        nativeSources: input.sources,
      });
      expect(addon.lua).toContain(".turnin 420002");
      expect(addon.lua).toContain(".isOnQuest 420002");
      expect(addon.lua).toContain(".isQuestComplete 420002");
      expect(addon.lua).not.toContain(".accept 420003");
      expect(addon.lua).not.toContain(".abandon 420002");
      expect(addon.lua).not.toContain("Cast Fear");
    }
    expect(input).toEqual(original);
  });

  it.each(["before", "during", "conditional", "other-quest"] as const)(
    "qualifies a pre-pickup collection reset only when safe: %s",
    (mode) => {
      const input = fixture(),
        source = input.sources[0]!;
      const reset =
        mode === "conditional"
          ? "step\n.abandon 420002\n.isQuestComplete 999999"
          : mode === "other-quest"
            ? "step\n.abandon 420002\n.abandon 999999"
            : "step\n.abandon 420002";
      const stages = [
        "step\n.goto Elwynn Forest,50,50\n.accept 420002\n.target Patrol Captain",
        "step\n.goto Elwynn Forest,51,51\n.complete 420002,1 >>Spider Gland (1)\n>>Kill Forest Spiders and loot a Spider Gland\n.mob Forest Spider",
        "step\n.goto Elwynn Forest,50,50\n.turnin 420002\n.target Patrol Captain",
      ];
      stages.splice(mode === "during" ? 1 : 0, 0, reset);
      input.sources = [
        {
          ...source,
          guide: parseGuideChapter(stages.join("\n"), source.reference.id, "f".repeat(64), 70205),
        },
      ];
      const before = structuredClone(input);
      expect(qualify(input).has(questId)).toBe(mode === "before");
      if (mode === "before") {
        expect(batch(input)?.requiredKills).toBe(1);
        const funded = fundCampaignQuestGaps(
          input.plan,
          input.sources,
          input.combat,
          input.catalog,
        );
        expect(funded.questFunding?.addedQuestIds).toContain(questId);
        const addon = compileCampaignAddon(funded, funded.actions, {
          version: "0.2.0-review.fresh-collection",
          runtimeBuild: 70450,
          interfaceVersion: 16001,
          restedXpVersion: "v4.11.27",
          nativeSources: input.sources,
        });
        expect(addon.lua).toContain(".turnin 420002");
        expect(addon.lua).not.toContain(".abandon 420002");
      }
      expect(input).toEqual(before);
    },
  );

  function suppliedFixture(): ReturnType<typeof fixture> {
    const input = fixture();
    input.catalog.quests[0]!.providedItem = { itemId: 957, name: "Sealed Orders" };
    input.catalog.quests[0]!.unsupportedRequirements = ["provided-item-interaction"];
    input.combat.quests[0]!.objectiveText = [
      "Find the Spider Gland and return to Patrol Captain in Goldshire with Sealed Orders.",
    ];
    return input;
  }

  it("keeps a passive pickup item separate from the complete acquired-item quota", () => {
    const input = suppliedFixture(),
      before = structuredClone(input);
    const qualified = qualify(input).get(questId);
    expect(qualified?.expectedKills).toBe(1);
    expect(qualified?.actions.map((action) => action.questChanges[0]?.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(batch(input)?.questIds).toEqual([questId]);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toContain(questId);
    const baselineInput = fixture();
    const baseline = fundCampaignQuestGaps(
      baselineInput.plan,
      baselineInput.sources,
      baselineInput.combat,
      baselineInput.catalog,
    );
    const actual = forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members;
    const expected = forecastCampaignGuide(baseline, emptyPremadeProgress()).sections[0]!.forecast
      .members;
    for (let i = 0; i < 5; i++) {
      expect(actual[i]!.endpoint).toEqual(expected[i]!.endpoint);
      expect(actual[i]!.combatXp).toBe(expected[i]!.combatXp);
      expect(actual[i]!.rewards.filter((reward) => reward.questId === questId)).toHaveLength(1);
    }
    expect(
      funded
        .combat!.activities.flatMap((activity) => activity.objectives)
        .filter((objective) => objective.questId === questId)
        .map((objective) => objective.loot?.itemId),
    ).toEqual([725]);
    expect(
      funded.actions
        .find((action) =>
          action.questChanges.some(
            (change) => change.questId === questId && change.state === "accepted",
          ),
        )
        ?.instructions.join(" "),
    ).toContain("Sealed Orders");
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.supplied-collection",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).toContain(`.complete ${questId},1`);
    expect(artifact.lua).not.toContain(".collect 957");
    expect(artifact.lua).not.toContain(".use 957");
    expect(input).toEqual(before);
  });

  it.each([
    "wrong-gift",
    "same-item",
    "unknown-recipient",
    "extra-work",
    "use",
    "collect-gift",
    "collect-other-item",
    "other-requirement",
    "class",
    "start-item",
    "missing-item-name",
    "wrong-source-npc",
  ] as const)("holds an unproven supplied-item collection: %s", (reason) => {
    const input = suppliedFixture();
    const quest = input.catalog.quests[0]!,
      reference = input.combat.quests[0]!;
    if (reason === "wrong-gift") quest.providedItem!.name = "Other Orders";
    if (reason === "same-item") quest.providedItem!.itemId = 725;
    if (reason === "unknown-recipient")
      reference.objectiveText = [
        "Find the Spider Gland and return to Unknown in Goldshire with Sealed Orders.",
      ];
    if (reason === "extra-work")
      reference.objectiveText = [
        "Find the Spider Gland and return to Patrol Captain in Goldshire with Sealed Orders. Use the key first.",
      ];
    if (reason === "use")
      input.sources[0]!.guide.steps[0]!.directives.push({
        tag: ".use",
        arguments: "957",
        sourceLine: 1,
        text: "",
        condition: "",
        questId: null,
        position: null,
      });
    if (reason === "collect-gift")
      input.sources[0]!.guide.steps[0]!.directives.unshift({
        tag: ".collect",
        arguments: `957,1,${questId},0`,
        sourceLine: 1,
        text: "",
        condition: "",
        questId: null,
        position: null,
      });
    if (reason === "collect-other-item")
      input.sources[0]!.guide.steps[0]!.directives.unshift({
        tag: ".collect",
        arguments: `958,1,${questId},0`,
        sourceLine: 1,
        text: "",
        condition: "",
        questId: null,
        position: null,
      });
    if (reason === "other-requirement") quest.unsupportedRequirements.push("requiredSkill");
    if (reason === "class") quest.requiredClasses = 8;
    if (reason === "start-item") reference.startItem = { itemId: 957, name: "Sealed Orders" };
    if (reason === "missing-item-name") delete reference.itemObjectives![0]!.itemName;
    if (reason === "wrong-source-npc")
      input.sources[0]!.guide.steps[0]!.directives.find((row) => row.tag === ".target")!.arguments =
        "Unknown";
    expect(qualify(input).has(questId)).toBe(false);
    expect(batch(input)).toBeNull();
    expect(
      fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).not.toContain(questId);
  });

  it("retains the shared party policy and full loot cost when a passive item is supplied", () => {
    const input = suppliedFixture();
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [questId],
      partyPolicy: {
        revision: "five-player-kill-first-20261102-v9",
        partySize: 5,
        decisions: [],
        unresolvedPrerequisiteIds: [],
      },
    };
    const before = structuredClone(input);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toContain(questId);
    expect(
      funded.partyPolicy?.decisions.find((decision) => decision.questId === questId),
    ).toMatchObject({
      objective: "collection",
      included: true,
      lootCost: { eligible: true, expectedKills: 1 },
    });
    expect(input).toEqual(before);
  });

  it.each([
    "obtain a key",
    "retrieve a scroll",
    "deliver a note",
    "bring a key",
    "give a note",
    "gather ore",
    "destroy a camp",
    "activate a shrine",
    "escort a scout",
    "protect a scout",
    "summon a spirit",
    "speak to a guide",
    "talk to a guard",
    "ask a guard",
    "report to a guard",
    "open a chest",
    "click a flag",
    "interact with a shrine",
    "where you must open a chest",
  ])("rejects additional work embedded in the location clause: %s", (work) => {
    const input = suppliedFixture();
    input.combat.quests[0]!.objectiveText = [
      `Find the Spider Gland and return to Patrol Captain in Goldshire ${work} with Sealed Orders.`,
    ];
    expect(qualify(input).has(questId)).toBe(false);
    expect(batch(input)).toBeNull();
  });

  it("records the full cost of a newly funded collection absent from the original policy", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      partyPolicy: {
        revision: "five-player-kill-first-20261102-v9",
        partySize: 5,
        decisions: [],
        unresolvedPrerequisiteIds: [],
      },
    };
    const before = structuredClone(input);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toContain(questId);
    expect(
      funded.partyPolicy?.decisions.filter((decision) => decision.questId === questId),
    ).toEqual([
      expect.objectContaining({
        questId,
        objective: "collection",
        included: true,
        lootCost: expect.objectContaining({ eligible: true, expectedKills: 1 }),
      }),
    ]);
    expect(input).toEqual(before);
  });

  it("honors slow-camp feedback for Patrolling Westfall even when its captured drop is otherwise eligible", () => {
    const input = fixture(102);
    input.plan = { ...input.plan, sharedQuestsOnly: true };
    const before = structuredClone(input);
    expect(qualify(input).get(102)).toMatchObject({ npcId: 114, expectedKills: 1 });
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).not.toContain(102);
    expect(
      funded.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).not.toContain(102);
    expect(input).toEqual(before);
  });

  it("qualifies a captured ordinary collection from a compatible class-recommended chapter", () => {
    const input = fixture();
    input.plan = { ...input.plan, sharedQuestsOnly: true, sharedSourceQuestIds: [questId] };
    input.sources = input.sources.map((source) => ({
      ...source,
      reference: {
        ...source.reference,
        condition: "Alliance !Hunter",
        defaults: ["Human Warrior"],
      },
    }));
    const before = structuredClone(input);
    expect(qualify(input).get(questId)).toMatchObject({
      npcId: 114,
      expectedKills: 1,
      slowKills: 1,
    });
    const actions = batch(input)!.actions;
    expect(actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    const native = campaignNativeInstructions(input.plan, input.sources);
    expect(actions.every((action) => native(action) !== null)).toBe(true);
    expect(input).toEqual(before);
  });

  it("keeps a conditional chapter XP restriction in shared collection funding", () => {
    const input = fixture();
    input.plan = { ...input.plan, sharedQuestsOnly: true, sharedSourceQuestIds: [questId] };
    input.sources = input.sources.map((source) => ({
      ...source,
      reference: {
        ...source.reference,
        condition: "Alliance Hunter/Alliance Priest",
        defaults: [],
        xpRates: [{ value: ">1.5", condition: "Hunter" }],
      },
    }));
    expect(qualify(input).size).toBe(0);
  });

  it.each([
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
    [0, 2, 1],
    [1, 0, 2],
    [2, 1, 0],
  ])("orders a simple captured lifecycle by quest phase: %i, %i, %i", (first, second, third) => {
    const input = fixture();
    const source = input.sources[0]!;
    const phases = [
      ".goto Elwynn Forest,50,50\n.accept 420002 >>Accept Spider Trophy\n.target Patrol Captain",
      ".goto Elwynn Forest,51,51\n.isOnQuest 420002\n.complete 420002,1 >>Spider Gland (1)\n>>Kill Forest Spiders and loot a Spider Gland\n.mob Forest Spider",
      ".goto Elwynn Forest,50,50\n.isQuestComplete 420002\n.turnin 420002 >>Turn in Spider Trophy\n.target Patrol Captain",
    ];
    const order = [first, second, third];
    input.sources = [
      {
        ...source,
        guide: parseGuideChapter(
          "step\n" + order.map((index) => phases[index]!).join("\nstep\n"),
          source.reference.id,
          "f".repeat(64),
          70205,
        ),
      },
    ];
    const before = structuredClone(input);
    const selected = qualify(input).get(questId);
    expect(selected).toMatchObject({ npcId: 114, expectedKills: 1, slowKills: 1 });
    expect(selected!.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    for (const [index, action] of selected!.actions.entries()) {
      expect(action.source!.stepId).toBe(input.sources[0]!.guide.steps[order.indexOf(index)]!.id);
    }
    const native = campaignNativeInstructions(input.plan, input.sources);
    expect(native(selected!.actions[1]!)!.directives).toContainEqual(
      expect.objectContaining({ tag: ".isOnQuest", arguments: "420002" }),
    );
    expect(native(selected!.actions[2]!)!.directives).toContainEqual(
      expect.objectContaining({ tag: ".isQuestComplete", arguments: "420002" }),
    );
    const funded = batch(input)!;
    expect(funded.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(funded.actions[1]!.positions).toEqual(selected!.actions[1]!.positions);
    expect(input).toEqual(before);
  });

  it.each([".isOnQuest 999999", ".use 123", ".isQuestTurnedIn 420002"])(
    "keeps an unsupported method held after phase ordering: %s",
    (guard) => {
      const input = fixture();
      const source = input.sources[0]!;
      input.sources = [
        {
          ...source,
          guide: parseGuideChapter(
            [
              "step",
              ".goto Elwynn Forest,51,51",
              guard,
              ".complete 420002,1 >>Spider Gland (1)",
              ">>Kill Forest Spiders and loot a Spider Gland",
              ".mob Forest Spider",
              "step",
              ".goto Elwynn Forest,50,50",
              ".turnin 420002",
              "step",
              ".goto Elwynn Forest,50,50",
              ".accept 420002",
            ].join("\n"),
            source.reference.id,
            "f".repeat(64),
            70205,
          ),
        },
      ];
      expect(qualify(input).size).toBe(0);
    },
  );

  it("uses a complete captured object handoff when the catalog has no NPC givers", () => {
    const input = fixture();
    const source = input.sources[0]!;
    input.sources = [
      {
        ...source,
        guide: parseGuideChapter(
          "step\n.goto 1429,50,50\n>>Click the Patrol Board\n.accept 420002\nstep\n.goto 1429,51,51\n>>Kill Forest Spiders and loot a Spider Gland\n.complete 420002,1 >>Spider Gland (1)\n.mob Forest Spider\nstep\n.goto 1429,50,50\n>>Click the Return Box\n.turnin 420002",
          source.reference.id,
          "f".repeat(64),
          70205,
        ),
      },
    ];
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({ ...quest, starts: [], ends: [] })),
    };
    const before = structuredClone(input);
    expect(qualify(input).get(questId)).toMatchObject({ npcId: 114, expectedKills: 1 });
    expect(batch(input)?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    const hostile = {
      ...input,
      catalog: {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          starts: [{ ...giver, friendlyToAlliance: false }],
        })),
      },
    };
    expect(qualify(hostile).size).toBe(0);
    expect(input).toEqual(before);
  });

  it("prefers a lower-level eligible camp across separate captured collection programs", () => {
    const input = fixture(), source = input.sources[0]!;
    input.plan = { ...input.plan, sharedQuestsOnly: true };
    const body = [
      "step", ".goto 1429,50,50", `.accept ${questId}`, ".target Patrol Captain",
      "step", ".goto 1429,51,51", ">>Kill Forest Spiders and loot Spider Glands",
      `.complete ${questId},1 >>Spider Gland (1)`, ".mob Forest Spider",
      "step", ".goto 1429,60,60", ">>Kill Meadow Spiders and loot Spider Glands",
      `.complete ${questId},1 >>Spider Gland (1)`, ".mob Meadow Spider",
      "step", ".goto 1429,50,50", `.turnin ${questId}`, ".target Patrol Captain",
    ].join("\n");
    input.sources = [{ ...source, guide: parseGuideChapter(body, source.reference.id, "f".repeat(64), 70205) }];
    input.combat = { ...input.combat,
      npcs: [...input.combat.npcs, { ...input.combat.npcs[0]!, id: 115, name: "Meadow Spider",
        minimumLevel: 5, maximumLevel: 6 }],
      quests: input.combat.quests.map((quest) => ({ ...quest, itemCreatureIds: [114, 115],
        itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, npcIds: [114, 115],
          quantity: 1, sharing: "pooled" })),
      })),
      lootDrops: [0.5, 1].map((probability, index) => ({ ...input.combat.lootDrops![0]!,
        npcId: 114 + index, probability, probabilityReference: {
          ...input.combat.lootDrops![0]!.probabilityReference!, npcId: 114 + index, lootEntry: 114 + index,
        },
      })),
    };
    const before = structuredClone(input), selected = qualify(input).get(questId)!;
    expect(selected).toMatchObject({ npcId: 114, expectedKills: 10, maximumEnemyLevel: 2 });
    expect(selected.actions[1]!.source?.stepId).toBe("source-step-0002");
    expect(input).toEqual(before);
  });

  it("chooses a cheaper captured collection program at equal creature levels and exports its full quota", () => {
    const input = fixture(),
      source = input.sources[0]!;
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      partyPolicy: {
        revision: "five-player-kill-first-20261102-v9",
        partySize: 5,
        unresolvedPrerequisiteIds: [],
        decisions: [
          {
            questId,
            objective: "collection",
            included: false,
            requiredFor: [],
            lootCost: null,
            reason: "The first camp exceeds the collection budget.",
          },
        ],
      },
    };
    const body =
      "step\n.goto 1429,50,50\n.accept 420002\n.target Patrol Captain\nstep\n.goto 1429,51,51\n>>Kill Forest Spiders and loot their Spider Glands\n.complete 420002,1 >>Spider Gland (2)\n.mob Forest Spider\nstep\n.goto 1429,60,60\n>>Kill Forest Spiders and Meadow Spiders and loot their Spider Glands\n.complete 420002,1 >>Spider Gland (2)\n.mob Forest Spider\n.mob Meadow Spider\nstep\n.goto 1429,50,50\n.turnin 420002\n.target Patrol Captain";
    input.sources = [
      { ...source, guide: parseGuideChapter(body, source.reference.id, "f".repeat(64), 70205) },
    ];
    input.combat = {
      ...input.combat,
      npcs: [...input.combat.npcs, { ...input.combat.npcs[0]!, id: 115, name: "Meadow Spider" }],
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        itemCreatureIds: [114, 115],
        itemObjectives: quest.itemObjectives!.map((item) => ({
          ...item,
          npcIds: [114, 115],
          quantity: 2,
          sharing: "pooled",
        })),
      })),
      lootDrops: [0.05, 0.5].map((probability, index) => ({
        ...input.combat.lootDrops![0]!,
        npcId: 114 + index,
        probability,
        probabilityReference: {
          ...input.combat.lootDrops![0]!.probabilityReference!,
          npcId: 114 + index,
          lootEntry: 114 + index,
        },
      })),
    };
    const before = structuredClone(input),
      choice = qualify(input).get(questId)!;
    expect(choice).toMatchObject({ npcId: 115, expectedKills: 20, retainedByDropRate: true });
    expect(choice.actions[1]!.source?.stepId).toBe("source-step-0003");
    expect(choice.actions[1]!.positions[0]!.position).toMatchObject({ x: 60, y: 60 });
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    const completion = funded.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === questId && change.state === "objectives-complete",
      ),
    )!;
    expect(completion.referenceCreatureTargets).toEqual([{ npcId: 115, name: "Meadow Spider" }]);
    expect(
      funded.partyPolicy?.decisions.find((decision) => decision.questId === questId),
    ).toMatchObject({ included: true, lootCost: { expectedKills: 20 } });
    const native = campaignNativeInstructions(funded, input.sources)(completion)!;
    expect(
      native.directives.filter((row) => row.tag === ".mob").map((row) => row.arguments),
    ).toEqual(["Meadow Spider"]);
    expect(native.directives.find((row) => row.tag === ".complete")?.text).toBe("Spider Gland (2)");
    for (const variant of [
      body.replace(".goto 1429,60,60", ".goto 1429,60,60\n.isOnQuest 999999"),
      body.replace(".goto 1429,60,60", ".goto 1429,60,60\n.use 123"),
      body.replace(".goto 1429,60,60\n", ""),
    ]) {
      expect(
        qualify({
          ...input,
          sources: [
            {
              ...source,
              guide: parseGuideChapter(variant, source.reference.id, "f".repeat(64), 70205),
            },
          ],
        }).size,
      ).toBe(0);
    }
    expect(input).toEqual(before);
  });
  it("carries a captured high-drop collection through the chain budget without shrinking its item requirement", () => {
    const input = fixture();
    input.plan = { ...input.plan, sharedQuestsOnly: true };
    const source = input.sources[0]!;
    input.sources = [
      {
        ...source,
        guide: parseGuideChapter(
          "step\n.goto Elwynn Forest,50,50\n.accept 420002\nstep\n.goto Elwynn Forest,51,51\n.complete 420002,1 >>Spider Gland (12)\n.mob Forest Spider\nstep\n.goto Elwynn Forest,50,50\n.turnin 420002",
          source.reference.id,
          "f".repeat(64),
          70205,
        ),
      },
    ];
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        itemObjectives: quest.itemObjectives!.map((item) => ({
          ...item,
          quantity: 12,
          sharing: "pooled",
        })),
      })),
      lootDrops: input.combat.lootDrops!.map((drop) => ({ ...drop, probability: 0.4 })),
    };
    const before = structuredClone(input);
    expect(qualify(input).get(questId)).toMatchObject({
      expectedKills: 150,
      retainedByDropRate: true,
    });
    const selected = batch(input);
    expect(selected?.requiredKills).toBe(150);
    expect(selected?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(selected?.actions[1]!.instructions.join(" ")).toContain("Spider Gland (12)");
    expect(input).toEqual(before);
  });
  it.each(["optional", "hidden"] as const)(
    "qualifies %s cleanup only after the complete source lifecycle without exporting abandonment",
    (mode) => {
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
          mode === "optional" ? "#optional" : "#hidewindow",
          "#season 0",
          mode === "optional" ? "#completewith NextTown" : "#completewith next",
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
    },
  );

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

  it.each([false, true])("moves a projected carried collection without restarting its pickup (mixed NPC visit: %s)", (mixedPickup) => {
    const input = carriedCollectionFixture(mixedPickup);
    const method = qualify(input).get(questId)!;
    const [pickup, ...remaining] = method.actions;
    const gate = input.plan.actions.find((action) => action.id === "gate")!;
    const before = structuredClone(input);
    const initial = forecastCampaignGuide(input.plan, emptyPremadeProgress());
    expect(initial.sections.flatMap((section) => section.forecast.members)
      .flatMap((member) => member.checkpoints))
      .toContainEqual(expect.objectContaining({ actionId: gate.id, ready: false }));
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    const gateIndex = funded.actions.findIndex((action) => action.id === gate.id);
    for (const action of remaining) {
      expect(funded.actions.findIndex((entry) => entry.id === action.id)).toBeLessThan(gateIndex);
      expect(funded.actions.find((entry) => entry.id === action.id)).toEqual({
        ...action, legId: gate.legId,
      });
    }
    expect(funded.actions.find((action) => action.id === pickup!.id))
      .toEqual(input.plan.actions.find((action) => action.id === pickup!.id));
    expect(funded.actions.flatMap((action) => action.questChanges)
      .filter((change) => change.questId === questId && change.state === "accepted")).toHaveLength(1);
    const forecast = forecastCampaignGuide(funded, emptyPremadeProgress());
    for (let player = 0; player < 5; player++) {
      const rows = forecast.sections.map((section) => section.forecast.members[player]!);
      expect(rows.every((member) => member.blockedAtActionId === null)).toBe(true);
      expect(rows.flatMap((member) => member.rewards)
        .filter((reward) => reward.questId === questId)).toHaveLength(1);
      expect(rows.at(-1)!.knownEndpoint!.level).toBeGreaterThanOrEqual(3);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.carried-collection", runtimeBuild: 70450,
      interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: input.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      for (const tag of ["accept", "complete", "turnin"])
        expect([...text.matchAll(new RegExp(`\\.${tag} ${questId}\\b`, "g"))]).toHaveLength(1);
    }
    expect(input).toEqual(before);
  });

  it.each(["not-shared", "held-before-projection", "partial-party", "unsafe-level", "source-change",
    "missing-reward", "mixed-quest", "personal", "dungeon", "inactive-phase", "protected"] as const)(
    "does not continue an unproved source lifecycle: %s", (reason) => {
      const input = carriedCollectionFixture();
      const gate = input.plan.actions.find((action) => action.id === "gate")!;
      const collections = qualify(input);
      const state = campaignFundingStates(input.plan)[0]!;
      let plan = input.plan, scenario = state, methods = collections, minimum = 0;
      const completion = plan.actions[3]!;
      if (reason === "not-shared") {
        const { sharedQuestsOnly, ...ordinary } = plan;
        expect(sharedQuestsOnly).toBe(true);
        plan = ordinary;
      }
      if (reason === "held-before-projection") scenario = { ...state,
        progress: { ...state.progress, members: state.progress.members.map((member) => ({
          ...member, questStates: { [questId]: "accepted" },
        })) },
        forecast: state.forecast.map((section) => ({ ...section, members: section.members.map((member) => ({
          ...member, steps: member.steps.filter((step) => !(step.questId === questId && step.phase === "accepted")),
        })) })),
      };
      if (reason === "partial-party") scenario = { ...state,
        progress: { ...state.progress, members: state.progress.members.slice(0, 4) } };
      if (reason === "unsafe-level") methods = new Map([...collections].map(([id, method]) =>
        [id, { ...method, maximumEnemyLevel: 10 }]));
      if (reason === "source-change") plan = { ...plan, actions: plan.actions.map((action) =>
        action.id === completion.id ? { ...action, source: { ...action.source!, stepId: "another-step" } } : action) };
      if (reason === "missing-reward") plan = { ...plan, actions: plan.actions.slice(0, -1) };
      if (reason === "mixed-quest") plan = { ...plan, actions: plan.actions.map((action) =>
        action.id === completion.id ? { ...action, questChanges: [...action.questChanges,
          { ...action.questChanges[0]!, questId: 999999 }] } : action) };
      if (reason === "personal") plan = { ...plan, actions: plan.actions.map((action) =>
        action.id === completion.id ? { ...action, leaderOnly: true } : action) };
      if (reason === "dungeon") plan = { ...plan, legs: plan.legs.map((leg) =>
        leg.id === "later" ? { ...leg, kind: "dungeon" } : leg) };
      if (reason === "inactive-phase") scenario = { ...state,
        actions: state.actions.filter((action) => action.id !== completion.id) };
      if (reason === "protected") minimum = plan.actions.indexOf(gate) + 1;
      expect([...campaignCollectionContinuations(plan, gate, scenario, methods, minimum)]).toEqual([]);
    },
  );

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
    input.plan = { ...input.plan, sharedQuestsOnly: true };
    expect(batch(input)?.requiredKills).toBe(30);
    input.combat = { ...input.combat,
      lootDrops: input.combat.lootDrops!.map((drop) => ({ ...drop, probability: 0.25,
        probabilityReference: { ...drop.probabilityReference!, probability: 0.25 },
      })),
    };
    const larger = qualify(input);
    expect(larger.get(questId)?.expectedKills).toBe(60);
    expect(larger.get(parentId)?.expectedKills).toBe(60);
    expect(batch(input)).toBeNull();
  });
});
