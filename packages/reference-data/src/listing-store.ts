import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  listingKey,
  listingRecordSchema,
  type ListingRecord,
  type ListingTask,
} from "./listing-contracts.js";
import { atomicJsonWrite } from "./store.js";

const MAX_LISTING_BYTES = 8_000_000;
const LISTING_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function listingDirectory(staging: string): string {
  return resolve(staging, "listings");
}

export function listingRecordPath(staging: string, task: ListingTask): string {
  return resolve(listingDirectory(staging), `${listingKey(task)}.json`);
}

export function listingMissingPath(staging: string, task: ListingTask): string {
  return resolve(listingDirectory(staging), `${listingKey(task)}.missing.json`);
}

export function listingErrorPath(staging: string, task: ListingTask): string {
  return resolve(listingDirectory(staging), `${listingKey(task)}.error.json`);
}

export async function readStagedListing(
  staging: string,
  task: ListingTask,
): Promise<ListingRecord | null> {
  const path = listingRecordPath(staging, task);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_LISTING_BYTES) return null;
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    const record = listingRecordSchema.parse(value);
    if (record.game !== task.game || record.kind !== task.kind || record.path !== task.path)
      return null;
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readAllStagedListings(staging: string): Promise<ListingRecord[]> {
  let names: string[];
  try {
    names = await readdir(listingDirectory(staging));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: ListingRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name.endsWith(".missing.json") || name.endsWith(".error.json"))
      continue;
    const path = resolve(listingDirectory(staging), name);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > MAX_LISTING_BYTES) continue;
      records.push(listingRecordSchema.parse(JSON.parse(await readFile(path, "utf8"))));
    } catch {
      // A single malformed listing must not hide the rest of the evidence.
    }
  }
  return records;
}

export function listingIsFresh(record: ListingRecord, now = Date.now()): boolean {
  const captured = Date.parse(record.capturedAt);
  return (
    Number.isFinite(captured) && now - captured >= -300000 && now - captured <= LISTING_FRESH_MS
  );
}

export async function writeStagedListing(staging: string, record: ListingRecord): Promise<string> {
  const path = resolve(listingDirectory(staging), `${listingKey(record)}.json`);
  await mkdir(listingDirectory(staging), { recursive: true });
  await atomicJsonWrite(path, listingRecordSchema.parse(record));
  return path;
}
