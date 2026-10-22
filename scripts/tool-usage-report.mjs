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
 */

/**
 * @param {{ root: string, from: string, to: string, now?: Date }} options
 * @returns {Promise<{
 * schema: 'tool-usage-report.v1', generatedAt: string,
 * range: { from: string, to: string, timezone: 'UTC', includesPartialToday: boolean },
 * observedDays: number, missingDays: string[], totalActions: number,
 * byDay: DailyTotal[], groups: UsageTotal[], builds: string[], interpretation: string
 * }>}
 */
export async function toolUsageReport({ root, from, to, now = new Date() }) {
  toolUsageDateSchema.parse(from);
  toolUsageDateSchema.parse(to);
  if (from > to || to > now.toISOString().slice(0, 10)) throw new Error("Invalid report range.");
  const days =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (days > 90) throw new Error("Choose at most 90 days.");
  const directory = resolve(root);
  const info = await lstat(directory);
  if (!info.isDirectory()) throw new Error("A real tool usage directory is required.");
  const missingDays = [];
  const byDay = [];
  /** @type {Map<string, UsageTotal>} */
  const totals = new Map();
  /** @type {Set<string>} */
  const builds = new Set();
  for (let index = 0; index < days; index++) {
    const date = new Date(Date.parse(`${from}T00:00:00.000Z`) + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
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
    interpretation:
      "Browser-reported successful actions, not unique people, attended events, completed trades or verified gameplay. Repeats of one action/edition within 30 seconds in one page runtime are suppressed. Missing days are unknown, not zero; collection may be disabled, blocked or unavailable. No browser-to-Discord identity matching.",
  };
}

/** @returns {Promise<void>} */
async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "node scripts/tool-usage-report.mjs [--root=/protected/tool-usage] [--from=YYYY-MM-DD --to=YYYY-MM-DD]\nDefaults to TOOL_USAGE_ROOT and the last seven complete UTC days. Read-only; no publication or synthetic data.\n",
    );
    return;
  }
  const options = new Map();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(root|from|to)=(.+)$/.exec(arg);
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
