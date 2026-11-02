import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { providedDeliveryFundingCatalog } from "./campaign-funding-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";

const position = { zone: "1429", x: 50, y: 50 };
const origin = {
  npcId: 234,
  name: "Town Messenger",
  friendlyToAlliance: true,
  positions: [position],
};
const recipient = {
  npcId: 235,
  name: "Archivist",
  friendlyToAlliance: true,
  positions: [{ ...position, x: 52 }],
};

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const parcel: QuestCatalogEntry = {
    questId: 310002,
    title: "Deliver the town records",
    minimumLevel: 1,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    providedItem: { itemId: 957, name: "A Sealed Parcel" },
    starts: [origin],
    ends: [
      { ...origin, npcId: 236, name: "Merchant", positions: [{ ...position, x: 50.1 }] },
      recipient,
    ],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"],
  };
  const base: CampaignAction = {
    id: "first-message",
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
      questId: 310001,
      title: "First message",
      state,
      objectiveIndex: null,
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
  return {
    plan: {
      release: "provided-delivery-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [base, gate, entry],
      legs: [
        {
          id: "prepare",
          title: "Town preparation",
          from: 1,
          to: 3,
          kind: "preparation",
          stopId: null,
          actionIds: [base.id, gate.id],
          questIds: [310001],
          unresolvedQuestIds: [],
        },
        {
          id: "dungeon",
          title: "Dungeon",
          from: 3,
          to: 4,
          kind: "dungeon",
          stopId: null,
          actionIds: [entry.id],
          questIds: [],
          unresolvedQuestIds: [],
        },
      ],
      rewardFacts: [400, 1000].map((fullXp, index) => ({
        questId: 310001 + index,
        fullXp,
        questLevel: 3,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-01T00:00:00.000Z",
      })),
    },
    catalog: {
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic regression fixture",
      providerRevision: "a".repeat(40),
      questSha256: "b".repeat(64),
      npcSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      areaMapSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
      includesAuthoredCorrections: false,
      quests: [parcel],
    },
    combat: {
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
        limitations: ["Synthetic regression fixture"],
      },
      npcs: [],
      quests: [
        {
          questId: 310002,
          creatureIds: [],
          itemCreatureIds: [],
          onlyCreatureObjectives: false,
          objectiveText: ["Bring A Sealed Parcel to Archivist in Goldshire."],
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    },
  };
}

function resolve(input: ReturnType<typeof fixture>): QuestCatalog {
  return providedDeliveryFundingCatalog(input.catalog, input.combat, new Set());
}

describe("provided-item courier funding", () => {
  it("resolves only the proven item requirements and exact recipient without mutating the source catalog", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const view = resolve(input);
    expect(view).not.toBe(input.catalog);
    expect(view.quests[0]!.unsupportedRequirements).toEqual([]);
    expect(view.quests[0]!.ends).toEqual([recipient]);
    expect(input.catalog.quests[0]!.ends[0]!.name).toBe("Merchant");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("distinguishes a conjunction inside the provided item's name from a second task", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        providedItem: { itemId: 735, name: "Rolf and Malakai's Medallions" },
      })),
    };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        objectiveText: [
          "Deliver Rolf and Malakai's Medallions to Archivist at the eastern Elwynn bridge.",
        ],
      })),
    };
    expect(resolve(input).quests[0]!.ends).toEqual([recipient]);
    expect(resolve(input).quests[0]!.unsupportedRequirements).toEqual([]);
  });

  it.each(["him", "her", "them"])(
    "recognizes a return to the named recipient followed by giving %s the exact provided parcel",
    (pronoun) => {
      const input = fixture();
      input.combat = {
        ...input.combat,
        quests: input.combat.quests.map((quest) => ({
          ...quest,
          objectiveText: [`Return to Archivist in Goldshire. Give ${pronoun} A Sealed Parcel.`],
        })),
      };
      const view = resolve(input);
      expect(view.quests[0]!.ends).toEqual([recipient]);
      expect(view.quests[0]!.unsupportedRequirements).toEqual([]);
      expect(view.quests[0]!.providedItem).toBe(input.catalog.quests[0]!.providedItem);
      const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
      expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
      expect(
        funded.actions
          .filter((action) => action.questChanges.some((change) => change.questId === 310002))
          .map((action) => action.questChanges[0]!.state),
      ).toEqual(["accepted", "rewarded"]);
    },
  );

  it.each([
    "Return to Unknown in Goldshire. Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire. Give him another parcel.",
    "Return to Archivist in Goldshire. Give him A Sealed Parcel. Return to Town Messenger.",
    "Return to Archivist in Goldshire and Town Messenger. Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire.",
    "Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire. Give him A Sealed Parcel after killing the guards.",
  ])("holds incomplete or additional work in a return-and-give objective: %s", (text) => {
    const input = fixture();
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({ ...quest, objectiveText: [text] })),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it("funds every player with one parcel hand-in, no collection quota or kill XP, and compiles the real phases", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
    const actions = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 310002),
    );
    expect(actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "rewarded",
    ]);
    expect(actions[1]!.positions[0]!.position).toMatchObject({ zone: "1429", x: 52, y: 50 });
    expect(actions[1]!.instructions).toContain(
      "Deliver A Sealed Parcel, supplied when you accepted the quest, to Archivist.",
    );
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((reward) => reward.questId === 310002)).toHaveLength(1);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.delivery",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(addon.lua).toContain(".accept 310002");
    expect(addon.lua).toContain(".turnin 310002");
    expect(addon.lua).not.toContain(".complete 310002");
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    "targetBuild",
    "providerRevision",
    "questSha256",
    "npcSha256",
    "itemSha256",
    "missing-item-provenance",
  ] as const)("holds a delivery with incompatible provenance: %s", (field) => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      ...(field === "targetBuild"
        ? { targetBuild: 70450 }
        : field === "providerRevision"
          ? { providerRevision: "e".repeat(40) }
          : field === "missing-item-provenance"
            ? { itemSha256: undefined }
            : { [field]: "e".repeat(64) }),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it.each([
    "source-held-pickup",
    "source-completion-objective",
    "unresolved-source-prerequisite",
    "repeatable",
    "requiredSkill",
    "exploration-trigger",
  ])("preserves unresolved requirement: %s", (requirement) => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        unsupportedRequirements: [...quest.unsupportedRequirements, requirement],
      })),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it("holds class/race restrictions, missing item identity, incomplete objectives and hostile recipients", () => {
    for (const reason of [
      "class",
      "race",
      "item",
      "text",
      "combat",
      "hostile",
      "extra-task",
    ] as const) {
      const input = fixture();
      input.catalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          ...(reason === "class" ? { requiredClasses: 1 } : {}),
          ...(reason === "race" ? { requiredRaces: 1 } : {}),
          ...(reason === "item" ? { providedItem: undefined } : {}),
          ...(reason === "hostile"
            ? { ends: quest.ends.map((npc) => ({ ...npc, friendlyToAlliance: false })) }
            : {}),
        })),
      };
      input.combat = {
        ...input.combat,
        quests: input.combat.quests.map((quest) => ({
          ...quest,
          ...(reason === "extra-task"
            ? {
                objectiveText: [
                  "Bring A Sealed Parcel to Archivist in Goldshire and return to Town Messenger.",
                ],
              }
            : {}),
          ...(reason === "text"
            ? { objectiveText: ["Use A Sealed Parcel to summon the Archivist."] }
            : {}),
          ...(reason === "combat" ? { creatureIds: [114] } : {}),
        })),
      };
      expect(resolve(input), reason).toBe(input.catalog);
    }
  });

  it("leaves already-selected source visits under the existing sequencing policy", () => {
    const input = fixture();
    expect(providedDeliveryFundingCatalog(input.catalog, input.combat, new Set([310002]))).toBe(
      input.catalog,
    );
  });

  it("counts the public trip back to the original position and enforces the actual pickup minimum", () => {
    const input = fixture(),
      view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: position,
      resumePosition: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    };
    const batch = campaignFundingBatch(view.quests[0]!, view, input.combat, progress, options);
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.travelCost).toBeCloseTo(0.04);
    expect(batch?.returnTravelCost).toBeCloseTo(0.02);
    const unavailable = { ...view.quests[0]!, minimumLevel: 3 };
    expect(
      campaignFundingBatch(
        unavailable,
        { ...view, quests: [unavailable] },
        input.combat,
        progress,
        options,
      ),
    ).toBeNull();
  });

  it("never invents XP for a missing courier reward", () => {
    const input = fixture();
    input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(0, 1) };
    const result = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(result.questFunding?.addedQuestIds).toEqual([]);
  });

  it("retains a courier prerequisite before an otherwise eligible shared-kill quest", () => {
    const input = fixture();
    const patrol: QuestCatalogEntry = {
      ...input.catalog.quests[0]!,
      questId: 310003,
      title: "Protect the archive",
      providedItem: undefined,
      starts: [recipient],
      ends: [recipient],
      category: "shared-kills",
      unsupportedRequirements: [],
      prerequisites: { allOf: [310002], anyOf: [] },
      objectives: [{ index: 1, npcId: 114, count: 4, positions: [position] }],
    };
    input.catalog = { ...input.catalog, quests: [...input.catalog.quests, patrol] };
    input.combat = {
      ...input.combat,
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
        ...input.combat.quests,
        {
          questId: 310003,
          creatureIds: [114],
          itemCreatureIds: [],
          objectiveText: ["Kill 4 Forest Spiders."],
          onlyCreatureObjectives: true,
        },
      ],
    };
    const view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const batch = campaignFundingBatch(view.quests[1]!, view, input.combat, progress, {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 4,
      previous: position,
      forbiddenQuestIds: new Set(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    });
    expect(batch?.questIds).toEqual([310002, 310003]);
    expect(batch?.requiredKills).toBe(4);
    expect(batch?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "rewarded",
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(batch?.actions[2]?.requiredQuestIds).toEqual([310002]);
  });

  it("does not convert an unfinished collection prerequisite into a ready parcel", () => {
    const input = fixture();
    const parcel = { ...input.catalog.quests[0]!, prerequisites: { allOf: [310003], anyOf: [] } };
    const collection: QuestCatalogEntry = {
      ...parcel,
      questId: 310003,
      title: "Gather supplies",
      category: "unsupported",
      providedItem: undefined,
      unsupportedRequirements: [],
      prerequisites: { allOf: [], anyOf: [] },
    };
    input.catalog = { ...input.catalog, quests: [parcel, collection] };
    const view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignFundingBatch(view.quests[0]!, view, input.combat, progress, {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
      }),
    ).toBeNull();
  });
});
