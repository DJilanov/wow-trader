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
import { helperAbsoluteUrl } from "./seo";
import {
  assessSearchSurface,
  isIndexableSearchSurface,
  type SearchSurfaceEntry,
} from "./search-surface";

type ReferenceClientContext =
  | {
      readonly items: readonly ReferenceClientItem[];
    }
  | { readonly product: string }
  | { readonly quests: ReadonlyMap<number, string | null> };

interface CatalogReferenceSurfaceOptions {
  readonly path?: string;
  readonly pageExists?: boolean;
  readonly clientItem?: ReferenceClientItem | null;
  readonly clientQuestPresent?: boolean;
  readonly clientQuestTitle?: string | null;
}

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
        if (!record) continue;
        const surface = getCatalogReferenceSearchSurface(game, kind, record.id, record, {
          ...(kind === "item" && identities
            ? { clientItem: identities.get(record.id) ?? null }
            : {}),
          ...(kind === "quest" && client && "quests" in client
            ? {
                clientQuestPresent: client.quests.has(record.id),
                clientQuestTitle: client.quests.get(record.id) ?? null,
              }
            : {}),
        });
        if (!isIndexableSearchSurface(surface)) continue;
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

export function getCatalogReferenceSearchSurface(
  game: ReferenceTask["game"],
  kind: ReferenceTask["kind"],
  id: number,
  record: ReferenceRecord | null,
  options: CatalogReferenceSurfaceOptions = {},
): SearchSurfaceEntry {
  const clientContextSupplied =
    "clientItem" in options || "clientQuestPresent" in options || "clientQuestTitle" in options;
  const clientIdentityPresent =
    kind === "item"
      ? options.clientItem !== null
      : kind === "quest"
        ? options.clientQuestPresent !== false
        : true;
  const identityConflict = Boolean(
    record &&
    ((kind === "item" &&
      options.clientItem &&
      referenceClientConflicts(record, options.clientItem).length > 0) ||
      (kind === "quest" && options.clientQuestTitle && record.name !== options.clientQuestTitle)),
  );
  const requiredEvidencePresent = Boolean(
    record &&
    referenceIndexGaps(
      record,
      kind === "item" && options.clientItem ? options.clientItem : undefined,
    ).length === 0,
  );
  const path = options.path ?? catalogReferencePath(game, kind, id);
  const url = helperAbsoluteUrl(path);
  return assessSearchSurface({
    url,
    pageExists:
      options.pageExists ?? (Boolean(record) && (!clientContextSupplied || clientIdentityPresent)),
    authoritativeIdentityPresent: clientIdentityPresent,
    identityConflict,
    requiredEvidencePresent,
    lastModified: record ? safeDate(record.capturedAt) : null,
    contentHash: record?.sourceSha256 ?? null,
    outgoingLinks:
      record?.relations.flatMap((relation) => {
        const relatedPath = catalogRelationPath(game, relation.kind, relation.id);
        return relatedPath ? [helperAbsoluteUrl(relatedPath)] : [];
      }) ?? [],
    evidenceKinds: [
      ...(clientContextSupplied && clientIdentityPresent ? (["exact_client"] as const) : []),
      ...(record ? (["published_reference"] as const) : []),
    ],
  });
}

function catalogReferencePath(
  game: ReferenceTask["game"],
  kind: ReferenceTask["kind"],
  id: number,
): string {
  const segment = kind === "spell" ? "recipes" : `${kind}s`;
  return `/${game}/encyclopedia/${segment}/${id}`;
}

function catalogRelationPath(game: ReferenceTask["game"], kind: string, id: number): string | null {
  const segment =
    kind === "spell"
      ? "recipes"
      : kind === "item" || kind === "quest" || kind === "npc" || kind === "object"
        ? `${kind}s`
        : null;
  return segment ? `/${game}/encyclopedia/${segment}/${id}` : null;
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}
