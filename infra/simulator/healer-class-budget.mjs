import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import process from "node:process";

export const healerClassLimitMs = 24 * 60 * 60 * 1000;
const classes = new Set(["priest", "druid", "paladin", "shaman"]);

/** @param {object} record @param {number} now @returns {{deadlineAt:string,remainingMs:number,expired:boolean}} */
export function inspectHealerClassBudget(record, now = Date.now()) {
  assert.equal(record.schema, "kfc-healer-class-budget.v1");
  assert(classes.has(record.classSlug));
  const started = Date.parse(record.startedAt),
    deadline = Date.parse(record.deadlineAt);
  assert(
    Number.isSafeInteger(now) && Number.isSafeInteger(started) && started > 0 && now >= started,
  );
  assert.equal(
    deadline - started,
    healerClassLimitMs,
    "Never reset or extend a healer class deadline",
  );
  assert.equal(record.maxDurationMs, healerClassLimitMs);
  assert(Array.isArray(record.runs) && record.runs.length <= 64);
  const ids = new Set();
  for (const run of record.runs) {
    assert(typeof run.id === "string" && !ids.has(run.id));
    ids.add(run.id);
    assert(/^[a-z][a-z0-9-]{0,63}$/.test(run.phase));
    assert(/^[a-f0-9]{64}$/.test(run.inputSha256));
    assert(
      Number.isSafeInteger(run.startedAtMs) &&
        run.startedAtMs >= started &&
        run.startedAtMs < deadline,
    );
    assert(
      ["running", "succeeded", "failed", "interrupted", "deadline-reached"].includes(run.status),
    );
    if (run.status === "running") assert.equal(run.finishedAtMs, undefined);
    else assert(Number.isSafeInteger(run.finishedAtMs) && run.finishedAtMs >= run.startedAtMs);
  }
  return {
    deadlineAt: record.deadlineAt,
    remainingMs: Math.max(0, deadline - now),
    expired: now >= deadline,
  };
}

/** Separate healer clock; the original DPS/tank budget files are never read or changed.
 * Callers must enforce assertActive before jobs and cancel their workers at deadlineAt.
 * @param {string} root @param {{classSlug:string,phase:string,inputSha256:string}} options
 * @returns {Promise<{deadlineAt:string,recordPath:string,assertActive:()=>void,finish:(status:'succeeded'|'failed'|'interrupted'|'deadline-reached')=>Promise<void>}>}
 */
export async function startHealerClassRun(root, { classSlug, phase, inputSha256 }) {
  assert(isAbsolute(root) && classes.has(classSlug));
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(phase) && /^[a-f0-9]{64}$/.test(inputSha256));
  const prefix = "artifacts/forever-simulator/optimization/healer-class-budgets/",
    directory = join(root, prefix);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, classSlug + ".json"),
    lock = join(directory, classSlug + ".lock"),
    owner = { pid: process.pid, nonce: randomUUID() };
  await writeFile(lock, JSON.stringify(owner) + "\n", { flag: "wx", mode: 0o600 });
  let released = false;
  async function release() {
    assert.deepEqual(
      JSON.parse(await readFile(lock)),
      owner,
      "Do not release another healer run's lock",
    );
    await unlink(lock);
    released = true;
  }
  try {
    let record;
    try {
      record = JSON.parse(await readFile(path));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const now = Date.now();
    if (!record) {
      record = {
        schema: "kfc-healer-class-budget.v1",
        classSlug,
        startedAt: new Date(now).toISOString(),
        deadlineAt: new Date(now + healerClassLimitMs).toISOString(),
        maxDurationMs: healerClassLimitMs,
        runs: [],
      };
      await writeFile(path, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    }
    assert.equal(record.classSlug, classSlug);
    assert(
      !inspectHealerClassBudget(record).expired,
      "Healer class24h limit reached; preserve results and move on",
    );
    const previous = record.runs.filter((run) => run.phase === phase);
    assert(
      !previous.some((run) => run.status === "running"),
      "Resolve the prior healer run before resuming",
    );
    assert(
      !previous.some((run) => run.status === "succeeded"),
      "Completed healer phase cannot be restarted",
    );
    for (const run of previous)
      assert.equal(run.inputSha256, inputSha256, "Resume the same frozen healer phase");
    assert(record.runs.length < 64);
    const run = {
      id: randomUUID(),
      phase,
      inputSha256,
      startedAtMs: Date.now(),
      status: "running",
    };
    assert(run.startedAtMs < Date.parse(record.deadlineAt));
    record.runs.push(run);
    async function save() {
      inspectHealerClassBudget(record);
      const pending = path + "." + owner.nonce + ".pending";
      await writeFile(pending, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      await rename(pending, path);
    }
    await save();
    return {
      deadlineAt: record.deadlineAt,
      recordPath: prefix + classSlug + ".json",
      assertActive: () => {
        assert(!released && run.status === "running");
        assert(!inspectHealerClassBudget(record).expired, "Healer class24h limit reached");
      },
      finish: async (status) => {
        assert(!released && run.status === "running");
        assert(["succeeded", "failed", "interrupted", "deadline-reached"].includes(status));
        run.finishedAtMs = Date.now();
        run.status =
          run.finishedAtMs >= Date.parse(record.deadlineAt) ? "deadline-reached" : status;
        await save();
        await release();
      },
    };
  } catch (error) {
    if (!released) await release();
    throw error;
  }
}
