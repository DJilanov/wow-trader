#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import { isMainModule } from "./runtime-entrypoint.mjs";

const DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function assertPublishableAudit(report, now = new Date(), maximumAgeMinutes = 60) {
  if (!report || report.schema !== "search-surface-report.v1") {
    throw new Error("IndexNow requires a search-surface-report.v1 release audit");
  }
  if (!report.summary?.complete) throw new Error("IndexNow requires a complete release audit");
  if (report.summary.issueCount !== 0) throw new Error("IndexNow refuses an audit with SEO issues");
  const generatedAt = new Date(report.generatedAt);
  if (
    Number.isNaN(generatedAt.valueOf()) ||
    generatedAt > now ||
    now.valueOf() - generatedAt.valueOf() > maximumAgeMinutes * 60_000
  ) {
    throw new Error("IndexNow requires a recent post-smoke release audit");
  }
  if (!Array.isArray(report.entries) || report.entries.length !== report.summary.uniqueUrlCount) {
    throw new Error("IndexNow audit entries do not match its unique URL count");
  }
  if (
    report.entries.some(
      (entry) =>
        entry?.state !== "indexable" ||
        entry.status !== 200 ||
        !urlsMatch(entry.url, entry.canonical),
    )
  ) {
    throw new Error("IndexNow audit contains an ineligible or non-canonical page");
  }
}

export function selectChangedUrls(report, state, options) {
  const keyDirectory = new URL(".", options.keyLocation).toString();
  const canonicalBase = normalizeUrl(options.canonicalBaseUrl);
  const candidates = report.entries
    .filter(
      (entry) =>
        entry?.state === "indexable" &&
        entry.status === 200 &&
        urlsMatch(entry.url, entry.canonical),
    )
    .map((entry) => ({ url: normalizeUrl(entry.url), fingerprint: pageFingerprint(entry) }))
    .filter(
      (entry) =>
        (entry.url === canonicalBase || entry.url.startsWith(`${canonicalBase}/`)) &&
        entry.url.startsWith(keyDirectory) &&
        new URL(entry.url).host === options.host,
    )
    .filter((entry) => state.acknowledged[entry.url] !== entry.fingerprint)
    .sort((left, right) => left.url.localeCompare(right.url));
  return {
    selected: candidates.slice(0, options.maximumUrls),
    pendingCount: Math.max(0, candidates.length - options.maximumUrls),
  };
}

export async function runIndexNowPublication(options) {
  const [report, state] = await Promise.all([
    readJson(options.auditPath),
    readState(options.statePath),
  ]);
  assertPublishableAudit(report, options.now, options.maximumAuditAgeMinutes);
  const outbox = selectChangedUrls(report, state, options);
  const urls = outbox.selected.map((entry) => entry.url);
  let responseStatus = null;
  if (urls.length && !options.dryRun) {
    await verifyKeyLocation(options.keyLocation, options.key, options.timeoutMs);
    const response = await globalThis.fetch(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: options.host,
        key: options.key,
        keyLocation: options.keyLocation,
        urlList: urls,
      }),
      signal: globalThis.AbortSignal.timeout(options.timeoutMs),
    });
    responseStatus = response.status;
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow submission failed with HTTP ${response.status}`);
    }
    for (const entry of outbox.selected) state.acknowledged[entry.url] = entry.fingerprint;
    state.updatedAt = options.now.toISOString();
    state.lastSuccessfulAudit = report.generatedAt;
    await writeJsonAtomic(options.statePath, state, 0o600);
  }
  const receipt = {
    schema: "indexnow-submission.v1",
    generatedAt: options.now.toISOString(),
    dryRun: options.dryRun,
    endpoint: options.endpoint,
    auditGeneratedAt: report.generatedAt,
    selectedUrlCount: urls.length,
    pendingUrlCount: outbox.pendingCount,
    responseStatus,
    urls,
    note: "A 200/202 response confirms receipt or pending key validation; it does not guarantee indexing or Google discovery.",
  };
  await writeJsonAtomic(options.receiptPath, receipt, 0o600);
  return receipt;
}

async function verifyKeyLocation(keyLocation, key, timeoutMs) {
  const response = await globalThis.fetch(keyLocation, {
    signal: globalThis.AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok || (await response.text()).trim() !== key) {
    throw new Error("IndexNow key location is not publicly serving the configured key");
  }
}

function pageFingerprint(entry) {
  const content = JSON.stringify({
    canonical: entry.canonical,
    contentHash: entry.contentHash,
    title: entry.title,
    description: entry.description,
    outgoingLinks: entry.outgoingLinks,
  });
  return createHash("sha256").update(content).digest("hex");
}

async function readState(path) {
  try {
    const value = await readJson(path);
    if (!value || value.schema !== "indexnow-state.v1" || !isRecord(value.acknowledged)) {
      throw new Error("IndexNow state has an invalid schema");
    }
    return value;
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        schema: "indexnow-state.v1",
        updatedAt: null,
        lastSuccessfulAudit: null,
        acknowledged: {},
      };
    }
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonAtomic(path, value, mode) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await rename(temporary, path);
}

function normalizeUrl(value) {
  return new URL(value).toString().replace(/\/$/, "");
}

function urlsMatch(left, right) {
  try {
    return normalizeUrl(left) === normalizeUrl(right);
  } catch {
    return false;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseOptions(argv) {
  const flags = new Map();
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.*)$/);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    flags.set(match[1], match[2]);
  }
  const dryRun = flags.get("dry-run") === "true";
  const key = process.env.INDEXNOW_KEY ?? "";
  if (!dryRun && !KEY_PATTERN.test(key)) {
    throw new Error("INDEXNOW_KEY must contain 8-128 letters, numbers, or dashes");
  }
  const canonicalBaseUrl = normalizeUrl(
    flags.get("canonical-base-url") ?? "https://kfcguild.online/tools",
  );
  const keyLocation = normalizeUrl(
    process.env.INDEXNOW_KEY_LOCATION ?? `${canonicalBaseUrl}/indexnow-key.txt`,
  );
  const host = new URL(canonicalBaseUrl).host;
  if (new URL(keyLocation).host !== host) {
    throw new Error("INDEXNOW_KEY_LOCATION must use the canonical host");
  }
  const maximumUrls = Number(flags.get("max-urls") ?? process.env.INDEXNOW_MAX_URLS ?? "500");
  if (!Number.isSafeInteger(maximumUrls) || maximumUrls <= 0 || maximumUrls > 10_000) {
    throw new Error("IndexNow max URLs must be between 1 and 10000");
  }
  return {
    auditPath: resolve(flags.get("audit") ?? "artifacts/seo/production-search-surface-report.json"),
    statePath: resolve(flags.get("state") ?? "artifacts/seo/indexnow-state.json"),
    receiptPath: resolve(flags.get("receipt") ?? "artifacts/seo/indexnow-receipt.json"),
    endpoint: process.env.INDEXNOW_ENDPOINT ?? DEFAULT_ENDPOINT,
    key,
    keyLocation,
    canonicalBaseUrl,
    host,
    maximumUrls,
    maximumAuditAgeMinutes: 60,
    timeoutMs: 30_000,
    dryRun,
    now: new Date(),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const receipt = await runIndexNowPublication(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
