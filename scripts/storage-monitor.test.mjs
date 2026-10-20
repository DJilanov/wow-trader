import assert from "node:assert/strict";
import { test } from "node:test";
import { deletedOpenTotals, storageAlert, developmentBusy } from "./storage-monitor.mjs";

test("counts a deleted inode once across many descriptors and processes", () => {
  const result = deletedOpenTotals(
    "p1\nf4\nD0x1\ns100\ni2\nf5\nD0x1\ns100\ni2\np2\nf6\nD0x1\ns100\ni2\nf7\nD0x2\ns50\ni2\n",
  );
  assert.deepEqual(result, { files: 2, logicalBytes: 150 });
});
test("alerts on low space or measured growth, excluding long gaps and tiny intervals", () => {
  const gib = 1024 ** 3;
  const previous = { time: 1, freeBytes: 40 * gib };
  assert.equal(storageAlert(previous, { time: 3_600_001, freeBytes: 38 * gib }).alert, true);
  assert.equal(storageAlert(previous, { time: 3_600_001, freeBytes: 40 * gib }).alert, false);
  assert.equal(storageAlert(previous, { time: 300_001, freeBytes: 38 * gib }).alert, false);
  assert.equal(storageAlert(previous, { time: 86_400_001, freeBytes: 25 * gib }).alert, false);
  assert.equal(storageAlert(null, { time: 1, freeBytes: 19 * gib }).alert, true);
});
test("defers destructive scheduled work for producers but allows the monitor itself", () => {
  assert.equal(
    developmentBusy("/usr/local/bin/node scripts/optimize-simulator-prebis.mjs --resume"),
    true,
  );
  assert.equal(developmentBusy("node /path/pnpm.cjs --filter web build"), true);
  assert.equal(developmentBusy("node scripts/storage-monitor.mjs\nWindowServer"), false);
});
