import { mkdir, open, readFile, readdir, stat, statfs, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ReferenceValidation } from "./client-validation.js";
import {
  referenceKey,
  referenceTaskSchema,
  type ReferenceRecord,
  type ReferenceTask,
} from "./contracts.js";
import { atomicJsonWrite, publishCollectedReferences, readStagedReference } from "./store.js";

const checkSchema = z
  .object({
    signature: z.string(),
    nextCheckAt: z.number().finite(),
    status: z.enum(["complete", "partial", "held"]),
    reasons: z.array(z.string()),
  })
  .strict();
const stateSchema = z
  .object({
    schema: z.literal("reference-publication.v1"),
    updatedAt: z.iso.datetime(),
    checks: z.record(z.string().regex(/^(forever|tbc)-(item|quest)-\d+$/), checkSchema),
  })
  .strict();

export interface PublicationCycleOptions {
  readonly staging: string;
  readonly destination: string;
  readonly statusPath: string;
  readonly revision: string;
  readonly validator: (
    tasks: readonly ReferenceTask[],
  ) => Promise<(record: ReferenceRecord) => ReferenceValidation>;
  readonly limit?: number;
}

export async function runReferencePublicationCycle(options: PublicationCycleOptions): Promise<{
  checked: number;
  published: number;
  complete: number;
  partial: number;
  held: number;
}> {
  const limit = options.limit ?? 200;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !options.revision)
    throw new Error("Invalid publication policy");
  await mkdir(options.destination, { recursive: true });
  const filesystem = await statfs(options.destination);
  if (filesystem.bavail * filesystem.bsize < 8 * 1024 ** 3)
    throw new Error("Publication stopped below the free-disk reserve");
  const lockPath = resolve(options.destination, ".publication-worker.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    let checks: z.infer<typeof stateSchema>["checks"] = {};
    try {
      if ((await stat(options.statusPath)).size > 32_000_000)
        throw new Error("Publication status too large");
      checks = stateSchema.parse(JSON.parse(await readFile(options.statusPath, "utf8"))).checks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const selected: Array<{ task: ReferenceTask; signature: string }> = [];
    const due: Array<{ task: ReferenceTask; signature: string; nextCheckAt: number }> = [];
    const now = Date.now();
    for (const name of (await readdir(options.staging)).sort()) {
      const match = /^(forever|tbc)-(item|quest)-(\d+)\.json$/.exec(name);
      if (!match) continue;
      const task = referenceTaskSchema.parse({
        game: match[1],
        kind: match[2],
        id: Number(match[3]),
      });
      const info = await stat(resolve(options.staging, name));
      const signature = `${info.mtimeMs}:${info.size}:${options.revision}`;
      const previous = checks[referenceKey(task)];
      if (previous?.signature !== signature) {
        selected.push({ task, signature });
        if (selected.length === limit) break;
      } else if (previous.nextCheckAt <= now) {
        due.push({ task, signature, nextCheckAt: previous.nextCheckAt });
      }
    }
    due.sort((first, second) => first.nextCheckAt - second.nextCheckAt);
    selected.push(...due.slice(0, limit - selected.length));
    const tasks = selected.map(({ task }) => task);
    const validate = tasks.length ? await options.validator(tasks) : null;
    const result = await publishCollectedReferences(
      options.staging,
      options.destination,
      tasks,
      async (record): Promise<ReferenceValidation> => {
        if (!validate) throw new Error("Missing publication validator");
        return validate(record);
      },
    );
    const held = new Map(result.held.map((entry) => [entry.key, entry.reasons]));
    for (const { task, signature } of selected) {
      const key = referenceKey(task);
      const record = await readStagedReference(options.staging, task).catch((): null => null);
      const validation = record && validate ? validate(record) : null;
      const reasons = held.get(key) ?? validation?.indexGaps ?? [];
      const expiresAt = record
        ? Date.parse(record.capturedAt) + (record.game === "forever" ? 14 : 90) * 86400000
        : now;
      checks[key] = {
        signature,
        nextCheckAt: Math.max(now + 60000, Math.min(now + 3600000, expiresAt)),
        status: held.has(key) ? "held" : reasons.length ? "partial" : "complete",
        reasons: [...reasons],
      };
    }
    await atomicJsonWrite(options.statusPath, {
      schema: "reference-publication.v1",
      updatedAt: new Date().toISOString(),
      checks,
    });
    const counts = { complete: 0, partial: 0, held: 0 };
    for (const check of Object.values(checks)) counts[check.status]++;
    return { checked: selected.length, published: result.published, ...counts };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
