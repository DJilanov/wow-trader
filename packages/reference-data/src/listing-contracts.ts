import { z } from "zod";
import { referenceRelationSchema } from "./contracts.js";

const professionSlugPattern = /^[a-z0-9-]{1,80}$/;
const listingPathPattern =
  /^\/forever\/(spells\/professions|items\/recipes)\/([a-z0-9-]{1,80})(\?filter=20%3B1%3B0)?$/;

export const listingTaskSchema = z
  .object({
    game: z.literal("forever"),
    kind: z.enum(["spell-list", "item-list"]),
    path: z.string().min(1).max(200),
  })
  .strict()
  .superRefine((task, context) => {
    const parsed = parseListingPath(task.path);
    if (!parsed) {
      context.addIssue({ code: "custom", message: "Unsupported profession listing path" });
      return;
    }
    if (parsed.kind !== task.kind) {
      context.addIssue({ code: "custom", message: "Listing path and task kind disagree" });
    }
  });
export type ListingTask = z.infer<typeof listingTaskSchema>;

export interface ParsedListingPath {
  readonly kind: "spell-list" | "item-list";
  readonly profession: string;
}

export function parseListingPath(path: string): ParsedListingPath | null {
  const match = listingPathPattern.exec(path);
  if (!match) return null;
  const kind = match[1] === "spells/professions" ? "spell-list" : "item-list";
  const profession = match[2] ?? "";
  if (!professionSlugPattern.test(profession)) return null;
  if (kind === "item-list" && match[3] !== undefined) return null;
  return { kind, profession };
}

export function listingProfession(task: ListingTask): string {
  const parsed = parseListingPath(task.path);
  if (!parsed) throw new Error("Invalid profession listing task");
  return parsed.profession;
}

export function listingKey(task: ListingTask): string {
  return `${task.game}-${task.kind === "spell-list" ? "spell" : "item"}-list-${listingProfession(task)}`;
}

export function listingUrl(task: ListingTask): string {
  const parsed = listingTaskSchema.parse(task);
  return `https://www.wowhead.com${parsed.path}`;
}

export const listingEntrySchema = z
  .object({
    /** Spell ID for spell listings, item ID for item listings. */
    id: z.number().int().positive().max(2_147_483_647),
    name: z.string().min(1).max(300),
    /** Broad listing labels (trainer, vendor, drop, quest, ...). Hints only. */
    sourceTypes: z.array(z.string().min(1).max(80)).max(50),
    /** Exact relations only. Never inferred from a broad label. */
    relations: z.array(referenceRelationSchema).max(2000),
    /** Spell IDs that this recipe item teaches, when listed explicitly. */
    teaches: z.array(z.number().int().positive().max(2_147_483_647)).max(100),
    /** Reasons this entry still needs a detail page. */
    unresolved: z.array(z.string().min(1).max(160)).max(50),
  })
  .strict();
export type ListingEntry = z.infer<typeof listingEntrySchema>;

export const listingRecordSchema = z
  .object({
    schema: z.literal("wowhead-listing.v1"),
    game: z.literal("forever"),
    kind: z.enum(["spell-list", "item-list"]),
    path: z.string().min(1).max(200),
    profession: z.string().regex(professionSlugPattern),
    sourceUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.origin === "https://www.wowhead.com" && !url.username && !url.password && !url.hash
      );
    }),
    capturedAt: z.iso.datetime(),
    permissionRef: z.string().min(1).max(300),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal(1),
    entries: z.array(listingEntrySchema).max(5000),
    warnings: z.array(z.string().min(1).max(300)).max(50),
  })
  .strict()
  .superRefine((record, context) => {
    const parsed = parseListingPath(record.path);
    if (!parsed || parsed.kind !== record.kind || parsed.profession !== record.profession) {
      context.addIssue({ code: "custom", message: "Listing record path or profession mismatch" });
      return;
    }
    const url = new URL(record.sourceUrl);
    const expected = record.path.split("?")[0];
    if (url.pathname !== expected && url.pathname !== `${expected}/`) {
      context.addIssue({ code: "custom", message: "Listing record source path mismatch" });
    }
  });
export type ListingRecord = z.infer<typeof listingRecordSchema>;
