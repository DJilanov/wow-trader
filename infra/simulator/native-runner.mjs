import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout } from "node:timers";
import { promisify } from "node:util";
import process from "node:process";
import { prepareItemEffectFixes } from "./item-effects-adapter.mjs";
import { prepareDungeonManaModels } from "./dungeon-set-mana-adapter.mjs";
import { assertDrakkisathDatabase } from "./drakkisath-trinkets.mjs";
import { assertSimulatorWorkspaceAccess } from "./simulator-workspace.mjs";

export function nativeSimulationTimeout(iterations) {
  assert(Number.isSafeInteger(iterations) && iterations > 0, "Invalid simulation iteration count");
  return Math.min(1800000, Math.max(180000, Math.ceil(iterations / 20000) * 180000));
}

class NativeWorker {
  constructor(binary, upstream, binarySha256) {
    this.binarySha256 = binarySha256;
    this.child = spawn(binary, [], {
      cwd: upstream,
      env: { ...process.env, GOMAXPROCS: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.pending = null;
    this.stderr = "";
    this.child.stderr.on("data", (bytes) => {
      this.stderr = (this.stderr + bytes).slice(-6000);
    });
    this.child.stdin.on("error", (error) => this.fail(error));
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      clearTimeout(pending.timer);
      try {
        const result = JSON.parse(line);
        if (
          result.error ||
          result.id !== pending.id ||
          !Number.isFinite(result.dps) ||
          result.dps <= 0
        )
          throw new Error(result.error || "Invalid simulation response");
        pending.resolve(result);
      } catch (error) {
        pending.reject(new Error(`${error.message}\n${this.stderr}`));
      }
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code) =>
      this.fail(new Error(`Simulation worker exited ${code}: ${this.stderr}`)),
    );
  }
  fail(error) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }
  run(input) {
    assert(!this.pending);
    const timeout = nativeSimulationTimeout(input.iterations);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(
          new Error(
            `Simulation exceeded ${timeout / 1000} seconds: job ${input.id}; items ${(input.gear ?? []).map((item) => item.id || 0).join(",")}`,
          ),
        );
        this.child.kill();
      }, timeout);
      this.pending = { id: input.id, resolve, reject, timer };
      this.child.stdin.write(JSON.stringify(input) + "\n");
    });
  }
  close() {
    this.child.stdin.end();
  }
  terminate() {
    this.fail(new Error("Simulation interrupted"));
    this.child.kill();
  }
}

export async function createNativeRunners(
  root,
  workerCount = Math.min(6, Math.max(1, availableParallelism() - 2)),
) {
  assert(Number.isInteger(workerCount) && workerCount >= 1 && workerCount <= 6);
  await assertSimulatorWorkspaceAccess(root);
  const upstream = join(root, ".cache/forever-sim-upstream");
  await prepareItemEffectFixes(root, upstream);
  await prepareDungeonManaModels(root, upstream);
  assertDrakkisathDatabase(
    JSON.parse(await readFile(join(upstream, "assets/database/db.json"), "utf8")),
  );
  const directory = join(upstream, "cmd/kfcprebis");
  await mkdir(directory, { recursive: true });
  await copyFile(join(root, "infra/simulator/prebis-runner.go"), join(directory, "main.go"));
  const binary = join(root, ".cache/simulator-toolchain/bin/kfc-prebis");
  await promisify(execFile)(
    join(root, ".cache/simulator-toolchain/go/bin/go"),
    ["build", "-tags", "with_db", "-o", binary, "./cmd/kfcprebis"],
    { cwd: upstream, timeout: 180000, env: { ...process.env, GOTOOLCHAIN: "local" } },
  );
  const binarySha256 = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  return Array.from(
    { length: workerCount },
    () => new NativeWorker(binary, upstream, binarySha256),
  );
}
