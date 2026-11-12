import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";
import { providedItemDeliveryRecipients, npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import type { CampaignSourceDelivery } from "./campaign-source-deliveries.js";

/** Eligibility here permits carrying a courier; the insertion checker still verifies its full NPC exchange. */
export function fundingDeliveryPickupQuestIds(
  catalog: QuestCatalog,
  combat: CombatDataset,
  deliveries: ReadonlyMap<number, CampaignSourceDelivery>,
): ReadonlySet<number> {
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  return new Set(catalog.quests.filter((quest) =>
    isUnrestrictedFundingQuest({ ...quest, unsupportedRequirements: [] }) &&
    (deliveries.get(quest.questId)?.canLeaveAfterPickup === true ||
      npcDeliveryRecipients(quest, references.get(quest.questId)).length > 0 ||
      providedItemDeliveryRecipients(quest, references.get(quest.questId)).length > 0))
    .map((quest) => quest.questId));
}

/** Resolve proven parcel requirements locally; retain selected NPC visits and object source programs. */
export function providedDeliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
  includeSelected: boolean = false,
): QuestCatalog {
  return deliveryFundingCatalog(catalog, combat, selectedQuestIds, providedItemDeliveryRecipients, includeSelected);
}

export function npcDeliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
  includeSelected: boolean = false,
): QuestCatalog {
  return deliveryFundingCatalog(catalog, combat, selectedQuestIds, npcDeliveryRecipients, includeSelected);
}

function deliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
  recipients: (
    quest: QuestCatalogEntry,
    reference: CombatQuestReference | undefined,
  ) => readonly QuestCatalogEntry["ends"][number][],
  includeSelected: boolean,
): QuestCatalog {
  if (
    catalog.targetBuild !== combat.targetBuild ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    !catalog.itemSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256 ||
    (catalog.quests.some((quest) => quest.objectStarts?.length || quest.objectEnds?.length) &&
      catalog.objectSha256 !== combat.provider.objectSha256)
  )
    return catalog;
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  let changed = false;
  const quests = catalog.quests.map((quest) => {
    if (selectedQuestIds.has(quest.questId) && !includeSelected && !quest.objectStarts?.length) return quest;
    const ends = recipients(quest, references.get(quest.questId));
    if (!ends.length) return quest;
    const resolved = { ...quest, ends: [...ends], unsupportedRequirements: [] };
    if (!isUnrestrictedFundingQuest(resolved)) return quest;
    changed = true;
    return resolved;
  });
  return changed ? { ...catalog, quests } : catalog;
}
