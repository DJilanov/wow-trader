import { mkdir, open, readFile, readdir, stat, statfs, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { referenceKey, referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import {
  crawlReferences,
  type CrawlOptions,
  type CrawlResult,
  type CrawlTaskResult,
} from "./crawler.js";
import { atomicJsonWrite, referenceChecksum } from "./store.js";

const counter = z.number().int().nonnegative();
export const crawlJobStatusSchema = z
  .object({
    schema: z.literal("wowhead-crawl-job.v1"),
    queueSha256: z.string().regex(/^[a-f0-9]{64}$/),
    total: counter,
    cursor: counter,
    permissionRef: z.string().min(1),
    refresh: z.boolean(),
    state: z.enum(["running", "completed", "blocked", "interrupted"]),
    pid: z.number().int().positive(),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    currentKey: z.string().nullable(),
    lastCompletedKey: z.string().nullable(),
    error: z.string().nullable(),
    counts: z
      .object({ crawled: counter, cached: counter, incomplete: counter, notFound: counter })
      .strict(),
  })
  .strict()
  .superRefine((status, context): void => {
    if (
      status.cursor > status.total ||
      status.counts.crawled + status.counts.cached + status.counts.notFound !== status.cursor ||
      status.counts.incomplete > status.counts.crawled ||
      (status.state === "completed" && (status.cursor !== status.total || !status.completedAt))
    )
      context.addIssue({ code: "custom", message: "Inconsistent crawl checkpoint" });
  });

export type CrawlJobStatus = z.infer<typeof crawlJobStatusSchema>;

interface JobOptions extends CrawlOptions {
  readonly statusPath: string;
  readonly batchSize?: number;
  readonly minFreeDiskBytes?: number;
  readonly maxStagingBytes?: number;
  readonly availableDiskBytes?: () => Promise<number>;
  readonly crawl?: (tasks: readonly ReferenceTask[], options: CrawlOptions) => Promise<CrawlResult>;
}

export async function readCrawlJobStatus(path: string): Promise<CrawlJobStatus | null> {
  try {
    if ((await stat(path)).size > 16000) throw new Error("Crawl status exceeds size budget");
    return crawlJobStatusSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function runCrawlJob(
  tasks: readonly ReferenceTask[],
  options: JobOptions,
): Promise<CrawlJobStatus> {
  const queue = [
    ...new Map(
      tasks.map((task): readonly [string, ReferenceTask] => {
        const validated = referenceTaskSchema.parse(task);
        return [referenceKey(validated), validated];
      }),
    ).values(),
  ];
  if (!queue.length || queue.length > 250000)
    throw new Error("Full queue must contain 1-250000 records");
  if (!options.permissionRef.trim()) throw new Error("A permission reference is required");
  const batchSize = options.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error("Batch size must be 1-500");
  const minFree = options.minFreeDiskBytes ?? 8 * 1024 ** 3;
  const maxStaging = options.maxStagingBytes ?? 2 * 1024 ** 3;
  if (
    ![minFree, maxStaging].every((value): boolean => Number.isSafeInteger(value) && value >= 0) ||
    maxStaging < 300000
  )
    throw new Error("Invalid crawl storage budget");
  const root = resolve(options.directory);
  const statusPath = resolve(options.statusPath);
  await mkdir(root, { recursive: true });
  await mkdir(dirname(statusPath), { recursive: true });
  // One full job per staging store, independent of the bounded crawler's per-batch lock.
  const lockPath = resolve(root, ".job.lock");
  const lock = await open(lockPath, "wx", 0o600);
  let status: CrawlJobStatus | undefined;
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), statusPath }),
    );
    const queueSha256 = referenceChecksum(JSON.stringify(queue));
    const previous = await readCrawlJobStatus(statusPath);
    if (
      previous &&
      (previous.queueSha256 !== queueSha256 ||
        previous.total !== queue.length ||
        previous.permissionRef !== options.permissionRef ||
        previous.refresh !== (options.refresh ?? false))
    )
      throw new Error(
        "Queue or crawl policy differs from saved checkpoint; use a separate status file",
      );
    if (previous?.state === "completed") return previous;
    const now = new Date().toISOString();
    status = {
      schema: "wowhead-crawl-job.v1",
      queueSha256,
      total: queue.length,
      cursor: 0,
      permissionRef: options.permissionRef,
      refresh: options.refresh ?? false,
      state: "running",
      pid: process.pid,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      currentKey: null,
      lastCompletedKey: null,
      error: null,
      counts: { crawled: 0, cached: 0, incomplete: 0, notFound: 0 },
      ...previous,
    };
    status.state = "running";
    status.pid = process.pid;
    status.error = null;
    const save = async (): Promise<void> => {
      if (!status) throw new Error("Missing job state");
      status.updatedAt = new Date().toISOString();
      await atomicJsonWrite(statusPath, crawlJobStatusSchema.parse(status));
    };
    await save();
    const sizes = new Map<string, number>();
    let stagedBytes = 0;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isFile()) throw new Error("Unexpected nested artifact in staging directory");
      const size = (await stat(resolve(root, entry.name))).size;
      sizes.set(entry.name, size);
      stagedBytes += size;
    }
    const available =
      options.availableDiskBytes ??
      (async (): Promise<number> => {
        const filesystem = await statfs(root);
        return filesystem.bavail * filesystem.bsize;
      });
    while (status.cursor < queue.length) {
      options.signal?.throwIfAborted();
      if ((await available()) < minFree)
        throw new Error("Stopped: free disk below crawl safety reserve");
      const batch = queue.slice(status.cursor, status.cursor + batchSize);
      const start = status.cursor;
      await (options.crawl ?? crawlReferences)(batch, {
        ...options,
        limit: batch.length,
        onTaskStart: async (key: string): Promise<void> => {
          if (!status) throw new Error("Missing job state");
          if (key !== referenceKey(queue[status.cursor]!))
            throw new Error("Crawler violated queue order");
          status.currentKey = key;
          await save();
          if (stagedBytes + 300000 > maxStaging)
            throw new Error("Stopped: staging storage budget exhausted");
          await options.onTaskStart?.(key);
        },
        onTaskComplete: async (result: CrawlTaskResult): Promise<void> => {
          if (!status || result.key !== referenceKey(queue[status.cursor]!))
            throw new Error("Crawler completion does not match checkpoint");
          const filename =
            result.outcome === "not_found" || result.gaps.includes("source_not_found")
              ? `${result.key}.missing.json`
              : `${result.key}.json`;
          const size = (await stat(resolve(root, filename))).size;
          stagedBytes += size - (sizes.get(filename) ?? 0);
          sizes.set(filename, size);
          if (result.outcome === "cached") status.counts.cached++;
          else if (result.outcome === "not_found") status.counts.notFound++;
          else {
            status.counts.crawled++;
            if (result.gaps.length) status.counts.incomplete++;
          }
          status.cursor++;
          status.lastCompletedKey = result.key;
          status.currentKey = null;
          await save();
          await options.onTaskComplete?.(result);
        },
      });
      if (status.cursor !== start + batch.length)
        throw new Error("Crawler returned before completing batch");
    }
    status.state = "completed";
    status.currentKey = null;
    status.completedAt = new Date().toISOString();
    await save();
    return status;
  } catch (error) {
    if (status) {
      status.state = options.signal?.aborted ? "interrupted" : "blocked";
      status.error = (error instanceof Error ? error.message : "Crawl job failed").slice(0, 1000);
      status.updatedAt = new Date().toISOString();
      await atomicJsonWrite(statusPath, crawlJobStatusSchema.parse(status));
    }
    throw error;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
