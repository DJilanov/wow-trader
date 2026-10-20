/**
 * Reference crawler.
 *
 * The production path drives Browsertrix Crawler in Docker, then reads the
 * resulting WARC responses and extracts records with the same parser used by
 * the rest of the package. Identity, robots, durable pacing, cache checks and
 * staging writes stay outside the browser container.
 *
 * Supplying `options.fetcher` selects the in-process transport used by unit
 * tests and offline tooling; it is never selected silently.
 */
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { WARCParser, type WARCRecord } from "warcio";
import { z } from "zod";
import {
  referenceIsFresh,
  referenceKey,
  referenceQualityGaps,
  referenceTaskSchema,
  referenceUrl,
  type ReferenceTask,
} from "./contracts.js";
import { parseQuestXpPage, parseWowheadPage } from "./parser.js";
import { parseWowheadListing } from "./listing-parser.js";
import {
  listingKey,
  listingTaskSchema,
  listingUrl,
  type ListingRecord,
  type ListingTask,
} from "./listing-contracts.js";
import {
  listingErrorPath,
  listingIsFresh,
  listingMissingPath,
  readStagedListing,
  writeStagedListing,
} from "./listing-store.js";
import { writeChallengeEvidence } from "./challenge-evidence.js";
import { readStagedQuestXp } from "./quest-xp-store.js";
import { QUEST_XP_PARSER_VERSION } from "./quest-xp-contracts.js";
import { atomicJsonWrite, readStagedReference } from "./store.js";
import {
  DEFAULT_ACCESS_DENIED_COOLDOWN_MS,
  requestGate,
  SourceCooldownError,
  validateRequestDelay,
  type RequestGate,
} from "./pacing.js";
import { CRAWLER_AGENT } from "./identity.js";
import { loadRobotsPolicyText } from "./robots-cache.js";

export { CRAWLER_AGENT };

interface RobotsPolicy {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
}

// robots-parser ships CommonJS with an ESM-style declaration; bind its documented callable export.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  text: string,
) => RobotsPolicy;

const BROWSERTRIX_DEFAULT_IMAGE = "webrecorder/browsertrix-crawler:1.15.0";
const BROWSERTRIX_COLLECTION = "crawl";
// A batch of one task bounds failure recovery. Each source seed is launched in
// its own container so the durable gate can account for every navigation.
const BROWSERTRIX_TASK_BATCH = 1;

const DEFAULT_DELAY_MIN_MS = 72_000;
const DEFAULT_DELAY_MAX_MS = 90_000;
const DELAY_MIN_ENV = "CRAWL_DELAY_MIN_MS";
const DELAY_MAX_ENV = "CRAWL_DELAY_MAX_MS";
const BROWSERTRIX_SCREENCAST_PORT_ENV = "BROWSERTRIX_SCREENCAST_PORT";
const BROWSERTRIX_PAGE_LOAD_TIMEOUT_SECONDS = 30;
const SOURCE_PAGE_BYTES = 4_000_000;
const SOURCE_REDIRECT_LIMIT = 5;
const BROWSERTRIX_REPORT_BYTES = 50_000_000;
const BROWSERTRIX_LOG_BYTES = 20_000_000;
const BROWSERTRIX_SCREENSHOT_BYTES = 10_000_000;
const BROWSERTRIX_DOCKER_STOP_GRACE_MS = 30_000;
const executeDockerCommand = promisify(execFile);

const ENTITY_ORIGIN = "https://www.wowhead.com";
const CONTENT_TYPE_PATTERN = /(?:text\/html|application\/xml|text\/xml)/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CHALLENGE_PATTERN =
  /cf-chl-|AwsWafIntegration|verify that you(?:'|’)re not a robot|<title>\s*(?:Just a moment|Access denied|Verify you are human)/i;

export interface CrawlOptions {
  readonly directory: string;
  readonly permissionRef: string;
  readonly limit?: number;
  /**
   * Fixed delay override. Takes precedence over min/max; when omitted the
   * crawler jitters between the configured bounds.
   */
  readonly delayMs?: number;
  /** Inclusive lower delay bound in milliseconds. Defaults to 72000. */
  readonly delayMinMs?: number;
  /** Inclusive upper delay bound in milliseconds. Defaults to 90000. */
  readonly delayMaxMs?: number;
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  readonly random?: () => number;
  readonly refresh?: boolean;
  readonly questXp?: boolean;
  /** Skip the item `&xml` navigation and parse tooltip/class from the HTML page. */
  readonly skipItemXml?: boolean;
  readonly waitOnSourceCooldown?: boolean;
  /** Selects the in-process fetch transport instead of Browsertrix. */
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (key: string, gaps: readonly string[]) => void | Promise<void>;
  readonly onTaskStart?: (key: string) => void | Promise<void>;
  readonly onTaskComplete?: (result: CrawlTaskResult) => void | Promise<void>;
  /** Browsertrix Docker image. Defaults to BROWSERTRIX_IMAGE or the pinned 1.15.0 image. */
  readonly browsertrixImage?: string;
  /**
   * Optional loopback-only Browsertrix screencast port. The viewer is available
   * only while a browser container is running.
   */
  readonly browsertrixScreencastPort?: number;
  /**
   * Brave profile tar.gz created by `create-login-profile`. Accepts a local
   * path or an HTTP(S) URL. A local profile is mounted read-only at /profiles,
   * or read-write when browsertrixSaveProfile is set.
   */
  readonly browsertrixProfile?: string;
  /** Save refreshed cookies back to the local profile after a successful crawl. */
  readonly browsertrixSaveProfile?: boolean;
  /** Upstream proxy for the crawler browser, e.g. http://host.docker.internal:8080. */
  readonly browsertrixProxy?: string;
  /** Docker --add-host entries, e.g. www.wowhead.com:host.docker.internal. */
  readonly browsertrixAddHosts?: readonly string[];
  /** Docker network mode, e.g. host or a custom network name. */
  readonly browsertrixNetwork?: string;
  /** Extra Chrome switches, e.g. --ignore-certificate-errors for a local test CA. */
  readonly browsertrixExtraChromeArgs?: readonly string[];
  /**
   * User-agent suffix. Defaults to CRAWLER_AGENT; set to an empty string to
   * match the default Brave UA used while creating a WAF-cleared profile.
   */
  readonly browsertrixUserAgentSuffix?: string;
  /**
   * Parent directory for copied crawl results. Disposable browser data stays
   * inside Docker. Defaults to BROWSERTRIX_WORK_DIR or the OS temp directory.
   */
  readonly browsertrixWorkDirectory?: string;
  /** Keep the WARC workspace. Defaults to BROWSERTRIX_KEEP_ARCHIVE=1. */
  readonly keepBrowsertrixArchive?: boolean;
}

export interface CrawlTaskResult {
  readonly key: string;
  readonly outcome: "crawled" | "cached" | "not_found" | "rejected";
  readonly gaps: readonly string[];
}

export interface CrawlResult {
  readonly crawled: number;
  readonly cached: number;
  readonly incomplete: number;
  readonly notFound: number;
}

export interface ListingCrawlResult extends CrawlResult {
  readonly rejected: number;
}

interface DelayPolicy {
  readonly minMs: number;
  readonly maxMs: number;
  next(): number;
  withFloor(floorMs: number): DelayPolicy;
}

interface CrawlContext {
  readonly root: string;
  readonly gate: RequestGate;
  readonly delay: DelayPolicy;
  readonly policy: RobotsPolicy;
  readonly screencastPort?: number;
}

type Requester = (
  url: string,
  init: Omit<RequestInit, "signal">,
  delayMs: number,
) => Promise<Response>;

interface PendingTask {
  readonly task: ReferenceTask;
  readonly key: string;
  readonly previous: Awaited<ReturnType<typeof readStagedReference>>;
  readonly missingPath: string;
  readonly htmlUrl: string;
  readonly xmlUrl: string | null;
}

type TaskAction =
  | { readonly kind: "cached"; readonly key: string; readonly gaps: readonly string[] }
  | { readonly kind: "pending"; readonly pending: PendingTask };

interface Capture {
  readonly url: string;
  readonly capturedAt: string;
  readonly status: number;
  readonly location: string | null;
  readonly contentType: string;
  readonly text: string;
  readonly tooLarge: boolean;
}

interface PageEntry {
  readonly url: string;
  readonly status: number | null;
}

interface ScreenshotCapture {
  readonly capturedAt: string;
  readonly contentType: "image/png" | "image/jpeg";
  readonly bytes: Buffer;
}

interface CrawlArchive {
  readonly captures: ReadonlyMap<string, Capture>;
  readonly screenshots: ReadonlyMap<string, ScreenshotCapture>;
  readonly pages: ReadonlyMap<string, PageEntry>;
  readonly skipped: ReadonlyMap<string, string>;
  readonly logs: string;
}

interface BrowsertrixProfile {
  readonly containerPath: string;
  readonly hostDirectory: string | null;
  readonly save: boolean;
}

interface BrowsertrixLaunch {
  readonly profile: BrowsertrixProfile | null;
  readonly proxy: string | null;
  readonly addHosts: readonly string[];
  readonly network: string | null;
  readonly extraChromeArgs: readonly string[];
  readonly userAgentSuffix: string;
}

interface BrowsertrixRun {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}

class SourceNotFound extends Error {
  constructor(
    message: string,
    readonly status: 301 | 404 = 404,
  ) {
    super(message);
  }
}

class SourceChallengeError extends Error {
  override readonly name = "SourceChallengeError";

  constructor(readonly url: string) {
    super("Source challenge encountered; stopped");
  }
}

const missingPageSchema = referenceTaskSchema
  .extend({ checkedAt: z.iso.datetime(), status: z.union([z.literal(404), z.literal(301)]) })
  .strict();

export async function crawlReferences(
  tasks: readonly ReferenceTask[],
  options: CrawlOptions,
): Promise<CrawlResult> {
  options.signal?.throwIfAborted();
  const queue = [
    ...new Map(
      tasks.map((task) => {
        const validated = referenceTaskSchema.parse(task);
        return [referenceKey(validated), validated] as const;
      }),
    ).values(),
  ];
  if (!options.permissionRef.trim()) throw new Error("A permission reference is required");
  const limit = options.limit ?? 20;
  const requestedDelay = createDelayPolicy(options);
  const screencastPort = browsertrixScreencastPort(options);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error("Record limit must be 1-500");
  const sleep =
    options.sleep ??
    (async (milliseconds: number): Promise<void> => {
      await pause(milliseconds, undefined, { signal: options.signal });
    });
  const root = resolve(options.directory);
  await mkdir(root, { recursive: true });
  const lockPath = resolve(root, ".crawl.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const gate = await requestGate(root, sleep, options.now ?? Date.now, options.signal);
    const request = createRequester(options, gate);
    const robots = await loadRobotsPolicyText(root, (options.now ?? Date.now)(), async () => {
      const response = await request(
        `${ENTITY_ORIGIN}/robots.txt`,
        {
          redirect: "error",
          headers: { "user-agent": CRAWLER_AGENT },
        },
        requestedDelay.next(),
      );
      if (!response.ok) throw new Error(`Robots fetch failed: HTTP ${response.status}`);
      return limitedText(response, 500000);
    });
    const policy = robotsParser(`${ENTITY_ORIGIN}/robots.txt`, robots.text);
    const robotsDelay = policy.getCrawlDelay(CRAWLER_AGENT) ?? 0;
    if (!Number.isFinite(robotsDelay) || robotsDelay < 0 || robotsDelay > 120)
      throw new Error("Unsupported robots crawl-delay; stopped");
    const delay = requestedDelay.withFloor(Math.ceil(robotsDelay * 1000));
    const context: CrawlContext = {
      root,
      gate,
      delay,
      policy,
      ...(screencastPort !== undefined ? { screencastPort } : {}),
    };
    if (options.fetcher) return await crawlWithFetcher(queue, options, context, request, limit);
    return await crawlWithBrowsertrix(queue, options, context, limit);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

/**
 * Crawls the bounded profession listing pages that expose many recipes at once.
 *
 * Listing evidence is stored separately from entity records. The queue planner
 * uses it only to remove detail-page tasks whose exact acquisition relation is
 * present; broad labels and ambiguous links remain unresolved.
 */
export async function crawlListings(
  tasks: readonly ListingTask[],
  options: CrawlOptions,
): Promise<ListingCrawlResult> {
  if (options.fetcher) throw new Error("Listing crawl requires the Browsertrix transport");
  options.signal?.throwIfAborted();
  if (!options.permissionRef.trim()) throw new Error("A permission reference is required");
  const queue = [
    ...new Map(
      tasks.map((task) => {
        const validated = listingTaskSchema.parse(task);
        return [listingKey(validated), validated] as const;
      }),
    ).values(),
  ];
  if (queue.length === 0) throw new Error("Listing queue is empty");
  const limit = options.limit ?? 30;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Listing limit must be 1-100");
  const requestedDelay = createDelayPolicy(options);
  const screencastPort = browsertrixScreencastPort(options);
  const root = resolve(options.directory);
  await mkdir(root, { recursive: true });
  const lockPath = resolve(root, ".crawl.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const sleep =
      options.sleep ??
      (async (milliseconds: number): Promise<void> => {
        await pause(milliseconds, undefined, { signal: options.signal });
      });
    const gate = await requestGate(root, sleep, options.now ?? Date.now, options.signal);
    const request = createRequester(options, gate);
    const robots = await loadRobotsPolicyText(root, (options.now ?? Date.now)(), async () => {
      const response = await request(
        `${ENTITY_ORIGIN}/robots.txt`,
        { redirect: "error", headers: { "user-agent": CRAWLER_AGENT } },
        requestedDelay.next(),
      );
      if (!response.ok) throw new Error(`Robots fetch failed: HTTP ${response.status}`);
      return limitedText(response, 500000);
    });
    const policy = robotsParser(`${ENTITY_ORIGIN}/robots.txt`, robots.text);
    const robotsDelay = policy.getCrawlDelay(CRAWLER_AGENT) ?? 0;
    if (!Number.isFinite(robotsDelay) || robotsDelay < 0 || robotsDelay > 120)
      throw new Error("Unsupported robots crawl-delay; stopped");
    const delay = requestedDelay.withFloor(Math.ceil(robotsDelay * 1000));
    return await crawlListingTasks(
      queue,
      options,
      { root, gate, delay, policy, ...(screencastPort !== undefined ? { screencastPort } : {}) },
      limit,
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function crawlListingTasks(
  queue: readonly ListingTask[],
  options: CrawlOptions,
  context: CrawlContext,
  limit: number,
): Promise<ListingCrawlResult> {
  const { root, gate, delay, policy, screencastPort } = context;
  let crawled = 0,
    cached = 0,
    incomplete = 0,
    notFound = 0,
    rejected = 0;
  for (const task of queue) {
    options.signal?.throwIfAborted();
    const key = listingKey(task);
    await options.onTaskStart?.(key);
    const previous = await readStagedListing(root, task);
    if (previous && listingIsFresh(previous) && !options.refresh) {
      cached++;
      await options.onTaskComplete?.({
        key,
        outcome: "cached",
        gaps: previous.entries.length ? [] : ["no_listing_entries"],
      });
      continue;
    }
    if (
      !options.refresh &&
      (await recentlyMissingListing(root, task, (options.now ?? Date.now)()))
    ) {
      cached++;
      await options.onTaskComplete?.({ key, outcome: "cached", gaps: ["source_not_found"] });
      continue;
    }
    if (crawled + notFound + rejected >= limit) break;
    await gate.beforeRequest(delay.next());
    const result = await executeBrowsertrix(
      [listingUrl(task)],
      listingTargetMatcher(task),
      options,
      screencastPort,
    );
    if (result.run.exitCode !== 0)
      await throwBrowsertrixFailure(result.run, result.archive, options, gate, delay);
    let page: { text: string; url: string; capturedAt: string };
    try {
      page = await captureListingSource(
        result.archive,
        listingUrl(task),
        task,
        policy,
        options.signal,
      );
    } catch (error) {
      if (error instanceof SourceNotFound) {
        await atomicJsonWrite(listingMissingPath(root, task), {
          ...task,
          status: error.status,
          checkedAt: new Date().toISOString(),
        });
        notFound++;
        await options.onProgress?.(key, ["source_not_found"]);
        await options.onTaskComplete?.({
          key,
          outcome: "not_found",
          gaps: ["source_not_found"],
        });
        continue;
      }
      if (error instanceof SourceChallengeError) {
        await writeListingChallengeEvidence(result.archive, error, task, root);
        throw error;
      }
      throw error;
    }

    let record: ListingRecord;
    try {
      record = parseWowheadListing(page.text, task, {
        url: page.url,
        capturedAt: page.capturedAt,
        permissionRef: options.permissionRef,
      });
    } catch (error) {
      await atomicJsonWrite(listingErrorPath(root, task), {
        schema: "wowhead-listing-error.v1",
        ...task,
        sourceUrl: page.url,
        capturedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      });
      rejected++;
      await options.onProgress?.(key, ["listing_parser_error"]);
      await options.onTaskComplete?.({
        key,
        outcome: "rejected",
        gaps: ["listing_parser_error"],
      });
      continue;
    }

    await writeStagedListing(root, record);
    await rm(listingMissingPath(root, task), { force: true });
    await rm(listingErrorPath(root, task), { force: true });
    const gaps = record.entries.length ? [] : ["no_listing_entries"];
    crawled++;
    if (gaps.length) incomplete++;
    await options.onProgress?.(key, gaps);
    await options.onTaskComplete?.({ key, outcome: "crawled", gaps });
  }
  return { crawled, cached, incomplete, notFound, rejected };
}

async function recentlyMissingListing(
  root: string,
  task: ListingTask,
  now: number,
): Promise<boolean> {
  try {
    const info = await stat(listingMissingPath(root, task));
    return now - info.mtimeMs < 7 * 86400000;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeListingChallengeEvidence(
  archive: CrawlArchive,
  error: SourceChallengeError,
  task: ListingTask,
  root: string,
): Promise<void> {
  const capture = archive.captures.get(urlKey(error.url));
  if (!capture) return;
  const screenshot = archive.screenshots.get(urlKey(error.url)) ?? null;
  await writeChallengeEvidence({
    stagingDirectory: root,
    key: listingKey(task),
    url: capture.url,
    capturedAt: capture.capturedAt,
    status: capture.status,
    contentType: capture.contentType,
    responseBody: capture.text,
    screenshot,
  });
}

function listingTargetMatcher(task: ListingTask): (url: string) => boolean {
  const expected = new URL(listingUrl(task));
  return (raw: string): boolean => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    return (
      url.origin === ENTITY_ORIGIN &&
      !url.username &&
      !url.password &&
      (url.pathname === expected.pathname || url.pathname.startsWith(`${expected.pathname}/`))
    );
  };
}

async function captureListingSource(
  archive: CrawlArchive,
  url: string,
  task: ListingTask,
  policy: RobotsPolicy,
  signal?: AbortSignal,
): Promise<{ text: string; url: string; capturedAt: string }> {
  let current = url;
  for (let attempt = 0; attempt < SOURCE_REDIRECT_LIMIT; attempt++) {
    signal?.throwIfAborted();
    assertPermittedListing(current, task);
    if (policy.isAllowed(current, CRAWLER_AGENT) !== true)
      throw new Error("Source disallowed by robots policy");
    const capture = archive.captures.get(urlKey(current));
    if (!capture) {
      const page = pageFor(archive, current);
      if (page?.status === 404) throw new SourceNotFound("Listing document not found");
      const skipped = archive.skipped.get(urlKey(current));
      if (skipped === "robotsTxt") throw new Error("Source disallowed by robots policy");
      if (skipped === "redirectToExcluded")
        throw new Error("Listing redirected outside the permitted profession");
      throw new Error(`Browsertrix archived no response for ${current}`);
    }
    if (capture.status === 404) throw new SourceNotFound("Listing document not found");
    if (REDIRECT_STATUSES.has(capture.status)) {
      if (!capture.location) throw new Error("Listing redirect has no target");
      const next = new URL(capture.location, current);
      if (!listingRedirectAllowed(next, task))
        throw new SourceNotFound("Listing redirected outside the requested profession", 301);
      current = next.href;
      continue;
    }
    if (capture.status < 200 || capture.status > 299)
      throw new Error(`Source HTTP ${capture.status}; stopped without bypassing access controls`);
    if (!CONTENT_TYPE_PATTERN.test(capture.contentType))
      throw new Error("Unexpected source content type");
    if (capture.tooLarge) throw new Error("Source exceeds response budget");
    if (CHALLENGE_PATTERN.test(capture.text)) throw new SourceChallengeError(current);
    return { text: capture.text, url: current, capturedAt: capture.capturedAt };
  }
  throw new Error("Too many source redirects or retries");
}

function assertPermittedListing(url: string, task: ListingTask): void {
  const parsed = new URL(url);
  const expected = new URL(listingUrl(task));
  if (
    parsed.origin !== ENTITY_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.pathname !== expected.pathname && parsed.pathname !== `${expected.pathname}/`)
  )
    throw new Error("Listing edition or path mismatch");
  if (task.kind === "item-list" && parsed.search)
    throw new Error("Listing query changed outside the permitted filter");
  if (task.kind === "spell-list" && parsed.search && parsed.search !== "?filter=20%3B1%3B0")
    throw new Error("Listing filter changed outside the permitted value");
}

function listingRedirectAllowed(next: URL, task: ListingTask): boolean {
  const expected = new URL(listingUrl(task));
  return (
    next.origin === ENTITY_ORIGIN &&
    !next.username &&
    !next.password &&
    !next.hash &&
    (next.pathname === expected.pathname || next.pathname === `${expected.pathname}/`) &&
    (!next.search || (task.kind === "spell-list" && next.search === "?filter=20%3B1%3B0"))
  );
}

function createDelayPolicy(options: CrawlOptions): DelayPolicy {
  if (options.delayMs !== undefined) return fixedDelayPolicy(validateRequestDelay(options.delayMs));
  const min = validateRequestDelay(
    options.delayMinMs ?? environmentInteger(DELAY_MIN_ENV) ?? DEFAULT_DELAY_MIN_MS,
  );
  const max = validateRequestDelay(
    options.delayMaxMs ?? environmentInteger(DELAY_MAX_ENV) ?? DEFAULT_DELAY_MAX_MS,
  );
  if (min > max) throw new Error("Crawl delay range must have min <= max");
  return rangeDelayPolicy(min, max, options.random ?? Math.random);
}

function fixedDelayPolicy(milliseconds: number): DelayPolicy {
  return {
    minMs: milliseconds,
    maxMs: milliseconds,
    next: (): number => milliseconds,
    withFloor: (floorMs: number): DelayPolicy =>
      fixedDelayPolicy(validateRequestDelay(Math.max(milliseconds, Math.ceil(floorMs)))),
  };
}

function rangeDelayPolicy(minMs: number, maxMs: number, random: () => number): DelayPolicy {
  return {
    minMs,
    maxMs,
    next: (): number => {
      const sample = random();
      const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999999999) : 0.5;
      return minMs + Math.floor(bounded * (maxMs - minMs + 1));
    },
    withFloor: (floorMs: number): DelayPolicy => {
      const floor = Math.ceil(floorMs);
      return rangeDelayPolicy(
        validateRequestDelay(Math.max(minMs, floor)),
        validateRequestDelay(Math.max(maxMs, floor)),
        random,
      );
    },
  };
}

function environmentInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function browsertrixScreencastPort(options: CrawlOptions): number | undefined {
  const configured =
    options.browsertrixScreencastPort ?? environmentInteger(BROWSERTRIX_SCREENCAST_PORT_ENV);
  if (configured === undefined) return undefined;
  if (!Number.isSafeInteger(configured) || configured < 1024 || configured > 65535)
    throw new Error("Browsertrix screencast port must be an integer from 1024 to 65535");
  return configured;
}

function createRequester(options: CrawlOptions, gate: RequestGate): Requester {
  const fetcher = options.fetcher ?? fetch;
  const requestSignal = (): AbortSignal =>
    options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
  return async (url: string, init: Omit<RequestInit, "signal">, delayMs: number) => {
    await gate.beforeRequest(delayMs);
    const response = await fetcher(url, { ...init, signal: requestSignal() });
    if (response.status === 429 || response.status === 503) {
      const retryAt = await gate.cooldown(response.headers.get("retry-after"), delayMs);
      await response.body?.cancel();
      throw new SourceCooldownError(
        `Source rate limited: HTTP ${response.status}; cooldown saved; stopped`,
        retryAt,
        response.status,
      );
    }
    if (response.status === 403 && options.waitOnSourceCooldown) {
      const retryAt = await gate.cooldown(
        response.headers.get("retry-after"),
        delayMs,
        DEFAULT_ACCESS_DENIED_COOLDOWN_MS,
      );
      await response.body?.cancel();
      throw new SourceCooldownError(
        `Source access denied: HTTP 403; cooldown saved`,
        retryAt,
        response.status,
      );
    }
    return response;
  };
}

async function crawlWithFetcher(
  queue: readonly ReferenceTask[],
  options: CrawlOptions,
  context: CrawlContext,
  request: Requester,
  limit: number,
): Promise<CrawlResult> {
  const { delay, policy, root } = context;
  let crawled = 0,
    cached = 0,
    incomplete = 0,
    notFound = 0;

  async function source(
    url: string,
    task: ReferenceTask,
  ): Promise<{ text: string; url: string; capturedAt: string }> {
    let current = url;
    const xmlMode = url.endsWith("&xml");
    for (let attempt = 0; attempt < SOURCE_REDIRECT_LIMIT; attempt++) {
      options.signal?.throwIfAborted();
      assertPermittedSource(current, task, xmlMode);
      if (policy.isAllowed(current, CRAWLER_AGENT) !== true)
        throw new Error("Source disallowed by robots policy");
      const response = await request(
        current,
        {
          redirect: "manual",
          headers: { "user-agent": CRAWLER_AGENT, accept: "text/html,application/xml" },
        },
        delay.next(),
      );
      if (REDIRECT_STATUSES.has(response.status)) {
        const target = response.headers.get("location");
        await response.body?.cancel();
        if (!target) throw new Error("Source redirect has no target");
        const redirected = new URL(target, current);
        if (response.status === 301 && isNotFoundRedirect(target, current, task))
          throw new SourceNotFound("Source explicitly redirected this entity to not-found", 301);
        current = redirected.href;
        continue;
      }
      if (response.status === 404) {
        await response.body?.cancel();
        throw new SourceNotFound("Entity document not found");
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Source HTTP ${response.status}; stopped`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!CONTENT_TYPE_PATTERN.test(contentType)) {
        await response.body?.cancel();
        throw new Error("Unexpected source content type");
      }
      const text = await limitedText(response, SOURCE_PAGE_BYTES);
      if (CHALLENGE_PATTERN.test(text)) throw new SourceChallengeError(current);
      return { text, url: current, capturedAt: new Date().toISOString() };
    }
    throw new Error("Too many source redirects or retries");
  }

  for (const task of queue) {
    options.signal?.throwIfAborted();
    const key = referenceKey(task);
    await options.onTaskStart?.(key);
    const previous = await readStagedReference(root, task);
    const previousXp =
      options.questXp && task.kind === "quest" ? await readStagedQuestXp(root, task) : null;
    if (
      previous &&
      referenceIsFresh(previous) &&
      !options.refresh &&
      (!options.questXp ||
        task.kind !== "quest" ||
        (previousXp?.sourceSha256 === previous.sourceSha256 &&
          previousXp.capturedAt === previous.capturedAt &&
          (previousXp.status !== "unknown" ||
            previousXp.parserVersion === QUEST_XP_PARSER_VERSION)))
    ) {
      cached++;
      await options.onTaskComplete?.({
        key,
        outcome: "cached",
        gaps: referenceQualityGaps(previous),
      });
      continue;
    }
    const missingPath = resolve(root, `${key}.missing.json`);
    if (!options.refresh && (await recentlyMissing(missingPath, task))) {
      cached++;
      await options.onTaskComplete?.({ key, outcome: "cached", gaps: ["source_not_found"] });
      continue;
    }
    if (crawled + notFound >= limit) break;
    try {
      const page = await source(previous?.sourceUrl ?? referenceUrl(task), task);
      const xml =
        task.kind === "item" && !options.skipItemXml
          ? await source(`${referenceUrl(task)}&xml`, task)
          : null;
      const record = parseWowheadPage(page.text, task, {
        url: page.url,
        capturedAt: page.capturedAt,
        permissionRef: options.permissionRef,
        ...(xml ? { itemXml: xml.text } : {}),
      });
      const questXp =
        options.questXp && task.kind === "quest" ? parseQuestXpPage(page.text, record) : null;
      const gaps = [...referenceQualityGaps(record), ...(questXp?.issues ?? [])];
      if (Buffer.byteLength(JSON.stringify(record)) + 1 > 300000)
        throw new Error("Extracted reference exceeds staging budget");
      await atomicJsonWrite(resolve(root, `${referenceKey(task)}.json`), record);
      if (questXp) await atomicJsonWrite(resolve(root, `${referenceKey(task)}.xp.json`), questXp);
      crawled++;
      if (gaps.length) incomplete++;
      await options.onProgress?.(key, gaps);
      await options.onTaskComplete?.({ key, outcome: "crawled", gaps });
    } catch (error) {
      if (!(error instanceof SourceNotFound)) throw error;
      await atomicJsonWrite(missingPath, {
        ...task,
        status: error.status,
        checkedAt: new Date().toISOString(),
      });
      notFound++;
      await options.onProgress?.(key, ["source_not_found"]);
      await options.onTaskComplete?.({ key, outcome: "not_found", gaps: ["source_not_found"] });
    }
  }
  return { crawled, cached, incomplete, notFound };
}

async function crawlWithBrowsertrix(
  queue: readonly ReferenceTask[],
  options: CrawlOptions,
  context: CrawlContext,
  limit: number,
): Promise<CrawlResult> {
  const { root, gate, delay, policy, screencastPort } = context;
  const actions: TaskAction[] = [];
  let pendingCount = 0;

  for (const task of queue) {
    options.signal?.throwIfAborted();
    const key = referenceKey(task);
    const previous = await readStagedReference(root, task);
    const previousXp =
      options.questXp && task.kind === "quest" ? await readStagedQuestXp(root, task) : null;
    if (
      previous &&
      referenceIsFresh(previous) &&
      !options.refresh &&
      (!options.questXp ||
        task.kind !== "quest" ||
        (previousXp?.sourceSha256 === previous.sourceSha256 &&
          previousXp.capturedAt === previous.capturedAt &&
          (previousXp.status !== "unknown" ||
            previousXp.parserVersion === QUEST_XP_PARSER_VERSION)))
    ) {
      actions.push({ kind: "cached", key, gaps: referenceQualityGaps(previous) });
      continue;
    }
    const missingPath = resolve(root, `${key}.missing.json`);
    if (!options.refresh && (await recentlyMissing(missingPath, task))) {
      actions.push({ kind: "cached", key, gaps: ["source_not_found"] });
      continue;
    }
    if (pendingCount >= limit) break;
    actions.push({
      kind: "pending",
      pending: {
        task,
        key,
        previous,
        missingPath,
        htmlUrl: previous?.sourceUrl ?? referenceUrl(task),
        xmlUrl: task.kind === "item" && !options.skipItemXml ? `${referenceUrl(task)}&xml` : null,
      },
    });
    pendingCount++;
  }

  // Keep each Docker run small enough that a crash loses only a bounded amount
  // of work. The job runner may pass a much larger batch (100 by default).
  const taskBatch = Math.min(limit, browsertrixTaskBatchSize());
  const groups: TaskAction[][] = [];
  let group: TaskAction[] = [];
  let groupPending = 0;
  for (const action of actions) {
    if (action.kind === "pending" && groupPending >= taskBatch) {
      groups.push(group);
      group = [];
      groupPending = 0;
    }
    group.push(action);
    if (action.kind === "pending") groupPending++;
  }
  if (group.length) groups.push(group);

  let crawled = 0,
    cached = 0,
    incomplete = 0,
    notFound = 0;
  for (const batch of groups) {
    options.signal?.throwIfAborted();
    const pending = batch
      .filter(
        (action): action is Extract<TaskAction, { kind: "pending" }> => action.kind === "pending",
      )
      .map((action) => action.pending);
    for (const entry of pending) {
      assertPermittedSource(entry.htmlUrl, entry.task, false);
      if (policy.isAllowed(entry.htmlUrl, CRAWLER_AGENT) !== true)
        throw new Error("Source disallowed by robots policy");
      if (entry.xmlUrl) {
        assertPermittedSource(entry.xmlUrl, entry.task, true);
        if (policy.isAllowed(entry.xmlUrl, CRAWLER_AGENT) !== true)
          throw new Error("Source disallowed by robots policy");
      }
    }

    let archive = emptyArchive();
    let failure: BrowsertrixRun | null = null;
    if (pending.length) {
      const seeds = [
        ...new Set(
          pending.flatMap((entry) =>
            entry.xmlUrl ? [entry.htmlUrl, entry.xmlUrl] : [entry.htmlUrl],
          ),
        ),
      ];
      for (const seed of seeds) {
        await gate.beforeRequest(delay.next());
        const result = await executeBrowsertrix(
          [seed],
          entityTargetMatcher(pending),
          options,
          screencastPort,
        );
        archive = mergeArchives(archive, result.archive);
        if (result.run.exitCode !== 0) {
          failure = result.run;
          break;
        }
      }
    }

    for (const action of batch) {
      options.signal?.throwIfAborted();
      if (action.kind === "cached") {
        await options.onTaskStart?.(action.key);
        cached++;
        await options.onTaskComplete?.({ key: action.key, outcome: "cached", gaps: action.gaps });
        continue;
      }
      const entry = action.pending;
      await options.onTaskStart?.(entry.key);
      try {
        const page = await captureSource(
          archive,
          entry.htmlUrl,
          entry.task,
          policy,
          options.signal,
        );
        const xml = entry.xmlUrl
          ? await captureSource(archive, entry.xmlUrl, entry.task, policy, options.signal)
          : null;
        const record = parseWowheadPage(page.text, entry.task, {
          url: page.url,
          capturedAt: page.capturedAt,
          permissionRef: options.permissionRef,
          ...(xml ? { itemXml: xml.text } : {}),
        });
        const questXp =
          options.questXp && entry.task.kind === "quest"
            ? parseQuestXpPage(page.text, record)
            : null;
        const gaps = [...referenceQualityGaps(record), ...(questXp?.issues ?? [])];
        if (Buffer.byteLength(JSON.stringify(record)) + 1 > 300000)
          throw new Error("Extracted reference exceeds staging budget");
        await atomicJsonWrite(resolve(root, `${entry.key}.json`), record);
        if (questXp) await atomicJsonWrite(resolve(root, `${entry.key}.xp.json`), questXp);
        crawled++;
        if (gaps.length) incomplete++;
        await options.onProgress?.(entry.key, gaps);
        await options.onTaskComplete?.({ key: entry.key, outcome: "crawled", gaps });
      } catch (error) {
        if (error instanceof SourceNotFound) {
          await atomicJsonWrite(entry.missingPath, {
            ...entry.task,
            status: error.status,
            checkedAt: new Date().toISOString(),
          });
          notFound++;
          await options.onProgress?.(entry.key, ["source_not_found"]);
          await options.onTaskComplete?.({
            key: entry.key,
            outcome: "not_found",
            gaps: ["source_not_found"],
          });
          continue;
        }
        if (error instanceof SourceChallengeError) {
          const capture = archive.captures.get(urlKey(error.url));
          if (capture) {
            const screenshot = archive.screenshots.get(urlKey(error.url)) ?? null;
            const written = await writeChallengeEvidence({
              stagingDirectory: root,
              key: entry.key,
              url: capture.url,
              capturedAt: capture.capturedAt,
              status: capture.status,
              contentType: capture.contentType,
              responseBody: capture.text,
              screenshot,
            });
            process.stderr.write(`Challenge evidence report: ${written.reportPath}\n`);
          }
        }
        if (failure) await throwBrowsertrixFailure(failure, archive, options, gate, delay);
        throw error;
      }
    }

    if (failure) await throwBrowsertrixFailure(failure, archive, options, gate, delay);
  }
  return { crawled, cached, incomplete, notFound };
}

async function captureSource(
  archive: CrawlArchive,
  url: string,
  task: ReferenceTask,
  policy: RobotsPolicy,
  signal?: AbortSignal,
): Promise<{ text: string; url: string; capturedAt: string }> {
  let current = url;
  const xmlMode = url.endsWith("&xml");
  for (let attempt = 0; attempt < SOURCE_REDIRECT_LIMIT; attempt++) {
    signal?.throwIfAborted();
    assertPermittedSource(current, task, xmlMode);
    if (policy.isAllowed(current, CRAWLER_AGENT) !== true)
      throw new Error("Source disallowed by robots policy");
    const capture = archive.captures.get(urlKey(current));
    if (!capture) {
      const page = pageFor(archive, current);
      if (page?.status === 404) throw new SourceNotFound("Entity document not found");
      const skipped = archive.skipped.get(urlKey(current));
      if (skipped === "robotsTxt") throw new Error("Source disallowed by robots policy");
      if (skipped === "redirectToExcluded")
        throw new Error("Source redirected outside the permitted entity");
      throw new Error(`Browsertrix archived no response for ${current}`);
    }
    if (capture.status === 301 && isNotFoundRedirect(capture.location, current, task))
      throw new SourceNotFound("Source explicitly redirected this entity to not-found", 301);
    if (capture.status === 404) throw new SourceNotFound("Entity document not found");
    if (REDIRECT_STATUSES.has(capture.status)) {
      if (!capture.location) throw new Error("Source redirect has no target");
      current = new URL(capture.location, current).href;
      continue;
    }
    if (capture.status < 200 || capture.status > 299)
      throw new Error(`Source HTTP ${capture.status}; stopped without bypassing access controls`);
    if (!CONTENT_TYPE_PATTERN.test(capture.contentType))
      throw new Error("Unexpected source content type");
    if (capture.tooLarge) throw new Error("Source exceeds response budget");
    if (CHALLENGE_PATTERN.test(capture.text)) throw new SourceChallengeError(current);
    return { text: capture.text, url: current, capturedAt: capture.capturedAt };
  }
  throw new Error("Too many source redirects or retries");
}

function assertPermittedSource(url: string, task: ReferenceTask, xmlMode: boolean): void {
  const parsed = new URL(url);
  const expected = `/${task.game}/${task.kind}=${task.id}`;
  if (
    parsed.origin !== ENTITY_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !(
      parsed.pathname === expected ||
      parsed.pathname.startsWith(`${expected}/`) ||
      (xmlMode && parsed.pathname === `${expected}&xml`)
    )
  )
    throw new Error("Source redirected outside the permitted entity");
}

function isNotFoundRedirect(location: string | null, base: string, task: ReferenceTask): boolean {
  if (!location) return false;
  let redirected: URL;
  try {
    redirected = new URL(location, base);
  } catch {
    return false;
  }
  return (
    redirected.origin === ENTITY_ORIGIN &&
    !redirected.username &&
    !redirected.password &&
    !redirected.hash &&
    redirected.pathname === `/${task.game}/${task.kind}s` &&
    redirected.search === `?notFound=${task.id}`
  );
}

async function prepareBrowsertrixLaunch(options: CrawlOptions): Promise<BrowsertrixLaunch> {
  const profileValue = options.browsertrixProfile ?? process.env.BROWSERTRIX_PROFILE;
  const save = options.browsertrixSaveProfile ?? process.env.BROWSERTRIX_SAVE_PROFILE === "1";
  let profile: BrowsertrixProfile | null = null;
  if (profileValue) {
    if (/^https?:\/\//i.test(profileValue)) {
      if (save) throw new Error("Cannot save a Browsertrix profile back to an HTTP(S) URL");
      profile = { containerPath: profileValue, hostDirectory: null, save: false };
    } else {
      const hostPath = resolve(process.env.INIT_CWD ?? process.cwd(), profileValue);
      let info: Awaited<ReturnType<typeof stat>>;
      try {
        info = await stat(hostPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new Error(`Browsertrix profile not found: ${hostPath}`);
        throw error;
      }
      if (!info.isFile()) throw new Error("Browsertrix profile must be a tar.gz file");
      profile = {
        containerPath: `/profiles/${basename(hostPath)}`,
        hostDirectory: dirname(hostPath),
        save,
      };
    }
  } else if (save) {
    throw new Error(
      "Browsertrix profile saving requires browsertrixProfile or BROWSERTRIX_PROFILE",
    );
  }
  const proxy = options.browsertrixProxy ?? process.env.BROWSERTRIX_PROXY ?? null;
  const network = options.browsertrixNetwork ?? process.env.BROWSERTRIX_NETWORK ?? null;
  return {
    profile,
    proxy: proxy?.trim() ? proxy : null,
    addHosts: options.browsertrixAddHosts ?? environmentList("BROWSERTRIX_ADD_HOSTS"),
    network: network?.trim() ? network : null,
    extraChromeArgs: options.browsertrixExtraChromeArgs ?? [],
    userAgentSuffix:
      options.browsertrixUserAgentSuffix ??
      process.env.BROWSERTRIX_USER_AGENT_SUFFIX ??
      CRAWLER_AGENT,
  };
}

function environmentList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function executeBrowsertrix(
  seeds: readonly string[],
  isTarget: (url: string) => boolean,
  options: CrawlOptions,
  screencastPort?: number,
): Promise<{ archive: CrawlArchive; run: BrowsertrixRun }> {
  const keep = options.keepBrowsertrixArchive ?? process.env.BROWSERTRIX_KEEP_ARCHIVE === "1";
  const parent = options.browsertrixWorkDirectory ?? process.env.BROWSERTRIX_WORK_DIR;
  let work: string;
  if (parent) {
    const parentDirectory = resolve(parent);
    await mkdir(parentDirectory, { recursive: true });
    work = await mkdtemp(resolve(parentDirectory, "run-"));
  } else {
    work = await mkdtemp(resolve(tmpdir(), "wow-trader-browsertrix-"));
  }
  const image =
    options.browsertrixImage ?? process.env.BROWSERTRIX_IMAGE ?? BROWSERTRIX_DEFAULT_IMAGE;
  const docker = process.env.BROWSERTRIX_DOCKER ?? "docker";
  const container = `wow-trader-crawl-${randomUUID()}`;
  let primaryError: unknown;
  if (keep) process.stderr.write(`Browsertrix archive directory: ${work}\n`);
  if (screencastPort !== undefined)
    process.stderr.write(
      `Browsertrix screencast: http://127.0.0.1:${screencastPort} (active during this page)\n`,
    );
  try {
    const launch = await prepareBrowsertrixLaunch(options);
    const run = await spawnDocker(
      docker,
      browsertrixArgs(container, image, seeds, launch, screencastPort),
      options.signal,
    );
    options.signal?.throwIfAborted();
    await copyBrowsertrixResults(docker, container, work, keep, run.exitCode !== 0, options.signal);
    const archive = await readBrowsertrixArchive(work, isTarget, run.exitCode !== 0);
    return { archive, run };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await executeDockerCommand(docker, ["rm", "--force", container], {
        timeout: BROWSERTRIX_DOCKER_STOP_GRACE_MS,
        maxBuffer: 200_000,
      }).catch((error: unknown): void => {
        if (error instanceof Error && /No such container/i.test(error.message)) return;
        if (!primaryError) throw error;
        process.stderr.write(`Browsertrix container cleanup failed: ${String(error)}\n`);
      });
    } finally {
      if (!keep) await rm(work, { recursive: true, force: true });
    }
  }
}

async function copyBrowsertrixResults(
  docker: string,
  container: string,
  work: string,
  keep: boolean,
  runFailed: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const copy = async (source: string, destination: string): Promise<boolean> => {
    try {
      await executeDockerCommand(docker, ["cp", `${container}:${source}`, destination], {
        timeout: 120_000,
        maxBuffer: 200_000,
        signal,
      });
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        /Could not find the file|no such file or directory/i.test(error.message)
      )
        return false;
      throw error;
    }
  };
  if (keep) {
    if (!(await copy("/crawls/.", work))) throw new Error("Browsertrix workspace is missing");
    return;
  }
  const destination = resolve(work, "collections", BROWSERTRIX_COLLECTION);
  await mkdir(destination, { recursive: true });
  // Copy only parser inputs. The browser profile and downloads stay inside Docker,
  // avoiding deleted host files retained by Docker Desktop's file-sharing service.
  for (const name of ["archive", "pages", "reports", ...(runFailed ? ["logs"] : [])]) {
    if (!(await copy(`/crawls/collections/${BROWSERTRIX_COLLECTION}/${name}`, destination)))
      await copy(`/crawls/${BROWSERTRIX_COLLECTION}/${name}`, destination);
  }
}

// A smaller per-container batch bounds the work lost if the host or browser
// crashes mid-run. Operators can override it with BROWSERTRIX_BATCH_TASKS.
function browsertrixTaskBatchSize(): number {
  const raw = process.env.BROWSERTRIX_BATCH_TASKS;
  if (!raw) return BROWSERTRIX_TASK_BATCH;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? value : BROWSERTRIX_TASK_BATCH;
}

function browsertrixArgs(
  container: string,
  image: string,
  seeds: readonly string[],
  launch: BrowsertrixLaunch,
  screencastPort?: number,
): string[] {
  // The durable host-side gate spaces source navigations. Browsertrix receives
  // one seed per container, so an additional page delay would double-throttle.
  const timeLimit = Math.max(
    300,
    Math.ceil(seeds.length * (BROWSERTRIX_PAGE_LOAD_TIMEOUT_SECONDS + 20) + 120),
  );
  const args = [
    "run",
    "--name",
    container,
    "--label",
    "online.kfcguild.storage=browsertrix-workspace",
    "--label",
    `online.kfcguild.owner-pid=${process.pid}`,
    "--init",
    "--shm-size=1g",
    "--log-opt",
    "max-size=10m",
    "--log-opt",
    "max-file=2",
  ];
  if (launch.network) args.push("--network", launch.network);
  for (const host of launch.addHosts) args.push("--add-host", host);
  if (launch.profile?.hostDirectory)
    args.push(
      "--mount",
      `type=bind,source=${launch.profile.hostDirectory},target=/profiles${
        launch.profile.save ? "" : ",readonly"
      }`,
    );
  if (screencastPort !== undefined)
    args.push("--publish", `127.0.0.1:${screencastPort}:${screencastPort}`);
  args.push(
    image,
    "crawl",
    "--collection",
    BROWSERTRIX_COLLECTION,
    "--overwrite",
    "--scopeType",
    "page",
    "--exclude",
    "^(?:https?://[^/]*@|http://|https://(?!www\\.wowhead\\.com(?:/|$)))",
    "--depth",
    "0",
    "--pageLimit",
    String(seeds.length),
    "--maxPageLimit",
    String(seeds.length),
    "--workers",
    "1",
    "--delay",
    "0",
    "--waitUntil",
    "domcontentloaded",
    "--pageLoadTimeout",
    String(BROWSERTRIX_PAGE_LOAD_TIMEOUT_SECONDS),
    "--netIdleWait",
    "0",
    "--screenshot",
    "view",
  );
  if (screencastPort !== undefined) args.push("--screencastPort", String(screencastPort));
  if (launch.profile) {
    args.push("--profile", launch.profile.containerPath);
    if (launch.profile.save) args.push("--saveProfile");
  }
  if (launch.proxy) args.push("--proxyServer", launch.proxy);
  for (const extra of launch.extraChromeArgs) args.push("--extraChromeArgs", extra);
  if (launch.userAgentSuffix) args.push("--userAgentSuffix", launch.userAgentSuffix);
  args.push(
    "--blockAds",
    "--rateLimitMaxRetries",
    "0",
    "--rateLimitInterruptCount",
    "1",
    "--rateLimitOnMatch",
    'src="/_Incapsula_Resource?:200',
    "--rateLimitOnMatch",
    "cf-chl-",
    "--rateLimitOnMatch",
    "<title>\\s*(?:Just a moment|Access denied|Verify you are human)",
    "--saveState",
    "never",
    "--timeLimit",
    String(timeLimit),
    "--behaviors",
    "",
  );
  for (const seed of seeds) args.push("--url", seed);
  return args;
}

function spawnDocker(
  docker: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<BrowsertrixRun> {
  signal?.throwIfAborted();
  return new Promise<BrowsertrixRun>((resolvePromise, reject) => {
    const child = spawn(docker, [...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
      if (killTimer) clearTimeout(killTimer);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, BROWSERTRIX_DOCKER_STOP_GRACE_MS);
      killTimer.unref();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length >= 200_000) return;
      stderr += chunk.slice(0, 200_000 - stderr.length);
    });
    child.once("error", (error) => {
      finish(() => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT")
          reject(
            new Error(
              "Browsertrix requires Docker; install Docker or set BROWSERTRIX_DOCKER to the docker executable",
            ),
          );
        else reject(error);
      });
    });
    child.once("close", (exitCode, exitSignal) => {
      finish(() => resolvePromise({ exitCode, signal: exitSignal, stderr }));
    });
  });
}

async function browsertrixCollection(workDirectory: string): Promise<string> {
  const current = resolve(workDirectory, "collections", BROWSERTRIX_COLLECTION);
  try {
    await stat(current);
    return current;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Older images and the published docs use a flat collection directory.
    return resolve(workDirectory, BROWSERTRIX_COLLECTION);
  }
}

async function readBrowsertrixArchive(
  workDirectory: string,
  isTarget: (url: string) => boolean,
  runFailed: boolean,
): Promise<CrawlArchive> {
  const collection = await browsertrixCollection(workDirectory);
  const pageRows = await readJsonLineObjects(resolve(collection, "pages", "pages.jsonl"));
  const skippedRows = await readJsonLineObjects(
    resolve(collection, "reports", "skippedPages.jsonl"),
  );
  const pages = new Map<string, PageEntry>();
  for (const row of pageRows) {
    if (typeof row.url !== "string") continue;
    pages.set(urlKey(row.url), {
      url: row.url,
      status: typeof row.status === "number" ? row.status : null,
    });
  }
  const skipped = new Map<string, string>();
  for (const row of skippedRows) {
    if (typeof row.url === "string" && typeof row.reason === "string")
      skipped.set(urlKey(row.url), row.reason);
  }
  // Logs are only needed to classify a failed run (rate limit vs. access
  // denial); skip the I/O entirely for successful batches.
  let logs = runFailed ? await readBrowsertrixLogs(resolve(collection, "logs")) : "";
  let warc: {
    readonly captures: ReadonlyMap<string, Capture>;
    readonly screenshots: ReadonlyMap<string, ScreenshotCapture>;
  };
  try {
    warc = await readWarcArchive(resolve(collection, "archive"), isTarget);
  } catch (error) {
    if (!runFailed) throw error;
    logs += `\nWARC parse error: ${error instanceof Error ? error.message : String(error)}`;
    warc = { captures: new Map(), screenshots: new Map() };
  }
  return { ...warc, pages, skipped, logs };
}

async function readWarcArchive(
  archiveDirectory: string,
  isTarget: (url: string) => boolean,
): Promise<{
  readonly captures: ReadonlyMap<string, Capture>;
  readonly screenshots: ReadonlyMap<string, ScreenshotCapture>;
}> {
  let names: string[];
  try {
    names = await readdir(archiveDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { captures: new Map(), screenshots: new Map() };
    throw error;
  }
  const captures = new Map<string, Capture>();
  const screenshots = new Map<string, ScreenshotCapture>();
  const files = names.filter((name) => name.endsWith(".warc.gz") || name.endsWith(".warc")).sort();
  for (const name of files) {
    const stream = createReadStream(resolve(archiveDirectory, name));
    try {
      const parser = new WARCParser(stream);
      for await (const record of parser) {
        const target = record.warcTargetURI;
        if (!target) continue;
        if (record.warcType === "resource" && target.startsWith("urn:view:")) {
          const sourceUrl = target.slice("urn:view:".length);
          if (!isTarget(sourceUrl)) continue;
          const contentType = record.warcContentType;
          if (contentType !== "image/png" && contentType !== "image/jpeg") continue;
          screenshots.set(urlKey(sourceUrl), {
            capturedAt: record.warcDate ?? new Date().toISOString(),
            contentType,
            bytes: await readRecordBytes(record, BROWSERTRIX_SCREENSHOT_BYTES),
          });
          continue;
        }
        if (record.warcType !== "response" || !isTarget(target)) continue;
        const status = Number(record.httpHeaders?.statusCode);
        if (!Number.isInteger(status) || status < 100 || status > 599) continue;
        const headers = record.httpHeaders?.headers;
        const contentType = headers?.get("content-type") ?? "";
        const location = headers?.get("location")?.trim() || null;
        let text = "";
        let tooLarge = false;
        if (status >= 200 && status < 300 && CONTENT_TYPE_PATTERN.test(contentType)) {
          const declared = Number(headers?.get("content-length") ?? 0);
          if (Number.isFinite(declared) && declared > SOURCE_PAGE_BYTES) tooLarge = true;
          else text = await readRecordText(record, SOURCE_PAGE_BYTES);
        }
        captures.set(urlKey(target), {
          url: target,
          capturedAt: record.warcDate ?? new Date().toISOString(),
          status,
          location,
          contentType,
          text,
          tooLarge,
        });
      }
    } finally {
      stream.destroy();
    }
  }
  return { captures, screenshots };
}

async function readRecordText(record: WARCRecord, maximum: number): Promise<string> {
  return (await readRecordBytes(record, maximum)).toString("utf8");
}

async function readRecordBytes(record: WARCRecord, maximum: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of record) {
    size += chunk.byteLength;
    if (size > maximum) throw new Error("Source exceeds response budget");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonLineObjects(
  path: string,
  maximum = BROWSERTRIX_REPORT_BYTES,
): Promise<Record<string, unknown>[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (Buffer.byteLength(text) > maximum) throw new Error("Browsertrix report exceeds size budget");
  const rows: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value))
        rows.push(value as Record<string, unknown>);
    } catch {
      // A partially written final line is not a reason to discard the report.
    }
  }
  return rows;
}

async function readBrowsertrixLogs(directory: string): Promise<string> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
  const pieces: string[] = [];
  let total = 0;
  const crawlLogs = names
    .filter(
      (entry) => (entry.endsWith(".jsonl") || entry.endsWith(".log")) && entry !== "redis.log",
    )
    .sort();
  for (const name of crawlLogs) {
    if (total >= BROWSERTRIX_LOG_BYTES) break;
    const text = await readFile(resolve(directory, name), "utf8");
    const remaining = BROWSERTRIX_LOG_BYTES - total;
    pieces.push(text.slice(0, remaining));
    total += Math.min(text.length, remaining);
  }
  return pieces.join("\n");
}

function entityTargetMatcher(pending: readonly PendingTask[]): (url: string) => boolean {
  const prefixes = [
    ...new Set(pending.map((entry) => `/${entry.task.game}/${entry.task.kind}=${entry.task.id}`)),
  ];
  return (raw: string): boolean => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (url.origin !== ENTITY_ORIGIN || url.username || url.password) return false;
    return prefixes.some(
      (prefix) =>
        url.pathname === prefix ||
        url.pathname.startsWith(`${prefix}/`) ||
        url.pathname === `${prefix}&xml`,
    );
  };
}

function pageFor(archive: CrawlArchive, url: string): PageEntry | null {
  const direct = archive.pages.get(urlKey(url));
  if (direct) return direct;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const page of archive.pages.values()) {
    try {
      if (new URL(page.url).pathname === path) return page;
    } catch {
      // Ignore malformed report rows.
    }
  }
  return null;
}

function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.href;
  } catch {
    return raw;
  }
}

function emptyArchive(): CrawlArchive {
  return {
    captures: new Map(),
    screenshots: new Map(),
    pages: new Map(),
    skipped: new Map(),
    logs: "",
  };
}

function mergeArchives(left: CrawlArchive, right: CrawlArchive): CrawlArchive {
  return {
    captures: new Map([...left.captures, ...right.captures]),
    screenshots: new Map([...left.screenshots, ...right.screenshots]),
    pages: new Map([...left.pages, ...right.pages]),
    skipped: new Map([...left.skipped, ...right.skipped]),
    logs: [left.logs, right.logs].filter(Boolean).join("\n"),
  };
}

function rateLimitEvidence(text: string): { status: number | null; retryAfter: string | null } {
  const statuses = new Set<number>();
  for (const match of text.matchAll(
    /"(?:status|statusCode|rateLimitStatus)"\s*:\s*(403|429|503)\b/g,
  )) {
    if (match[1]) statuses.add(Number(match[1]));
  }
  const retryAfter =
    /"(?:retryAfter|rateLimitedRetryAfter)"\s*:\s*"?([0-9]+|[^",}\s]+)"?/.exec(text)?.[1] ?? null;
  const status = statuses.has(403) ? 403 : statuses.has(429) ? 429 : statuses.has(503) ? 503 : null;
  return { status, retryAfter };
}

async function throwBrowsertrixFailure(
  run: BrowsertrixRun,
  archive: CrawlArchive,
  options: CrawlOptions,
  gate: RequestGate,
  delay: DelayPolicy,
): Promise<never> {
  if (run.exitCode === 18) {
    const { status, retryAfter } = rateLimitEvidence(`${archive.logs}\n${run.stderr}`);
    if (status === 403 && !options.waitOnSourceCooldown)
      throw new Error("Source access denied: HTTP 403; stopped without bypassing access controls");
    if (status === 403) {
      const retryAt = await gate.cooldown(
        retryAfter,
        delay.next(),
        DEFAULT_ACCESS_DENIED_COOLDOWN_MS,
      );
      throw new SourceCooldownError(
        "Source access denied: HTTP 403; cooldown saved without bypassing access controls",
        retryAt,
        status,
      );
    }
    const retryAt = await gate.cooldown(retryAfter, delay.next());
    throw new SourceCooldownError(
      `Source rate limited${status ? `: HTTP ${status}` : ""}; cooldown saved; stopped`,
      retryAt,
      status,
    );
  }
  throw new Error(browsertrixFailureMessage(run));
}

function browsertrixFailureMessage(run: BrowsertrixRun): string {
  const detail = run.stderr.trim().slice(-2000);
  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(detail))
    return "Browsertrix requires a running Docker daemon; start Docker and retry";
  const messages: Record<number, string> = {
    1: "Browsertrix crawl failed",
    3: "Browsertrix crawl stopped: disk is full",
    4: "Browsertrix rejected the crawl configuration",
    8: "Browsertrix could not connect to its internal Redis instance",
    9: "Browsertrix crawl failed unexpectedly",
    10: "Browsertrix browser crashed",
    11: "Browsertrix crawl was interrupted",
    12: "Browsertrix failed-page limit reached",
    13: "Browsertrix crawl was force-interrupted",
    14: "Browsertrix size limit reached",
    15: "Browsertrix time limit reached",
    16: "Browsertrix disk-utilization limit reached",
    17: "Browsertrix stopped with a fatal error",
    21: "Browsertrix proxy error",
    22: "Browsertrix failed to write archive output",
  };
  const base =
    (run.exitCode !== null ? messages[run.exitCode] : undefined) ??
    (run.exitCode === null
      ? `Browsertrix crawl terminated by signal ${run.signal ?? "unknown"}`
      : `Browsertrix crawl failed (exit ${run.exitCode})`);
  return detail ? `${base}: ${detail}` : base;
}

async function recentlyMissing(path: string, task: ReferenceTask): Promise<boolean> {
  try {
    const previous = missingPageSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (referenceKey(previous) !== referenceKey(task))
      throw new Error("Missing-page identity mismatch");
    const age = Date.now() - Date.parse(previous.checkedAt);
    return age >= 0 && age < 7 * 86400000;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function limitedText(response: Response, maximum: number): Promise<string> {
  if (!response.body) throw new Error("Source body missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("Source exceeds response budget");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
