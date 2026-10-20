import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { load } from "cheerio";
import { referenceKey, type ReferenceTask } from "./contracts.js";
import { parseQuestXpPage, parseWowheadPage } from "./parser.js";
import {
  listingKey,
  listingTaskSchema,
  parseListingPath,
  type ListingTask,
} from "./listing-contracts.js";
import { parseWowheadListing } from "./listing-parser.js";
import { readStagedListing, writeStagedListing } from "./listing-store.js";
import { atomicJsonWrite, readStagedReference } from "./store.js";
import { readStagedQuestXp } from "./quest-xp-store.js";

const MAX_HTML_BYTES = 4_000_000;
const MAX_FILES = 1000;
const MAX_DIRECTORY_DEPTH = 8;
const CANONICAL_TASK_PATTERN =
  /^https:\/\/www\.wowhead\.com\/(tbc|forever)\/(item|quest)=(\d+)(?:\/|$)/;

export interface ImportSavedHtmlOptions {
  /** A single .html/.htm file or a directory containing saved pages. */
  readonly input: string;
  /** Existing reference staging directory. */
  readonly staging: string;
  /** Provenance label recorded on every imported record. */
  readonly permissionRef: string;
  /** Replace an existing staged record with a different page hash. */
  readonly force?: boolean;
  /** Fixed ISO timestamp for all records; defaults to each file's mtime. */
  readonly capturedAt?: string;
}

export interface ImportedSavedHtmlEntry {
  readonly key: string;
  readonly kind: "item" | "quest" | "spell-list" | "item-list";
  readonly path: string;
  readonly recordPath: string;
  readonly xpPath?: string;
}

export interface SavedHtmlConflict {
  readonly key: string;
  readonly path: string;
  readonly existingSha256: string;
  readonly incomingSha256: string;
}

export interface SavedHtmlRejection {
  readonly path: string;
  readonly reason: string;
}

export interface ImportSavedHtmlResult {
  readonly imported: readonly ImportedSavedHtmlEntry[];
  readonly skipped: readonly {
    readonly key: string;
    readonly path: string;
    readonly reason: "unchanged";
  }[];
  readonly conflicts: readonly SavedHtmlConflict[];
  readonly rejected: readonly SavedHtmlRejection[];
}

export async function importSavedHtml(
  options: ImportSavedHtmlOptions,
): Promise<ImportSavedHtmlResult> {
  const files = await listHtmlFiles(options.input);
  const capturedAt = parseCapturedAt(options.capturedAt);
  await mkdir(options.staging, { recursive: true });

  const imported: ImportedSavedHtmlEntry[] = [];
  const skipped: { key: string; path: string; reason: "unchanged" }[] = [];
  const conflicts: SavedHtmlConflict[] = [];
  const rejected: SavedHtmlRejection[] = [];

  for (const path of files) {
    try {
      const info = await stat(path);
      if (info.size > MAX_HTML_BYTES) throw new Error("Saved HTML exceeds the 4 MB budget");
      const html = await readFile(path, "utf8");
      if (Buffer.byteLength(html) > MAX_HTML_BYTES)
        throw new Error("Saved HTML exceeds the 4 MB budget");

      const listing = taskFromSavedListing(html);
      if (listing) {
        const record = parseWowheadListing(html, listing.task, {
          url: listing.canonical,
          capturedAt: capturedAt ?? info.mtime.toISOString(),
          permissionRef: options.permissionRef,
        });
        const existing = await readStagedListing(options.staging, listing.task);
        if (existing?.sourceSha256 === record.sourceSha256 && !options.force) {
          skipped.push({ key: listingKey(listing.task), path, reason: "unchanged" });
          continue;
        }
        const recordPath = await writeStagedListing(options.staging, record);
        imported.push({
          key: listingKey(listing.task),
          kind: listing.task.kind,
          path,
          recordPath,
        });
        continue;
      }

      const { task, canonical } = taskFromSavedHtml(html);
      const key = referenceKey(task);
      const record = parseWowheadPage(html, task, {
        url: canonical,
        capturedAt: capturedAt ?? info.mtime.toISOString(),
        permissionRef: options.permissionRef,
      });
      const recordPath = resolve(options.staging, `${key}.json`);
      const existing = await readStagedReference(options.staging, task);

      if (existing && existing.sourceSha256 !== record.sourceSha256 && !options.force) {
        conflicts.push({
          key,
          path,
          existingSha256: existing.sourceSha256,
          incomingSha256: record.sourceSha256,
        });
        continue;
      }

      let wroteRecord = false;
      if (!existing || existing.sourceSha256 !== record.sourceSha256 || options.force) {
        await atomicJsonWrite(recordPath, record);
        wroteRecord = true;
      }

      let xpPath: string | undefined;
      if (task.kind === "quest") {
        const existingXp = await readStagedQuestXp(options.staging, task);
        if (!existingXp || existingXp.sourceSha256 !== record.sourceSha256 || options.force) {
          const xp = parseQuestXpPage(html, record);
          xpPath = resolve(options.staging, `${key}.xp.json`);
          await atomicJsonWrite(xpPath, xp);
        }
      }

      if (!wroteRecord && !xpPath) {
        skipped.push({ key, path, reason: "unchanged" });
        continue;
      }
      imported.push({ key, kind: task.kind, path, recordPath, ...(xpPath ? { xpPath } : {}) });
    } catch (error) {
      rejected.push({ path, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { imported, skipped, conflicts, rejected };
}

export function taskFromSavedListing(html: string): {
  readonly task: ListingTask;
  readonly canonical: string;
} | null {
  if (Buffer.byteLength(html) > MAX_HTML_BYTES)
    throw new Error("Saved HTML exceeds the 4 MB budget");
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) return null;
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }
  if (url.origin !== "https://www.wowhead.com" || url.username || url.password || url.hash)
    return null;
  const path = `${url.pathname}${url.search}`;
  const parsed = parseListingPath(path);
  if (!parsed) return null;
  return {
    task: listingTaskSchema.parse({ game: "forever", kind: parsed.kind, path }),
    canonical,
  };
}

export function taskFromSavedHtml(html: string): {
  readonly task: ReferenceTask & { readonly kind: "item" | "quest" };
  readonly canonical: string;
} {
  if (Buffer.byteLength(html) > MAX_HTML_BYTES)
    throw new Error("Saved HTML exceeds the 4 MB budget");
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) throw new Error("Reference canonical missing");
  const match = CANONICAL_TASK_PATTERN.exec(canonical);
  if (!match) throw new Error("Canonical is not a Wowhead edition entity URL");
  const task = {
    game: match[1] as "tbc" | "forever",
    kind: match[2] as "item" | "quest",
    id: Number(match[3]),
  };
  return { task, canonical };
}

async function listHtmlFiles(input: string): Promise<string[]> {
  const info = await stat(input);
  if (info.isFile()) {
    if (!isHtml(input)) throw new Error(`Not an HTML file: ${input}`);
    return [resolve(input)];
  }
  if (!info.isDirectory()) throw new Error(`Input is not a file or directory: ${input}`);
  const files: string[] = [];
  await walkHtml(resolve(input), files, 0);
  files.sort();
  if (files.length === 0) throw new Error(`No .html or .htm files found in ${input}`);
  if (files.length > MAX_FILES) throw new Error(`Too many saved pages: ${files.length}`);
  return files;
}

async function walkHtml(directory: string, files: string[], depth: number): Promise<void> {
  if (depth > MAX_DIRECTORY_DEPTH) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      // Chrome's "Webpage, Complete" sidecar directory contains assets, not pages.
      if (entry.name.endsWith("_files")) continue;
      await walkHtml(path, files, depth + 1);
      continue;
    }
    if (entry.isFile() && isHtml(entry.name)) files.push(path);
  }
}

function isHtml(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return extension === ".html" || extension === ".htm";
}

function parseCapturedAt(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("capturedAt must be an ISO timestamp");
  return parsed.toISOString();
}
