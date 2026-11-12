import { describe, expect, it } from "vitest";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { importedChapterSchema } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import fixtureData from "./fixtures/stalvan-courier-programs-70205.json" with { type: "json" };
import { reviewedHandoffInstruction } from "./campaign-reviewed-handoff.js";

import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";
const ids = [67, 69, 74, 79, 80, 97];

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset; sources: CampaignSource[] } {
  const sources = fixtureData.sources.map((source): CampaignSource => {
    const guide = importedChapterSchema.parse(source.guide);
    return { reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)!, guide };
  });
  const catalog = questCatalogSchema.parse({ ...fixtureData.catalogMetadata, quests: fixtureData.catalog });
  const combat = combatDatasetSchema.parse({ schema: "forever-combat-reference.v1", targetBuild: 70205, publication: "private-reference", authorizationNote: "Exact captured courier subset for regression checks; no combat or payout data is implied.", provider: fixtureData.provider, npcs: [], dungeons: [], killXpEvidence: [], questCatalogReference: fixtureData.combatCatalogReference, quests: fixtureData.references });
  const plan: CampaignPlan = { release: "reviewed-stalvan-couriers", race: "human", leaderClass: "warrior", targetBuild: 70205, sourceArchiveSha256: fixtureData.sourceArchiveSha256, sharedQuestsOnly: true, sharedSourceQuestIds: fixtureData.originalSharedQuestIds, actions: [], legs: [] };
  return { plan, catalog, combat, sources };
}

describe("exact Stalvan object and courier handoffs", () => {
  it.each(ids)("qualifies actual courier %i with unchanged endpoints, parcel and prerequisites", (questId) => {
    const input = fixture();
    const before = structuredClone(input);
    const method = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(questId)!;
    expect(method).toBeDefined();
    const original = input.catalog.quests.find((quest) => quest.questId === questId)!;
    expect(method.quest.providedItem).toEqual(original.providedItem);
    expect(method.quest.prerequisites).toEqual(original.prerequisites);
    expect(method.actions.map((action) => action.questChanges.map((change) => change.state))).toEqual([["accepted"], ["rewarded"]]);
    const proof = fixtureData.proofs.find((row) => row.quest.questId === questId)!;
    expect(method.actions[0]!.source).toEqual(proof.pickup!.source);
    expect(method.actions[1]!.source).toEqual(proof.handIn!.source);
    expect(input).toEqual(before);
  });

  it.each(["archive", "build", "provider", "wording", "parcel", "object", "class", "source-version", "use-device", "location"])("retains an unresolved parcel handoff when evidence changes: %s", (change) => {
    const input = fixture();
    if (change === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "0".repeat(64) };
    if (change === "build") input.plan = { ...input.plan, targetBuild: 70450 };
    if (change === "provider") input.combat.provider.npcSha256 = "0".repeat(64);
    if (change === "wording") input.combat.quests.find((quest) => quest.questId === 74)!.objectiveText = ["Activate an unrelated device."];
    if (change === "parcel") input.catalog.quests.find((quest) => quest.questId === 74)!.providedItem!.itemId = 917;
    if (change === "object") input.catalog.quests.find((quest) => quest.questId === 74)!.objectStarts![0]!.name = "Unrelated Crate";
    if (change === "class") input.catalog.quests.find((quest) => quest.questId === 74)!.requiredClasses = 128;
    if (change === "source-version") input.sources[0]!.guide.version = "unreviewed-source";
    if (change === "use-device" || change === "location") {
      const step = input.sources[0]!.guide.steps.find((row) => row.id === "source-step-0262")!;
      if (change === "use-device") step.directives.push({ ...step.directives[0]!, tag: ".use", arguments: "916", questId: null, position: null });
      else step.directives.find((row) => row.position)!.position!.zone = "1457";
    }
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(74)).toBe(false);
  });

  it.each([[79, "rewarded"], [80, "accepted"], [97, "rewarded"]] as const)("keeps quest %i's %s visit as safe waiting, without suggesting additional grinding", (questId, phase) => {
    const input = fixture();
    const method = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(questId)!;
    const action = method.actions.find((row) => row.questChanges[0]!.state === phase)!;
    const instructions = action.instructions.join(" ");
    expect(instructions).toContain("wait somewhere safe");
    expect(instructions).not.toContain("consider grinding");
    expect(action.questChanges).toEqual([{ questId, state: phase, title: "The Legend of Stalvan", objectiveIndex: null }]);
  });

  it.each(["source", "position", "phase", "quest"])("does not rewrite a warning outside the exact reviewed interaction: %s", (change) => {
    const input = fixture();
    const method = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(80)!;
    const original = method.actions[0]!;
    const warning = fixtureData.proofs.find((proof) => proof.quest.questId === 80)!.instructionReplacements[0]!.from;
    let action: CampaignAction = original;
    if (change === "source") action = { ...original, source: { ...original.source!, version: "unreviewed-source" } };
    if (change === "position") action = { ...original, positions: original.positions.map((row) => ({ ...row, position: { ...row.position, zone: "1457" } })) };
    if (change === "phase") action = { ...original, questChanges: original.questChanges.map((row) => ({ ...row, state: "objectives-complete" })) };
    if (change === "quest") action = { ...original, questChanges: original.questChanges.map((row) => ({ ...row, questId: 999999 })) };
    expect(reviewedHandoffInstruction(action, warning)).toBe(warning);
  });
});
