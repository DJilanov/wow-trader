import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import { npcDeliveryFundingCatalog } from "./campaign-funding-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";

const position = { zone: "1429", x: 50, y: 50 };
const recipient = {
  npcId: 235,
  name: "Archivist",
  friendlyToAlliance: true,
  positions: [{ ...position, x: 52 }],
};

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const quest: QuestCatalogEntry = {
    questId: 320002,
    title: "Report to the archive",
    minimumLevel: 1,
    questLevel: 30,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [{ ...recipient, npcId: 234, name: "Messenger", positions: [position] }],
    ends: [
      { ...recipient, npcId: 236, name: "Merchant", positions: [{ ...position, x: 50.1 }] },
      recipient,
    ],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["unresolved-objective-text"],
  };
  const first: CampaignAction = {
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
      questId: 320001,
      title: "First message",
      state,
      objectiveIndex: null,
    })),
  };
  const gate: CampaignAction = {
    ...first,
    id: "gate",
    kind: "xp-check",
    targetLevel: 3,
    questChanges: [],
  };
  return {
    plan: {
      release: "npc-delivery-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [first, gate],
      legs: [
        {
          id: "prepare",
          title: "Elwynn Forest",
          kind: "preparation",
          from: 1,
          to: 3,
          stopId: null,
          actionIds: [first.id, gate.id],
          questIds: [320001],
          unresolvedQuestIds: [],
        },
      ],
      rewardFacts: [400, 1000].map((fullXp, index) => ({
        questId: 320001 + index,
        fullXp,
        questLevel: index === 0 ? 3 : 30,
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
      quests: [quest],
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
      quests: [
        {
          questId: 320002,
          creatureIds: [],
          itemCreatureIds: [],
          onlyCreatureObjectives: false,
          objectiveText: ["Report to Archivist in Goldshire."],
        },
      ],
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
    },
  };
}
function view(input: ReturnType<typeof fixture>): QuestCatalog {
  return npcDeliveryFundingCatalog(input.catalog, input.combat, new Set());
}

describe("verified zero-item NPC deliveries", () => {
  it.each(["Speak with", "Speak to", "Talk to", "Return to", "Report to"])(
    "accepts the exact single %s objective and its actual recipient",
    (prefix) => {
      const input = fixture();
      input.combat.quests[0]!.objectiveText = [`${prefix} Archivist at the eastern Elwynn bridge.`];
      const before = JSON.stringify(input);
      const resolved = view(input);
      expect(resolved.quests[0]!.ends).toEqual([recipient]);
      expect(resolved.quests[0]!.unsupportedRequirements).toEqual([]);
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it("counts every player's hand-in once without inventing an item or treating the reward level as combat difficulty", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const actions = funded.actions.filter((a) => a.libraryQuestId === 320002);
    expect(actions.map((a) => a.questChanges[0]!.state)).toEqual(["accepted", "rewarded"]);
    expect(actions[1]!.instructions).toContain(
      "Talk to Archivist in Elwynn Forest. Turn in Report to the archive.",
    );
    expect(actions[1]!.positions[0]!.position).toMatchObject({ x: 52, y: 50 });
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((r) => r.questId === 320002)).toHaveLength(1);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.npc",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(addon.lua).toContain(".accept 320002");
    expect(addon.lua).toContain(".turnin 320002");
    expect(addon.lua).not.toContain(".complete 320002");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the difficulty exemption opt-in, checks the real pickup minimum and counts the return", () => {
    const input = fixture(),
      catalog = view(input),
      quest = catalog.quests[0]!,
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
      previous: position,
      resumePosition: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    };
    expect(campaignFundingBatch(quest, catalog, input.combat, progress, options)).toBeNull();
    const batch = campaignFundingBatch(quest, catalog, input.combat, progress, {
      ...options,
      includeNpcDeliveries: true,
    });
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.travelCost).toBeCloseTo(0.04);
    const higher = { ...quest, minimumLevel: 3 };
    expect(
      campaignFundingBatch(higher, { ...catalog, quests: [higher] }, input.combat, progress, {
        ...options,
        includeNpcDeliveries: true,
      }),
    ).toBeNull();
  });

  it.each([
    "Speak with Unknown in Goldshire.",
    "Speak with Archivist in Goldshire and return to Messenger.",
    "Speak with Archivist in Goldshire, then use the key.",
    "Speak with Archivist after killing the guardian.",
    "Find Archivist in Goldshire.",
    "Speak with Archivist. Collect 3 records.",
  ])("holds extra work, unknown recipients or incomplete objectives: %s", (text) => {
    const input = fixture();
    input.combat.quests[0]!.objectiveText = [text];
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "quantity",
    "provided",
    "creatures",
    "item-creatures",
    "conflict",
    "missing-text",
    "second-objective",
    "quest-identity",
  ] as const)("holds incompatible objective evidence: %s", (reason) => {
    const input = fixture();
    const q = input.combat.quests[0]!;
    input.combat = {
      ...input.combat,
      quests: [
        {
          ...q,
          ...(reason === "quantity"
            ? {
                itemObjectives: [
                  {
                    itemId: 10,
                    itemName: "Records",
                    quantity: 1,
                    objectiveIndex: 1,
                    npcIds: [],
                    sharing: "pooled" as const,
                  },
                ],
              }
            : {}),
          ...(reason === "creatures" ? { creatureIds: [10] } : {}),
          ...(reason === "item-creatures" ? { itemCreatureIds: [10] } : {}),
          ...(reason === "conflict" ? { killQuotaConflicts: [1] } : {}),
          ...(reason === "missing-text" ? { objectiveText: [] } : {}),
          ...(reason === "second-objective"
            ? { objectiveText: [...q.objectiveText, "Return to Messenger."] }
            : {}),
          ...(reason === "quest-identity" ? { questId: 320003 } : {}),
        },
      ],
    };
    if (reason === "provided")
      input.catalog.quests[0]!.providedItem = { itemId: 10, name: "Records" };
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "provided-item-interaction",
    "source-completion-objective",
    "requiredMinRep",
    "requiredSkill",
    "repeatable",
    "exploration-trigger",
  ])("does not clear another held requirement: %s", (requirement) => {
    const input = fixture();
    input.catalog.quests[0]!.unsupportedRequirements.push(requirement);
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "class",
    "race",
    "reward",
    "prerequisite",
    "exclusive",
    "hostile",
    "unlocated",
  ] as const)("does not fund an ineligible conversation: %s", (reason) => {
    const input = fixture(),
      q = input.catalog.quests[0]!;
    if (reason === "class") q.requiredClasses = 8;
    if (reason === "race") q.requiredRaces = 2;
    if (reason === "prerequisite") q.prerequisites = { allOf: [999], anyOf: [] };
    if (reason === "exclusive") {
      q.exclusiveWith = [320001];
    }
    if (reason === "hostile") q.ends = q.ends.map((g) => ({ ...g, friendlyToAlliance: false }));
    if (reason === "unlocated") q.ends = q.ends.map((g) => ({ ...g, positions: [] }));
    if (reason === "reward")
      input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(0, 1) };
    expect(
      fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
  });

  it("preserves selected source visits and rejects mismatched input provenance", () => {
    const input = fixture();
    expect(npcDeliveryFundingCatalog(input.catalog, input.combat, new Set([320002]))).toBe(
      input.catalog,
    );
    for (const field of [
      "targetBuild",
      "providerRevision",
      "questSha256",
      "npcSha256",
      "itemSha256",
    ] as const) {
      const catalog = {
        ...input.catalog,
        ...(field === "targetBuild"
          ? { targetBuild: 70450 }
          : { [field]: field === "providerRevision" ? "0".repeat(40) : "0".repeat(64) }),
      };
      expect(npcDeliveryFundingCatalog(catalog, input.combat, new Set())).toBe(catalog);
    }
  });

  it("does not exempt a combat prerequisite from its actual difficulty limit", () => {
    const input = fixture();
    input.catalog.quests[0]!.prerequisites = { allOf: [320003], anyOf: [] };
    const patrol: QuestCatalogEntry = {
      ...input.catalog.quests[0]!,
      questId: 320003,
      groundPickup: undefined,
      category: "shared-kills",
      unsupportedRequirements: [],
      prerequisites: { allOf: [], anyOf: [] },
      objectives: [{ index: 1, npcId: 10, count: 5, positions: [position] }],
    };
    input.catalog.quests.push(patrol);
    input.combat.npcs.push({
      id: 10,
      name: "Guardian",
      minimumLevel: 30,
      maximumLevel: 30,
      rank: 0,
      zoneIds: [12],
      xpEligibility: "assumed",
    });
    input.combat.quests.push({
      questId: 320003,
      creatureIds: [10],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: ["Kill 5 Guardians."],
    });
    const catalog = view(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((m) => ({
      ...m,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignFundingBatch(catalog.quests[0]!, catalog, input.combat, progress, {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
        includeNpcDeliveries: true,
      }),
    ).toBeNull();
  });

  it("binds the literal recipient name even when it contains regular-expression characters", () => {
    const input = fixture();
    const name = "Archivist (Senior)";
    input.catalog.quests[0]!.ends = [{ ...recipient, name }];
    input.combat.quests[0]!.objectiveText = [`Speak with ${name} in Goldshire.`];
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([
      { ...recipient, name },
    ]);
  });
});
