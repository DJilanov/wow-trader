import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { promisify } from "node:util";
import { lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { acquireStorageLock, pruneSimulationCache } from "../infra/simulator/cache-retention.mjs";

const execute = promisify(execFile);
const day = 86_400_000;
const hash = /^[a-f0-9]{64}$/;

async function optionalStat(path) {
  return lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** Refuse symlinks in any component below the explicitly allowed root. */
export async function safeStoragePath(root, candidate) {
  const base = await realpath(root);
  const path = resolve(candidate);
  const rel = relative(resolve(root), path);
  if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("/"))
    throw new Error(`Cleanup path escapes its root: ${candidate}`);
  let current = base;
  for (const part of rel.split("/")) {
    current = join(current, part);
    const info = await optionalStat(current);
    if (!info) return false;
    if (info.isSymbolicLink()) throw new Error(`Refusing a symlinked cleanup path: ${current}`);
  }
  return true;
}

export async function storageActivity() {
  const { stdout } = await execute("/usr/sbin/lsof", ["-nP", "-Fpn"], {
    maxBuffer: 64 * 1024 ** 2,
    timeout: 60_000,
  });
  const paths = new Set();
  for (const line of stdout.split("\n"))
    if (line.startsWith("n/")) paths.add(line.slice(1).replace(/ \(deleted\)$/, ""));
  return (path) => [...paths].some((open) => open === path || open.startsWith(path + "/"));
}

async function allocatedBytes(path) {
  const { stdout } = await execute("/usr/bin/du", ["-skx", path], { timeout: 180_000 });
  const size = Number(stdout.split(/\s/, 1)[0]);
  if (!Number.isFinite(size)) throw new Error(`Cannot measure ${path}`);
  return size * 1024;
}

async function children(root) {
  if (!(await optionalStat(root))) return [];
  return readdir(root, { withFileTypes: true });
}

/** Existing source/docs and runtime path configuration provide conservative retention pins. */
export async function storageReferences(repository) {
  const { stdout } = await execute(
    "git",
    ["-C", repository, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      env: {
        ...process.env,
        DEVELOPER_DIR: process.env.DEVELOPER_DIR || "/Library/Developer/CommandLineTools",
      },
      maxBuffer: 16 * 1024 ** 2,
    },
  );
  const paths = new Set(stdout.split("\0").filter(Boolean));
  for (const suffix of [".env", ".env.local", "apps/web/.env", "apps/web/.env.local"])
    paths.add(suffix);
  let text = [...paths].join("\n") + "\n";
  for (const path of paths) {
    if (!/\.(?:md|json|mjs|ts|tsx|sh|ya?ml|txt)$/.test(path) && !basename(path).startsWith(".env"))
      continue;
    if (path.startsWith("artifacts/") || path.startsWith(".cache/")) continue;
    const file = join(repository, path);
    const info = await optionalStat(file);
    if (!info?.isFile() || info.isSymbolicLink()) continue;
    if (info.size > 8 * 1024 ** 2)
      throw new Error(`Reference file exceeds retention scan budget: ${path}`);
    text += await readFile(file, "utf8");
    text += "\n";
    if (text.length > 128 * 1024 ** 2)
      throw new Error("Retention reference scan exceeds its budget");
  }
  return text;
}

async function protectedByMarker(root, path) {
  let directory = (await lstat(path)).isDirectory() ? path : dirname(path);
  while (directory.startsWith(root + "/") || directory === root) {
    if (await optionalStat(join(directory, ".storage-keep"))) return true;
    if (directory === root) break;
    directory = dirname(directory);
  }
  return false;
}

async function approvedAudit(path) {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    const prefix = Buffer.alloc(Math.min(64_000, info.size));
    const suffix = Buffer.alloc(Math.min(4096, info.size));
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(suffix, 0, suffix.length, Math.max(0, info.size - suffix.length));
    return /"(?:coverageGatePassed|approved)"\s*:\s*true|"(?:status|state)"\s*:\s*"(?:approved|published|reviewed)"/.test(
      prefix.toString() + suffix.toString(),
    );
  } finally {
    await handle.close();
  }
}

export async function pruneStorageEntries(
  root,
  entries,
  {
    keep = 2,
    maxBytes = Infinity,
    maxAgeMs = Infinity,
    graceMs = 3_600_000,
    now = Date.now(),
    dryRun = true,
    active = () => false,
    pinned = () => false,
  } = {},
) {
  const candidates = [];
  for (const path of entries) {
    if (!(await safeStoragePath(root, path))) continue;
    const info = await lstat(path);
    candidates.push({
      path,
      info,
      bytes: await allocatedBytes(path),
      protected: (await pinned(path)) || active(path) || (await protectedByMarker(root, path)),
    });
  }
  candidates.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs || a.path.localeCompare(b.path));
  let total = candidates.reduce((sum, entry) => sum + entry.bytes, 0);
  const removable = [];
  for (const [index, entry] of candidates.entries())
    if (!entry.protected && index >= keep) removable.push(entry);
  const removed = [];
  for (const entry of removable.reverse()) {
    if (now - entry.info.mtimeMs < graceMs) continue;
    // A finite keep count retains that many entries. Byte/age limits can evict
    // additional unpinned entries when callers use keep=0 for a bounded cache.
    if (keep === 0 && total <= maxBytes && now - entry.info.mtimeMs <= maxAgeMs) continue;
    if (
      !(await safeStoragePath(root, entry.path)) ||
      active(entry.path) ||
      (await protectedByMarker(root, entry.path))
    )
      continue;
    const current = await lstat(entry.path);
    if (
      current.ino !== entry.info.ino ||
      current.dev !== entry.info.dev ||
      current.mtimeMs !== entry.info.mtimeMs
    )
      continue;
    if (!dryRun) await rm(entry.path, { recursive: true, force: false });
    total -= entry.bytes;
    removed.push({ path: entry.path, bytes: entry.bytes });
  }
  return {
    removed,
    removedBytes: removed.reduce((sum, entry) => sum + entry.bytes, 0),
    remainingBytes: total,
  };
}

export async function pruneGuardianReleases(home, options = {}) {
  const root = join(home, "Library/Application Support/WowTraderCatalogGuardian");
  if (!(await optionalStat(root))) return { removed: [], removedBytes: 0 };
  const release = await acquireStorageLock(join(root, "guardian.lock"));
  if (!release) return { removed: [], removedBytes: 0, skipped: "guardian active" };
  try {
    const deployment = await optionalJson(join(root, "deployment.json"));
    if (!deployment?.releaseDirectory)
      return { removed: [], removedBytes: 0, skipped: "no active deployment" };
    const pins = new Set([deployment.releaseDirectory]);
    if (deployment.rollbackPlist) {
      const plist = await readFile(deployment.rollbackPlist, "utf8");
      for (const match of plist.matchAll(/releases\/([a-f0-9]{64})/g))
        pins.add(join(root, "releases", match[1]));
    }
    const entries = (await children(join(root, "releases")))
      .filter((entry) => entry.isDirectory() && hash.test(entry.name))
      .map((entry) => join(root, "releases", entry.name));
    if (pins.size < 2) {
      const older = await Promise.all(
        entries
          .filter((path) => !pins.has(path))
          .map(async (path) => ({ path, time: (await lstat(path)).mtimeMs })),
      );
      older.sort((a, b) => b.time - a.time);
      if (older[0]) pins.add(older[0].path);
    }
    return await pruneStorageEntries(root, entries, {
      ...options,
      keep: 0,
      maxAgeMs: 0,
      pinned: (path) => pins.has(path),
    });
  } finally {
    await release();
  }
}

export async function pruneAudits(repository, referenceText, options) {
  const root = join(repository, "artifacts/leveling/audits");
  const groups = new Map();
  async function walk(directory) {
    for (const entry of await children(directory)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /^campaign-xp-audit-[a-f0-9]{16}\.json$/.test(entry.name)) {
        const workflow = relative(root, directory).replace(/^\d{4}-?\d{2}-?\d{2}\//, "");
        const group = groups.get(workflow) ?? [];
        group.push(path);
        groups.set(workflow, group);
      }
    }
  }
  await walk(root);
  const results = [];
  for (const [workflow, entries] of groups) {
    if (
      /(?:^|\/)(?:[^/]*(?:approved|published|reviewed|final|reference)[^/]*)(?:\/|$)/i.test(
        workflow,
      )
    )
      continue;
    results.push(
      await pruneStorageEntries(repository, entries, {
        ...options,
        keep: 3,
        graceMs: day,
        pinned: async (path) =>
          referenceText.includes(basename(path)) ||
          referenceText.includes(relative(repository, path)) ||
          (await approvedAudit(path)),
      }),
    );
  }
  return results;
}

async function pruneSnapshots(repository, referenceText, guardianStatus, options) {
  const results = [];
  // Only numeric, generated game-build directories are eligible. Root evidence,
  // arbitrary extraction directories and all migration backups are outside this policy.
  for (const relativeRoot of [
    "artifacts/local-media",
    "artifacts/world-snapshots",
    "artifacts/local-world/world-snapshots",
  ]) {
    const root = join(repository, relativeRoot);
    for (const product of await children(root)) {
      if (!product.isDirectory() || !/^[a-z0-9_]+$/.test(product.name)) continue;
      const productRoot = join(root, product.name);
      const entries = (await children(productRoot))
        .filter((entry) => entry.isDirectory() && /^\d{5,8}$/.test(entry.name))
        .map((entry) => join(productRoot, entry.name));
      const newest = [...entries]
        .sort((a, b) => Number(basename(b)) - Number(basename(a)))
        .slice(0, 2);
      results.push(
        await pruneStorageEntries(repository, entries, {
          ...options,
          keep: 0,
          maxAgeMs: 0,
          graceMs: day,
          pinned: (path) =>
            newest.includes(path) ||
            (guardianStatus?.product === product.name &&
              Number(basename(path)) === guardianStatus.buildNumber) ||
            referenceText.includes(relative(repository, path)),
        }),
      );
    }
  }
  const catalogRoot = join(repository, "artifacts/local-catalog");
  const catalogs = (await children(catalogRoot))
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{12}$/.test(entry.name))
    .map((entry) => join(catalogRoot, entry.name));
  results.push(
    await pruneStorageEntries(repository, catalogs, {
      ...options,
      keep: 2,
      graceMs: day,
      pinned: (path) =>
        referenceText.includes(basename(path)) ||
        guardianStatus?.manifestPath?.startsWith(path + "/"),
    }),
  );
  return results;
}

export async function maintainStorage({
  repository = resolve(import.meta.dirname, ".."),
  home = homedir(),
  dryRun = true,
  active,
  now = Date.now(),
  full = true,
} = {}) {
  repository = await realpath(repository);
  const activePath = active ?? (await storageActivity());
  const options = { dryRun, active: activePath, now };
  const stateDirectory = join(repository, ".cache/storage-maintenance");
  await safeStoragePath(repository, stateDirectory);
  await mkdir(stateDirectory, { recursive: true });
  const release = await acquireStorageLock(join(stateDirectory, "cleanup.lock"));
  if (!release) return { skipped: "cleanup active", removedBytes: 0 };
  try {
    const results = [];
    const previews = (await children(join(repository, "apps/web")))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(".next-"))
      .map((entry) => join(repository, "apps/web", entry.name));
    results.push(
      await pruneStorageEntries(repository, previews, {
        ...options,
        keep: 0,
        maxBytes: 2 * 1024 ** 3,
        maxAgeMs: 7 * day,
      }),
    );
    results.push(await pruneGuardianReleases(home, options));
    if (full) {
      const references = await storageReferences(repository);
      const guardian = join(home, "Library/Application Support/WowTraderCatalogGuardian");
      const status = await optionalJson(join(guardian, "status.json"));
      results.push(...(await pruneAudits(repository, references, options)));
      results.push(...(await pruneSnapshots(repository, references, status, options)));
      const guardianWork = join(guardian, "work");
      if (await optionalStat(guardianWork)) {
        const releaseGuardian = await acquireStorageLock(join(guardian, "guardian.lock"));
        if (releaseGuardian) {
          try {
            const currentStatus = await optionalJson(join(guardian, "status.json"));
            results.push(
              ...(await pruneSnapshots(guardianWork, references, currentStatus, options)),
            );
          } finally {
            await releaseGuardian();
          }
        }
      }
      const simulation = join(
        repository,
        "artifacts/forever-simulator/optimization/simulation-cache",
      );
      if (await safeStoragePath(repository, simulation)) {
        if (activePath(simulation))
          results.push({ skipped: "simulation files open", removedBytes: 0 });
        else results.push(await pruneSimulationCache(simulation, { dryRun, now, intervalMs: 0 }));
      }
    }
    return {
      dryRun,
      results,
      removedBytes: results.reduce((sum, item) => sum + (item.removedBytes ?? 0), 0),
    };
  } finally {
    await release();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--dry-run", "--quick"].includes(arg)))
    throw new Error("Usage: storage-retention.mjs [--apply|--dry-run] [--quick]");
  const result = await maintainStorage({
    dryRun: !args.includes("--apply"),
    full: !args.includes("--quick"),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
