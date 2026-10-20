import { spawn } from "node:child_process";
import { lstat, readdir, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants } from "node:os";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const gib = 1024 ** 3;

/**
 * @param {string} root
 * @param {{dryRun?: boolean, maxBytes?: number, maxAgeMs?: number, graceMs?: number, now?: number}} options
 * @returns {Promise<{removed: string[], bytes: number}>}
 */
export async function pruneBuildCache(root, options = {}) {
  const {
    dryRun = false,
    maxBytes = 2 * gib,
    maxAgeMs = 7 * 86400000,
    graceMs = 60000,
    now = Date.now(),
  } = options;
  const cache = join(await realpath(root), ".turbo", "cache");
  try {
    if ((await realpath(cache)) !== cache) throw new Error("Refusing a symlinked Turbo cache");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { removed: [], bytes: 0 };
    }
    throw error;
  }
  /** @type {Map<string, {files: {path: string, stat: import('node:fs').Stats}[], size: number, newest: number, unsafe: boolean}>} */
  const groups = new Map();
  for (const name of await readdir(cache)) {
    const match = /^([a-f0-9]{16,64})(?:\.tar\.zst|-(?:meta|manifest)\.json)$/.exec(name);
    if (!match) continue;
    const path = join(cache, name);
    const stat = await lstat(path);
    const group = groups.get(match[1]) ?? { files: [], size: 0, newest: 0, unsafe: false };
    group.files.push({ path, stat });
    group.size += stat.size;
    group.newest = Math.max(group.newest, stat.mtimeMs);
    group.unsafe ||= !stat.isFile();
    groups.set(match[1], group);
  }
  let total = [...groups.values()].reduce((sum, group) => sum + group.size, 0);
  const result = { removed: /** @type {string[]} */ ([]), bytes: 0 };
  for (const [hash, group] of [...groups].sort((a, b) => a[1].newest - b[1].newest)) {
    if (group.unsafe || now - group.newest < graceMs) continue;
    if (total <= maxBytes && now - group.newest <= maxAgeMs) continue;
    // A concurrent Turbo writer may have replaced an archive since the scan.
    const unchanged = await Promise.all(
      group.files.map(async ({ path, stat }) => {
        const current = await lstat(path).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        return (
          current?.isFile() &&
          current.ino === stat.ino &&
          current.size === stat.size &&
          current.mtimeMs === stat.mtimeMs
        );
      }),
    );
    if (unchanged.some((value) => !value)) continue;
    if (!dryRun) {
      for (const { path } of group.files) {
        await unlink(path).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
    total -= group.size;
    result.bytes += group.size;
    result.removed.push(hash);
  }
  return result;
}

/** @param {string[]} args @returns {Promise<number>} */
async function runTurbo(args) {
  const child = spawn(
    process.execPath,
    [join(repositoryRoot, "node_modules/turbo/bin/turbo"), "run", ...args],
    {
      cwd: repositoryRoot,
      stdio: "inherit",
    },
  );
  /** @param {NodeJS.Signals} signal @returns {void} */
  const forward = (signal) => {
    child.kill(signal);
  };
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    return await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) =>
        resolveExit(code ?? (signal ? 128 + constants.signals[signal] : 1)),
      );
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

/** @returns {Promise<void>} */
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--run") {
    if (!args[1]) throw new Error("Expected a Turbo task after --run");
    try {
      process.exitCode = await runTurbo(args.slice(1));
    } finally {
      await clean().catch((error) => {
        process.stderr.write(`[build-cache] Cleanup failed: ${String(error)}\n`);
      });
    }
  } else {
    if (args.some((arg) => arg !== "--dry-run"))
      throw new Error("Expected --dry-run or --run <task>");
    await clean(args.includes("--dry-run"));
  }
}

/** @param {boolean} dryRun @returns {Promise<void>} */
async function clean(dryRun = false) {
  const result = await pruneBuildCache(repositoryRoot, { dryRun });
  process.stdout.write(
    `[build-cache] ${dryRun ? "Would remove" : "Removed"} ${result.removed.length} cache entries (${(result.bytes / gib).toFixed(2)} GiB).\n`,
  );
  // The wrapper is also used in isolated fixtures without the optional macOS policy.
  if (process.platform === "darwin") {
    const policy = join(repositoryRoot, "scripts/storage-retention.mjs");
    const exists = await lstat(policy).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (exists) {
      const { maintainStorage } = await import("./storage-retention.mjs");
      const storage = await maintainStorage({ repository: repositoryRoot, dryRun, full: false });
      process.stdout.write(
        `[storage] ${dryRun ? "Would remove" : "Removed"} ${(storage.removedBytes / gib).toFixed(2)} GiB of inactive previews/releases.\n`,
      );
    }
  }
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  await main().catch((error) => {
    process.stderr.write(`[build-cache] ${String(error)}\n`);
    process.exitCode = 1;
  });
}
