import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { partyQuestLootCost } from "./party-quest-cost.js";

interface Fixture {
  plan: CampaignPlan;
  data: CombatDataset;
  sources: CampaignSource[];
}

function fixture(groundQuantity = 1): Fixture {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 16)!;
  const guide = parseGuideChapter(
    `step\n.goto Stranglethorn Vale,44,9\n>>Open the camp supplies. Loot the Fern Extract\n.complete 420204,2 >>Fern Extract (${groundQuantity})`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  const npc = {
    id: 940,
    name: "Synthetic Camp Healer",
    minimumLevel: 32,
    maximumLevel: 33,
    rank: 0,
    zoneIds: [33],
    xpEligibility: "assumed" as const,
  };
  const plan: CampaignPlan = {
    release: "synthetic-mixed-ground-cost",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    sourceArchiveSha256: "a".repeat(64),
    actions: [
      {
        id: "ground",
        legId: "camp",
        title: "Collect the extract",
        kind: "quests",
        instructions: ["Open the camp supplies. Loot the Fern Extract"],
        positions: [],
        source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
        leaderOnly: false,
        raidOnly: false,
        targetLevel: null,
        targetStopId: null,
        questChanges: [
          {
            questId: 420204,
            title: "Camp Medicine",
            state: "objectives-complete",
            objectiveIndex: 2,
          },
        ],
      },
    ],
    legs: [],
    itemRequirements: [
      { questId: 420204, objectiveIndex: 1, itemId: 771, quantity: 7 },
      { questId: 420204, objectiveIndex: 2, itemId: 772, quantity: groundQuantity },
    ],
    combat: {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      notice: null,
      npcs: [npc],
      activities: [
        {
          id: "remedies",
          actionId: "remedies",
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              questId: 420204,
              objectiveIndex: 1,
              npcIds: [940],
              requiredKills: null,
              credit: "personal-loot",
              source: "Synthetic captured camp",
              reason: null,
              loot: { itemId: 771, quantity: 7, sharing: "pooled" },
            },
          ],
        },
      ],
      lootDrops: [
        {
          itemId: 771,
          npcId: 940,
          probability: 0.5,
          probabilityBasis: "sample-ratio",
          minimumQuantity: 1,
          maximumQuantity: 1,
          sampleSize: 100,
          targetBuild: 70205,
          sourceUrl: "https://example.test/camp-drop",
          capturedAt: "2026-11-04T00:00:00Z",
          sourceSha256: "b".repeat(64),
        },
      ],
    },
  };
  const data: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic mixed ground and loot collection",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic counter regression"],
    },
    npcs: [npc],
    quests: [
      {
        questId: 420204,
        requiredClasses: 0,
        creatureIds: [],
        itemCreatureIds: [940],
        objectiveText: ["Bring seven remedies and the extract."],
        onlyCreatureObjectives: false,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 771,
            itemName: "Camp Remedy",
            quantity: 7,
            npcIds: [940],
            sharing: "pooled",
          },
          {
            objectiveIndex: 2,
            itemId: 772,
            itemName: "Fern Extract",
            quantity: groundQuantity,
            npcIds: [],
            objectIds: [263],
            sharing: "pooled",
          },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  };
  return { plan, data, sources: [{ reference, guide }] };
}

describe("collection cost with a separate ground counter", () => {
  it.each([1, 3])(
    "prices all 35 remedy drops while preserving %i ground items per player",
    (quantity) => {
      const input = fixture(quantity),
        before = structuredClone(input);
      const result = partyQuestLootCost(420204, input.plan, input.data, 5, input.sources);
      expect(result).toMatchObject({ eligible: true, expectedKills: 70, retainedByDropRate: true });
      expect(result.slowKills).toBeGreaterThan(70);
      expect(input).toEqual(before);
    },
  );

  it("accepts a full ground-only method without inventing creature kills", () => {
    const input = fixture();
    input.data.quests[0]!.itemObjectives!.splice(0, 1);
    input.plan = { ...input.plan, combat: { ...input.plan.combat!, activities: [] } };
    expect(partyQuestLootCost(420204, input.plan, input.data, 5, input.sources)).toMatchObject({
      eligible: true,
      expectedKills: 0,
      slowKills: 0,
    });
  });

  it("rejects an understated creature-drop quota even if the ground counter is complete", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      combat: {
        ...input.plan.combat!,
        activities: input.plan.combat!.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => ({
            ...objective,
            loot: { ...objective.loot!, quantity: 1 },
          })),
        })),
      },
    };
    expect(partyQuestLootCost(420204, input.plan, input.data, 5, input.sources).eligible).toBe(
      false,
    );
  });

  it.each([
    "missing-source",
    "wrong-build",
    "wrong-counter",
    "display-only",
    "missing-object",
    "npc-alternative",
    "unknown-quantity",
    "partial-quota",
    "conflicting-quota",
    "duplicate-quota",
  ])("keeps an unproven ground requirement unresolved (%s)", (change) => {
    const input = fixture();
    const item = input.data.quests[0]!.itemObjectives![1]!;
    if (change === "missing-source") input.sources = [];
    if (change === "wrong-build") input.sources[0]!.guide.targetBuild = 99999;
    if (change === "wrong-counter")
      input.sources[0]!.guide.steps[0]!.directives.find(
        (row) => row.tag === ".complete",
      )!.arguments = "420204,1";
    if (change === "display-only") {
      const guide = input.sources[0]!.guide;
      guide.steps[0]!.directives.push({
        tag: ".disablecheckbox",
        arguments: "",
        condition: "",
        text: "",
        sourceLine: 5,
        questId: null,
        position: null,
      });
    }
    if (change === "missing-object") delete item.objectIds;
    if (change === "npc-alternative") item.npcIds = [941];
    if (change === "unknown-quantity") item.quantity = null;
    if (change === "partial-quota" || change === "conflicting-quota")
      input.plan = {
        ...input.plan,
        itemRequirements: input.plan.itemRequirements!.map((requirement, index) =>
          index === 1
            ? {
                ...requirement,
                ...(change === "partial-quota" ? { quantity: 2 } : { conflict: true }),
              }
            : requirement,
        ),
      };
    if (change === "duplicate-quota")
      input.plan = {
        ...input.plan,
        itemRequirements: [
          ...input.plan.itemRequirements!,
          { ...input.plan.itemRequirements![1]!, quantity: 2 },
        ],
      };
    expect(partyQuestLootCost(420204, input.plan, input.data, 5, input.sources).eligible).toBe(
      false,
    );
  });
});
