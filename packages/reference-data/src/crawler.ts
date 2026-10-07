import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import {
  referenceIsFresh,
  referenceKey,
  referenceQualityGaps,
  referenceTaskSchema,
  referenceUrl,
  type ReferenceTask,
} from "./contracts.js";
import { parseWowheadPage } from "./parser.js";
import { atomicJsonWrite, readStagedReference } from "./store.js";
import { DEFAULT_REQUEST_DELAY_MS, requestGate, validateRequestDelay } from "./pacing.js";

export const CRAWLER_AGENT = "KFC-Helper-Reference/1.0 (+https://kfcguild.online/about)";

interface RobotsPolicy {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
}

// robots-parser ships CommonJS with an ESM-style declaration; bind its documented callable export.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  text: string,
) => RobotsPolicy;

export interface CrawlOptions {
  readonly directory: string;
  readonly permissionRef: string;
  readonly limit?: number;
  readonly delayMs?: number;
  readonly refresh?: boolean;
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (key: string, gaps: readonly string[]) => void | Promise<void>;
  readonly onTaskStart?: (key: string) => void | Promise<void>;
  readonly onTaskComplete?: (result: CrawlTaskResult) => void | Promise<void>;
}

export interface CrawlTaskResult {
  readonly key: string;
  readonly outcome: "crawled" | "cached" | "not_found";
  readonly gaps: readonly string[];
}

export interface CrawlResult {
  readonly crawled: number;
  readonly cached: number;
  readonly incomplete: number;
  readonly notFound: number;
}

class SourceNotFound extends Error {}

const missingPageSchema = referenceTaskSchema
  .extend({ checkedAt: z.iso.datetime(), status: z.literal(404) })
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
  const requestedDelay = validateRequestDelay(options.delayMs ?? DEFAULT_REQUEST_DELAY_MS);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error("Record limit must be 1-500");
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    (async (milliseconds: number): Promise<void> => {
      await pause(milliseconds, undefined, { signal: options.signal });
    });
  const requestSignal = (): AbortSignal =>
    options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
  const root = resolve(options.directory);
  await mkdir(root, { recursive: true });
  const lockPath = resolve(root, ".crawl.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const gate = await requestGate(root, sleep, options.now ?? Date.now, options.signal);
    async function request(url: string, init: Omit<RequestInit, "signal">, delayMs: number): Promise<Response> {
      await gate.beforeRequest(delayMs);
      const response = await fetcher(url, { ...init, signal: requestSignal() });
      if (response.status === 429 || response.status === 503) {
        await gate.cooldown(response.headers.get("retry-after"), delayMs);
        await response.body?.cancel();
        throw new Error(`Source rate limited: HTTP ${response.status}; cooldown saved; stopped`);
      }
      return response;
    }
    const robotsResponse = await request("https://www.wowhead.com/robots.txt", {
      redirect: "error",
      headers: { "user-agent": CRAWLER_AGENT },
    }, requestedDelay);
    if (!robotsResponse.ok) throw new Error(`Robots fetch failed: HTTP ${robotsResponse.status}`);
    const policy = robotsParser(
      "https://www.wowhead.com/robots.txt",
      await limitedText(robotsResponse, 500000),
    );
    const robotsDelay = policy.getCrawlDelay(CRAWLER_AGENT) ?? 0;
    if (!Number.isFinite(robotsDelay) || robotsDelay < 0 || robotsDelay > 120)
      throw new Error("Unsupported robots crawl-delay; stopped");
    const delay = Math.max(requestedDelay, robotsDelay * 1000);
    let crawled = 0,
      cached = 0,
      incomplete = 0,
      notFound = 0;

    async function source(
      url: string,
      task: ReferenceTask,
    ): Promise<{ text: string; url: string }> {
      let current = url;
      const xmlMode = url.endsWith("&xml");
      for (let attempt = 0; attempt < 5; attempt++) {
        options.signal?.throwIfAborted();
        const parsed = new URL(current);
        const expected = `/${task.game}/${task.kind}=${task.id}`;
        if (
          parsed.origin !== "https://www.wowhead.com" ||
          parsed.search ||
          parsed.hash ||
          !(
            parsed.pathname === expected ||
            parsed.pathname.startsWith(`${expected}/`) ||
            (xmlMode && parsed.pathname === `${expected}&xml`)
          )
        )
          throw new Error("Source redirected outside the permitted entity");
        if (policy.isAllowed(current, CRAWLER_AGENT) !== true)
          throw new Error("Source disallowed by robots policy");
        const response = await request(current, {
          redirect: "manual",
          headers: { "user-agent": CRAWLER_AGENT, accept: "text/html,application/xml" },
        }, delay);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const target = response.headers.get("location");
          await response.body?.cancel();
          if (!target) throw new Error("Source redirect has no target");
          current = new URL(target, current).href;
          continue;
        }
        if (response.status === 404) {
          await response.body?.cancel();
          throw new SourceNotFound("Entity document not found");
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            `Source HTTP ${response.status}; stopped without bypassing access controls`,
          );
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!/(?:text\/html|application\/xml|text\/xml)/i.test(contentType)) {
          await response.body?.cancel();
          throw new Error("Unexpected source content type");
        }
        const text = await limitedText(response, 4000000);
        if (/cf-chl-|<title>\s*(?:Just a moment|Access denied|Verify you are human)/i.test(text))
          throw new Error("Source challenge encountered; stopped");
        return { text, url: current };
      }
      throw new Error("Too many source redirects or retries");
    }

    for (const task of queue) {
      options.signal?.throwIfAborted();
      const key = referenceKey(task);
      await options.onTaskStart?.(key);
      const previous = await readStagedReference(root, task);
      if (previous && referenceIsFresh(previous) && !options.refresh) {
        cached++;
        await options.onTaskComplete?.({
          key,
          outcome: "cached",
          gaps: referenceQualityGaps(previous),
        });
        continue;
      }
      const missingPath = resolve(root, `${referenceKey(task)}.missing.json`);
      if (!options.refresh && (await recentlyMissing(missingPath, task))) {
        cached++;
        await options.onTaskComplete?.({ key, outcome: "cached", gaps: ["source_not_found"] });
        continue;
      }
      if (crawled + notFound >= limit) break;
      try {
        const page = await source(referenceUrl(task), task);
        const xml = task.kind === "item" ? await source(`${referenceUrl(task)}&xml`, task) : null;
        const record = parseWowheadPage(page.text, task, {
          url: page.url,
          capturedAt: new Date().toISOString(),
          permissionRef: options.permissionRef,
          ...(xml ? { itemXml: xml.text } : {}),
        });
        const gaps = referenceQualityGaps(record);
        if (Buffer.byteLength(JSON.stringify(record)) + 1 > 300000)
          throw new Error("Extracted reference exceeds staging budget");
        await atomicJsonWrite(resolve(root, `${referenceKey(task)}.json`), record);
        crawled++;
        if (gaps.length) incomplete++;
        await options.onProgress?.(key, gaps);
        await options.onTaskComplete?.({ key, outcome: "crawled", gaps });
      } catch (error) {
        if (!(error instanceof SourceNotFound)) throw error;
        await atomicJsonWrite(missingPath, {
          ...task,
          status: 404,
          checkedAt: new Date().toISOString(),
        });
        notFound++;
        await options.onProgress?.(key, ["source_not_found"]);
        await options.onTaskComplete?.({ key, outcome: "not_found", gaps: ["source_not_found"] });
      }
    }
    return { crawled, cached, incomplete, notFound };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
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
