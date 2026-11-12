import { z } from "zod";
import { questCatalogSchema, type QuestCatalog, type QuestCatalogEntry } from "./quest-catalog.js";
import { parseClientQuestSnapshots } from "./quest-client-cache.js";

const timedClientQuestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  level: z.number().int().min(1).max(60),
  minLevel: z.number().int().min(1).max(60),
  timeLimitSeconds: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sources: z.number().int().positive(),
});

export interface ClientQuestTimingResolution {
  readonly questId: number;
  readonly timeLimitSeconds: number;
  readonly previous: QuestCatalogEntry;
  readonly sources: readonly { readonly url: string; readonly sha256: string }[];
}

/** Add corroborated deadlines without inferring that unqueried quests have no deadline. */
export function reconcileClientQuestTiming(input: {
  readonly catalog: QuestCatalog;
  readonly snapshots: readonly unknown[];
  readonly questIds: readonly number[];
}): {
  readonly catalog: QuestCatalog;
  readonly resolutions: readonly ClientQuestTimingResolution[];
} {
  if (
    !input.questIds.length ||
    new Set(input.questIds).size !== input.questIds.length ||
    input.questIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new Error("Client timing selection must contain unique explicit quest IDs.");
  const snapshots = parseClientQuestSnapshots(input.snapshots, input.catalog.targetBuild);
  const definitions = new Map(input.catalog.quests.map((quest) => [quest.questId, quest]));
  const resolutions: ClientQuestTimingResolution[] = [];
  for (const questId of input.questIds) {
    const definition = definitions.get(questId);
    if (!definition) throw new Error(`Quest ${questId} is absent from the timing catalog.`);
    const clients = snapshots.map((snapshot) =>
      timedClientQuestSchema.parse(snapshot.document.quests[String(questId)]),
    );
    const first = clients[0]!;
    if (
      clients.some(
        (quest) =>
          quest.title !== definition.title ||
          quest.level !== definition.questLevel ||
          quest.minLevel !== definition.minimumLevel ||
          quest.timeLimitSeconds !== first.timeLimitSeconds,
      ) ||
      (definition.timeLimitSeconds !== undefined &&
        definition.timeLimitSeconds !== first.timeLimitSeconds)
    )
      throw new Error(`Quest ${questId} has incompatible client identity or deadline claims.`);
    const source = (
      snapshot: (typeof snapshots)[number],
    ): NonNullable<QuestCatalogEntry["timeLimitSources"]>[number] => ({
      build: Number(snapshot.document.meta.clientBuild.split(".").at(-1)),
      url: snapshot.sourceUrl,
      sha256: snapshot.sourceSha256,
    });
    definitions.set(questId, {
      ...definition,
      timeLimitSeconds: first.timeLimitSeconds,
      timeLimitSources: [source(snapshots[0]), source(snapshots[1])],
    });
    resolutions.push({
      questId,
      timeLimitSeconds: first.timeLimitSeconds,
      previous: definition,
      sources: snapshots.map((snapshot) => ({
        url: snapshot.sourceUrl,
        sha256: snapshot.sourceSha256,
      })),
    });
  }
  return {
    catalog: questCatalogSchema.parse({
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => definitions.get(quest.questId)!),
    }),
    resolutions,
  };
}
