import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import fixtureData from "./fixtures/arathi-handoff-programs-70205.json" with { type: "json" };

interface HandoffFixture {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: QuestCatalog;
  combat: CombatDataset;
}

function fixture(): HandoffFixture {
  return {
    plan: {
      release: "captured-arathi-handoffs",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: fixtureData.sourceArchiveSha256,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [659, 663],
      actions: [],
      legs: [],
    },
    sources: fixtureData.sources.map((source): CampaignSource => {
      const guide = importedChapterSchema.parse(source.guide);
      return { reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)!, guide };
    }),
    catalog: questCatalogSchema.parse({ ...fixtureData.catalogMetadata, quests: fixtureData.catalog }),
    combat: combatDatasetSchema.parse({
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Exact captured NPC handoffs, without kill or payout estimates.",
      provider: fixtureData.provider,
      questCatalogReference: fixtureData.combatCatalogReference,
      quests: fixtureData.references,
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
    }),
  };
}

describe("captured Arathi conversation prerequisites", () => {
  it.each([659, 663])("qualifies quest %i without changing NPCs, requirements or source instructions", (questId) => {
    const input = fixture();
    const before = structuredClone(input);
    const method = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(questId);
    expect(method).toBeDefined();
    const original = input.catalog.quests.find((quest) => quest.questId === questId)!;
    expect(method!.quest).toEqual({ ...original, unsupportedRequirements: [] });
    expect(method!.canLeaveAfterPickup).toBe(true);
    expect(method!.actions.map((action) => action.questChanges.map((change) => change.state)))
      .toEqual([["accepted"], ["rewarded"]]);
    expect(method!.actions[1]!.instructions).toContain(`Talk to ${original.ends[0]!.name}`);
    expect(method!.actions.every((action) => action.source !== null)).toBe(true);
    expect(input).toEqual(before);
  });

  it.each([659, 663])("keeps quest %i unresolved when the exact wording changes", (questId) => {
    const input = fixture();
    input.combat.quests.find((quest) => quest.questId === questId)!.objectiveText = [
      questId === 659 ? "Find Quae and protect Kinelory." : "Talk to Captain O'Breen then fight the raiders.",
    ];
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(questId)).toBe(false);
  });

  it.each([
    "archive", "build", "provider", "object-provider", "class", "faction", "recipient", "position",
    "source-version", "use-device", "other-quest-guard", "extra-kills",
  ])("does not qualify Land Ho! when evidence or requirements differ: %s", (change) => {
    const input = fixture();
    const quest = input.catalog.quests.find((row) => row.questId === 663)!;
    const source = input.sources.find((row) => row.guide.chapterId === "chapter-21-39-40-alterac-arathi")!;
    const step = source.guide.steps.find((row) => row.id === "source-step-0139")!;
    if (change === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "0".repeat(64) };
    if (change === "build") input.plan = { ...input.plan, targetBuild: 70450 };
    if (change === "provider") input.combat.provider.npcSha256 = "0".repeat(64);
    if (change === "object-provider") input.combat.provider.objectSha256 = "0".repeat(64);
    if (change === "class") quest.requiredClasses = 1;
    if (change === "faction") quest.requiredRaces = 2;
    if (change === "recipient") step.directives.find((row) => row.tag === ".target")!.arguments = "Quae";
    if (change === "position") step.directives.find((row) => row.position)!.position!.zone = "1457";
    if (change === "source-version") source.guide.version = "unreviewed-source";
    if (change === "use-device" || change === "other-quest-guard") step.directives.push({
      ...step.directives[0]!, tag: change === "use-device" ? ".use" : ".isQuestTurnedIn",
      arguments: change === "use-device" ? "4482" : "658", questId: null, position: null,
    });
    if (change === "extra-kills") input.combat.quests.find((row) => row.questId === 663)!.creatureIds = [2770];
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(663)).toBe(false);
  });
});
