import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";
import { providedItemDeliveryRecipients, npcDeliveryRecipients } from "./quest-catalog-delivery.js";

/** Resolve proven parcel requirements locally; preserve the captured catalog and selected visits. */
export function providedDeliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
): QuestCatalog {
  return deliveryFundingCatalog(catalog, combat, selectedQuestIds, providedItemDeliveryRecipients);
}

export function npcDeliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
): QuestCatalog {
  return deliveryFundingCatalog(catalog, combat, selectedQuestIds, npcDeliveryRecipients);
}

function deliveryFundingCatalog(
  catalog: QuestCatalog,
  combat: CombatDataset,
  selectedQuestIds: ReadonlySet<number>,
  recipients: (
    quest: QuestCatalogEntry,
    reference: CombatQuestReference | undefined,
  ) => readonly QuestCatalogEntry["ends"][number][],
): QuestCatalog {
  if (
    catalog.targetBuild !== combat.targetBuild ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    !catalog.itemSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256
  )
    return catalog;
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  let changed = false;
  const quests = catalog.quests.map((quest) => {
    if (selectedQuestIds.has(quest.questId)) return quest;
    const ends = recipients(quest, references.get(quest.questId));
    if (!ends.length) return quest;
    const resolved = { ...quest, ends: [...ends], unsupportedRequirements: [] };
    if (!isUnrestrictedFundingQuest(resolved)) return quest;
    changed = true;
    return resolved;
  });
  return changed ? { ...catalog, quests } : catalog;
}
