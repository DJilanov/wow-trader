import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

import { z } from "zod";

import { referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import {
  buildStillSixtyRecipePlan,
  competitorRecipePlanSchema,
  parseStillSixtyRecipePage,
  stagedCompetitorRecipeReferenceSchema,
  STILLSIXTY_CRAWLER_AGENT_NAME,
  STILLSIXTY_CRAWLER_USER_AGENT,
  STILLSIXTY_RECIPE_SITEMAP_URL,
  STILLSIXTY_ROBOTS_URL,
  type CompetitorRecipePlan,
} from "./stillsixty-reference.js";
import { atomicJsonWrite } from "./store.js";

const require = createRequire(import.meta.url);
const robotsParser = require("robots-parser") as (
  url: string,
  contents: string,
) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

const MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_REQUESTS_PER_HOUR = 48;
const MAX_REQUESTS_PER_HOUR = 60;

const crawlFailureSchema = z
  .object({
    recipeSpellId: z.number().int().positive(),
    sourceUrl: z.url(),
    occurredAt: z.iso.datetime(),
    statusCode: z.number().int().min(100).max(599).nullable(),
    reason: z.string().min(1).max(1_000),
  })
  .strict();

export const competitorCrawlStatusSchema = z
  .object({
    schema: z.literal("competitor-recipe-crawl-status.v1"),
    source: z.literal("stillsixty"),
    planSha256: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedRecipeSpellIds: z.array(z.number().int().positive()).max(100_000),
    failures: z.array(crawlFailureSchema).max(10_000),
    blockedUntil: z.iso.datetime().nullable(),
    stopReason: z
      .enum([
        "limit_reached",
        "complete",
        "rate_limited",
        "access_denied",
        "http_error",
        "network_error",
        "validation_error",
      ])
      .nullable(),
  })
  .strict();
export type CompetitorCrawlStatus = z.infer<typeof competitorCrawlStatusSchema>;

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly url: string;
  readonly headers: Headers;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type CompetitorFetch = (
  input: string,
  init: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
) => Promise<FetchResponse>;

export interface DownloadStillSixtyPlanOptions {
  readonly queue: readonly ReferenceTask[];
  readonly now?: () => Date;
  readonly fetch?: CompetitorFetch;
}

export interface CrawlStillSixtyOptions {
  readonly plan: CompetitorRecipePlan;
  readonly stagingDirectory: string;
  readonly statusPath: string;
  readonly limit?: number;
  readonly requestsPerHour?: number;
  readonly now?: () => Date;
  readonly fetch?: CompetitorFetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export async function downloadStillSixtyPlan(
  options: DownloadStillSixtyPlanOptions,
): Promise<CompetitorRecipePlan> {
  const fetcher = options.fetch ?? defaultFetch;
  const robots = await fetchText(fetcher, STILLSIXTY_ROBOTS_URL, "text/plain");
  assertRobotsAllows(robots, STILLSIXTY_RECIPE_SITEMAP_URL);
  assertRobotsAllows(robots, `${STILLSIXTY_ROBOTS_URL.replace("/robots.txt", "")}/recipe/1`);
  const sitemap = await fetchText(fetcher, STILLSIXTY_RECIPE_SITEMAP_URL, "xml");
  return buildStillSixtyRecipePlan(options.queue, sitemap, options.now?.() ?? new Date());
}

export async function crawlStillSixtyRecipes(
  options: CrawlStillSixtyOptions,
): Promise<CompetitorCrawlStatus> {
  const plan = competitorRecipePlanSchema.parse(options.plan);
  const requestsPerHour = options.requestsPerHour ?? DEFAULT_REQUESTS_PER_HOUR;
  if (
    !Number.isSafeInteger(requestsPerHour) ||
    requestsPerHour <= 0 ||
    requestsPerHour > MAX_REQUESTS_PER_HOUR
  ) {
    throw new Error(`requestsPerHour must be an integer between 1 and ${MAX_REQUESTS_PER_HOUR}`);
  }
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit <= 0)) {
    throw new Error("limit must be a positive integer");
  }

  const fetcher = options.fetch ?? defaultFetch;
  const sleep = options.sleep ?? ((milliseconds: number) => pause(milliseconds));
  const now = options.now ?? (() => new Date());
  const planSha256 = sha256(JSON.stringify(plan));
  await mkdir(options.stagingDirectory, { recursive: true });
  await mkdir(dirname(resolve(options.statusPath)), { recursive: true });
  const existing = await readCrawlStatus(options.statusPath);
  if (existing && existing.planSha256 !== planSha256) {
    throw new Error("Existing competitor crawl status belongs to another plan");
  }
  let status: CompetitorCrawlStatus =
    existing ??
    competitorCrawlStatusSchema.parse({
      schema: "competitor-recipe-crawl-status.v1",
      source: "stillsixty",
      planSha256,
      startedAt: now().toISOString(),
      updatedAt: now().toISOString(),
      completedRecipeSpellIds: [],
      failures: [],
      blockedUntil: null,
      stopReason: null,
    });
  if (status.blockedUntil && Date.parse(status.blockedUntil) > now().getTime()) return status;

  const robotsCheckedAt = now().toISOString();
  const robots = await fetchText(fetcher, plan.robotsUrl, "text/plain");
  for (const task of plan.tasks) assertRobotsAllows(robots, task.sourceUrl);

  const completed = new Set(status.completedRecipeSpellIds);
  const minimumIntervalMs = Math.ceil(3_600_000 / requestsPerHour);
  const maximum = options.limit ?? Number.POSITIVE_INFINITY;
  let processed = 0;
  let lastRequestAt = 0;

  for (const task of plan.tasks) {
    if (completed.has(task.recipeSpellId)) continue;
    if (processed >= maximum) {
      status = await updateStatus(options.statusPath, status, now(), {
        completedRecipeSpellIds: [...completed],
        stopReason: "limit_reached",
      });
      return status;
    }
    const waitMs = Math.max(0, lastRequestAt + minimumIntervalMs - now().getTime());
    if (waitMs > 0) await sleep(waitMs);

    let response: FetchResponse;
    try {
      response = await fetcher(task.sourceUrl, requestInit("text/html"));
      lastRequestAt = now().getTime();
    } catch (error) {
      status = await stopForFailure(
        options.statusPath,
        status,
        task,
        now(),
        null,
        error,
        null,
        "network_error",
      );
      return status;
    }
    if (!response.ok) {
      const stopReason =
        response.status === 429
          ? "rate_limited"
          : response.status === 403
            ? "access_denied"
            : "http_error";
      const blockedUntil =
        response.status === 429 ? retryAfterDate(response.headers.get("retry-after"), now()) : null;
      status = await stopForFailure(
        options.statusPath,
        status,
        task,
        now(),
        response.status,
        new Error(`StillSixty returned HTTP ${response.status}`),
        blockedUntil,
        stopReason,
      );
      return status;
    }
    if (new URL(response.url).href !== task.sourceUrl) {
      status = await stopForFailure(
        options.statusPath,
        status,
        task,
        now(),
        response.status,
        new Error("StillSixty recipe redirected outside its canonical URL"),
        null,
      );
      return status;
    }

    try {
      const html = await responseText(response);
      const record = parseStillSixtyRecipePage(html, task.recipeSpellId, now().toISOString());
      const staged = stagedCompetitorRecipeReferenceSchema.parse({
        ...record,
        access: {
          robotsUrl: plan.robotsUrl,
          robotsCheckedAt,
          userAgent: plan.userAgent,
        },
      });
      await atomicJsonWrite(
        resolve(options.stagingDirectory, `stillsixty-spell-${task.recipeSpellId}.json`),
        staged,
      );
      completed.add(task.recipeSpellId);
      processed += 1;
      status = await updateStatus(options.statusPath, status, now(), {
        completedRecipeSpellIds: [...completed],
        blockedUntil: null,
        stopReason: null,
      });
    } catch (error) {
      status = await stopForFailure(
        options.statusPath,
        status,
        task,
        now(),
        response.status,
        error,
        null,
        "validation_error",
      );
      return status;
    }
  }

  return updateStatus(options.statusPath, status, now(), {
    completedRecipeSpellIds: [...completed],
    blockedUntil: null,
    stopReason: "complete",
  });
}

async function fetchText(fetcher: CompetitorFetch, url: string, accept: string): Promise<string> {
  const response = await fetcher(url, requestInit(accept));
  if (!response.ok) throw new Error(`StillSixty returned HTTP ${response.status} for ${url}`);
  if (new URL(response.url).origin !== new URL(url).origin) {
    throw new Error("StillSixty request redirected to another origin");
  }
  return responseText(response);
}

async function responseText(response: FetchResponse): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("StillSixty response exceeds 2 MB");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error("StillSixty response exceeds 2 MB");
  return body.toString("utf8");
}

function requestInit(accept: string): {
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
} {
  return {
    headers: {
      accept,
      "accept-language": "en-US,en;q=0.8",
      "user-agent": STILLSIXTY_CRAWLER_USER_AGENT,
    },
    signal: AbortSignal.timeout(30_000),
  };
}

async function defaultFetch(
  input: string,
  init: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
): Promise<FetchResponse> {
  return fetch(input, init);
}

function assertRobotsAllows(robotsText: string, url: string): void {
  const policy = robotsParser(STILLSIXTY_ROBOTS_URL, robotsText);
  if (policy.isAllowed(url, STILLSIXTY_CRAWLER_AGENT_NAME) !== true) {
    throw new Error(`StillSixty robots policy does not allow ${url}`);
  }
}

async function readCrawlStatus(path: string): Promise<CompetitorCrawlStatus | null> {
  try {
    return competitorCrawlStatusSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function updateStatus(
  path: string,
  current: CompetitorCrawlStatus,
  now: Date,
  changes: Partial<
    Pick<
      CompetitorCrawlStatus,
      "completedRecipeSpellIds" | "blockedUntil" | "stopReason" | "failures"
    >
  >,
): Promise<CompetitorCrawlStatus> {
  const status = competitorCrawlStatusSchema.parse({
    ...current,
    ...changes,
    updatedAt: now.toISOString(),
  });
  await atomicJsonWrite(path, status);
  return status;
}

async function stopForFailure(
  path: string,
  current: CompetitorCrawlStatus,
  task: CompetitorRecipePlan["tasks"][number],
  now: Date,
  statusCode: number | null,
  error: unknown,
  blockedUntil: Date | null,
  stopReason: CompetitorCrawlStatus["stopReason"] = "http_error",
): Promise<CompetitorCrawlStatus> {
  return updateStatus(path, current, now, {
    failures: [
      ...current.failures,
      {
        recipeSpellId: task.recipeSpellId,
        sourceUrl: task.sourceUrl,
        occurredAt: now.toISOString(),
        statusCode,
        reason: error instanceof Error ? error.message : String(error),
      },
    ],
    blockedUntil: blockedUntil?.toISOString() ?? null,
    stopReason,
  });
}

function retryAfterDate(value: string | null, now: Date): Date {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(now.getTime() + Math.max(300_000, seconds * 1_000));
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > now.getTime()) return new Date(parsed);
  }
  return new Date(now.getTime() + 300_000);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseCompetitorQueue(value: unknown): readonly ReferenceTask[] {
  return z.array(referenceTaskSchema).max(100_000).parse(value);
}

export function parseCompetitorPlan(value: unknown): CompetitorRecipePlan {
  return competitorRecipePlanSchema.parse(value);
}

export function parseCompetitorRecord(
  value: unknown,
): z.infer<typeof stagedCompetitorRecipeReferenceSchema> {
  return stagedCompetitorRecipeReferenceSchema.parse(value);
}
