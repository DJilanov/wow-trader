import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { batchCampaignLocalDeliveries } from "./campaign-local-deliveries.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const town = "early-darkshore-kills";
const later = "late-return";
const position = { zone: "1439", x: 39.37, y: 43.48 };
const giver = { npcId: 3693, name: "Terenthis", friendlyToAlliance: true, positions: [position] };
const recipient = { ...giver, npcId: 3649, name: "Thundris Windweaver" };

function quest(questId: number): QuestCatalogEntry {
  return {
    questId,
    title: questId === 4761 ? "Thundris Windweaver" : "How Big a Threat?",
    minimumLevel: questId === 4761 ? 11 : 10,
    questLevel: questId === 4761 ? 15 : 14,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [giver],
    ends: [questId === 4761 ? recipient : giver],
    prerequisites: { allOf: [], anyOf: questId === 4761 ? [985] : [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["unresolved-objective-text"],
  };
}

function action(id: string, legId: string, zone = "1439"): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    questChanges: [],
    positions: [
      { sourceLine: 0, position: { ...position, zone, floor: null, space: "map-percent" } },
    ],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function fixture(
  level = 11,
  departureZone = "1426",
): {
  readonly plan: CampaignPlan;
  readonly catalog: QuestCatalog;
  readonly combat: CombatDataset;
} {
  const actions: CampaignAction[] = [
    {
      ...action("prior-work", town),
      kind: "quests",
      questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
        questId: 300001,
        title: "Prior work",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      })),
    },
    {
      ...action("town-return", town),
      kind: "quests",
      source: { chapterId: "test", version: "test", stepId: "town-return" },
      questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
        questId: 985,
        title: "How Big a Threat?",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      })),
    },
    action("required-departure", later, departureZone),
    ...(["accepted", "rewarded"] as const).map((state): CampaignAction => ({
      ...action(state, later),
      kind: "quests",
      xpOptional: true,
      xpTargetLevel: 12,
      fundingCheckpointId: "enter",
      requiredQuestIds: [985],
      questChanges: [{ questId: 4761, title: "Thundris Windweaver", state, objectiveIndex: null }],
    })),
    { ...action("enter", later), kind: "xp-check", targetLevel: 12 },
  ];
  let entryXp = 0;
  for (let at = 1; at < level; at++) entryXp += FOREVER_XP_CURVE[at]!;
  const plan: CampaignPlan = {
    release: "town-batching-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [town, later].map((id) => ({
      id,
      title: id,
      kind: "preparation",
      from: 1,
      to: 12,
      stopId: null,
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
      questIds: [
        ...new Set(
          actions
            .filter((entry) => entry.legId === id)
            .flatMap((entry) => entry.questChanges.map((change) => change.questId)),
        ),
      ],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [
      [300001, entryXp],
      [985, 740],
      [4761, 105],
    ].map(([questId, fullXp]) => ({
      questId: questId!,
      fullXp: fullXp!,
      questLevel: 60,
      minimumLevel: questId === 4761 ? 11 : 1,
      xpByLevel: [],
      sourceUrl: "https://example.test/reward",
      capturedAt: "2026-11-01T00:00:00.000Z",
      status: "available",
      evidenceKind: "historical-reference",
    })),
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [quest(985), quest(4761)],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic fixture",
    provider: {
      repository: "https://example.test/reference",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: "f".repeat(64),
      limitations: ["Synthetic fixture"],
    },
    npcs: [],
    dungeons: [],
    killXpEvidence: [],
    quests: [
      {
        questId: 4761,
        creatureIds: [],
        itemCreatureIds: [],
        itemObjectives: [],
        onlyCreatureObjectives: false,
        objectiveText: ["Speak with Thundris Windweaver."],
      },
    ],
  };
  return { plan, catalog, combat };
}

describe("on-route settlement deliveries", () => {
  it("removes the later town return without adding quests, changing IDs or awarding a hand-in twice", () => {
    const { plan, catalog, combat } = fixture();
    const frozen = JSON.stringify(plan);
    const result = batchCampaignLocalDeliveries(plan, combat, catalog);
    expect(result.actions.map((entry) => entry.id)).toEqual([
      "prior-work",
      "town-return",
      "accepted",
      "rewarded",
      "required-departure",
      "enter",
    ]);
    expect(result.actions.slice(2, 4).every((entry) => entry.legId === town)).toBe(true);
    expect(result.actions.find((entry) => entry.id === "required-departure")).toBe(plan.actions[2]);
    expect(result.rewardFacts).toBe(plan.rewardFacts);
    for (const leg of result.legs) {
      expect(leg.actionIds).toEqual(
        result.actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
      );
    }
    for (const state of campaignFundingStates(result)) {
      for (let player = 0; player < 5; player++) {
        const rewards = state.forecast
          .flatMap((section) => section.members[player]!.rewards)
          .filter((reward) => reward.questId === 4761);
        expect(rewards).toHaveLength(1);
        expect(rewards[0]?.xp).toBe(105);
      }
    }
    expect(JSON.stringify(plan)).toBe(frozen);
    expect(batchCampaignLocalDeliveries(result, combat, catalog)).toBe(result);
  });

  it("keeps the existing placement when the early visit is below the real pickup level", () => {
    const { plan, catalog, combat } = fixture(10);
    expect(batchCampaignLocalDeliveries(plan, combat, catalog)).toBe(plan);
  });

  it("does not move a delivery whose original route already stays in town", () => {
    const { plan, catalog, combat } = fixture(11, "1439");
    expect(batchCampaignLocalDeliveries(plan, combat, catalog)).toBe(plan);
  });

  it("preserves source prerequisites beyond those in the provider table", () => {
    const { plan, catalog, combat } = fixture();
    const constrained = {
      ...plan,
      actions: plan.actions.map((entry) =>
        entry.id === "accepted" ? { ...entry, requiredQuestIds: [999999] } : entry,
      ),
    };
    expect(batchCampaignLocalDeliveries(constrained, combat, catalog)).toBe(constrained);
  });
  it("does not turn an optional hand-in into extra work for another difficulty policy", () => {
    const { plan, catalog, combat } = fixture(17);
    const conditional: CampaignPlan = {
      ...plan,
      actions: plan.actions.map((entry) =>
        entry.id === "required-departure"
          ? {
              ...entry,
              kind: "quests",
              questChanges: (["accepted", "objectives-complete", "rewarded"] as const).map(
                (state) => ({
                  questId: 300002,
                  title: "Required work",
                  state,
                  objectiveIndex: state === "objectives-complete" ? 1 : null,
                }),
              ),
            }
          : entry.id === "enter"
            ? { ...entry, targetStopId: "lordaeron" }
            : entry,
      ),
      rewardFacts: [
        ...plan.rewardFacts!,
        { ...plan.rewardFacts![0]!, questId: 300002, fullXp: FOREVER_XP_CURVE[17]! },
      ],
    };
    const states = campaignFundingStates(conditional);
    const skipped = (policy: "at-level" | "experienced-premade"): readonly string[] =>
      states
        .find((state) => state.difficultyPolicy === policy)!
        .forecast.flatMap((section) => section.skippedOptionalActionIds);
    expect(skipped("experienced-premade")).toContain("rewarded");
    expect(skipped("at-level")).not.toContain("rewarded");
    expect(batchCampaignLocalDeliveries(conditional, combat, catalog)).toBe(conditional);
  });

  it.each(["race", "npc", "provider", "interaction"] as const)(
    "holds incompatible %s evidence",
    (field) => {
      const { plan, catalog, combat } = fixture();
      const revised = {
        ...catalog,
        ...(field === "provider" ? { npcSha256: "0".repeat(64) } : {}),
        quests: catalog.quests.map((entry) => ({
          ...entry,
          ...(field === "race" && entry.questId === 4761 ? { requiredRaces: 4 } : {}),
          ...(field === "npc" && entry.questId === 985 ? { ends: [{ ...giver, npcId: 999 }] } : {}),
        })),
      };
      const reference =
        field === "interaction"
          ? {
              ...combat,
              quests: combat.quests.map((entry) => ({
                ...entry,
                objectiveText: ["Escort Thundris Windweaver."],
              })),
            }
          : combat;
      expect(batchCampaignLocalDeliveries(plan, reference, revised)).toBe(plan);
    },
  );
});
