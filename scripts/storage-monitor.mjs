import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { maintainStorage } from "./storage-retention.mjs";
import { acquireStorageLock, processExists } from "../infra/simulator/cache-retention.mjs";

const execute = promisify(execFile);
const day = 86_400_000;
const gib = 1024 ** 3;

export function deletedOpenTotals(output) {
  const files = new Map();
  let device = "",
    inode = "",
    size = 0;
  const flush = () => {
    if (device && inode)
      files.set(`${device}:${inode}`, Math.max(size, files.get(`${device}:${inode}`) ?? 0));
  };
  for (const line of output.split("\n")) {
    if (line.startsWith("f") || line.startsWith("p")) {
      flush();
      device = "";
      inode = "";
      size = 0;
    } else if (line.startsWith("D")) device = line.slice(1);
    else if (line.startsWith("i")) inode = line.slice(1);
    else if (line.startsWith("s")) size = Number(line.slice(1)) || 0;
  }
  flush();
  return {
    files: files.size,
    logicalBytes: [...files.values()].reduce((sum, bytes) => sum + bytes, 0),
  };
}

export function storageAlert(previous, current) {
  const elapsed = previous ? current.time - previous.time : 0;
  const lossPerHour =
    elapsed >= 30 * 60_000 && elapsed <= 2 * 3_600_000
      ? ((previous.freeBytes - current.freeBytes) * 3_600_000) / elapsed
      : 0;
  return {
    alert: current.freeBytes < 20 * gib || lossPerHour > gib,
    lossPerHour: Math.max(0, lossPerHour),
    freeGiB: Number((current.freeBytes / gib).toFixed(1)),
  };
}

async function jsonOr(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.pending`;
  await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temporary, path);
}

/** Match producers that can still be writing between individual file operations. */
export function developmentBusy(commands) {
  return commands
    .split("\n")
    .some((command) =>
      /(?:pnpm|npm|yarn)(?:\.c?js)?\s+(?:install|add|update|rebuild|build|test|exec|--filter)|(?:^|\/)(?:turbo|tsc|vitest|dotnet)(?:\s|$)|scripts\/(?:optimize-simulator|update-simulator|capture-simulator|audit-leveling|prepare-leveling|install-catalog-guardian|run-simulator|leveling-.*queue|recipe-.*queue)|catalog-guardian\.mjs/.test(
        command,
      ),
    );
}

async function pruneAbandonedCrawls(docker, now) {
  const { stdout } = await execute(
    docker,
    [
      "ps",
      "-aq",
      "--filter",
      "label=online.kfcguild.storage=browsertrix-workspace",
      "--filter",
      "status=exited",
    ],
    { timeout: 20_000 },
  );
  const ids = stdout.trim().split(/\s+/).filter(Boolean);
  const removed = [];
  for (const id of ids) {
    const details = JSON.parse(
      (await execute(docker, ["inspect", id], { timeout: 20_000 })).stdout,
    )[0];
    const pid = Number(details.Config.Labels["online.kfcguild.owner-pid"]);
    if (
      details.State.Running ||
      processExists(pid) ||
      now - Date.parse(details.State.FinishedAt) < 3_600_000
    )
      continue;
    // No --force: a concurrently restarted container must survive.
    await execute(docker, ["rm", id], { timeout: 30_000 });
    removed.push(id);
  }
  return removed;
}

async function folderTotals(repository, home) {
  const folders = {
    projects: join(home, "work"),
    wowArtifacts: join(repository, "artifacts"),
    guardian: join(home, "Library/Application Support/WowTraderCatalogGuardian"),
    pnpm: join(home, "Library/pnpm/store"),
    docker: join(home, "Library/Containers/com.docker.docker/Data/vms"),
    codex: join(home, ".codex"),
  };
  const totals = {};
  for (const [name, path] of Object.entries(folders)) {
    try {
      const { stdout } = await execute("/usr/bin/du", ["-skx", path], { timeout: 300_000 });
      totals[name] = Number(stdout.split(/\s/, 1)[0]) * 1024;
    } catch (error) {
      totals[name] = { unavailable: error.code ?? "scan failed" };
    }
  }
  return totals;
}

export async function runStorageMonitor({
  repository = resolve(import.meta.dirname, ".."),
  home = homedir(),
  docker = "/usr/local/bin/docker",
  pnpm = join(process.execPath, "../pnpm"),
  cleanup = true,
} = {}) {
  const stateDirectory = join(home, "Library/Logs/DeveloperStorageMaintenance");
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const release = await acquireStorageLock(join(stateDirectory, "monitor.lock"));
  if (!release) return { skipped: "monitor active" };
  try {
    const now = Date.now();
    const statePath = join(stateDirectory, "state.json");
    const state = await jsonOr(statePath, {});
    const errors = [];
    const filesystem = await statfs(home);
    const sample = { time: now, freeBytes: filesystem.bavail * filesystem.bsize };
    try {
      const result = await execute("/usr/sbin/lsof", ["-nP", "+L1", "-FpfDis"], {
        timeout: 60_000,
        maxBuffer: 64 * 1024 ** 2,
      });
      sample.deletedOpen = deletedOpenTotals(result.stdout);
    } catch (error) {
      if (error.code === 1 && !error.stdout) sample.deletedOpen = { files: 0, logicalBytes: 0 };
      else errors.push(`Deleted-file scan: ${error.code ?? error.message}`);
    }
    const alert = storageAlert(state.previous, sample);
    if (alert.alert && (!state.alertAt || now - state.alertAt > 6 * 3_600_000)) {
      const message = `Free space: ${alert.freeGiB} GiB. Recent loss: ${(alert.lossPerHour / gib).toFixed(1)} GiB/hour.`;
      try {
        await execute(
          "/usr/bin/osascript",
          ["-e", `display notification ${JSON.stringify(message)} with title "Disk space monitor"`],
          { timeout: 15_000 },
        );
        state.alertAt = now;
      } catch (error) {
        errors.push(`Notification: ${error.code ?? error.message}`);
      }
    }
    let busy = true;
    try {
      const { stdout } = await execute("/bin/ps", ["-axo", "command="], {
        maxBuffer: 8 * 1024 ** 2,
        timeout: 15_000,
      });
      busy = developmentBusy(stdout);
    } catch (error) {
      errors.push(`Idle check: ${error.code ?? error.message}`);
    }
    if (cleanup) {
      try {
        sample.orphanCrawlsRemoved = await pruneAbandonedCrawls(docker, now);
      } catch (error) {
        sample.dockerMaintenance = "unavailable";
        // A stopped Docker daemon is normal; no daemon is started by maintenance.
        if (
          !/Cannot connect|Is the docker daemon running|connect: no such file|connect: connection refused/.test(
            error.stderr ?? "",
          )
        )
          errors.push(`Docker cleanup: ${error.code ?? error.message}`);
      }
      if (!busy && (!state.cleanedAt || now - state.cleanedAt >= day)) {
        try {
          const result = await maintainStorage({ repository, home, dryRun: false });
          sample.cleanup = result;
          if (!result.skipped) state.cleanedAt = now;
        } catch (error) {
          errors.push(`Retention: ${error.message}`);
        }
      }
      if (!busy && (!state.pnpmAt || now - state.pnpmAt >= 7 * day)) {
        try {
          const { stdout } = await execute(pnpm, ["store", "prune"], {
            timeout: 600_000,
            maxBuffer: 1024 ** 2,
          });
          sample.pnpm = stdout.slice(-2000);
          state.pnpmAt = now;
        } catch (error) {
          errors.push(`pnpm pruning: ${error.code ?? error.message}`);
        }
      }
    }
    if (!state.measuredAt || now - state.measuredAt >= day) {
      sample.folders = await folderTotals(repository, home);
      state.measuredAt = now;
    }
    sample.busy = busy;
    sample.errors = errors;
    state.previous = { time: sample.time, freeBytes: sample.freeBytes };
    await atomicJson(statePath, state);
    const historyPath = join(stateDirectory, "history.json");
    const history = await jsonOr(historyPath, []);
    // One sample/hour for 30 days. Detailed removal lists are bounded too.
    if (sample.cleanup?.results) {
      for (const item of sample.cleanup.results) {
        if (item.removed) {
          item.removedCount = item.removed.length;
          item.removed = item.removed.slice(0, 20);
        }
      }
    }
    await atomicJson(historyPath, [...history.slice(-719), sample]);
    return sample;
  } finally {
    await release();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).some((arg) => arg !== "--observe-only"))
    throw new Error("Usage: storage-monitor.mjs [--observe-only]");
  await runStorageMonitor({ cleanup: !process.argv.includes("--observe-only") }).catch((error) => {
    process.stderr.write(`[storage-monitor] ${error.message}\n`);
    process.exitCode = 1;
  });
}
