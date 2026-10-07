import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { atomicJsonWrite } from "./store.js";

export const DEFAULT_REQUEST_DELAY_MS = 60000;
export const MIN_REQUEST_DELAY_MS = 40000;
export const MAX_REQUEST_DELAY_MS = 120000;

const MAX_TIMESTAMP = 8640000000000000;
const timestamp = z.number().int().nonnegative().max(MAX_TIMESTAMP);
const pacingSchema = z.object({
  schema: z.literal("wowhead-request-pacing.v1"),
  lastRequestedAt: timestamp,
  notBefore: timestamp,
  delayMs: z.number().int().min(MIN_REQUEST_DELAY_MS).max(MAX_REQUEST_DELAY_MS),
}).strict();

export type RequestPacing = z.infer<typeof pacingSchema>;

export interface RequestGate {
  beforeRequest(delayMs: number): Promise<void>;
  cooldown(retryAfter: string | null, delayMs: number): Promise<void>;
}

export function validateRequestDelay(delayMs: number): number {
  if (!Number.isSafeInteger(delayMs) || delayMs < MIN_REQUEST_DELAY_MS || delayMs > MAX_REQUEST_DELAY_MS)
    throw new Error(`Crawl delay must be ${MIN_REQUEST_DELAY_MS}-${MAX_REQUEST_DELAY_MS} ms`);
  return delayMs;
}

export async function readRequestPacing(directory: string): Promise<RequestPacing | null> {
  const path = resolve(directory, ".request-pacing.json");
  try {
    if ((await stat(path)).size > 3000) throw new Error("Request pacing exceeds size budget");
    return pacingSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Called under the crawl lock; every HTTP attempt shares this durable gate.
export async function requestGate(
  directory: string,
  sleep: (milliseconds: number) => Promise<void>,
  now: () => number,
  signal?: AbortSignal,
): Promise<RequestGate> {
  const path = resolve(directory, ".request-pacing.json");
  let state = await readRequestPacing(directory);
  const clock = (): number => timestamp.parse(now());
  return {
    async beforeRequest(delayMs: number): Promise<void> {
      validateRequestDelay(delayMs);
      signal?.throwIfAborted();
      const wait = Math.max(delayMs, (state?.notBefore ?? 0) - clock());
      if (wait > MAX_REQUEST_DELAY_MS)
        throw new Error(`Source cooldown until ${new Date(state!.notBefore).toISOString()}; stopped`);
      await sleep(wait);
      signal?.throwIfAborted();
      const requestedAt = clock();
      state = pacingSchema.parse({
        schema: "wowhead-request-pacing.v1",
        lastRequestedAt: requestedAt,
        notBefore: requestedAt + delayMs,
        delayMs,
      });
      await atomicJsonWrite(path, state);
    },
    async cooldown(retryAfter: string | null, delayMs: number): Promise<void> {
      const current = clock();
      const value = retryAfter?.trim();
      const parsed = value && /^\d+$/.test(value)
        ? Number(value) * 1000
        : value ? Date.parse(value) - current : 300000;
      const retry = Number.isFinite(parsed) ? Math.max(delayMs, parsed)
        : value && /^\d+$/.test(value) ? MAX_TIMESTAMP : 300000;
      state = pacingSchema.parse({
        schema: "wowhead-request-pacing.v1",
        lastRequestedAt: state?.lastRequestedAt ?? current,
        notBefore: Math.max(state?.notBefore ?? 0, Math.min(MAX_TIMESTAMP, current + retry)),
        delayMs,
      });
      await atomicJsonWrite(path, state);
    },
  };
}
