import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { atomicJsonWrite } from "./store.js";

export const DEFAULT_REQUEST_DELAY_MS = 72000;
export const MIN_REQUEST_DELAY_MS = 40000;
export const MAX_REQUEST_DELAY_MS = 120000;
export const REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 50;
export const DEFAULT_ACCESS_DENIED_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const MAX_AUTOMATIC_SOURCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const MAX_TIMESTAMP = 8640000000000000;
const timestamp = z.number().int().nonnegative().max(MAX_TIMESTAMP);
const legacyPacingSchema = z
  .object({
    schema: z.literal("wowhead-request-pacing.v1"),
    lastRequestedAt: timestamp,
    notBefore: timestamp,
    delayMs: z.number().int().min(MIN_REQUEST_DELAY_MS).max(MAX_REQUEST_DELAY_MS),
  })
  .strict();
const pacingSchema = z
  .object({
    schema: z.literal("wowhead-request-pacing.v2"),
    lastRequestedAt: timestamp,
    notBefore: timestamp,
    delayMs: z.number().int().min(MIN_REQUEST_DELAY_MS).max(MAX_REQUEST_DELAY_MS),
    requestTimestamps: z.array(timestamp).max(MAX_REQUESTS_PER_WINDOW),
  })
  .strict();

export type RequestPacing = z.infer<typeof pacingSchema>;

export interface RequestGate {
  beforeRequest(delayMs: number): Promise<void>;
  cooldown(retryAfter: string | null, delayMs: number, fallbackMs?: number): Promise<number>;
}

export class SourceCooldownError extends Error {
  override readonly name = "SourceCooldownError";

  constructor(
    message: string,
    readonly retryAt: number,
    readonly sourceStatus: number | null = null,
  ) {
    super(message);
  }
}

export function validateRequestDelay(delayMs: number): number {
  if (
    !Number.isSafeInteger(delayMs) ||
    delayMs < MIN_REQUEST_DELAY_MS ||
    delayMs > MAX_REQUEST_DELAY_MS
  )
    throw new Error(`Crawl delay must be ${MIN_REQUEST_DELAY_MS}-${MAX_REQUEST_DELAY_MS} ms`);
  return delayMs;
}

export async function readRequestPacing(directory: string): Promise<RequestPacing | null> {
  const path = resolve(directory, ".request-pacing.json");
  try {
    if ((await stat(path)).size > 3000) throw new Error("Request pacing exceeds size budget");
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    const current = pacingSchema.safeParse(value);
    if (current.success) return current.data;
    const legacy = legacyPacingSchema.parse(value);
    return pacingSchema.parse({
      schema: "wowhead-request-pacing.v2",
      lastRequestedAt: legacy.lastRequestedAt,
      notBefore: legacy.notBefore,
      delayMs: legacy.delayMs,
      requestTimestamps: [legacy.lastRequestedAt],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Called under the crawl lock; every top-level source navigation shares this durable gate.
export async function requestGate(
  directory: string,
  sleep: (milliseconds: number) => Promise<void>,
  now: () => number,
  signal?: AbortSignal,
): Promise<RequestGate> {
  const path = resolve(directory, ".request-pacing.json");
  let state = await readRequestPacing(directory);
  const clock = (): number => timestamp.parse(now());
  const recentRequests = (at: number): number[] =>
    (state?.requestTimestamps ?? [])
      .filter((requestedAt) => requestedAt > at - REQUEST_WINDOW_MS)
      .sort((left, right) => left - right);
  return {
    async beforeRequest(delayMs: number): Promise<void> {
      validateRequestDelay(delayMs);
      signal?.throwIfAborted();
      const current = clock();
      const sourceWait = (state?.notBefore ?? 0) - current;
      if (sourceWait > MAX_REQUEST_DELAY_MS)
        throw new SourceCooldownError(
          `Source cooldown until ${new Date(state!.notBefore).toISOString()}; stopped`,
          state!.notBefore,
        );
      const requests = recentRequests(current);
      const windowNotBefore =
        requests.length >= MAX_REQUESTS_PER_WINDOW ? requests[0]! + REQUEST_WINDOW_MS : 0;
      const spacingNotBefore = state ? state.lastRequestedAt + delayMs : current + delayMs;
      const wait = Math.max(0, sourceWait, spacingNotBefore - current, windowNotBefore - current);
      await sleep(wait);
      signal?.throwIfAborted();
      const requestedAt = clock();
      const updatedRequests = recentRequests(requestedAt);
      if (updatedRequests.length >= MAX_REQUESTS_PER_WINDOW)
        throw new Error("Request pacing wait completed before the rolling window elapsed");
      state = pacingSchema.parse({
        schema: "wowhead-request-pacing.v2",
        lastRequestedAt: requestedAt,
        notBefore: requestedAt + delayMs,
        delayMs,
        requestTimestamps: [...updatedRequests, requestedAt],
      });
      await atomicJsonWrite(path, state);
    },
    async cooldown(
      retryAfter: string | null,
      delayMs: number,
      fallbackMs = 300000,
    ): Promise<number> {
      if (!Number.isSafeInteger(fallbackMs) || fallbackMs < delayMs)
        throw new Error("Invalid source cooldown fallback");
      const current = clock();
      const value = retryAfter?.trim();
      const parsed =
        value && /^\d+$/.test(value)
          ? Number(value) * 1000
          : value
            ? Date.parse(value) - current
            : fallbackMs;
      const retry = Number.isFinite(parsed)
        ? Math.max(delayMs, parsed)
        : value && /^\d+$/.test(value)
          ? MAX_TIMESTAMP
          : fallbackMs;
      state = pacingSchema.parse({
        schema: "wowhead-request-pacing.v2",
        lastRequestedAt: state?.lastRequestedAt ?? current,
        notBefore: Math.max(state?.notBefore ?? 0, Math.min(MAX_TIMESTAMP, current + retry)),
        delayMs,
        requestTimestamps: recentRequests(current),
      });
      await atomicJsonWrite(path, state);
      return state.notBefore;
    },
  };
}
