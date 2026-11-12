import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignLibraryOptions, buildCampaignQuestLibrary } from "./campaign-library.js";
import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";
import { providedDeliveryFundingCatalog } from "./campaign-funding-deliveries.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { createCampaignSourcePhaseSelector } from "./campaign-source-phase-selection.js";
import { campaignSourceChecks } from "./campaign-source-conditions.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { getGuideStepView, importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import fixtureData from "./fixtures/wharfmaster-duplicate-handoff-70205.json" with { type: "json" };

interface HandoffFixture {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: QuestCatalog;
  combat: CombatDataset;
}

function fixture(): HandoffFixture {
  return {
    plan: { release: "captured-wharfmaster-handoff", race: "human", leaderClass: "warrior",
      targetBuild: 70205, sourceArchiveSha256: fixtureData.sourceArchiveSha256,
      sharedQuestsOnly: true, sharedSourceQuestIds: fixtureData.originalSharedQuestIds,
      actions: [], legs: [] },
    sources: fixtureData.sources.map((source): CampaignSource => {
      const guide = importedChapterSchema.parse(source.guide);
      return { reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)!, guide };
    }),
    catalog: questCatalogSchema.parse({ ...fixtureData.catalogMetadata, quests: fixtureData.catalog }),
    combat: combatDatasetSchema.parse({ schema: "forever-combat-reference.v1", targetBuild: 70205,
      publication: "private-reference", authorizationNote: "Exact source handoff subset, without rewards or kill estimates.",
      provider: fixtureData.provider, questCatalogReference: fixtureData.combatCatalogReference,
      quests: fixtureData.references, npcs: [], dungeons: [], killXpEvidence: [] }),
  };
}

function library(input: HandoffFixture): ReturnType<typeof buildCampaignQuestLibrary> {
  return buildCampaignQuestLibrary(input.sources, createCampaignSourceProfile("human", null), [],
    new Set(), input.combat.quests, campaignLibraryOptions(input.plan));
}

describe("repeated Wharfmaster NPC exchange", () => {
  it("keeps the complete next-step exchange without the unrelated Barrens port guard", () => {
    const input = fixture(), before = structuredClone(input), programs = library(input);
    for (const [id, phase] of [[1111, "rewarded"], [1112, "accepted"]] as const) {
      const action = programs.find((quest) => quest.questId === id)!.actions
        .find((row) => row.questChanges[0]!.state === phase)!;
      expect(action.source?.stepId).toBe("source-step-0096");
      expect(campaignSourceChecks(action)).toEqual([]);
      const native = campaignNativeInstructions(input.plan, input.sources)(action)!;
      expect(native.directives.some((row) => row.tag === ".isQuestTurnedIn" && row.arguments === "1038"))
        .toBe(false);
    }
    expect(input).toEqual(before);
  });

  it("qualifies the outbound exchange and retains the catalog-backed return parcel's prerequisite", () => {
    const input = fixture();
    const methods = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog);
    const outbound = methods.get(1111)!;
    const inbound = providedDeliveryFundingCatalog(input.catalog, input.combat, new Set())
      .quests.find((quest) => quest.questId === 1112)!;
    expect(outbound).toBeDefined();
    expect(inbound.unsupportedRequirements).toEqual([]);
    expect(outbound.quest.prerequisites.allOf).toContain(1110);
    expect(outbound.actions[0]!.requiredQuestIds).toContain(1110);
    expect(outbound.quest.providedItem).toEqual({ itemId: 5799, name: "Kravel's Parts Order" });
    expect(inbound.prerequisites.anyOf).toEqual([1111]);
    expect(inbound.providedItem).toEqual({ itemId: 5800, name: "Kravel's Parts" });
    expect(outbound.actions[1]!.source?.stepId).toBe("source-step-0096");
  });

  it("retains the unrelated port phases and their captured condition at the earlier visit", () => {
    const input = fixture(), guide = input.sources[0]!.guide;
    const step = guide.steps.find((row) => row.id === "source-step-0095")!;
    const profile = createCampaignSourceProfile("human", null);
    const view = getGuideStepView(step, profile, { dungeons: [] });
    const select = createCampaignSourcePhaseSelector(guide, profile, [], input.combat.quests);
    expect(view.directives.filter((row) => [".turnin", ".accept"].includes(row.tag))
      .map((row) => [row.tag, row.questId, select(step, view, row)]))
      .toEqual([[".turnin", 1111, false], [".accept", 1112, false],
        [".turnin", 1039, true], [".accept", 1040, true]]);
    expect(view.runtimeChecks.map((row) => [row.tag, row.arguments]))
      .toEqual([[".isQuestTurnedIn", "1038"]]);
  });

  it("does not replace a selected class's exchange with an unavailable class branch", () => {
    const input = fixture(), guide = input.sources[0]!.guide;
    guide.steps.find((row) => row.id === "source-step-0096")!.condition = "Mage";
    const earlier = guide.steps.find((row) => row.id === "source-step-0095")!;
    const profile = createCampaignSourceProfile("human", "warrior");
    const view = getGuideStepView(earlier, profile, { dungeons: [] });
    const phase = view.directives.find((row) => row.tag === ".turnin" && row.questId === 1111)!;
    expect(createCampaignSourcePhaseSelector(guide, profile, [], input.combat.quests)(earlier, view, phase))
      .toBe(true);
  });

  it.each(["no-parent-handoff", "wrong-parent-giver", "wrong-parcel"])(
    "keeps the parcel unresolved without its full physical prerequisite: %s", (change) => {
      const input = fixture();
      if (change === "no-parent-handoff") {
        const step = input.sources[0]!.guide.steps.find((row) => row.id === "source-step-0063")!;
        step.directives = step.directives.filter((row) => row.tag !== ".turnin");
      }
      if (change === "wrong-parent-giver") input.catalog.quests.find((row) => row.questId === 1110)!
        .ends[0]!.npcId = 3453;
      if (change === "wrong-parcel") input.catalog.quests.find((row) => row.questId === 1111)!
        .providedItem!.name = "Unrelated Parts";
      expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(1111))
        .toBe(false);
    },
  );

  it.each(["target", "position", "functional-work", "nonadjacent", "fallback-guard",
    "child-prerequisite", "dependent-port-quest", "indirect-dependency", "missing-prerequisite",
    "class-parent", "class-child", "unknown-class-access"])(
    "keeps the captured earlier exchange when replacement is not proven: %s", (change) => {
      const input = fixture(), guide = input.sources[0]!.guide;
      const next = guide.steps.find((row) => row.id === "source-step-0096")!;
      if (change === "target") next.directives.find((row) => row.tag === ".target")!.arguments = "Kravel Koalbeard";
      if (change === "position") next.directives.find((row) => row.position)!.position!.x += 1;
      if (change === "functional-work" || change === "fallback-guard") next.directives.push({
        ...next.directives[0]!, tag: change === "functional-work" ? ".use" : ".isQuestTurnedIn",
        arguments: change === "functional-work" ? "5800" : "1038", questId: null, position: null,
      });
      if (change === "nonadjacent") next.ordinal += 1;
      if (change === "child-prerequisite") input.combat.quests.find((row) => row.questId === 1112)!
        .prerequisites = { allOf: [], anyOf: [] };
      if (change === "dependent-port-quest") input.combat.quests.find((row) => row.questId === 1039)!
        .prerequisites = { allOf: [1111], anyOf: [] };
      if (change === "indirect-dependency") input.combat.quests.find((row) => row.questId === 1038)!
        .prerequisites = { allOf: [1112], anyOf: [] };
      if (change === "missing-prerequisite") input.combat.quests = input.combat.quests.filter((row) => row.questId !== 1038);
      if (change === "class-parent") input.combat.quests.find((row) => row.questId === 1111)!.requiredClasses = 256;
      if (change === "class-child") input.combat.quests.find((row) => row.questId === 1112)!.requiredClasses = 256;
      if (change === "unknown-class-access") delete input.combat.quests.find((row) => row.questId === 1111)!.requiredClasses;
      const earlier = guide.steps.find((row) => row.id === "source-step-0095")!;
      const profile = createCampaignSourceProfile("human", null);
      const view = getGuideStepView(earlier, profile, { dungeons: [] });
      const phase = view.directives.find((row) => row.tag === ".turnin" && row.questId === 1111)!;
      expect(createCampaignSourcePhaseSelector(guide, profile, [], input.combat.quests)(earlier, view, phase))
        .toBe(true);
    },
  );
});
