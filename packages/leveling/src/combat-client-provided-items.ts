import { z } from "zod";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";
import { parseClientQuestSnapshots } from "./quest-client-cache.js";

const clientParcelSchema = z.object({
  title: z.string().trim().min(1).max(300),
  level: z.number().int().min(1).max(60),
  minLevel: z.number().int().min(1).max(60),
  sources: z.number().int().positive(),
  startItemId: z.number().int().positive(),
  objectivesText: z.string().min(1).max(12000),
  objectives: z.tuple([
    z.object({
      id: z.number().int().positive(),
      type: z.literal("item"),
      typeId: z.literal(1),
      objectId: z.number().int().positive(),
      amount: z.literal(1),
      storageIndex: z.literal(0),
    }),
  ]),
});

export interface ClientProvidedItemResolution {
  readonly questId: number;
  readonly targetBuild: number;
  readonly itemId: number;
  readonly clientObjectiveId: number;
  readonly sources: readonly { readonly url: string; readonly sha256: string }[];
  readonly previous: { readonly combat: CombatQuestReference; readonly catalog: QuestCatalogEntry };
  readonly attribution: string;
}

/** Correct a supplied parcel's identity without treating its predecessor's loot as new combat. */
export function reconcileClientProvidedItems(input: {
  readonly combat: CombatDataset;
  readonly catalog: QuestCatalog;
  readonly snapshots: readonly unknown[];
  readonly questIds: readonly number[];
}): { readonly combat: CombatDataset; readonly resolutions: readonly ClientProvidedItemResolution[] } {
  const { combat, catalog } = input;
  if (
    combat.targetBuild !== catalog.targetBuild ||
    combat.provider.revision !== catalog.providerRevision ||
    combat.provider.questSha256 !== catalog.questSha256 ||
    combat.provider.npcSha256 !== catalog.npcSha256 ||
    !catalog.itemSha256 ||
    combat.provider.itemSha256 !== catalog.itemSha256
  )
    throw new Error("Client parcels require matching combat/catalog identities and item provenance.");
  if (
    !input.questIds.length ||
    new Set(input.questIds).size !== input.questIds.length ||
    input.questIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new Error("Client parcel selection must contain unique explicit quest IDs.");
  const snapshots = parseClientQuestSnapshots(input.snapshots, combat.targetBuild);
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  const resolutions: ClientProvidedItemResolution[] = [];
  for (const questId of input.questIds) {
    const reference = references.get(questId),
      definition = catalog.quests.find((quest) => quest.questId === questId),
      item = reference?.itemObjectives?.[0];
    if (
      !reference ||
      !definition?.providedItem ||
      !item ||
      reference.itemObjectives?.length !== 1 ||
      !item.provided ||
      item.quantity !== 1 ||
      item.objectiveIndex !== 1 ||
      item.npcIds.length ||
      item.objectIds?.length ||
      item.groundPickup ||
      item.vendorEvidence ||
      item.rewardEvidence ||
      item.sharingReference ||
      item.sharing !== "unknown" ||
      reference.startItem ||
      reference.creatureIds.length ||
      reference.killQuotas?.length ||
      reference.killQuotaConflicts?.length ||
      reference.onlyCreatureObjectives ||
      reference.onlyInteractionObjectives ||
      reference.requiredClasses !== 0 ||
      definition.requiredClasses !== 0 ||
      definition.groundPickup ||
      definition.groundPickups?.length ||
      definition.objectStarts?.length ||
      definition.objectEnds?.length ||
      definition.objectives.length ||
      item.itemName !== definition.providedItem.name
    )
      throw new Error(`Quest ${questId} is not an existing sole, supplied parcel objective.`);
    const clients = snapshots.map((snapshot) =>
      clientParcelSchema.parse(snapshot.document.quests[String(questId)]),
    );
    const first = clients[0]!;
    if (
      clients.some(
        (quest) =>
          quest.title !== definition.title ||
          quest.level !== definition.questLevel ||
          quest.minLevel !== definition.minimumLevel ||
          quest.startItemId !== definition.providedItem!.itemId ||
          quest.objectives[0].objectId !== definition.providedItem!.itemId ||
          JSON.stringify(quest.objectives) !== JSON.stringify(first.objectives) ||
          JSON.stringify(reference.objectiveText) !== JSON.stringify([quest.objectivesText]),
      )
    )
      throw new Error(`Quest ${questId} has incompatible client parcel identity or objectives.`);
    // Verify the complete delivery text after removing only the proven parcel projection.
    // The active catalog's unsupported flags remain unchanged.
    const recipients = providedItemDeliveryRecipients(
      { ...definition, category: "delivery" },
      { ...reference, itemObjectives: [], itemCreatureIds: [] },
    );
    if (!recipients.length)
      throw new Error(`Quest ${questId} has no matching friendly parcel recipient.`);
    references.set(questId, {
      ...reference,
      itemCreatureIds: [],
      itemObjectives: [{ ...item, itemId: definition.providedItem.itemId }],
    });
    resolutions.push({
      questId,
      targetBuild: combat.targetBuild,
      itemId: definition.providedItem.itemId,
      clientObjectiveId: first.objectives[0].id,
      sources: snapshots.map((snapshot) => ({
        url: snapshot.sourceUrl,
        sha256: snapshot.sourceSha256,
      })),
      previous: { combat: reference, catalog: definition },
      attribution: "Data from Efficient Games (https://efficient.games), licensed under CC BY 4.0.",
    });
  }
  const note = `Client-supplied parcel identities reconciled for quests ${input.questIds.join(",")}; ${snapshots.map((row) => `${row.document.meta.clientBuild} sha256 ${row.sourceSha256}`).join("; ")}. Efficient Games https://efficient.games, CC BY 4.0. Prior item/drop projections are retained in resolution provenance. No reward, access or physical drop count changed.`;
  return {
    combat: {
      ...combat,
      quests: combat.quests.map((quest) => references.get(quest.questId)!),
      provider: {
        ...combat.provider,
        limitations: combat.provider.limitations.includes(note)
          ? combat.provider.limitations
          : [...combat.provider.limitations, note],
      },
    },
    resolutions,
  };
}
