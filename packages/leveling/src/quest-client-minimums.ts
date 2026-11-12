import { z } from "zod";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { parseClientQuestSnapshots } from "./quest-client-cache.js";

const clientLevelSchema = z.object({
  title: z.string().trim().min(1).max(300),
  level: z.number().int().min(1).max(60),
  minLevel: z.number().int().min(1).max(60),
  sources: z.number().int().positive(),
});

export interface ClientMinimumLevelResolution {
  readonly questId: number;
  readonly minimumLevel: number;
  readonly previous: QuestCatalogEntry;
  readonly sources: readonly { readonly url: string; readonly sha256: string }[];
}

/** Reconcile selected pickup minima without relabeling reward levels or their reduction tables. */
export function reconcileClientMinimumLevels(input: {
  readonly catalog: QuestCatalog;
  readonly snapshots: readonly unknown[];
  readonly questIds: readonly number[];
}): {
  readonly catalog: QuestCatalog;
  readonly resolutions: readonly ClientMinimumLevelResolution[];
} {
  const { catalog } = input;
  if (
    !input.questIds.length ||
    new Set(input.questIds).size !== input.questIds.length ||
    input.questIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new Error("Client minimum selection must contain unique explicit quest IDs.");
  const snapshots = parseClientQuestSnapshots(input.snapshots, catalog.targetBuild);
  const definitions = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const resolutions: ClientMinimumLevelResolution[] = [];
  for (const questId of input.questIds) {
    const definition = definitions.get(questId);
    if (!definition || definition.requiredClasses !== 0)
      throw new Error(`Quest ${questId} is not an existing ordinary quest.`);
    const clients = snapshots.map((snapshot) =>
      clientLevelSchema.parse(snapshot.document.quests[String(questId)]),
    );
    const first = clients[0]!;
    if (
      clients.some(
        (quest) =>
          quest.title !== definition.title ||
          quest.level !== definition.questLevel ||
          quest.minLevel !== first.minLevel,
      )
    )
      throw new Error(`Quest ${questId} has incompatible client identity, quest level or pickup minimum.`);
    definitions.set(questId, { ...definition, minimumLevel: first.minLevel });
    resolutions.push({
      questId,
      minimumLevel: first.minLevel,
      previous: definition,
      sources: snapshots.map((snapshot) => ({
        url: snapshot.sourceUrl,
        sha256: snapshot.sourceSha256,
      })),
    });
  }
  const note = `Client pickup minima reconciled for quests ${input.questIds.join(",")}; ${snapshots.map((row) => `${row.document.meta.clientBuild} sha256 ${row.sourceSha256}`).join("; ")}. Efficient Games https://efficient.games, CC BY 4.0. Quest levels, reward tables and other access requirements unchanged; previous minima retained in resolution provenance.`;
  return {
    catalog: {
      ...catalog,
      quests: catalog.quests.map((quest) => definitions.get(quest.questId)!),
      authorizationNote: catalog.authorizationNote.includes(note)
        ? catalog.authorizationNote
        : `${catalog.authorizationNote}\n${note}`.trim(),
    },
    resolutions,
  };
}
