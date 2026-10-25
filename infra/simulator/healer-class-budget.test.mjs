import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  healerClassLimitMs,
  inspectHealerClassBudget,
  startHealerClassRun,
} from "./healer-class-budget.mjs";
const args = { classSlug: "priest", phase: "reference-calibration", inputSha256: "a".repeat(64) };
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), "kfc-healer-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("healer budget is separate from the original class ledger and keeps one deadline across phases", async (t) => {
  const root = await workspace(t),
    old = join(
      root,
      "artifacts/forever-simulator/optimization/first-pass-class-budgets/priest.json",
    );
  await mkdir(join(old, ".."), { recursive: true });
  await writeFile(old, "preserved expired DPS evidence\n");
  const first = await startHealerClassRun(root, args);
  first.assertActive();
  const deadline = first.deadlineAt;
  await first.finish("succeeded");
  assert.throws(() => first.assertActive());
  await assert.rejects(startHealerClassRun(root, args), /Completed healer phase/);
  const next = await startHealerClassRun(root, { ...args, phase: "gear" });
  assert.equal(next.deadlineAt, deadline);
  await next.finish("interrupted");
  assert.equal(await readFile(old, "utf8"), "preserved expired DPS evidence\n");
});
test("an interrupted phase resumes only its exact inputs without resetting the clock", async (t) => {
  const root = await workspace(t),
    first = await startHealerClassRun(root, args),
    deadline = first.deadlineAt;
  await first.finish("interrupted");
  await assert.rejects(
    startHealerClassRun(root, { ...args, inputSha256: "b".repeat(64) }),
    /same frozen/,
  );
  const resumed = await startHealerClassRun(root, args);
  assert.equal(resumed.deadlineAt, deadline);
  await resumed.finish("succeeded");
});
test("concurrent runs cannot claim one class budget", async (t) => {
  const root = await workspace(t),
    first = await startHealerClassRun(root, args);
  await assert.rejects(
    startHealerClassRun(root, { ...args, phase: "gear" }),
    (error) => error.code === "EEXIST",
  );
  first.assertActive();
  await first.finish("failed");
});
test("expired or edited deadlines fail closed", async (t) => {
  const root = await workspace(t),
    first = await startHealerClassRun(root, args);
  await first.finish("succeeded");
  const path = join(root, first.recordPath),
    record = JSON.parse(await readFile(path)),
    start = Date.parse(record.startedAt);
  assert.equal(inspectHealerClassBudget(record, start + healerClassLimitMs).expired, true);
  assert.throws(
    () =>
      inspectHealerClassBudget({
        ...record,
        deadlineAt: new Date(start + healerClassLimitMs + 1).toISOString(),
      }),
    /Never reset/,
  );
  record.startedAt = new Date(start - healerClassLimitMs - 1000).toISOString();
  record.deadlineAt = new Date(start - 1000).toISOString();
  record.runs = [];
  await writeFile(path, JSON.stringify(record));
  await assert.rejects(startHealerClassRun(root, { ...args, phase: "gear" }), /24h limit/);
});
