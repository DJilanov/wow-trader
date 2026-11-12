import { z } from "zod";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { parseClientQuestSnapshots } from "./quest-client-cache.js";
import {
  calculateClientQuestXp,
  clientQuestRewardReferenceSchema,
  type ClientQuestRewardReference,
} from "./quest-client-reward.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const tableSnapshotSchema = z.object({
  sourceSha256: hash,
  questXpSha256: hash,
  document: z.object({
    schemaVersion: z.literal("forever-leveling-evidence.v1"),
    capturedAt: z.iso.datetime(),
    build: z.object({
      product: z.literal("wow_classic_beta"),
      clientVersion: z.string().regex(/^1\.60\.1\.[1-9]\d{3,5}$/),
      buildNumber: z.number().int().positive(),
    }),
    definitionsRevision: z.string().regex(/^[a-f0-9]{40}$/),
    hotfixSha256: hash,
    questXpRows: z
      .array(
        z.object({
          id: z.number().int().min(1).max(100),
          Difficulty: z.array(z.number().int().min(0).max(1_000_000)).length(10),
        }),
      )
      .min(60)
      .max(100),
  }),
});
const clientBindingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  level: z.number().int().min(1).max(60),
  minLevel: z.number().int().min(1).max(60),
  sources: z.number().int().positive(),
  rewards: z.object({
    xpDifficulty: z.number().int().min(0).max(9),
    xpMultiplier: z.number().finite().min(0).max(100),
  }),
});

export interface ClientRewardResolution {
  readonly questId: number;
  readonly reference: ClientQuestRewardReference;
  readonly previous: { readonly reward: QuestRewardFact; readonly catalog: QuestCatalogEntry };
}

/** Replace selected historical estimates using agreeing client bindings and decoded tables. */
export function deriveClientRewardEstimates(input: {
  readonly catalog: QuestCatalog;
  readonly facts: readonly QuestRewardFact[];
  readonly snapshots: readonly unknown[];
  readonly tableSnapshots: readonly unknown[];
  readonly questIds: readonly number[];
  readonly questLevelCorrections?: readonly number[];
  readonly referencedAt: string;
}): {
  readonly catalog: QuestCatalog;
  readonly facts: readonly QuestRewardFact[];
  readonly resolutions: readonly ClientRewardResolution[];
  readonly skipped: readonly { readonly questId: number; readonly reason: string }[];
} {
  z.iso.datetime().parse(input.referencedAt);
  const ids = new Set(input.questIds);
  const corrections = new Set(input.questLevelCorrections ?? []);
  if (
    !ids.size ||
    ids.size !== input.questIds.length ||
    input.questIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    corrections.size !== (input.questLevelCorrections?.length ?? 0) ||
    [...corrections].some((id) => !ids.has(id)) ||
    new Set(input.facts.map((fact) => fact.questId)).size !== input.facts.length
  )
    throw new Error(
      "Client reward selection and correction IDs must be unique and explicitly scoped.",
    );
  const target = input.catalog.targetBuild;
  const snapshots = [...parseClientQuestSnapshots(input.snapshots, target)].sort(
    (left, right) =>
      Number(left.document.meta.clientBuild.split(".").at(-1)) -
      Number(right.document.meta.clientBuild.split(".").at(-1)),
  );
  const tables = z
    .tuple([tableSnapshotSchema, tableSnapshotSchema])
    .parse(input.tableSnapshots)
    .sort((left, right) => left.document.build.buildNumber - right.document.build.buildNumber);
  for (const [index, table] of tables.entries()) {
    const build = table.document.build;
    const rows = new Map(table.document.questXpRows.map((row) => [row.id, row.Difficulty]));
    if (
      build.clientVersion !== `1.60.1.${build.buildNumber}` ||
      build.clientVersion !== snapshots[index]!.document.meta.clientBuild ||
      rows.size !== table.document.questXpRows.length ||
      Array.from({ length: 60 }, (_, at) => at + 1).some((level) => !rows.has(level))
    )
      throw new Error(
        "Client QuestXP table identity or level coverage differs from its query cache.",
      );
  }
  if (
    tables[0]!.questXpSha256 !== tables[1]!.questXpSha256 ||
    tables[0]!.sourceSha256 === tables[1]!.sourceSha256 ||
    JSON.stringify(tables[0]!.document.questXpRows) !==
      JSON.stringify(tables[1]!.document.questXpRows)
  )
    throw new Error("Matching-build and corroborating QuestXP tables disagree.");
  const tableRows = new Map(tables[0]!.document.questXpRows.map((row) => [row.id, row.Difficulty]));
  const facts = new Map(input.facts.map((fact) => [fact.questId, fact]));
  const definitions = new Map(input.catalog.quests.map((quest) => [quest.questId, quest]));
  const resolutions: ClientRewardResolution[] = [],
    skipped: { questId: number; reason: string }[] = [];
  let catalogChanged = false;
  for (const questId of input.questIds) {
    const previous = facts.get(questId),
      definition = definitions.get(questId);
    const skip = (reason: string): void => {
      skipped.push({ questId, reason });
    };
    if (!previous || !definition) {
      skip("Missing existing reward or catalog identity.");
      continue;
    }
    if (
      previous.status === "conflict" ||
      (previous.evidenceKind !== "historical-reference" &&
        previous.evidenceKind !== "client-table-reference")
    ) {
      skip("Published, observed, conflicted or unlabeled reward retained.");
      continue;
    }
    const clients = snapshots.map((snapshot) =>
      clientBindingSchema.safeParse(snapshot.document.quests[String(questId)]),
    );
    if (!clients[0]!.success || !clients[1]!.success) {
      skip("Missing or unsupported client reward binding.");
      continue;
    }
    const first = clients[0]!.data,
      second = clients[1]!.data;
    if (
      first.title !== definition.title ||
      second.title !== definition.title ||
      first.level !== second.level ||
      first.minLevel !== second.minLevel ||
      first.rewards.xpDifficulty !== second.rewards.xpDifficulty ||
      first.rewards.xpMultiplier !== second.rewards.xpMultiplier ||
      first.minLevel !== definition.minimumLevel ||
      definition.requiredClasses !== 0 ||
      (first.level !== definition.questLevel && !corrections.has(questId))
    ) {
      skip("Client identity, access, quest level or reward bindings disagree.");
      continue;
    }
    const reference = clientQuestRewardReferenceSchema.parse({
      schema: "client-quest-reward-reference.v1",
      calculation: "table-multiplier-reduction-rounding.v1",
      targetBuild: target,
      questId,
      questLevel: first.level,
      minimumLevel: first.minLevel,
      difficulty: first.rewards.xpDifficulty,
      baseXp: tableRows.get(first.level)![first.rewards.xpDifficulty],
      xpMultiplier: first.rewards.xpMultiplier,
      cacheSources: snapshots.map((source) => ({
        build: Number(source.document.meta.clientBuild.split(".").at(-1)),
        url: source.sourceUrl,
        sha256: source.sourceSha256,
      })),
      tableSources: tables.map((source) => ({
        build: source.document.build.buildNumber,
        evidenceSha256: source.sourceSha256,
        questXpSha256: source.questXpSha256,
        definitionsRevision: source.document.definitionsRevision,
        hotfixSha256: source.document.hotfixSha256,
      })),
    });
    const next: QuestRewardFact = {
      questId,
      fullXp: calculateClientQuestXp(reference, 1),
      rewardBasis: "final-reward",
      questLevel: reference.questLevel,
      minimumLevel: reference.minimumLevel,
      xpByLevel: Array.from({ length: 60 - reference.minimumLevel }, (_, index) => {
        const level = reference.minimumLevel + index;
        return { level, xp: calculateClientQuestXp(reference, level) };
      }),
      status: "available",
      evidenceKind: "client-table-reference",
      clientReference: reference,
      referenceBaseXp: reference.baseXp,
      capturedAt: input.referencedAt,
      sourceUrl: `Calculated client QuestXP reference; table-multiplier-reduction-rounding.v1; ${reference.cacheSources.map((source) => `${source.url}#sha256=${source.sha256}`).join("; ")}. Data from Efficient Games https://efficient.games, CC BY 4.0. Includes the client multiplier; no additional dungeon coefficient. Not an observed payout; XP buffs and server rounding remain unverified.`,
    };
    questRewardFactSchema.parse(next);
    facts.set(questId, next);
    if (definition.questLevel !== first.level) {
      definitions.set(questId, { ...definition, questLevel: first.level });
      catalogChanged = true;
    }
    resolutions.push({ questId, reference, previous: { reward: previous, catalog: definition } });
  }
  const note =
    "Explicit client quest-level corrections accompany complete regenerated reward curves; prior facts retained in client reward resolution provenance. Access masks, pickup minima and objective-method holds unchanged. Client-table values remain estimates, not observed payouts.";
  return {
    catalog: catalogChanged
      ? {
          ...input.catalog,
          quests: input.catalog.quests.map((quest) => definitions.get(quest.questId)!),
          authorizationNote: input.catalog.authorizationNote.includes(note)
            ? input.catalog.authorizationNote
            : `${input.catalog.authorizationNote}\n${note}`.trim(),
        }
      : input.catalog,
    facts: input.facts.map((fact) => facts.get(fact.questId)!),
    resolutions,
    skipped,
  };
}
