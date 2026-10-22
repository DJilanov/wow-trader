import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { toolUsageReport } from "./tool-usage-report.mjs";
import { addToolUsage } from "../apps/web/src/lib/tool-usage-contract.mjs";

test("reports complete days and unknown gaps without inventing unique users or activity", async () => {
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
