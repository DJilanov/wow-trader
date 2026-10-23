#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { isMainModule } from "./runtime-entrypoint.mjs";
import {
  toolUsageAggregateSchema,
  toolUsageDateSchema,
} from "../apps/web/src/lib/tool-usage-contract.mjs";

/**
 * @typedef {{ edition: string, action: string, device: string, count: number }} UsageTotal
 * @typedef {{ date: string, count: number }} DailyTotal
 * @typedef {'collection_start_unknown' | 'before_collection' | 'partial_collection_date' | 'current_utc_day' | 'missing_aggregate'} CoverageExclusion
 */

/**
 * @param {{ root: string, from: string, to: string, now?: Date, collectionStartedAt?: string }} options
 * @returns {Promise<{
 * schema: 'tool-usage-report.v1', generatedAt: string,
 * range: { from: string, to: string, timezone: 'UTC', includesPartialToday: boolean },
 * observedDays: number, missingDays: string[], totalActions: number,
 * byDay: DailyTotal[], groups: UsageTotal[], builds: string[], interpretation: string,
 * coverage: {
 * collectionStartedAt: string | null, firstCompleteUtcDate: string | null,
 * completeCalendarDates: string[], excludedDates: { date: string, reasons: CoverageExclusion[] }[],
 * fullCalendarWindowObserved: boolean, interpretation: string
 * }
 * }>}
 */
export async function toolUsageReport({ root, from, to, now = new Date(), collectionStartedAt }) {
  toolUsageDateSchema.parse(from);
  toolUsageDateSchema.parse(to);
  if (from > to || to > now.toISOString().slice(0, 10)) throw new Error("Invalid report range.");
  const days =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days > 90) throw new Error("Choose at most 90 days.");
  let start = null;
  let firstCompleteUtcDate = null;
  if (collectionStartedAt !== undefined) {
    start = new Date(collectionStartedAt);
    if (
      !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(collectionStartedAt) ||
      !Number.isFinite(start.getTime()) ||
      start.toISOString().replace(".000Z", "Z") !== collectionStartedAt.replace(".000Z", "Z")
    )
      throw new Error("Use a valid UTC collection timestamp with seconds or milliseconds.");
    toolUsageDateSchema.parse(start.toISOString().slice(0, 10));
    if (start > now) throw new Error("Collection cannot start in the future.");
    const midnight = Date.parse(`${start.toISOString().slice(0, 10)}T00:00:00.000Z`);
    firstCompleteUtcDate = new Date(midnight + (start.getTime() === midnight ? 0 : 86_400_000))
      .toISOString()
      .slice(0, 10);
  }
  const directory = resolve(root);
  const info = await lstat(directory);
  if (!info.isDirectory()) throw new Error("A real tool usage directory is required.");
  const missingDays = [];
  const byDay = [];
  /** @type {Map<string, UsageTotal>} */
  const totals = new Map();
  /** @type {Set<string>} */
  const builds = new Set();
  /** @type {string[]} */
  const completeCalendarDates = [];
  /** @type {{ date: string, reasons: CoverageExclusion[] }[]} */
  const excludedDates = [];
  for (let index = 0; index < days; index++) {
    const date = new Date(Date.parse(`${from}T00:00:00.000Z`) + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    /** @type {CoverageExclusion[]} */
    const reasons = [];
    if (!start) reasons.push("collection_start_unknown");
    else if (date < start.toISOString().slice(0, 10)) reasons.push("before_collection");
    else if (firstCompleteUtcDate !== null && date < firstCompleteUtcDate)
      reasons.push("partial_collection_date");
    if (date === now.toISOString().slice(0, 10)) reasons.push("current_utc_day");
    const file = join(directory, `${date}.json`);
    let aggregate;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > 131_072)
        throw new Error("Invalid tool usage aggregate file.");
      aggregate = toolUsageAggregateSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        missingDays.push(date);
        excludedDates.push({ date, reasons: [...reasons, "missing_aggregate"] });
        continue;
      }
      throw new Error(`Invalid aggregate for ${date}.`, { cause: error });
    }
    if (aggregate.date !== date) throw new Error(`Aggregate date mismatch for ${date}.`);
    let count = 0;
    for (const group of Object.values(aggregate.groups)) {
      const key = `${group.edition}|${group.action}|${group.device}`;
      const previous = totals.get(key);
      totals.set(key, {
        edition: group.edition,
        action: group.action,
        device: group.device,
        count: (previous?.count ?? 0) + group.count,
      });
      builds.add(group.build);
      count += group.count;
    }
    byDay.push({ date, count });
    if (reasons.length) excludedDates.push({ date, reasons });
    else completeCalendarDates.push(date);
  }
  return {
    schema: "tool-usage-report.v1",
    generatedAt: now.toISOString(),
    range: {
      from,
      to,
      timezone: "UTC",
      includesPartialToday: to === now.toISOString().slice(0, 10),
    },
    observedDays: byDay.length,
    missingDays,
    totalActions: byDay.reduce((sum, row) => sum + row.count, 0),
    byDay,
    groups: [...totals.values()].sort((left, right) =>
      `${left.edition}|${left.action}|${left.device}`.localeCompare(
        `${right.edition}|${right.action}|${right.device}`,
      ),
    ),
    builds: [...builds].sort(),
    coverage: {
      collectionStartedAt: start?.toISOString() ?? null,
      firstCompleteUtcDate,
      completeCalendarDates,
      excludedDates,
      fullCalendarWindowObserved: completeCalendarDates.length === days,
      interpretation:
        "Calendar boundaries and aggregate-file presence only, using the supplied activation timestamp. This does not verify continuous collection, uptime, zero activity on missing dates, unique people or a growth trend. No start time is inferred from a first event, file timestamp or release label.",
    },
    interpretation:
      "Browser-reported successful actions, not unique people, attended events, completed trades or verified gameplay. Repeats of one action/edition within 30 seconds in one page runtime are suppressed. Missing days are unknown, not zero; collection may be disabled, blocked or unavailable. No browser-to-Discord identity matching.",
  };
}

/** @returns {Promise<void>} */
async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "node scripts/tool-usage-report.mjs [--root=/protected/tool-usage] [--from=YYYY-MM-DD --to=YYYY-MM-DD] [--collection-started-at=YYYY-MM-DDTHH:mm:ssZ]\nDefaults to TOOL_USAGE_ROOT and the last seven closed UTC dates. Supply the verified activation timestamp to distinguish complete calendar dates from a partial rollout day. An omitted start is unknown. Read-only; no publication or synthetic data.\n",
    );
    return;
  }
  const options = new Map();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(root|from|to|collection-started-at)=(.+)$/.exec(arg);
    if (!match || options.has(match[1])) throw new Error("Invalid or duplicate argument.");
    options.set(match[1], match[2]);
  }
  if (options.has("from") !== options.has("to")) throw new Error("Provide both --from and --to.");
  const now = new Date();
  const root = options.get("root") ?? process.env.TOOL_USAGE_ROOT;
  if (!root) throw new Error("TOOL_USAGE_ROOT or --root is required.");
  const report = await toolUsageReport({
    root,
    from:
      options.get("from") ?? new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10),
    to: options.get("to") ?? new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10),
    now,
    collectionStartedAt: options.get("collection-started-at"),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (isMainModule(import.meta.url))
  await main().catch(() => {
    process.stderr.write(
      "Tool usage report failed. Check the protected directory, aggregate integrity and date range; use --help.\n",
    );
    process.exitCode = 1;
  });
