#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL, URLSearchParams } from "node:url";

import { isMainModule } from "./runtime-entrypoint.mjs";

const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function buildComparisonRanges(now = new Date()) {
  const currentEnd = addPacificDays(pacificDate(now), -3);
  const currentStart = addIsoDays(currentEnd, -27);
  const previousEnd = addIsoDays(currentStart, -1);
  const previousStart = addIsoDays(previousEnd, -27);
  return {
    current: { startDate: currentStart, endDate: currentEnd },
    previous: { startDate: previousStart, endDate: previousEnd },
  };
}

export function buildReviewCandidates(currentRows, previousRows) {
  const previousByPage = new Map(previousRows.map((row) => [row.page, row]));
  const candidates = [];
  for (const current of currentRows) {
    const previous = previousByPage.get(current.page) ?? null;
    const reasons = [];
    if (current.impressions >= 50 && current.ctr < 0.02 && current.position <= 20) {
      reasons.push("low_ctr");
    }
    if (current.impressions >= 50 && current.position >= 8 && current.position <= 20) {
      reasons.push("striking_distance");
    }
    if (previous && previous.clicks >= 10 && current.clicks < previous.clicks * 0.7) {
      reasons.push("click_decline");
    }
    if (!previous && current.impressions >= 25 && current.clicks === 0) {
      reasons.push("new_visibility_without_clicks");
    }
    if (!reasons.length) continue;
    candidates.push({
      page: current.page,
      segment: segmentSearchPage(current.page),
      reasons,
      current,
      previous,
    });
  }
  return candidates.sort(
    (left, right) =>
      right.current.impressions - left.current.impressions || left.page.localeCompare(right.page),
  );
}

export function segmentSearchPage(value) {
  try {
    const path = new URL(value).pathname.replace(/^\/tools/, "") || "/";
    const patterns = [
      ["items", /^\/(forever|tbc)\/encyclopedia\/items\/\d+$/],
      ["recipes", /^\/(forever|tbc)\/encyclopedia\/recipes\/\d+$/],
      ["npcs", /^\/forever\/encyclopedia\/npcs(?:\/|$)/],
      ["objects", /^\/forever\/encyclopedia\/objects(?:\/|$)/],
      ["quests", /^\/forever\/encyclopedia\/quests(?:\/|$)/],
      ["changes", /^\/forever\/encyclopedia\/changes(?:\/|$)/],
      ["leveling", /^\/forever\/leveling(?:\/|$)/],
      ["simulator", /^\/forever\/simulator(?:\/|$)/],
      ["markets", /^\/(forever|tbc)\/(markets|trader)(?:\/|$)/],
      ["encyclopedia", /^\/(forever|tbc)\/encyclopedia(?:\/|$)/],
    ];
    return patterns.find(([, pattern]) => pattern.test(path))?.[0] ?? "other";
  } catch {
    return "invalid";
  }
}

export async function runSearchConsoleImport(options) {
  const token = await resolveAccessToken(options);
  await assertPropertyAccess(token, options.siteUrl, options.timeoutMs);
  const ranges = buildComparisonRanges(options.now);
  const [currentRows, previousRows] = await Promise.all([
    queryPages(token, options, ranges.current),
    queryPages(token, options, ranges.previous),
  ]);
  const candidates = buildReviewCandidates(currentRows, previousRows);
  const report = {
    schema: "search-console-intelligence.v1",
    generatedAt: options.now.toISOString(),
    source: {
      api: SEARCH_CONSOLE_API,
      oauthScope: READ_ONLY_SCOPE,
      property: options.siteUrl,
      pagePrefix: options.pagePrefix,
      searchType: "web",
      dataState: "final",
      topRowsOnly: true,
    },
    ranges,
    summary: {
      currentPages: currentRows.length,
      previousPages: previousRows.length,
      reviewCandidateCount: candidates.length,
      segments: summarizeSegments(currentRows),
    },
    current: currentRows,
    previous: previousRows,
    reviewCandidates: candidates,
    policy: {
      readOnly: true,
      automaticContentChanges: false,
      note: "Candidates require human review before metadata, content, or linking changes.",
    },
  };
  await writeReport(options.reportPath, report);
  return report;
}

async function queryPages(token, options, range) {
  const endpoint = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`;
  const response = await apiFetch(
    endpoint,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...range,
        dimensions: ["page"],
        type: "web",
        aggregationType: "auto",
        dataState: "final",
        rowLimit: 25_000,
        dimensionFilterGroups: [
          {
            groupType: "and",
            filters: [{ dimension: "page", operator: "contains", expression: options.pagePrefix }],
          },
        ],
      }),
    },
    options.timeoutMs,
  );
  const body = await readJsonResponse(response, "Search Analytics query");
  const rows = Array.isArray(body.rows) ? body.rows : [];
  return rows.map((row, index) => parseAnalyticsRow(row, index));
}

async function assertPropertyAccess(token, siteUrl, timeoutMs) {
  const response = await apiFetch(
    `${SEARCH_CONSOLE_API}/sites`,
    { headers: { authorization: `Bearer ${token}` } },
    timeoutMs,
  );
  const body = await readJsonResponse(response, "Search Console sites list");
  const entries = Array.isArray(body.siteEntry) ? body.siteEntry : [];
  const property = entries.find((entry) => entry && entry.siteUrl === siteUrl);
  if (!property || property.permissionLevel === "siteUnverifiedUser") {
    throw new Error(
      `Configured Search Console property is not verified for this credential: ${siteUrl}`,
    );
  }
}

function parseAnalyticsRow(value, index) {
  if (
    !value ||
    !Array.isArray(value.keys) ||
    typeof value.keys[0] !== "string" ||
    !finiteNonNegative(value.clicks) ||
    !finiteNonNegative(value.impressions) ||
    !finiteNonNegative(value.ctr) ||
    !finiteNonNegative(value.position)
  ) {
    throw new Error(`Search Console returned an invalid page row at index ${index}`);
  }
  return {
    page: value.keys[0],
    segment: segmentSearchPage(value.keys[0]),
    clicks: value.clicks,
    impressions: value.impressions,
    ctr: value.ctr,
    position: value.position,
  };
}

async function resolveAccessToken(options) {
  if (options.accessToken) return options.accessToken;
  if (!options.clientId || !options.clientSecret || !options.refreshToken) {
    throw new Error(
      "Search Console requires GSC_ACCESS_TOKEN or GSC_CLIENT_ID, GSC_CLIENT_SECRET, and GSC_REFRESH_TOKEN",
    );
  }
  const response = await apiFetch(
    TOKEN_ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: options.refreshToken,
        grant_type: "refresh_token",
      }),
    },
    options.timeoutMs,
  );
  const body = await readJsonResponse(response, "OAuth token exchange");
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("OAuth token exchange returned no access token");
  }
  return body.access_token;
}

async function apiFetch(url, init, timeoutMs) {
  return globalThis.fetch(url, {
    ...init,
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  });
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message.slice(0, 500)
        : "request failed";
    throw new Error(`${label} failed with HTTP ${response.status}: ${message}`);
  }
  if (!body || typeof body !== "object") throw new Error(`${label} returned an invalid body`);
  return body;
}

function summarizeSegments(rows) {
  const result = {};
  for (const row of rows) {
    const current = result[row.segment] ?? { pages: 0, clicks: 0, impressions: 0 };
    current.pages += 1;
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    result[row.segment] = current;
  }
  return result;
}

async function writeReport(reportPath, report) {
  await mkdir(dirname(reportPath), { recursive: true });
  const temporary = `${reportPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, reportPath);
}

function pacificDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function addPacificDays(value, days) {
  return addIsoDays(value, days);
}

function addIsoDays(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseOptions(argv) {
  const flags = new Map();
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.*)$/);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    flags.set(match[1], match[2]);
  }
  const siteUrl = flags.get("site-url") ?? process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL or --site-url is required");
  const pagePrefix =
    flags.get("page-prefix") ?? process.env.GSC_PAGE_PREFIX ?? "https://kfcguild.online/tools/";
  new URL(pagePrefix);
  return {
    siteUrl,
    pagePrefix,
    accessToken: process.env.GSC_ACCESS_TOKEN,
    clientId: process.env.GSC_CLIENT_ID,
    clientSecret: process.env.GSC_CLIENT_SECRET,
    refreshToken: process.env.GSC_REFRESH_TOKEN,
    timeoutMs: 30_000,
    reportPath: resolve(
      flags.get("report") ??
        process.env.GSC_REPORT_PATH ??
        "artifacts/seo/search-console-intelligence.json",
    ),
    now: new Date(),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const report = await runSearchConsoleImport(options);
  process.stdout.write(
    `${JSON.stringify({ report: options.reportPath, summary: report.summary }, null, 2)}\n`,
  );
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
