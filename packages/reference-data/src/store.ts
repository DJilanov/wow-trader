import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { referenceDisplayable, type ReferenceValidation } from "./client-validation.js";
import {
  referenceIndexSchema,
  referenceIsFresh,
  referenceKey,
  referenceQualityGaps,
  referenceRecordSchema,
  type ReferenceIndex,
  type ReferenceRecord,
  type ReferenceTask,
} from "./contracts.js";

export function referenceChecksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch((cleanup: unknown): void => {
      if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") throw cleanup;
    });
    throw error;
  }
}

export async function readStagedReference(
  root: string,
  task: ReferenceTask,
): Promise<ReferenceRecord | null> {
  try {
    const path = resolve(root, `${referenceKey(task)}.json`);
    if ((await stat(path)).size > 300_000) throw new Error("Staged reference too large");
    const record = referenceRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (referenceKey(record) !== referenceKey(task))
      throw new Error("Staged reference identity mismatch");
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

let indexCache:
  | {
      root: string;
      modified: number;
      inode: number;
      size: number;
      index: ReferenceIndex;
      byKey: ReadonlyMap<string, ReferenceIndex["records"][number]>;
    }
  | undefined;

export async function readReferenceIndex(root: string): Promise<ReferenceIndex | null> {
  const path = resolve(root, "index.json");
  try {
    const info = await stat(path);
    if (info.size > 24_000_000) throw new Error("Reference index too large");
    if (
      indexCache?.root === root &&
      indexCache.modified === info.mtimeMs &&
      indexCache.inode === info.ino &&
      indexCache.size === info.size
    )
      return indexCache.index;
    const index = referenceIndexSchema.parse(JSON.parse(await readFile(path, "utf8")));
    const keys = index.records.map(referenceKey);
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate reference identities");
    indexCache = {
      root,
      modified: info.mtimeMs,
      inode: info.ino,
      size: info.size,
      index,
      byKey: new Map(index.records.map((record) => [referenceKey(record), record])),
    };
    return index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readPublishedReference(
  root: string,
  task: ReferenceTask,
): Promise<ReferenceRecord | null> {
  const index = await readReferenceIndex(root);
  const entry =
    indexCache?.index === index
      ? indexCache?.byKey.get(referenceKey(task))
      : index?.records.find((record) => referenceKey(record) === referenceKey(task));
  if (!entry || !referenceIsFresh(entry)) return null;
  const path = resolve(root, "records", `${entry.sha256}.json`);
  if ((await stat(path)).size > 300_000) throw new Error("Reference record too large");
  const contents = await readFile(path, "utf8");
  if (referenceChecksum(contents) !== entry.sha256) throw new Error("Reference checksum mismatch");
  const record = referenceRecordSchema.parse(JSON.parse(contents));
  if (referenceKey(record) !== referenceKey(task) || record.capturedAt !== entry.capturedAt)
    throw new Error("Invalid approved reference");
  return record;
}

export async function readApprovedReference(
  root: string,
  task: ReferenceTask,
): Promise<ReferenceRecord | null> {
  const record = await readPublishedReference(root, task);
  if (record && referenceQualityGaps(record).length) throw new Error("Invalid approved reference");
  return record;
}

export interface ReferencePublicationResult {
  readonly published: number;
  readonly complete: number;
  readonly partial: number;
  readonly held: readonly { readonly key: string; readonly reasons: readonly string[] }[];
}

export async function publishCollectedReferences(
  staging: string,
  destination: string,
  tasks: readonly ReferenceTask[],
  validate: (record: ReferenceRecord) => Promise<ReferenceValidation>,
): Promise<ReferencePublicationResult> {
  if (resolve(staging) === resolve(destination))
    throw new Error("Staging and published directories must differ");
  await mkdir(resolve(destination, "records"), { recursive: true });
  const lockPath = resolve(destination, ".publish.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const current = await readReferenceIndex(destination);
    const entries = new Map(current?.records.map((entry) => [referenceKey(entry), entry]));
    const held: Array<{ key: string; reasons: readonly string[] }> = [];
    let published = 0,
      complete = 0,
      partial = 0;
    for (const task of tasks) {
      const key = referenceKey(task);
      let record: ReferenceRecord | null;
      try {
        record = await readStagedReference(staging, task);
      } catch {
        held.push({ key, reasons: ["invalid_staged_record"] });
        continue;
      }
      if (!record || !referenceIsFresh(record) || !referenceDisplayable(record)) {
        held.push({
          key,
          reasons: [
            !record
              ? "missing_record"
              : !referenceIsFresh(record)
                ? "stale_record"
                : "insufficient_display_data",
          ],
        });
        continue;
      }
      const validation = await validate(record);
      if (validation.conflicts.length) {
        held.push({ key, reasons: validation.conflicts });
        continue;
      }
      const gaps = validation.indexGaps;
      const contents = `${JSON.stringify(record)}\n`;
      const sha256 = referenceChecksum(contents);
      const previous = entries.get(key);
      if (previous?.sha256 === sha256) continue;
      if (previous) {
        const old = await readPublishedReference(destination, task);
        // A partial refresh must not replace a fresh, complete published record.
        if (old && !(await validate(old)).indexGaps.length && gaps.length) {
          held.push({ key, reasons: ["preserved_complete_record"] });
          continue;
        }
        if (old && Date.parse(old.capturedAt) > Date.parse(record.capturedAt)) {
          held.push({ key, reasons: ["preserved_newer_record"] });
          continue;
        }
      }
      const path = resolve(destination, "records", `${sha256}.json`);
      try {
        await writeFile(path, contents, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (referenceChecksum(await readFile(path, "utf8")) !== sha256)
          throw new Error("Existing published reference is corrupted");
      }
      entries.set(key, {
        game: record.game,
        kind: record.kind,
        id: record.id,
        sha256,
        capturedAt: record.capturedAt,
      });
      published++;
      if (gaps.length) partial++;
      else complete++;
    }
    if (published) {
      await atomicJsonWrite(
        resolve(destination, "index.json"),
        referenceIndexSchema.parse({
          schema: "wowhead-reference-index.v1",
          publishedAt: new Date().toISOString(),
          records: [...entries.values()],
        }),
      );
      indexCache = undefined;
    }
    return { published, complete, partial, held };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export async function publishReferences(
  staging: string,
  destination: string,
  tasks: readonly ReferenceTask[],
): Promise<number> {
  if (resolve(staging) === resolve(destination))
    throw new Error("Staging and published directories must differ");
  await mkdir(resolve(destination, "records"), { recursive: true });
  const lockPath = resolve(destination, ".publish.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const selected = await Promise.all(tasks.map((task) => readStagedReference(staging, task)));
    for (const record of selected) {
      if (!record || referenceQualityGaps(record).length || !referenceIsFresh(record))
        throw new Error(
          `Reference is incomplete or stale: ${record ? referenceKey(record) : "missing"}`,
        );
    }
    const current = await readReferenceIndex(destination);
    const entries = new Map(current?.records.map((entry) => [referenceKey(entry), entry]));
    for (const record of selected) {
      if (!record) throw new Error("Missing approved reference");
      const contents = `${JSON.stringify(record)}\n`;
      const sha256 = referenceChecksum(contents);
      const path = resolve(destination, "records", `${sha256}.json`);
      try {
        await writeFile(path, contents, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (referenceChecksum(await readFile(path, "utf8")) !== sha256)
          throw new Error("Existing published reference is corrupted");
      }
      entries.set(referenceKey(record), {
        game: record.game,
        kind: record.kind,
        id: record.id,
        sha256,
        capturedAt: record.capturedAt,
      });
    }
    const index = referenceIndexSchema.parse({
      schema: "wowhead-reference-index.v1",
      publishedAt: new Date().toISOString(),
      records: [...entries.values()],
    });
    await atomicJsonWrite(resolve(destination, "index.json"), index);
    indexCache = undefined;
    return selected.length;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
