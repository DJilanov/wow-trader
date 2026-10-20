import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as pause } from "node:timers/promises";

export function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

async function existing(path) {
  return lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

/** Exclusive coordination; an unreadable or malformed lock is never reclaimed. */
export async function acquireStorageLock(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx", 0o600);
      const identity = await handle.stat();
      try {
        await handle.writeFile(String(process.pid));
      } finally {
        await handle.close();
      }
      return async () => {
        const current = await existing(path);
        if (current?.ino === identity.ino && current.dev === identity.dev) await unlink(path);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const identity = await existing(path);
      if (!identity) continue;
      if (!identity.isFile()) return null;
      const contents = await readFile(path, "utf8").catch((readError) => {
        if (readError.code === "ENOENT") return null;
        throw readError;
      });
      if (contents === null) continue;
      const owner = Number(contents);
      if (processExists(owner)) return null;
      const current = await existing(path);
      if (current?.ino !== identity.ino || current.dev !== identity.dev) return null;
      await unlink(path);
    }
  }
  return null;
}

/** Readers/writers announce themselves before touching files that can be evicted. */
export async function withSimulationCacheAccess(directory, operation) {
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Symlinked simulation cache");
  const root = await realpath(directory);
  const gate = join(root, ".retention.lock");
  const lease = join(root, `.active-${process.pid}-${randomUUID()}`);
  const deadline = Date.now() + 30 * 60_000;
  while (true) {
    const release = await acquireStorageLock(gate);
    if (release) {
      try {
        await writeFile(lease, "", { flag: "wx", mode: 0o600 });
      } finally {
        await release();
      }
      break;
    }
    if (Date.now() >= deadline) throw new Error("Simulation cache cleanup lock timed out");
    await pause(100);
  }
  try {
    return await operation();
  } finally {
    await unlink(lease);
  }
}

export async function pruneSimulationCache(
  directory,
  {
    maxBytes = 2 * 1024 ** 3,
    maxFiles = 500_000,
    maxAgeMs = 7 * 86_400_000,
    graceMs = 60_000,
    intervalMs = 3_600_000,
    now = Date.now(),
    dryRun = false,
  } = {},
) {
  const result = { removedFiles: 0, removedBytes: 0, skipped: null, samples: [] };
  const directoryStat = await existing(directory);
  if (!directoryStat) return result;
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
    throw new Error("Refusing a redirected simulation cache");
  const root = await realpath(directory);
  const lastPath = join(root, ".retention-last");
  const lastInfo = await existing(lastPath);
  if (lastInfo && !lastInfo.isFile()) throw new Error("Invalid simulation retention timestamp");
  const last = await readFile(lastPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "0";
    throw error;
  });
  if (!dryRun && now - Number(last) < intervalMs) return { ...result, skipped: "interval" };
  const release = await acquireStorageLock(join(root, ".retention.lock"));
  if (!release) return { ...result, skipped: "cleanup active" };
  try {
    const top = await readdir(root, { withFileTypes: true });
    for (const entry of top) {
      const match = /^\.active-(\d+)-[a-f0-9-]+$/.exec(entry.name);
      if (!match) continue;
      if (processExists(Number(match[1]))) return { ...result, skipped: "simulation active" };
      if (!dryRun && entry.isFile()) await unlink(join(root, entry.name));
    }
    const files = [];
    let total = 0;
    for (const entry of top) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      const fingerprint = join(root, entry.name);
      const names = (await readdir(fingerprint, { withFileTypes: true }))
        .filter((child) => child.isFile() && /^[a-f0-9]{64}\.json$/.test(child.name))
        .map((child) => child.name);
      for (let offset = 0; offset < names.length; offset += 32) {
        const batch = await Promise.all(
          names.slice(offset, offset + 32).map(async (name) => {
            const path = join(fingerprint, name);
            const stat = await existing(path);
            if (!stat?.isFile() || stat.isSymbolicLink()) return null;
            const bytes = stat.blocks === undefined ? stat.size : stat.blocks * 512;
            return {
              path,
              bytes,
              ino: stat.ino,
              dev: stat.dev,
              size: stat.size,
              time: stat.mtimeMs,
            };
          }),
        );
        for (const file of batch) {
          if (!file) continue;
          total += file.bytes;
          files.push(file);
        }
      }
    }
    let count = files.length;
    files.sort((a, b) => a.time - b.time || a.path.localeCompare(b.path));
    for (const file of files) {
      if (now - file.time < graceMs) continue;
      if (total <= maxBytes && count <= maxFiles && now - file.time <= maxAgeMs) continue;
      const current = await existing(file.path);
      if (
        !current?.isFile() ||
        current.ino !== file.ino ||
        current.dev !== file.dev ||
        current.size !== file.size ||
        current.mtimeMs !== file.time
      )
        continue;
      if (!dryRun) await unlink(file.path);
      total -= file.bytes;
      count--;
      result.removedFiles++;
      result.removedBytes += file.bytes;
      if (result.samples.length < 10) result.samples.push(file.path);
    }
    if (!dryRun) {
      const current = await existing(lastPath);
      if (current && !current.isFile()) throw new Error("Invalid simulation retention timestamp");
      await writeFile(lastPath, String(now), { mode: 0o600 });
    }
    return { ...result, remainingBytes: total, remainingFiles: count };
  } finally {
    await release();
  }
}
