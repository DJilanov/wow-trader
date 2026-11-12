import { describe, expect, it } from "vitest";
import { groundPickupReferenceSchema } from "./quest-ground-pickup.js";
import { questItemObjectiveSchema } from "./quest-loot.js";
import { isMultiItemGroundCollectionSource } from "./campaign-ground-pickup.js";
import { parseGuideChapter } from "./guide-archive.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import {
  combatDatasetSchema,
  type CombatQuestReference,
} from "./combat-model.js";
import type { CampaignPlan } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

// Synthetic isolated source; the real multi-quest Rocket Car source needs separate qualification.
function fixture(quantity = 30): {
  quest: CombatQuestReference;
  ground: unknown;
  guide: ReturnType<typeof parseGuideChapter>;
} {
  const guide = parseGuideChapter(
    `step\n.goto 1441,77,77\n>>Open the Rocket Car Rubble. Loot it for the Rocket Car Parts\n.complete 1110,1 >>Rocket Car Parts (${quantity})`,
    "synthetic-ground-quantity",
    "a".repeat(64),
    70205,
  );
  const ground = {
    questId: 1110,
    itemId: 5798,
    quantity,
    objectiveIndex: 1,
    objectId: 19868,
    objectName: "Rocket Car Rubble",
    positions: [{ zone: "1441", x: 77, y: 77 }],
    sourceArchiveSha256: "a".repeat(64),
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
  };
  return {
    ground,
    guide,
    quest: {
      questId: 1110,
      creatureIds: [],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      requiredClasses: 0,
      objectiveText: [
        `Bring ${quantity} Rocket Car Parts to Kravel Koalbeard in the Shimmering Flats.`,
      ],
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 5798,
          itemName: "Rocket Car Parts",
          quantity,
          npcIds: [],
          objectIds: [19868],
          sharing: "pooled",
        },
      ],
    },
  };
}

describe("source-proven pickups above twenty items", () => {
  it.each([30, 10_000])(
    "preserves the full supported item quota %i in both reference schemas",
    (quantity) => {
      const input = fixture(quantity),
        ground = groundPickupReferenceSchema.parse(input.ground);
      const item = questItemObjectiveSchema.parse({
        ...input.quest.itemObjectives![0]!,
        groundPickup: ground,
      });
      expect(item.quantity).toBe(quantity);
      expect(item.groundPickup!.quantity).toBe(quantity);
    },
  );

  it("recognizes a full thirty-item source counter without treating it as a creature farm", () => {
    const input = fixture();
    expect(
      isMultiItemGroundCollectionSource({
        quest: input.quest,
        objectiveIndex: 1,
        directives: input.guide.steps[0]!.directives,
        objectName: "Rocket Car Rubble",
      }),
    ).toBe(true);
  });

  it.each([0, -1, 1.5, 10_001])("rejects an invalid item quota %s", (quantity) => {
    expect(groundPickupReferenceSchema.safeParse(fixture(quantity).ground).success).toBe(false);
  });

  it.each(["partial", "encounter", "mob-source", "wrong-object"])(
    "retains the existing source qualification guard: %s",
    (change) => {
      const input = fixture();
      let directives = input.guide.steps[0]!.directives;
      if (change === "partial") input.quest.itemObjectives![0]!.quantity = 29;
      if (change === "mob-source") input.quest.itemObjectives![0]!.npcIds = [100];
      if (change === "encounter")
        directives = [
          ...directives,
          {
            ...directives[0]!,
            tag: "text",
            arguments: "",
            text: "Kill the guardian that spawns.",
            position: null,
            questId: null,
          },
        ];
      expect(
        isMultiItemGroundCollectionSource({
          quest: input.quest,
          objectiveIndex: 1,
          directives,
          objectName: change === "wrong-object" ? "Unrelated Chest" : "Rocket Car Rubble",
        }),
      ).toBe(false);
    },
  );

  it("keeps thirty items for each of five players and pays only the one completed hand-in", () => {
    const input = fixture(),
      ground = groundPickupReferenceSchema.parse(input.ground);
    const actions: CampaignPlan["actions"] = (
      ["accepted", "objectives-complete", "rewarded"] as const
    ).map((state) => ({
      id: state,
      legId: "ground",
      title: "Synthetic ground collection",
      kind: "quests",
      source: null,
      instructions: ["Collect 30 Rocket Car Parts"],
      positions: [],
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
      ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
      questChanges: [
        {
          questId: 1110,
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
          title: "Rocket Car Parts",
        },
      ],
    }));
    const plan: CampaignPlan = {
      release: "synthetic-ground-quantity",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sharedQuestsOnly: true,
      incidentalKillXpPercent: 10,
      actions,
      legs: [
        {
          id: "ground",
          title: "Ground collection",
          kind: "preparation",
          from: 28,
          to: 29,
          stopId: null,
          questIds: [1110],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
      rewardFacts: [
        {
          questId: 1110,
          fullXp: 100,
          minimumLevel: 28,
          questLevel: 31,
          xpByLevel: [],
          sourceUrl: "https://example.test/synthetic-reward",
          capturedAt: "2026-11-04T00:00:00Z",
          status: "available",
          evidenceKind: "published-forever",
        },
      ],
    };
    const data = combatDatasetSchema.parse({
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic source quota regression",
      provider: {
        repository: "https://example.test/provider",
        revision: "b".repeat(40),
        layer: "forever-static-with-authored",
        questSha256: "c".repeat(64),
        npcSha256: "d".repeat(64),
        itemSha256: "e".repeat(64),
        objectSha256: "f".repeat(64),
        limitations: ["Synthetic isolated source, not actual archived route qualification"],
      },
      questCatalogReference: {
        sha256: "b".repeat(64),
        providerRevision: "b".repeat(40),
        sourceArchiveSha256: "a".repeat(64),
      },
      quests: [
        {
          ...input.quest,
          itemObjectives: [{ ...input.quest.itemObjectives![0]!, groundPickup: ground }],
        },
      ],
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
    });
    const before = structuredClone({ plan, data });
    const enriched = attachCampaignCombat(plan, [], data, "synthetic-ground-quantity");
    expect(enriched.itemRequirements).toEqual([
      { questId: 1110, objectiveIndex: 1, itemId: 5798, quantity: 30 },
    ]);
    expect(enriched.combat!.activities).toEqual([]);
    const initial = emptyPremadeProgress();
    const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    const progress = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        classSlug: classes[index]!,
        raceId: "human" as const,
        level: 28,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const forecast = forecastCampaignXp(enriched, progress);
    expect(forecast[0]!.members).toHaveLength(5);
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 28, currentXp: 100 });
      expect(member.rewards.map((reward) => reward.questId)).toEqual([1110]);
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
    }
    expect({ plan, data }).toEqual(before);
  });
});
