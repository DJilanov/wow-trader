import { cache } from "react";
import {
  readPublishedReference,
  readReferenceIndex,
  referenceIsFresh,
  referenceDisplayable,
  referenceClientConflicts,
  referenceIndexGaps,
  type ReferenceClientItem,
  type ReferenceRecord,
  type ReferenceTask,
} from "@wow-trader/reference-data";
import { getReferenceClientItems } from "./data";

type ReferenceClientContext =
  | {
      readonly items: readonly ReferenceClientItem[];
    }
  | { readonly product: string }
  | { readonly quests: ReadonlyMap<number, string | null> };

export const getCatalogReference = cache(
  async (
    game: ReferenceTask["game"],
    kind: ReferenceTask["kind"],
    id: number,
  ): Promise<ReferenceRecord | null> => {
    const root = process.env.WOW_TRADER_REFERENCE_DIRECTORY;
    if (!root) return null;
    try {
      const record = await readPublishedReference(root, { game, kind, id });
      return record && referenceDisplayable(record) ? record : null;
    } catch (error) {
      console.error(
        "Catalog reference validation failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    }
  },
);

export async function getIndexableReferenceIds(
  game: ReferenceTask["game"],
  kind: ReferenceTask["kind"],
  client?: ReferenceClientContext,
): Promise<ReadonlyMap<number, Date>> {
  const root = process.env.WOW_TRADER_REFERENCE_DIRECTORY;
  if (!root) return new Map();
  try {
    const index = await readReferenceIndex(root);
    const entries =
      index?.records.filter(
        (record) => record.game === game && record.kind === kind && referenceIsFresh(record),
      ) ?? [];
    const approved = new Map<number, Date>();
    let clientItems: readonly ReferenceClientItem[] | null = null;
    if (client && !("quests" in client)) {
      clientItems =
        "items" in client
          ? client.items
          : await getReferenceClientItems(
              entries.map((entry) => entry.id),
              client.product,
            );
    }
    const identities = clientItems ? new Map(clientItems.map((item) => [item.itemId, item])) : null;
    for (let offset = 0; offset < entries.length; offset += 16) {
      const records = await Promise.all(
        entries.slice(offset, offset + 16).map(async (entry): Promise<ReferenceRecord | null> => {
          try {
            return await readPublishedReference(root, entry);
          } catch {
            return null;
          }
        }),
      );
      for (const record of records) {
        if (!record || referenceIndexGaps(record).length) continue;
        if (kind === "item" && identities) {
          const nativeItem = identities.get(record.id);
          if (!nativeItem || referenceIndexGaps(record, nativeItem).length) continue;
        }
        if (kind === "quest" && client && "quests" in client) {
          if (!client.quests.has(record.id)) continue;
          const title = client.quests.get(record.id);
          if (title && title !== record.name) continue;
        }
        approved.set(record.id, new Date(record.capturedAt));
      }
    }
    if (approved.size !== entries.length)
      console.error("Unusable published catalog references excluded from sitemap", {
        game,
        kind,
        excluded: entries.length - approved.size,
      });
    return approved;
  } catch (error) {
    console.error(
      "Catalog reference index validation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return new Map();
  }
}

export function itemReferenceMatchesClient(
  record: ReferenceRecord | null,
  item: ReferenceClientItem,
): boolean {
  return Boolean(record && !referenceClientConflicts(record, item).length);
}
