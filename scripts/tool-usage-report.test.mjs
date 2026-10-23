import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { toolUsageReport } from "./tool-usage-report.mjs";
import { addToolUsage } from "../apps/web/src/lib/tool-usage-contract.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execute = promisify(execFile);

/** @param {string} root @param {string[]} dates @returns {Promise<void>} */
async function recordDates(root, dates) {
  for (const date of dates) {
    const aggregate = addToolUsage(
      null,
      {
        schema: "tool-usage.v1",
        build: "test-release",
        action: "simulation_completed",
        edition: "forever",
        device: "desktop",
      },
      new Date(`${date}T12:00:00Z`),
    );
    await writeFile(join(root, `${date}.json`), JSON.stringify(aggregate));
  }
}

test("reports dated aggregates and unknown gaps without inventing unique users or activity", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    const now = new Date("2026-10-22T12:00:00Z");
    const event = {
      schema: "tool-usage.v1",
      build: "test-release",
      action: "market_item_watched",
      edition: "forever",
      device: "mobile",
    };
    const aggregate = addToolUsage(null, event, new Date("2026-10-21T12:00:00Z"));
    const file = join(root, "2026-10-21.json");
    const before = JSON.stringify(aggregate);
    await writeFile(file, before);
    const report = await toolUsageReport({ root, from: "2026-10-20", to: "2026-10-21", now });
    assert.equal(report.totalActions, 1);
    assert.equal(report.observedDays, 1);
    assert.deepEqual(report.missingDays, ["2026-10-20"]);
    assert.equal(report.range.includesPartialToday, false);
    assert.equal(report.coverage.collectionStartedAt, null);
    assert.equal(report.coverage.fullCalendarWindowObserved, false);
    assert.deepEqual(report.coverage.completeCalendarDates, []);
    assert.ok(
      report.coverage.excludedDates.every((row) =>
        row.reasons.includes("collection_start_unknown"),
      ),
    );
    assert.deepEqual(report.groups, [
      { action: event.action, edition: event.edition, device: event.device, count: 1 },
    ]);
    assert.equal(await readFile(file, "utf8"), before);
    const today = await toolUsageReport({ root, from: "2026-10-22", to: "2026-10-22", now });
    assert.equal(today.range.includesPartialToday, true);
    assert.deepEqual(today.missingDays, ["2026-10-22"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("marks rollout and current days partial without changing or dropping their action totals", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    const dates = ["2026-10-22", "2026-10-23"];
    await recordDates(root, dates);
    const before = await Promise.all(
      dates.map((date) => readFile(join(root, `${date}.json`), "utf8")),
    );
    const report = await toolUsageReport({
      root,
      from: "2026-10-21",
      to: "2026-10-23",
      now: new Date("2026-10-23T14:00:00Z"),
      collectionStartedAt: "2026-10-22T15:58:57Z",
    });
    assert.equal(report.totalActions, 2);
    assert.equal(report.observedDays, 2);
    assert.equal(report.coverage.collectionStartedAt, "2026-10-22T15:58:57.000Z");
    assert.equal(report.coverage.firstCompleteUtcDate, "2026-10-23");
    assert.deepEqual(report.coverage.completeCalendarDates, []);
    assert.equal(report.coverage.fullCalendarWindowObserved, false);
    assert.deepEqual(report.coverage.excludedDates, [
      { date: "2026-10-21", reasons: ["before_collection", "missing_aggregate"] },
      { date: "2026-10-22", reasons: ["partial_collection_date"] },
      { date: "2026-10-23", reasons: ["current_utc_day"] },
    ]);
    assert.deepEqual(
      await Promise.all(dates.map((date) => readFile(join(root, `${date}.json`), "utf8"))),
      before,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a seven-day calendar window needs closed post-rollout dates and every aggregate", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${23 + index}`);
    await recordDates(root, dates);
    const options = {
      root,
      from: "2026-10-23",
      to: "2026-10-29",
      now: new Date("2026-10-30T00:00:00Z"),
      collectionStartedAt: "2026-10-22T15:58:57.000Z",
    };
    const complete = await toolUsageReport(options);
    assert.equal(complete.totalActions, 7);
    assert.equal(complete.coverage.fullCalendarWindowObserved, true);
    assert.deepEqual(complete.coverage.completeCalendarDates, dates);
    assert.deepEqual(complete.coverage.excludedDates, []);
    assert.match(complete.coverage.interpretation, /does not verify continuous collection/);
    await rm(join(root, "2026-10-26.json"));
    const missing = await toolUsageReport(options);
    assert.equal(missing.totalActions, 6);
    assert.equal(missing.coverage.fullCalendarWindowObserved, false);
    assert.deepEqual(missing.missingDays, ["2026-10-26"]);
    assert.deepEqual(missing.coverage.excludedDates, [
      { date: "2026-10-26", reasons: ["missing_aggregate"] },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("midnight activation permits that closed UTC date but even one millisecond later is partial", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    await recordDates(root, ["2026-10-22"]);
    const options = {
      root,
      from: "2026-10-22",
      to: "2026-10-22",
      now: new Date("2026-10-23T00:00:00Z"),
    };
    const complete = await toolUsageReport({
      ...options,
      collectionStartedAt: "2026-10-22T00:00:00Z",
    });
    assert.equal(complete.coverage.fullCalendarWindowObserved, true);
    assert.equal(complete.coverage.firstCompleteUtcDate, "2026-10-22");
    const partial = await toolUsageReport({
      ...options,
      collectionStartedAt: "2026-10-22T00:00:00.001Z",
    });
    assert.equal(partial.coverage.fullCalendarWindowObserved, false);
    assert.equal(partial.coverage.firstCompleteUtcDate, "2026-10-23");
    assert.equal(partial.totalActions, complete.totalActions);
    assert.deepEqual(partial.coverage.excludedDates, [
      { date: "2026-10-22", reasons: ["partial_collection_date"] },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported or future activation timestamps rather than guessing a full day", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    const options = {
      root,
      from: "2026-10-22",
      to: "2026-10-22",
      now: new Date("2026-10-23T12:00:00Z"),
    };
    for (const collectionStartedAt of [
      "",
      "yesterday",
      "2026-02-30T00:00:00Z",
      "2026-10-22",
      "2026-10-22T00:00:00+02:00",
      "2026-10-22T00:00:00.0001Z",
      "2026-10-24T00:00:00Z",
    ])
      await assert.rejects(toolUsageReport({ ...options, collectionStartedAt }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the CLI accepts an explicit activation time and remains read-only with unknown gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    await recordDates(root, ["2020-01-02"]);
    const args = [
      "scripts/tool-usage-report.mjs",
      `--root=${root}`,
      "--from=2020-01-01",
      "--to=2020-01-02",
      "--collection-started-at=2020-01-01T15:58:57Z",
    ];
    const { stdout } = await execute(process.execPath, args);
    const report = JSON.parse(stdout);
    assert.equal(report.totalActions, 1);
    assert.equal(report.coverage.fullCalendarWindowObserved, false);
    assert.deepEqual(report.coverage.completeCalendarDates, ["2020-01-02"]);
    assert.deepEqual(report.coverage.excludedDates, [
      { date: "2020-01-01", reasons: ["partial_collection_date", "missing_aggregate"] },
    ]);
    await assert.rejects(execute(process.execPath, [...args, args.at(-1)]));
    const { stdout: help } = await execute(process.execPath, [args[0], "--help"]);
    assert.match(help, /--collection-started-at/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects corrupt, misdated, linked and unbounded inputs rather than underreporting them", async () => {
  const root = await mkdtemp(join(tmpdir(), "helper-tool-report-"));
  try {
    const options = {
      root,
      from: "2026-10-21",
      to: "2026-10-21",
      now: new Date("2026-10-22T12:00:00Z"),
    };
    const file = join(root, "2026-10-21.json");
    await writeFile(file, "broken");
    await assert.rejects(toolUsageReport(options), /Invalid aggregate/);
    const event = {
      schema: "tool-usage.v1",
      build: "test",
      action: "talent_build_saved",
      edition: "forever",
      device: "desktop",
    };
    await writeFile(
      file,
      JSON.stringify(addToolUsage(null, event, new Date("2026-10-20T12:00:00Z"))),
    );
    await assert.rejects(toolUsageReport(options), /date mismatch/);
    const other = join(root, "other.json");
    await writeFile(other, "private");
    await rm(file);
    await symlink(other, file);
    await assert.rejects(toolUsageReport(options), /Invalid aggregate/);
    await assert.rejects(toolUsageReport({ ...options, from: "2026-02-30" }));
    await assert.rejects(
      toolUsageReport({ ...options, from: "2026-10-22" }),
      /Invalid report range/,
    );
    await assert.rejects(toolUsageReport({ ...options, to: "2026-10-23" }), /Invalid report range/);
    await assert.rejects(toolUsageReport({ ...options, from: "2026-01-01" }), /at most 90/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
