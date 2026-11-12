import { describe, expect, it } from "vitest";
import {
  campaignSourceDeliveries,
  sourceDeliveryFundingCatalog,
} from "./campaign-source-deliveries.js";
import {
  questCatalogSchema,
  type QuestCatalog,
} from "./quest-catalog.js";
import {
  combatDatasetSchema,
  type CombatDataset,
} from "./combat-model.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { importedChapterSchema } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import fixtureData from "./fixtures/diplomat-courier-programs-70205.json" with { type: "json" };

const ids = [1241, 1242, 1243] as const;

function fixture(): {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
  sources: CampaignSource[];
} {
  const guide = importedChapterSchema.parse(fixtureData.source.guide);
  const reference = CHAPTER_REFERENCES.find((entry) => entry.id === guide.chapterId)!;
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote:
      "Extracted exact three-courier source test; unrelated area metadata is synthetic.",
    providerRevision: fixtureData.provider.revision,
    questSha256: fixtureData.provider.questSha256,
    npcSha256: fixtureData.provider.npcSha256,
    itemSha256: fixtureData.provider.itemSha256,
    objectSha256: fixtureData.provider.objectSha256,
    areaMapSha256: "f".repeat(64),
    sourceArchiveSha256: fixtureData.sourceArchiveSha256,
    includesAuthoredCorrections: true,
    quests: fixtureData.catalog,
  });
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Extracted exact courier references; no combat or payout claim.",
    provider: {
      ...fixtureData.provider,
      repository: "https://github.com/Questie/QuestieDB",
      layer: "forever-static-with-authored",
      limitations: ["Source-only three-courier test subset, not route qualification."],
    },
    npcs: [],
    quests: fixtureData.references,
    dungeons: [],
    killXpEvidence: [],
  });
  return {
    plan: {
      release: "reviewed-diplomat-couriers",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: fixtureData.sourceArchiveSha256,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [1274, ...ids],
      actions: [],
      legs: [],
    },
    catalog,
    combat,
    sources: [{ reference, guide }],
  };
}

describe("exact reviewed Missing Diplomat letters", () => {
  it.each(ids)(
    "qualifies the complete provided-letter handoff %i without changing its parcel or prerequisite",
    (questId) => {
      const input = fixture(),
        before = structuredClone(input);
      const deliveries = campaignSourceDeliveries(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
      );
      const delivery = deliveries.get(questId)!;
      expect(delivery).toBeDefined();
      const original = input.catalog.quests.find((quest) => quest.questId === questId)!;
      expect(delivery.quest.providedItem).toEqual(original.providedItem);
      expect(delivery.quest.prerequisites).toEqual(original.prerequisites);
      expect(delivery.quest.unsupportedRequirements).toEqual([]);
      expect(
        delivery.actions.map((action) => action.questChanges.map((change) => change.state)),
      ).toEqual([["accepted"], ["rewarded"]]);
      const proof = fixtureData.proofs.find((entry) => entry.quest.questId === questId)!;
      expect(delivery.actions[0]!.source).toEqual(proof.pickup.source);
      expect(delivery.actions[1]!.source).toEqual(proof.handIn.source);
      expect(input).toEqual(before);
    },
  );

  it.each([
    "archive",
    "build",
    "provider",
    "wording",
    "parcel",
    "target",
    "source-version",
    "use-device",
  ])("retains an unresolved handoff when its proof changes: %s", (change) => {
    const input = fixture();
    if (change === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "a".repeat(64) };
    if (change === "build") input.plan = { ...input.plan, targetBuild: 70450 };
    if (change === "provider") input.combat.provider.revision = "a".repeat(40);
    if (change === "wording")
      input.combat.quests.find((quest) => quest.questId === 1242)!.objectiveText = [
        "Activate the device before finding Elling.",
      ];
    if (change === "parcel")
      input.catalog.quests.find((quest) => quest.questId === 1242)!.providedItem!.itemId = 5947;
    if (change === "target")
      input.catalog.quests.find((quest) => quest.questId === 1242)!.ends[0]!.name =
        "Unrelated Character";
    if (change === "source-version") input.sources[0]!.guide.version = "unreviewed-version";
    if (change === "use-device") {
      const step = input.sources[0]!.guide.steps.find(
        (step) => step.id === fixtureData.proofs[1]!.pickup.source.stepId,
      )!;
      step.directives.push({
        ...step.directives[0]!,
        tag: ".use",
        arguments: "5946",
        text: "Activate this device",
        questId: null,
        position: null,
      });
    }
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(1242),
    ).toBe(false);
  });

  it("retains all three real parcels and pays each hand-in once for all five classes, with no combat XP", () => {
    const input = fixture();
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    const qualified = sourceDeliveryFundingCatalog(input.catalog, deliveries);
    for (const questId of ids)
      expect(qualified.quests.find((quest) => quest.questId === questId)!.providedItem).toEqual(
        input.catalog.quests.find((quest) => quest.questId === questId)!.providedItem,
      );
    const actions = ids.flatMap((questId) =>
      deliveries.get(questId)!.actions.map((action) => ({ ...action, legId: "couriers" })),
    );
    const plan: CampaignPlan = {
      ...input.plan,
      actions,
      legs: [
        {
          id: "couriers",
          title: "Stormwind letters",
          kind: "preparation",
          from: 28,
          to: 29,
          stopId: null,
          questIds: [...ids],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
      rewardFacts: ids.map((questId) => ({
        questId,
        fullXp: 230,
        minimumLevel: 28,
        questLevel: 28,
        xpByLevel: [],
        sourceUrl: `https://www.wowhead.com/forever/quest=${questId}`,
        capturedAt: "2026-11-04T00:00:00Z",
        status: "available",
        evidenceKind: "published-forever",
      })),
    };
    const enriched = attachCampaignCombat(plan, input.sources, input.combat, "reviewed-couriers");
    expect(enriched.combat!.activities).toEqual([]);
    const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    const initial = emptyPremadeProgress();
    const progress = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        classSlug: classes[index]!,
        raceId: "human" as const,
        level: 28,
        currentXp: 0,
        xpNeedsUpdate: false,
        questStates: { 1274: "rewarded" as const },
      })),
    };
    const forecast = forecastCampaignXp(enriched, progress);
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 28, currentXp: 690 });
      expect(member.rewards.map((reward) => reward.questId)).toEqual([...ids]);
      expect(member.combatXp).toBe(0);
    }
    for (const classSlug of classes) {
      const addon = compileCampaignAddon({ ...enriched, leaderClass: classSlug }, actions, {
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
        for (const questId of ids) {
          expect(text.match(new RegExp(`\\.accept ${questId}\\b`, "g"))).toHaveLength(1);
          expect(text.match(new RegExp(`\\.turnin ${questId}\\b`, "g"))).toHaveLength(1);
          expect(text).not.toContain(`.complete ${questId}`);
        }
      }
    }
  });
});
