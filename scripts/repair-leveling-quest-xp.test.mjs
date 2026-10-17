import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";

const exec = promisify(execFile);
const script = resolve("scripts/repair-leveling-quest-xp.mjs");
async function stage(root, records) {
  await mkdir(join(root, "quest-xp/records"), { recursive: true });
  const entries = [];
  for (const { id, status } of records) {
    const capturedAt = new Date().toISOString();
    const record = {
      schema: "quest-xp-evidence.v1",
      parserVersion: "wowhead-quest-xp-20261014-v1",
      game: "forever",
      kind: "quest",
      id,
      name: `Quest ${id}`,
      sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
      sourceSha256: "a".repeat(64),
      capturedAt,
      questLevel: 15,
      minimumLevel: 10,
      fullXp: status === "available" ? 1000 : null,
      referenceBaseXp: null,
      pageMultiplier: null,
      rendererRevision: "quest-5f36c4ad-core-52d4f803",
      xpByLevel: [],
      status,
      issues: status === "unknown" ? ["unverified_quest_xp_renderer_revision"] : [],
    };
    const raw = `${JSON.stringify(record)}\n`,
      sha256 = createHash("sha256").update(raw).digest("hex");
    await writeFile(join(root, "quest-xp/records", `${sha256}.json`), raw);
    entries.push({ game: "forever", id, capturedAt, sha256 });
  }
  await writeFile(
    join(root, "quest-xp/index.json"),
    JSON.stringify({
      schema: "quest-xp-index.v1",
      publishedAt: new Date().toISOString(),
      records: entries,
    }),
  );
}

test("recovery queue preserves the original cohort, deduplicates new unknowns and reports actual resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "quest-xp-repair-tool-"));
  try {
    const baseline = join(root, "baseline"),
      rewards = join(root, "current"),
      destination = join(root, "queues");
    await stage(baseline, [
      { id: 1, status: "unknown" },
      { id: 2, status: "unknown" },
      { id: 3, status: "available" },
    ]);
    await stage(rewards, [
      { id: 1, status: "available" },
      { id: 2, status: "unknown" },
      { id: 3, status: "available" },
      { id: 4, status: "unknown" },
    ]);
    const flags = ["--baseline", baseline, "--rewards", rewards, "--expected-unknown", "2"];
    const { stdout } = await exec(process.execPath, [
      script,
      "prepare",
      ...flags,
      "--destination",
      destination,
    ]);
    const report = JSON.parse(stdout);
    assert.deepEqual(
      {
        total: report.cohort.total,
        resolved: report.cohort.resolved,
        remaining: report.cohort.remaining,
      },
      { total: 2, resolved: 1, remaining: 1 },
    );
    assert.deepEqual(
      JSON.parse(await readFile(report.queue.path, "utf8")).map((task) => task.id),
      [1, 2, 4],
    );
    await assert.rejects(
      exec(process.execPath, [script, "prepare", ...flags, "--destination", destination]),
      /EEXIST/,
    );
    const status = JSON.parse((await exec(process.execPath, [script, "status", ...flags])).stdout);
    assert.equal(status.current.available, 2);
    assert.deepEqual(
      status.cohort.unresolved.map((quest) => quest.id),
      [2],
    );
    await assert.rejects(
      exec(process.execPath, [
        script,
        "status",
        "--baseline",
        baseline,
        "--rewards",
        rewards,
        "--expected-unknown",
        "298",
      ]),
      /cohort mismatch/,
    );
    const index = JSON.parse(await readFile(join(rewards, "quest-xp/index.json"), "utf8"));
    await writeFile(join(rewards, "quest-xp/records", `${index.records[0].sha256}.json`), "{}");
    await assert.rejects(exec(process.execPath, [script, "status", ...flags]), /checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
