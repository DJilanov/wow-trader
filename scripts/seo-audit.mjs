#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout as waitFor } from "node:timers/promises";
import { URL } from "node:url";

import { isMainModule } from "./runtime-entrypoint.mjs";

const REPORT_SCHEMA = "search-surface-report.v1";
const DEFAULT_PUBLIC_BASE = "https://kfcguild.online/tools";
const DEFAULT_LOCAL_BASE = "http://127.0.0.1:3000/tools";
const DEFAULT_FETCH_RETRIES = 2;

export function parseSitemapXml(xml) {
  const kind = /<sitemapindex(?:\s|>)/i.test(xml) ? "index" : "urlset";
  const locations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) =>
    decodeXml(match[1].trim()),
  );
  return { kind, locations };
}

export function analyzeSearchPage({ url, status, html }) {
  const canonical = readLinkHref(html, "canonical");
  const robots = readMetaContent(html, "robots").toLowerCase();
  const googlebot = readMetaContent(html, "googlebot").toLowerCase();
  const title = stripMarkup(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = readMetaContent(html, "description");
  const reasons = [];
  if (status !== 200) reasons.push("page_missing");
  if (!canonical) reasons.push("canonical_missing");
  else if (normalizeUrl(canonical) !== normalizeUrl(url)) reasons.push("canonical_mismatch");
  if (hasNoIndex(robots) || hasNoIndex(googlebot)) reasons.push("noindex_in_sitemap");
  if (!title) reasons.push("title_missing");
  if (!description) reasons.push("description_missing");
  const outgoingLinks = readInternalLinks(html, url);
  return {
    url,
    canonical: canonical || null,
    state: status !== 200 ? "excluded" : reasons.length ? "review_required" : "indexable",
    reasons: reasons.length ? reasons : ["eligible"],
    lastModified: null,
    contentHash: null,
    outgoingLinks,
    evidenceKinds: ["release_http_audit"],
    status,
    title,
    description,
  };
}

export async function runSeoAudit(options) {
  const startedAt = new Date();
  const sitemapUrls = await discoverSitemaps(options);
  const collected = await collectSitemapUrls(sitemapUrls, options);
  const duplicateUrls = duplicates(collected.pageUrls);
  const selectedUrls = selectEvenSample([...new Set(collected.pageUrls)], options.maxPages);
  const entries = await mapConcurrent(selectedUrls, options.concurrency, async (url) => {
    try {
      const response = await auditedFetch(mapPublicUrlToFetchUrl(url, options), options.timeoutMs, {
        retries: options.retries,
      });
      return analyzeSearchPage({ url, status: response.status, html: await response.text() });
    } catch {
      return failedSearchPage(url);
    }
  });
  const issues = [
    ...collected.issues,
    ...duplicateUrls.map((url) => ({ code: "duplicate_sitemap_url", url })),
    ...entries.flatMap((entry) =>
      entry.state === "indexable"
        ? []
        : entry.reasons.map((reason) => ({ code: reason, url: entry.url })),
    ),
  ];
  const report = {
    schema: REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.valueOf(),
    target: {
      fetchBaseUrl: options.baseUrl,
      canonicalBaseUrl: options.canonicalBaseUrl,
      sitemapUrls,
    },
    policy: {
      sitemapPagesMustReturn200: true,
      sitemapPagesMustSelfCanonicalize: true,
      sitemapPagesMustBeIndexable: true,
      sitemapPagesMustHaveTitleAndDescription: true,
    },
    summary: {
      sitemapCount: collected.visitedSitemaps.length,
      declaredUrlCount: collected.pageUrls.length,
      uniqueUrlCount: new Set(collected.pageUrls).size,
      auditedUrlCount: entries.length,
      indexableCount: entries.filter((entry) => entry.state === "indexable").length,
      issueCount: issues.length,
      complete:
        entries.length === new Set(collected.pageUrls).size &&
        !collected.issues.some((issue) => issue.code.startsWith("sitemap_")),
    },
    visitedSitemaps: collected.visitedSitemaps,
    issues,
    entries,
  };
  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function discoverSitemaps(options) {
  const robotsUrl = new URL(
    `${new URL(options.baseUrl).pathname.replace(/\/$/, "")}/robots.txt`,
    new URL(options.baseUrl).origin,
  );
  const response = await auditedFetch(robotsUrl.toString(), options.timeoutMs, {
    retries: options.retries,
  });
  if (!response.ok) throw new Error(`robots.txt returned HTTP ${response.status}`);
  const robots = await response.text();
  const urls = robots
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*Sitemap:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);
  if (!urls.length) throw new Error("robots.txt declares no sitemap URLs");
  return [...new Set(urls)];
}

async function collectSitemapUrls(initialUrls, options) {
  const pending = [...initialUrls];
  const visitedSitemaps = [];
  const pageUrls = [];
  const issues = [];
  const seen = new Set();
  while (pending.length) {
    const publicUrl = pending.shift();
    if (seen.has(publicUrl)) continue;
    seen.add(publicUrl);
    if (seen.size > 100) throw new Error("Sitemap recursion exceeds the 100-document safety limit");
    let response;
    try {
      response = await auditedFetch(mapPublicUrlToFetchUrl(publicUrl, options), options.timeoutMs, {
        retries: options.retries,
      });
    } catch {
      issues.push({ code: "sitemap_fetch_error", url: publicUrl });
      continue;
    }
    if (!response.ok) {
      issues.push({ code: "sitemap_http_error", url: publicUrl, status: response.status });
      continue;
    }
    const parsed = parseSitemapXml(await response.text());
    visitedSitemaps.push(publicUrl);
    if (parsed.kind === "index") pending.push(...parsed.locations);
    else pageUrls.push(...parsed.locations);
  }
  return { visitedSitemaps, pageUrls, issues };
}

function mapPublicUrlToFetchUrl(url, options) {
  const publicBase = normalizeUrl(options.canonicalBaseUrl);
  const normalized = normalizeUrl(url);
  if (!normalized.startsWith(`${publicBase}/`) && normalized !== publicBase) return normalized;
  return `${normalizeUrl(options.baseUrl)}${normalized.slice(publicBase.length)}`;
}

export async function auditedFetch(
  url,
  timeoutMs,
  { fetchImpl = globalThis.fetch, retries = DEFAULT_FETCH_RETRIES, wait = waitFor } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.1",
          "user-agent": "KFC-SEO-Release-Audit/1.0 (+https://kfcguild.online/tools)",
        },
        redirect: "follow",
        signal: globalThis.AbortSignal.timeout(timeoutMs),
      });
      if (!isRetryableStatus(response.status) || attempt >= retries) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt >= retries) {
        throw new Error(`SEO audit request failed after ${attempt + 1} attempts: ${url}`, {
          cause: error,
        });
      }
    }
    await wait(250 * 2 ** attempt);
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function failedSearchPage(url) {
  return {
    url,
    canonical: null,
    state: "excluded",
    reasons: ["page_fetch_error"],
    lastModified: null,
    contentHash: null,
    outgoingLinks: [],
    evidenceKinds: ["release_http_audit"],
    status: 0,
    title: "",
    description: "",
  };
}

function selectEvenSample(urls, maximum) {
  const ordered = [...urls].sort((left, right) => left.localeCompare(right));
  if (!Number.isFinite(maximum) || ordered.length <= maximum) return ordered;
  if (maximum === 1) return ordered.slice(0, 1);
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.floor((index * (ordered.length - 1)) / (maximum - 1));
    return ordered[sourceIndex];
  });
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function readLinkHref(html, relation) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = readAttributes(tag);
    if ((attributes.rel ?? "").toLowerCase().split(/\s+/).includes(relation)) {
      return attributes.href ?? "";
    }
  }
  return "";
}

function readMetaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = readAttributes(tag);
    if ((attributes.name ?? "").toLowerCase() === name) return attributes.content ?? "";
  }
  return "";
}

function readAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function readInternalLinks(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const links = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = readAttributes(tag).href;
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("javascript:")
    )
      continue;
    try {
      const resolved = new URL(href, pageUrl);
      resolved.hash = "";
      if (resolved.origin === origin) links.push(normalizeUrl(resolved.toString()));
    } catch {
      // Malformed links are caught by browser and framework validation elsewhere.
    }
  }
  return [...new Set(links)].sort((left, right) => left.localeCompare(right));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated].sort((left, right) => left.localeCompare(right));
}

function hasNoIndex(value) {
  return value.split(",").some((token) => token.trim() === "noindex");
}

function stripMarkup(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return decodeHtml(value);
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeUrl(value) {
  return new URL(value).toString().replace(/\/$/, "");
}

function parseOptions(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.*)$/);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  const baseUrl = normalizeUrl(values.get("base-url") ?? DEFAULT_LOCAL_BASE);
  const canonicalBaseUrl = normalizeUrl(values.get("canonical-base-url") ?? DEFAULT_PUBLIC_BASE);
  const maximum = values.get("max-pages") ?? "250";
  const maxPages =
    maximum === "all" ? Number.POSITIVE_INFINITY : parsePositiveInteger(maximum, "max-pages");
  return {
    baseUrl,
    canonicalBaseUrl,
    maxPages,
    concurrency: parsePositiveInteger(values.get("concurrency") ?? "8", "concurrency"),
    timeoutMs: parsePositiveInteger(values.get("timeout-ms") ?? "20000", "timeout-ms"),
    retries: parseNonNegativeInteger(
      values.get("retries") ?? String(DEFAULT_FETCH_RETRIES),
      "retries",
    ),
    reportPath: resolve(values.get("report") ?? "artifacts/seo/search-surface-report.json"),
  };
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be positive`);
  return parsed;
}

function parseNonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`--${name} must be non-negative`);
  return parsed;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const report = await runSeoAudit(options);
  process.stdout.write(
    `${JSON.stringify({ report: options.reportPath, summary: report.summary }, null, 2)}\n`,
  );
  if (report.summary.issueCount) process.exitCode = 1;
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
