import { mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  questXpIndexSchema,
  questXpRecordSchema,
  type QuestXpIndex,
  type QuestXpRecord,
} from "./quest-xp-contracts.js";
import { referenceIsFresh, referenceKey, type ReferenceTask } from "./contracts.js";
import { atomicJsonWrite, readStagedReference, referenceChecksum } from "./store.js";
import type { ReferenceValidation } from "./client-validation.js";
import { z } from "zod";

const publicationStateSchema = z
  .object({
    checks: z.record(
      z.string(),
      z.object({ signature: z.string(), nextCheckAt: z.number().finite() }).strict(),
    ),
  })
  .strict();

export async function readStagedQuestXp(
  root: string,
  task: ReferenceTask,
): Promise<QuestXpRecord | null> {
  try {
    const path = resolve(root, `${referenceKey(task)}.xp.json`);
    if ((await stat(path)).size > 100000) throw new Error("Quest XP record too large");
    const record = questXpRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (referenceKey(record) !== referenceKey(task))
      throw new Error("Quest XP record identity mismatch");
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readQuestXpIndex(root: string): Promise<QuestXpIndex | null> {
  try {
    const path = resolve(root, "quest-xp", "index.json");
    if ((await stat(path)).size > 4000000) throw new Error("Quest XP index too large");
    return questXpIndexSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readPublishedQuestXp(
  root: string,
  entry: QuestXpIndex["records"][number],
): Promise<QuestXpRecord | null> {
  entry = questXpIndexSchema.shape.records.element.parse(entry);
  if (!referenceIsFresh(entry)) return null;
  const path = resolve(root, "quest-xp", "records", `${entry.sha256}.json`);
  if ((await stat(path)).size > 100000) throw new Error("Published quest XP record too large");
  const raw = await readFile(path, "utf8");
  if (referenceChecksum(raw) !== entry.sha256) throw new Error("Quest XP checksum mismatch");
  const record = questXpRecordSchema.parse(JSON.parse(raw));
  if (
    record.game !== entry.game ||
    record.id !== entry.id ||
    record.capturedAt !== entry.capturedAt
  )
    throw new Error("Published quest XP identity mismatch");
  return record;
}

export async function publishQuestXpCycle(options: {
  readonly staging: string;
  readonly destination: string;
  readonly limit?: number;
  readonly revision: string;
  readonly validate: (
    task: ReferenceTask,
  ) => Promise<
    (record: NonNullable<Awaited<ReturnType<typeof readStagedReference>>>) => ReferenceValidation
  >;
}): Promise<{ checked: number; published: number; held: number }> {
  const limit = options.limit ?? 200;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !options.revision ||
    resolve(options.staging) === resolve(options.destination)
  )
    throw new Error("Invalid quest XP publication policy");
  const root = resolve(options.destination, "quest-xp");
  await mkdir(resolve(root, "records"), { recursive: true });
  const lockPath = resolve(root, ".publish.lock"),
    lock = await open(lockPath, "wx", 0o600);
  try {
    const index = await readQuestXpIndex(options.destination);
    const statePath = resolve(root, ".publication-state.json");
    let checks: z.infer<typeof publicationStateSchema>["checks"] = {};
    try {
      if ((await stat(statePath)).size > 4000000)
        throw new Error("Quest XP publication state too large");
      checks = publicationStateSchema.parse(JSON.parse(await readFile(statePath, "utf8"))).checks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const entries = new Map(index?.records.map((entry) => [`${entry.game}:${entry.id}`, entry]));
    let checked = 0,
      published = 0,
      held = 0;
    const candidates: { task: ReferenceTask; mtime: number; signature: string }[] = [];
    for (const name of await readdir(options.staging)) {
      const match = /^(forever|tbc)-quest-(\d+)\.xp\.json$/.exec(name);
      if (!match) continue;
      const info = await stat(resolve(options.staging, name));
      const task: ReferenceTask = {
        game: match[1] as ReferenceTask["game"],
        kind: "quest",
        id: Number(match[2]),
      };
      const signature = `${info.mtimeMs}:${info.size}:${options.revision}`,
        previous = checks[referenceKey(task)];
      if (previous?.signature !== signature || previous.nextCheckAt <= Date.now())
        candidates.push({ task, mtime: info.mtimeMs, signature });
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    for (const { task, signature } of candidates.slice(0, limit)) {
      checked++;
      checks[referenceKey(task)] = { signature, nextCheckAt: Date.now() + 3600000 };
      const record = await readStagedQuestXp(options.staging, task);
      const reference = await readStagedReference(options.staging, task);
      if (
        !record ||
        !reference ||
        !referenceIsFresh(record) ||
        record.sourceSha256 !== reference.sourceSha256 ||
        record.capturedAt !== reference.capturedAt ||
        (await options.validate(task))(reference).conflicts.length
      ) {
        held++;
        continue;
      }
      const key = `${record.game}:${record.id}`,
        previous = entries.get(key);
      let candidate = record;
      if (previous) {
        const old = await readPublishedQuestXp(options.destination, previous);
        if (
          old &&
          (old.capturedAt > record.capturedAt ||
            ((old.status === "available" || old.status === "conflict") &&
              record.status === "unknown"))
        ) {
          held++;
          continue;
        }
        if (
          (old?.status === "available" || old?.status === "conflict") &&
          record.status === "available" &&
          (old.status === "conflict" ||
            (old.questLevel === record.questLevel &&
              (old.fullXp !== record.fullXp ||
                JSON.stringify(old.xpByLevel) !== JSON.stringify(record.xpByLevel))))
        )
          candidate = {
            ...record,
            status: "conflict",
            issues: [...record.issues, `previous_claim:${previous.sha256}`],
          };
      }
      const raw = `${JSON.stringify(candidate)}\n`,
        sha256 = referenceChecksum(raw);
      if (previous?.sha256 === sha256) continue;
      const path = resolve(root, "records", `${sha256}.json`);
      try {
        await writeFile(path, raw, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "EEXIST" ||
          referenceChecksum(await readFile(path, "utf8")) !== sha256
        )
          throw error;
      }
      entries.set(key, { game: record.game, id: record.id, sha256, capturedAt: record.capturedAt });
      published++;
    }
    if (published)
      await atomicJsonWrite(
        resolve(root, "index.json"),
        questXpIndexSchema.parse({
          schema: "quest-xp-index.v1",
          publishedAt: new Date().toISOString(),
          records: [...entries.values()],
        }),
      );
    await atomicJsonWrite(statePath, { checks });
    return { checked, published, held };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
