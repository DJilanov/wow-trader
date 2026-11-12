import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { earlyPreparationCouriers, earlySpiderCamp } from "./campaign-early-preparation-source.js";
import { connectEarlyCampaignPreparation } from "./campaign-early-preparation.js";

function fixture(): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
  catalog: QuestCatalog;
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 128)!;
  const guide = parseGuideChapter(
    [
      "step\n.goto 1433,26,44\n.accept 129\n.target Darcy",
      "step\n.goto 1433,30,60\n.turnin 129\n.target Guard Parker",
      "step\n.goto 1433,29,44\n.accept 120\n.target Magistrate Solomon",
      "step\n.goto 1453,66,75\n.turnin 120\n.target General Marcus Jonathan",
    ].join("\n"),
    reference.id,
    "f".repeat(64),
    70205,
  );
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic courier fixture",
    provider: {
      repository: "https://example.test",
      revision: "b".repeat(40),
      npcSha256: "c".repeat(64),
      questSha256: "d".repeat(64),
      itemSha256: "e".repeat(64),
      layer: "forever-static-with-authored",
      limitations: ["Synthetic test data; no observed payout."],
    },
    quests: [129, 120].map((questId) => ({
      questId,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: false,
      requiredClasses: 0,
      itemObjectives: [],
    })),
    npcs: [
      {
        id: 539,
        name: "Pygmy Venom Web Spider",
        minimumLevel: 18,
        maximumLevel: 19,
        rank: 0,
        zoneIds: [10],
        xpEligibility: "assumed",
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic courier fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: data.provider.revision,
    npcSha256: data.provider.npcSha256,
    questSha256: data.provider.questSha256,
    itemSha256: data.provider.itemSha256,
    areaMapSha256: "0".repeat(64),
    includesAuthoredCorrections: false,
    quests: [
      ...[129, 120].map((questId) => ({
        questId,
        title: questId === 129 ? "A Free Lunch" : "Messenger to Stormwind",
        minimumLevel: questId === 129 ? 12 : 14,
        questLevel: 15,
        requiredClasses: 0,
        requiredRaces: 0,
        providedItem: {
          itemId: questId === 129 ? 5534 : 1293,
          name: questId === 129 ? "Parker's Lunch" : "The State of Lakeshire",
        },
        starts: [
          {
            npcId: questId === 129 ? 379 : 344,
            name: questId === 129 ? "Darcy" : "Magistrate Solomon",
            friendlyToAlliance: true,
            positions: [{ zone: "1433", x: 26, y: 44 }],
          },
        ],
        ends: [
          {
            npcId: questId === 129 ? 464 : 466,
            name: questId === 129 ? "Guard Parker" : "General Marcus Jonathan",
            friendlyToAlliance: true,
            positions: [{ zone: questId === 129 ? "1433" : "1453", x: 30, y: 60 }],
          },
        ],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "delivery" as const,
        objectives: [],
        unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"],
      })),
      {
        questId: 245,
        title: "Eight-Legged Menaces",
        minimumLevel: 17,
        questLevel: 21,
        requiredClasses: 0,
        requiredRaces: 0,
        category: "shared-kills",
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        unsupportedRequirements: [],
        starts: [
          {
            npcId: 888,
            name: "Watcher Dodds",
            friendlyToAlliance: true,
            positions: [{ zone: "1431", x: 45, y: 67 }],
          },
        ],
        ends: [],
        objectives: [
          {
            index: 1,
            npcId: 539,
            count: 15,
            positions: [
              { zone: "1431", x: 60, y: 15 },
              { zone: "1431", x: 11, y: 66 },
              { zone: "1431", x: 13, y: 70 },
              { zone: "1431", x: 12, y: 68 },
            ],
          },
        ],
      },
    ],
  };
  const plan: CampaignPlan = {
    release: "test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    actions: [],
    legs: [],
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [120, 129, 245],
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
    rewardFacts: [120, 129, 245].map((questId) => ({
      questId,
      fullXp: 500,
      minimumLevel: 12,
      questLevel: 18,
      status: "available",
      xpByLevel: [],
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-02T00:00:00Z",
    })),
  };
  return { plan, sources: [{ reference, guide }], data, catalog };
}

describe("early route source qualification", () => {
  it("reuses both exact captured parcel phases with their target, source and position", () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = earlyPreparationCouriers(input.plan, input.sources, input.data, input.catalog)!;
    expect(result).not.toBeNull();
    expect(
      [result.lunchPickup, result.lunchReturn, result.reportPickup, result.reportReturn].map(
        (action) => [action.questChanges[0]!.questId, action.questChanges[0]!.state],
      ),
    ).toEqual([
      [129, "accepted"],
      [129, "rewarded"],
      [120, "accepted"],
      [120, "rewarded"],
    ]);
    expect(result.reportReturn.positions[0]!.position.zone).toBe("1453");
    expect(input).toEqual(before);
  });

  it.each([
    "foreign-provider",
    "class-quest",
    "wrong-parcel",
    "wrong-recipient",
    "human-excluded",
    "skill-gate",
    "missing-phase",
  ])("declines %s without changing the fallback route", (kind) => {
    const input = fixture();
    const catalog: QuestCatalog = {
      ...input.catalog,
      ...(kind === "foreign-provider" ? { itemSha256: "0".repeat(64) } : {}),
      quests: input.catalog.quests.map((quest) =>
        quest.questId !== 129
          ? quest
          : {
              ...quest,
              ...(kind === "class-quest" ? { requiredClasses: 16 } : {}),
              ...(kind === "human-excluded" ? { requiredRaces: 4294967372 } : {}),
              ...(kind === "wrong-parcel"
                ? { providedItem: { itemId: 1, name: "Wrong item" } }
                : {}),
              ...(kind === "wrong-recipient" ? { ends: [{ ...quest.ends[0]!, npcId: 999 }] } : {}),
              ...(kind === "skill-gate" ? { unsupportedRequirements: ["requiredSkill"] } : {}),
            },
      ),
    };
    const sources =
      kind === "missing-phase"
        ? input.sources.map((source) => ({
            ...source,
            guide: {
              ...source.guide,
              steps: source.guide.steps.filter((step) => step.ordinal !== 2),
            },
          }))
        : input.sources;
    expect(earlyPreparationCouriers(input.plan, sources, input.data, catalog)).toBeNull();
    expect(connectEarlyCampaignPreparation(input.plan, sources, input.data, catalog)).toBe(
      input.plan,
    );
  });

  it("emits a separate approach to the closest three real spider positions without changing the source counter", () => {
    const input = fixture(),
      before = structuredClone(input);
    const camp = earlySpiderCamp(input.plan, input.data, input.catalog)!;
    expect(camp.source).toBeNull();
    expect(camp.questChanges).toEqual([]);
    expect(camp.positions.map((entry) => entry.position.x)).toEqual([13, 12, 11]);
    expect(
      camp.positions.every(
        (entry) => entry.sourceLine === 0 && entry.position.space === "map-percent",
      ),
    ).toBe(true);
    expect(camp.instructions.join(" ")).toContain("15 shared kills");
    expect(input).toEqual(before);
  });

  it.each(["wrong-count", "foreign-map", "missing-level", "elite"])(
    "rejects unsupported spider %s",
    (kind) => {
      const input = fixture();
      const catalog: QuestCatalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) =>
          quest.questId !== 245
            ? quest
            : {
                ...quest,
                objectives: quest.objectives.map((objective) => ({
                  ...objective,
                  ...(kind === "wrong-count" ? { count: 14 } : {}),
                  ...(kind === "foreign-map"
                    ? { positions: [{ zone: "1433", x: 13, y: 70 }] }
                    : {}),
                })),
              },
        ),
      };
      const data: CombatDataset = {
        ...input.data,
        npcs: input.data.npcs.map((npc) => ({
          ...npc,
          ...(kind === "missing-level" ? { maximumLevel: null } : {}),
          ...(kind === "elite" ? { rank: 1 } : {}),
        })),
      };
      expect(earlySpiderCamp(input.plan, data, catalog)).toBeNull();
    },
  );
});
