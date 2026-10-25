import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout } from "node:timers";
import {
  assertDruidHealingJob as assertHealingJob,
  parseDruidHealingJobReply as parseHealingJobReply,
} from "./druid-healing-protocol.mjs";

class DruidHealingNativeWorker {
  constructor(binary, cwd, timeoutMs, binarySha256) {
    this.binarySha256 = binarySha256;
    this.timeoutMs = timeoutMs;
    this.pending = null;
    this.closed = false;
    this.stderr = "";
    this.child = spawn(binary, [], {
      cwd,
      env: { ...process.env, GOMAXPROCS: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (bytes) => {
      this.stderr = (this.stderr + bytes).slice(-6000);
    });
    this.child.stdin.on("error", (error) => this.terminate(error));
    this.child.on("error", (error) => this.terminate(error));
    this.child.on("exit", (code) =>
      this.terminate(new Error(`Healing worker exited ${code}: ${this.stderr}`)),
    );
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const pending = this.pending;
      if (!pending) {
        this.terminate(new Error("Unexpected healing worker output"));
        return;
      }
      let reply;
      try {
        reply = parseHealingJobReply(line, pending.id, pending.detail);
      } catch (error) {
        this.terminate(error);
        return;
      }
      clearTimeout(pending.timer);
      this.pending = null;
      if (reply.status === "error") {
        const error = new Error(reply.error.message);
        error.code = reply.error.code;
        pending.reject(error);
      } else pending.resolve(reply);
    });
  }
  run(job) {
    assertHealingJob(job);
    assert(!this.closed, "Healing worker is closed");
    assert(!this.pending, "Healing worker already has a pending job");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.terminate(new Error(`Healing job ${job.id} exceeded ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
      this.pending = { id: job.id, detail: job.detail, timer, resolve, reject };
      this.child.stdin.write(JSON.stringify(job) + "\n");
    });
  }
  terminate(error = new Error("Healing simulation interrupted")) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
    if (!this.closed) {
      this.closed = true;
      this.child.kill();
    }
  }
  close() {
    if (this.pending) this.terminate(new Error("Healing worker closed during a job"));
    else if (!this.closed) {
      this.closed = true;
      this.child.stdin.end();
    }
  }
}

/** Open checksum-verified healing workers without altering any compiled engine.
 * @param {string} binary @param {string} cwd @param {string} expectedSha256
 * @param {{workerCount?: number, timeoutMs?: number}} options
 * @returns {Promise<DruidHealingNativeWorker[]>}
 */
export async function openDruidHealingNativeRunners(binary, cwd, expectedSha256, options = {}) {
  const { workerCount = 1, timeoutMs = 180000 } = options;
  assert(Number.isInteger(workerCount) && workerCount >= 1 && workerCount <= 6);
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 1800000);
  assert(/^[a-f0-9]{64}$/.test(expectedSha256));
  assert.equal(
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex"),
    expectedSha256,
    "Healing engine changed",
  );
  return Array.from(
    { length: workerCount },
    () => new DruidHealingNativeWorker(binary, cwd, timeoutMs, expectedSha256),
  );
}
