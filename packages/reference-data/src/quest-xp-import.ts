import { createHash } from "node:crypto";
import { z } from "zod";
import { referenceKey, referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import { readStagedQuestXp } from "./quest-xp-store.js";
import type { QuestXpRecord } from "./quest-xp-contracts.js";

export const QUEST_XP_IMPORT_SCHEMA = "quest-xp-import.v1";
export const QUEST_XP_IMPORT_SET_SCHEMA = "quest-xp-import-set.v1";

export const IMPORT_SOURCE_KINDS = [
  "blizzard-api",
  "addon-database",
  "client-derived",
  "server-database",
  "operator-export",
  "manual-capture",
] as const;

const level = z.number().int().min(1).max(100);
const xp = z.number().int().min(0).max(1_000_000);
const issue = z.string().min(1).max(300);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * An imported reward is its own evidence type. It never claims to be a Wowhead
 * capture, so an operator export cannot be mistaken for a crawl in downstream
 * provenance.
 */
export const questXpImportRecordSchema = referenceTaskSchema
  .extend({
    kind: z.literal("quest"),
    schema: z.literal(QUEST_XP_IMPORT_SCHEMA),
    sourceKind: z.enum(IMPORT_SOURCE_KINDS),
    sourceRef: z.string().min(1).max(300),
    revision: z.string().min(1).max(120),
    exportSha256: sha256,
    importedAt: z.iso.datetime(),
    questLevel: level.nullable(),
    minimumLevel: level.nullable(),
    rewardXpId: z.number().int().min(0).max(1_000_000).nullable(),
    fullXp: xp.nullable(),
    xpByLevel: z.array(z.object({ level, xp }).strict()).max(60),
    status: z.enum(["available", "unknown", "conflict"]),
    issues: z.array(issue).max(30),
  })
  .strict()
  .superRefine((record, context): void => {
    if (new Set(record.xpByLevel.map((entry) => entry.level)).size !== record.xpByLevel.length)
      context.addIssue({ code: "custom", message: "Duplicate imported quest XP level" });
    if (
      record.status === "available" &&
      record.questLevel === null &&
      record.fullXp === null &&
      !record.xpByLevel.length
    )
      context.addIssue({ code: "custom", message: "Available import has no reward" });
    if (record.status === "available" && record.fullXp === null && !record.xpByLevel.length)
      context.addIssue({ code: "custom", message: "Available import has no reward binding" });
  });
export type QuestXpImportRecord = z.infer<typeof questXpImportRecordSchema>;

export const questXpImportSetSchema = z
  .object({
    schema: z.literal(QUEST_XP_IMPORT_SET_SCHEMA),
    game: z.enum(["tbc", "forever"]),
    sourceKind: z.enum(IMPORT_SOURCE_KINDS),
    sourceRef: z.string().min(1).max(300),
    revision: z.string().min(1).max(120),
    exportSha256: sha256,
    importedAt: z.iso.datetime(),
    counts: z
      .object({
        records: z.number().int().nonnegative(),
        available: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
        conflicts: z.number().int().nonnegative(),
        unexpected: z.number().int().nonnegative(),
      })
      .strict(),
    records: z.array(questXpImportRecordSchema).max(10000),
  })
  .strict()
  .superRefine((value, context): void => {
    const keys = value.records.map(referenceKey);
    if (new Set(keys).size !== keys.length)
      context.addIssue({ code: "custom", message: "Duplicate imported quest identity" });
    if (value.counts.records !== value.records.length)
      context.addIssue({ code: "custom", message: "Import record count mismatch" });
    if (value.records.some((record) => record.kind !== "quest"))
      context.addIssue({ code: "custom", message: "Imported kind mismatch" });
  });
export type QuestXpImportSet = z.infer<typeof questXpImportSetSchema>;

export interface QuestXpImportConflict {
  readonly key: string;
  readonly fields: readonly string[];
}

export interface QuestXpImportReport {
  readonly records: number;
  readonly available: number;
  readonly unknown: number;
  readonly conflicts: number;
  readonly unexpected: number;
  readonly conflictsWithWowhead: readonly QuestXpImportConflict[];
}

export interface QuestXpImportOptions {
  readonly input: string;
  readonly format: "csv" | "json";
  readonly game: "tbc" | "forever";
  readonly sourceKind: (typeof IMPORT_SOURCE_KINDS)[number];
  readonly sourceRef: string;
  readonly revision: string;
  readonly importedAt?: string;
  /** SHA-256 of the original source when `input` is a normalized intermediate representation. */
  readonly exportSha256?: string;
  /** Known queue identities; unknown ids are retained but flagged, never dropped. */
  readonly knownIds?: ReadonlySet<number>;
  /** Staged Wowhead directory, when imported values should be compared, not merged. */
  readonly stagedDirectory?: string;
}

export interface QuestXpImportResult {
  readonly set: QuestXpImportSet;
  readonly report: QuestXpImportReport;
}

interface RawRow {
  readonly id: number;
  readonly questLevel: number | null;
  readonly minimumLevel: number | null;
  readonly rewardXpId: number | null;
  readonly fullXp: number | null;
  readonly xpByLevel: readonly { readonly level: number; readonly xp: number }[];
  readonly label: string;
}

const COLUMNS = {
  id: ["id", "questid"],
  level: ["level", "questlevel"],
  minimumLevel: ["minlevel", "minimumlevel", "reqlevel", "requiredlevel"],
  rewardXpId: ["rewardxpid", "xpid"],
  fullXp: ["xp", "fullxp", "rewardxp"],
  xpByLevel: ["xpbylevel"],
} as const;

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) normalized.set(normalizeKey(key), value);
  const selected: Record<string, unknown> = {};
  for (const [field, aliases] of Object.entries(COLUMNS))
    for (const alias of aliases)
      if (normalized.has(alias)) {
        selected[field] = normalized.get(alias);
        break;
      }
  return selected;
}

function requiredNonNegative(value: unknown, field: string, label: string): number {
  const parsed = optionalInteger(value, field, label);
  if (parsed === null) throw new Error(`Missing ${field} in ${label}`);
  if (parsed < 0) throw new Error(`Invalid ${field} in ${label}: ${parsed}`);
  return parsed;
}

function requiredInteger(value: unknown, field: string, label: string): number {
  const parsed = requiredNonNegative(value, field, label);
  if (parsed < 1) throw new Error(`Invalid ${field} in ${label}: ${parsed}`);
  return parsed;
}

function optionalInteger(value: unknown, field: string, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error(`Invalid ${field} in ${label}: ${value}`);
    return value;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (!/^-?\d+$/.test(text)) throw new Error(`Invalid ${field} in ${label}: ${text}`);
  return Number(text);
}

function parseCurve(value: unknown, label: string): readonly { level: number; xp: number }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid xpByLevel in ${label}`);
  return value
    .map((entry, index): { level: number; xp: number } => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        throw new Error(`Invalid xpByLevel entry ${index} in ${label}`);
      const normalized = new Map<string, unknown>();
      for (const [key, item] of Object.entries(entry as Record<string, unknown>))
        normalized.set(normalizeKey(key), item);
      return {
        level: requiredNonNegative(normalized.get("level"), "xpByLevel.level", label),
        xp: requiredNonNegative(
          normalized.has("xp") ? normalized.get("xp") : normalized.get("value"),
          "xpByLevel.xp",
          label,
        ),
      };
    })
    .sort((left, right) => left.level - right.level);
}

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

function readRows(input: string, format: "csv" | "json"): readonly RawRow[] {
  if (format === "csv") {
    const rows = parseCsv(input);
    const header = rows.shift();
    if (!header?.length) throw new Error("Import CSV is empty");
    const names = header.map((name) => name.trim());
    if (new Set(names.map(normalizeKey)).size !== names.length)
      throw new Error("Import CSV has duplicate columns");
    return rows.map((values, index): RawRow => {
      if (values.length !== names.length)
        throw new Error(
          `Import CSV row ${index + 2} has ${values.length} fields, expected ${names.length}`,
        );
      const row: Record<string, unknown> = {};
      for (let column = 0; column < names.length; column++) row[names[column]!] = values[column];
      return normalizeRow(row, `CSV row ${index + 2}`);
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Import JSON is not valid JSON");
  }
  const records = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : null;
  if (!records) throw new Error("Import JSON must be an array or an object with a records array");
  if (!records.length) throw new Error("Import JSON has no records");
  return records.map((entry, index): RawRow => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new Error(`Import JSON record ${index} is not an object`);
    return normalizeRow(entry as Record<string, unknown>, `JSON record ${index}`);
  });
}

function normalizeRow(row: Readonly<Record<string, unknown>>, label: string): RawRow {
  const selected = pick(row);
  return {
    id: requiredInteger(selected.id, "id", label),
    questLevel: optionalInteger(selected.level, "level", label),
    minimumLevel: optionalInteger(selected.minimumLevel, "minimumLevel", label),
    rewardXpId: optionalInteger(selected.rewardXpId, "rewardXpId", label),
    fullXp: optionalInteger(selected.fullXp, "xp", label),
    xpByLevel: parseCurve(selected.xpByLevel, label),
    label,
  };
}

function compare(
  staged: QuestXpRecord,
  record: Omit<QuestXpImportRecord, "status">,
): readonly string[] {
  if (staged.status !== "available") return [];
  const fields: string[] = [];
  if (
    staged.questLevel !== null &&
    record.questLevel !== null &&
    staged.questLevel !== record.questLevel
  )
    fields.push("questLevel");
  if (
    staged.minimumLevel !== null &&
    record.minimumLevel !== null &&
    staged.minimumLevel !== record.minimumLevel
  )
    fields.push("minimumLevel");
  if (staged.fullXp !== null && record.fullXp !== null && staged.fullXp !== record.fullXp)
    fields.push("fullXp");
  if (
    staged.xpByLevel.length &&
    record.xpByLevel.length &&
    JSON.stringify(staged.xpByLevel) !== JSON.stringify(record.xpByLevel)
  )
    fields.push("xpByLevel");
  return fields;
}

export async function buildQuestXpImport(
  options: QuestXpImportOptions,
): Promise<QuestXpImportResult> {
  if (!options.sourceRef.trim()) throw new Error("Import requires a source reference");
  if (!options.revision.trim()) throw new Error("Import requires a content revision");
  const rows = readRows(options.input, options.format);
  const importedAt = options.importedAt ?? new Date().toISOString();
  const exportSha256 =
    options.exportSha256 ?? createHash("sha256").update(options.input).digest("hex");
  if (!sha256.safeParse(exportSha256).success) throw new Error("Import source SHA-256 is invalid");
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`Duplicate imported quest id: ${row.id}`);
    seen.add(row.id);
  }
  const records: QuestXpImportRecord[] = [];
  const conflictsWithWowhead: QuestXpImportConflict[] = [];
  for (const row of rows) {
    // A zero minimum level means "no requirement" and is not evidence of a missing value.
    const minimumLevel = row.minimumLevel === 0 ? null : row.minimumLevel;
    const issues: string[] = [];
    if (row.questLevel === null || row.questLevel === 0) issues.push("missing_quest_level");
    if (row.fullXp === null && !row.xpByLevel.length) issues.push("missing_reward_xp");
    if (row.rewardXpId === 0) issues.push("formula_derived_reward");
    if (options.knownIds && !options.knownIds.has(row.id)) issues.push("unexpected_id");
    const base: Omit<QuestXpImportRecord, "status"> = {
      game: options.game,
      kind: "quest",
      id: row.id,
      schema: QUEST_XP_IMPORT_SCHEMA,
      sourceKind: options.sourceKind,
      sourceRef: options.sourceRef,
      revision: options.revision,
      exportSha256,
      importedAt,
      questLevel: row.questLevel === 0 ? null : row.questLevel,
      minimumLevel,
      rewardXpId: row.rewardXpId,
      fullXp: row.fullXp,
      xpByLevel: [...row.xpByLevel],
      issues,
    };
    let status: QuestXpImportRecord["status"] =
      issues.includes("unexpected_id") || (base.fullXp === null && !base.xpByLevel.length)
        ? "unknown"
        : "available";
    if (options.stagedDirectory) {
      const task: ReferenceTask = { game: options.game, kind: "quest", id: row.id };
      const staged = await readStagedQuestXp(options.stagedDirectory, task);
      if (staged) {
        const fields = compare(staged, base);
        if (fields.length) {
          status = "conflict";
          base.issues.push(`wowhead_conflict:${referenceKey(task)}`);
          conflictsWithWowhead.push({ key: referenceKey(task), fields });
        }
      }
    }
    records.push(questXpImportRecordSchema.parse({ ...base, status }));
  }
  const set = questXpImportSetSchema.parse({
    schema: QUEST_XP_IMPORT_SET_SCHEMA,
    game: options.game,
    sourceKind: options.sourceKind,
    sourceRef: options.sourceRef,
    revision: options.revision,
    exportSha256,
    importedAt,
    counts: {
      records: records.length,
      available: records.filter((record) => record.status === "available").length,
      unknown: records.filter((record) => record.status === "unknown").length,
      conflicts: records.filter((record) => record.status === "conflict").length,
      unexpected: records.filter((record) => record.issues.includes("unexpected_id")).length,
    },
    records,
  });
  return {
    set,
    report: {
      records: records.length,
      available: set.counts.available,
      unknown: set.counts.unknown,
      conflicts: set.counts.conflicts,
      unexpected: set.counts.unexpected,
      conflictsWithWowhead,
    },
  };
}
