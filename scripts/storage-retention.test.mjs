import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  utimes,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pruneStorageEntries,
  safeStoragePath,
  pruneGuardianReleases,
  pruneAudits,
} from "./storage-retention.mjs";
import {
  acquireStorageLock,
  pruneSimulationCache,
  withSimulationCacheAccess,
} from "../infra/simulator/cache-retention.mjs";
import { createSimulationCache } from "../infra/simulator/simulation-cache.mjs";

const day = 86_400_000;
const now = Date.now();
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "storage-retention-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function file(path, age = 10 * day, text = "{}") {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
  await utimes(path, new Date(now - age), new Date(now - age));
  return path;
}

test("retains active files, explicit pins, markers and a fresh build", async (t) => {
  const root = await fixture(t);
  const entries = await Promise.all(
    ["old", "active", "pinned", "fresh", "marked/file"].map((name) =>
      file(join(root, name), name === "fresh" ? 100 : 10 * day),
    ),
  );
  await file(join(root, "marked/.storage-keep"));
  const result = await pruneStorageEntries(root, entries, {
    keep: 0,
    maxBytes: 0,
    dryRun: false,
    now,
    active: (path) => path.endsWith("/active"),
    pinned: (path) => path.endsWith("/pinned"),
  });
  assert.deepEqual(
    result.removed.map(({ path }) => path),
    [join(root, "old")],
  );
  for (const path of entries.slice(1)) assert.equal(await readFile(path, "utf8"), "{}");
});

test("refuses links and paths outside the configured root", async (t) => {
  const root = await fixture(t);
  const other = await fixture(t);
  await file(join(other, "precious"));
  await symlink(other, join(root, "redirect"));
  await assert.rejects(safeStoragePath(root, join(root, "redirect/precious")), /symlink/);
  await assert.rejects(safeStoragePath(root, other), /escapes/);
  assert.equal(await readFile(join(other, "precious"), "utf8"), "{}");
});

test("Guardian keeps its actual active and rollback releases even when older", async (t) => {
  const home = await fixture(t);
  const root = join(home, "Library/Application Support/WowTraderCatalogGuardian");
  const releases = ["a", "b", "c", "d"].map((letter) => join(root, "releases", letter.repeat(64)));
  for (const path of releases) {
    await file(join(path, "runtime"));
    await utimes(path, new Date(now - 10 * day), new Date(now - 10 * day));
  }
  const rollbackPlist = await file(
    join(root, "rollback.plist"),
    0,
    `<string>${releases[1]}/entry.mjs</string>`,
  );
  await file(
    join(root, "deployment.json"),
    0,
    JSON.stringify({ releaseDirectory: releases[0], rollbackPlist }),
  );
  const result = await pruneGuardianReleases(home, { dryRun: false, now });
  assert.deepEqual(result.removed.map(({ path }) => path).sort(), releases.slice(2).sort());
  assert.equal((await readdir(join(root, "releases"))).length, 2);
});

test("audit retention crosses date directories but preserves approved and referenced evidence", async (t) => {
  const root = await fixture(t);
  const entries = [];
  for (let i = 0; i < 6; i++)
    entries.push(
      await file(
        join(
          root,
          `artifacts/leveling/audits/${i % 2 ? `2026-10-1${i}` : `2026101${i}`}/workflow/campaign-xp-audit-${String(i).repeat(16)}.json`,
        ),
        (12 - i) * day,
        i === 0 ? '{"coverageGatePassed":true}' : "{}",
      ),
    );
  const results = await pruneAudits(root, entries[1], { dryRun: false, now });
  assert.equal(
    results.reduce((sum, result) => sum + result.removed.length, 0),
    1,
  );
  for (const i of [0, 1, 3, 4, 5]) assert.ok(await readFile(entries[i]));
});

test("storage locks serialize callers and malformed locks fail closed", async (t) => {
  const root = await fixture(t);
  const path = join(root, "lock");
  const release = await acquireStorageLock(path);
  assert.equal(await acquireStorageLock(path), null);
  await release();
  await file(path, 0, "not-a-pid");
  assert.equal(await acquireStorageLock(path), null);
});

test("cache eviction respects concurrent readers and removes old entries by file count", async (t) => {
  const root = await fixture(t);
  const dir = join(root, "cache");
  const paths = [];
  for (let i = 0; i < 4; i++)
    paths.push(
      await file(join(dir, "a".repeat(64), String(i).repeat(64) + ".json"), (4 - i) * day),
    );
  await withSimulationCacheAccess(dir, async () => {
    assert.equal(
      (await pruneSimulationCache(dir, { maxFiles: 1, intervalMs: 0 })).skipped,
      "simulation active",
    );
  });
  const preview = await pruneSimulationCache(dir, { maxFiles: 1, dryRun: true, now });
  assert.equal(preview.removedFiles, 3);
  assert.equal((await readdir(join(dir, "a".repeat(64)))).length, 4);
  const result = await pruneSimulationCache(dir, { maxFiles: 1, intervalMs: 0, now });
  assert.equal(result.remainingFiles, 1);
  assert.ok(await readFile(paths[3]));
});

test("leases are released after failures and redirected state files are refused", async (t) => {
  const root = await fixture(t);
  const dir = join(root, "cache");
  await assert.rejects(
    withSimulationCacheAccess(dir, async () => {
      throw new Error("worker failed");
    }),
    /worker failed/,
  );
  assert.equal((await readdir(dir)).filter((name) => name.startsWith(".active-")).length, 0);
  const victim = await file(join(root, "victim"), 0, "keep");
  await symlink(victim, join(dir, ".retention-last"));
  await assert.rejects(pruneSimulationCache(dir), /timestamp/);
  assert.equal(await readFile(victim, "utf8"), "keep");
});

test("a failed worker keeps the cache lease until its sibling writer finishes", async (t) => {
  const root = await fixture(t);
  const dir = join(root, "cache");
  let rejectWorker;
  const failedWorker = new Promise((_resolve, reject) => {
    rejectWorker = reject;
  });
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let siblingRuns = 0;
  let siblingFinished = false;
  let cleanupState;
  const cache = await createSimulationCache(dir, "b".repeat(64), [
    {
      run: async () => {
        markStarted();
        return failedWorker;
      },
    },
    {
      run: async (input) => {
        siblingRuns++;
        await started;
        rejectWorker(new Error("simulation failed"));
        const result = await pruneSimulationCache(dir, { maxFiles: 0, intervalMs: 0 });
        cleanupState = result.skipped;
        siblingFinished = true;
        return { ...input, dps: 10, stdev: 0 };
      },
    },
  ]);
  await assert.rejects(
    cache.run([
      { iterations: 1, seed: 1 },
      { iterations: 1, seed: 2 },
      { iterations: 1, seed: 3 },
    ]),
    /simulation failed/,
  );
  assert.equal(siblingRuns, 1);
  assert.equal(siblingFinished, true, "the failed batch must wait for its remaining writer");
  assert.equal(cleanupState, "simulation active");
  assert.equal((await readdir(dir)).filter((name) => name.startsWith(".active-")).length, 0);
});
