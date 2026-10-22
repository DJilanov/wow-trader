import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { z } from "zod";
import {
  addToolUsage,
  toolUsageAggregateSchema,
  toolUsageBuildSchema,
  toolUsageDateSchema,
} from "./tool-usage-contract.mjs";
import type { ToolUsageEvent } from "./tool-usage";

export interface ToolUsageConfig {
  readonly root: string;
  readonly build: string;
}

export function toolUsageConfig(): ToolUsageConfig | null {
  const build = toolUsageBuildSchema.safeParse(process.env.TOOL_USAGE_BUILD);
  const root = process.env.TOOL_USAGE_ROOT;
  if (process.env.TOOL_USAGE_ENABLED !== "true" || !root || !build.success) return null;
  return { root: resolve(root), build: build.data };
}

let pendingWrite: Promise<void> = Promise.resolve();
let queued = 0;
let lastPruned = "";

export async function storeToolUsage(input: ToolUsageEvent, now: Date = new Date()): Promise<void> {
  const config = toolUsageConfig();
  if (!config || config.build !== input.build)
    throw new Error("Tool usage is not configured for this release.");
  if (queued >= 32) throw new Error("Tool usage writer is busy.");
  queued++;
  const operation = pendingWrite
    .catch(() => undefined)
    .then(async (): Promise<void> => {
      await mkdir(config.root, { recursive: true, mode: 0o700 });
      const lock = join(config.root, ".writer-lock");
      await acquireLock(lock);
      const date = now.toISOString().slice(0, 10);
      const file = join(config.root, `${date}.json`);
      const temporary = join(config.root, `.${date}.${process.pid}.tmp`);
      try {
        const aggregate = addToolUsage(await readAggregate(file), input, now);
        await writeFile(temporary, `${JSON.stringify(aggregate)}\n`, { mode: 0o600, flag: "wx" });
        await rename(temporary, file);
        if (lastPruned !== `${config.root}:${date}`) {
          await pruneExpired(config.root, now);
          lastPruned = `${config.root}:${date}`;
        }
      } finally {
        try {
          await unlink(temporary).catch((error: unknown): void => {
            if (!missing(error)) throw error;
          });
        } finally {
          await rmdir(lock);
        }
      }
    });
  pendingWrite = operation;
  try {
    await operation;
  } finally {
    queued--;
  }
}

async function acquireLock(lock: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      return;
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      await setTimeout(25);
    }
  }
  // Never steal a lock from a slow or crashed writer and risk losing existing totals.
  throw new Error("Tool usage writer lock is unavailable.");
}

async function readAggregate(
  file: string,
): Promise<z.infer<typeof toolUsageAggregateSchema> | null> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > 131_072)
      throw new Error("Invalid tool usage aggregate file.");
    return toolUsageAggregateSchema.parse(JSON.parse(await readFile(file, "utf8")) as unknown);
  } catch (error: unknown) {
    if (missing(error)) return null;
    throw error;
  }
}

async function pruneExpired(root: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const date = toolUsageDateSchema.safeParse(entry.name.slice(0, -5));
    if (date.success && date.data < cutoff) await unlink(join(root, entry.name));
  }
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
