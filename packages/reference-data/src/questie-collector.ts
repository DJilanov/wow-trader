import { createHash } from "node:crypto";
import { z } from "zod";
import { referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import { buildQuestXpImport, type QuestXpImportResult } from "./quest-xp-import.js";
import { parseQuestieBaseQuestIds, parseQuestieXpDatabase } from "./questie-source.js";

export const QUESTIE_COLLECTION_REPORT_SCHEMA = "questie-quest-xp-collection.v1";

export interface QuestieQuestCollectionOptions {
  readonly tasks: readonly ReferenceTask[];
  readonly xpSource: string;
  readonly sodQuestSource: string;
  readonly sourceRef: string;
  readonly sodSourceRef: string;
  readonly revision: string;
  readonly targetFlavor: "forever";
  readonly importedAt?: string;
  readonly stagedDirectory?: string;
}

export interface QuestieFlavorExclusion {
  readonly task: ReferenceTask;
  readonly reason: "season-of-discovery";
}

export interface QuestieCollectionCounts {
  readonly total: number;
  readonly available: number;
  readonly missing: number;
  readonly missingXp: number;
  readonly excluded: number;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const countsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    missingXp: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
  })
  .strict();

export const questieCollectionReportSchema = z
  .object({
    schema: z.literal(QUESTIE_COLLECTION_REPORT_SCHEMA),
    generatedAt: z.iso.datetime(),
    targetFlavor: z.literal("forever"),
    source: z
      .object({
        reference: z.string().min(1).max(300),
        revision: z.string().min(1).max(120),
        sha256: sha256Schema,
      })
      .strict(),
    flavorFilter: z
      .object({
        reference: z.string().min(1).max(300),
        sha256: sha256Schema,
        excludedIds: z.array(z.number().int().positive()).max(10_000),
      })
      .strict(),
    counts: countsSchema,
  })
  .strict()
  .superRefine((report, context): void => {
    if (new Set(report.flavorFilter.excludedIds).size !== report.flavorFilter.excludedIds.length)
      context.addIssue({ code: "custom", message: "Duplicate flavor-filter exclusion id" });
    if (report.counts.excluded !== report.flavorFilter.excludedIds.length)
      context.addIssue({ code: "custom", message: "Flavor-filter exclusion count mismatch" });
    if (
      report.counts.total !==
      report.counts.available +
        report.counts.missing +
        report.counts.missingXp +
        report.counts.excluded
    )
      context.addIssue({ code: "custom", message: "Questie collection count mismatch" });
  });
export type QuestieCollectionReport = z.infer<typeof questieCollectionReportSchema>;

export interface QuestieQuestCollectionResult {
  readonly importResult: QuestXpImportResult;
  readonly fallbackTasks: readonly ReferenceTask[];
  readonly exclusions: readonly QuestieFlavorExclusion[];
  readonly counts: QuestieCollectionCounts;
  readonly report: QuestieCollectionReport;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function collectQuestieQuestXp(
  options: QuestieQuestCollectionOptions,
): Promise<QuestieQuestCollectionResult> {
  const tasks = options.tasks.map((task) => referenceTaskSchema.parse(task));
  if (!tasks.length) throw new Error("Questie collection queue is empty");
  if (tasks.length > 10_000) throw new Error("Questie collection queue exceeds 10,000 quests");
  if (tasks.some((task) => task.game !== "forever" || task.kind !== "quest"))
    throw new Error("Questie Forever collection accepts Forever quests only");
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error("Questie collection queue contains duplicate quest ids");
  if (!options.sourceRef.trim()) throw new Error("Questie collection requires a source reference");
  if (!options.sodSourceRef.trim())
    throw new Error("Questie collection requires a flavor-filter source reference");
  if (!options.revision.trim()) throw new Error("Questie collection requires a revision");

  const xpRows = new Map(parseQuestieXpDatabase(options.xpSource).map((row) => [row.questId, row]));
  const sodQuestIds = parseQuestieBaseQuestIds(options.sodQuestSource);
  const exclusions: QuestieFlavorExclusion[] = tasks
    .filter((task) => sodQuestIds.has(task.id))
    .map((task) => ({ task, reason: "season-of-discovery" }));
  const excludedIds = new Set(exclusions.map((entry) => entry.task.id));
  const eligibleTasks = tasks.filter((task) => !excludedIds.has(task.id));
  const availableIds = new Set<number>();
  const missingXpIds = new Set<number>();
  const rows: { readonly id: number; readonly level: number | null; readonly xp: number | null }[] = [];

  for (const task of eligibleTasks) {
    const row = xpRows.get(task.id);
    if (!row) continue;
    const usable = row.questLevel > 0 && row.baseXp > 0;
    if (usable) availableIds.add(task.id);
    else missingXpIds.add(task.id);
    rows.push({
      id: task.id,
      level: row.questLevel > 0 ? row.questLevel : null,
      xp: usable ? row.baseXp : null,
    });
  }
  if (!rows.length) throw new Error("Questie XP source has no records for the eligible queue");

  const xpSourceSha256 = sha256(options.xpSource);
  const generatedAt = options.importedAt ?? new Date().toISOString();
  const importResult = await buildQuestXpImport({
    input: JSON.stringify(rows),
    format: "json",
    game: "forever",
    sourceKind: "addon-database",
    sourceRef: options.sourceRef,
    revision: options.revision,
    importedAt: generatedAt,
    exportSha256: xpSourceSha256,
    knownIds: new Set(eligibleTasks.map((task) => task.id)),
    ...(options.stagedDirectory ? { stagedDirectory: options.stagedDirectory } : {}),
  });
  const fallbackTasks = eligibleTasks.filter((task) => !availableIds.has(task.id));
  const counts = {
    total: tasks.length,
    available: availableIds.size,
    missing: eligibleTasks.filter((task) => !xpRows.has(task.id)).length,
    missingXp: missingXpIds.size,
    excluded: exclusions.length,
  };
  return {
    importResult,
    fallbackTasks,
    exclusions,
    counts,
    report: questieCollectionReportSchema.parse({
      schema: QUESTIE_COLLECTION_REPORT_SCHEMA,
      generatedAt,
      targetFlavor: options.targetFlavor,
      source: {
        reference: options.sourceRef,
        revision: options.revision,
        sha256: xpSourceSha256,
      },
      flavorFilter: {
        reference: options.sodSourceRef,
        sha256: sha256(options.sodQuestSource),
        excludedIds: exclusions.map((entry) => entry.task.id),
      },
      counts,
    }),
  };
}
