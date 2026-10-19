import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = resolve("scripts/leveling-evidence-crawl-queue.mjs");

test("builds a deduplicated quest-page queue without claiming in-game evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-evidence-queue-"));
  try {
    const backlog = join(root, "backlog.json");
    const base = join(root, "base.json");
    const queue = join(root, "queue.json");
    const report = join(root, "report.json");
    await writeFile(
      backlog,
      JSON.stringify({
        schema: "campaign-evidence-backlog.v1",
        targetBuild: 70450,
        archiveSha256: "a".repeat(64),
        tasks: [
          {
            key: "quest-lifecycle-unverified:1053",
            code: "quest-lifecycle-unverified",
            questId: 1053,
          },
          {
            key: "personal-eligibility-unverified:1053",
            code: "personal-eligibility-unverified",
            questId: 1053,
          },
          {
            key: "reward-historical-estimate:977",
            code: "reward-historical-estimate",
            questId: 977,
          },
          { key: "named-target-unverified:19", code: "named-target-unverified", questId: 19 },
          {
            key: "adaptive-grind-unmeasured:route",
            code: "adaptive-grind-unmeasured",
            questId: null,
          },
        ],
      }),
    );
    await writeFile(base, JSON.stringify([{ game: "forever", kind: "quest", id: 977 }]));
    const output = JSON.parse(
      (
        await exec(process.execPath, [
          script,
          `--backlog=${backlog}`,
          `--base-queue=${base}`,
          `--queue=${queue}`,
          `--report=${report}`,
        ])
      ).stdout,
    );
    assert.deepEqual(JSON.parse(await readFile(queue, "utf8")), [
      { game: "forever", kind: "quest", id: 977 },
      { game: "forever", kind: "quest", id: 1053 },
    ]);
    const plan = JSON.parse(await readFile(report, "utf8"));
    assert.deepEqual(plan.summary, {
      sourceEvidenceTasks: 3,
      sourceEvidenceQuests: 2,
      baseQueueQuests: 1,
      alreadyInBaseQueue: 1,
      addedToBaseQueue: 1,
      mergedQueueQuests: 2,
      byEvidenceCode: {
        "pickup-level-conflict": 0,
        "source-gate-conflict": 0,
        "quest-lifecycle-unverified": 1,
        "personal-eligibility-unverified": 1,
        "reward-unresolved": 0,
        "reward-historical-estimate": 1,
      },
    });
    assert.equal(plan.quests.find((quest) => quest.id === 1053).evidenceCodes.length, 2);
    assert.equal(
      plan.quests.some((quest) => quest.id === 19),
      false,
    );
    assert.equal(output.addedToBaseQueue, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid base queues", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-evidence-queue-invalid-"));
  try {
    const backlog = join(root, "backlog.json");
    const base = join(root, "base.json");
    await writeFile(
      backlog,
      JSON.stringify({
        schema: "campaign-evidence-backlog.v1",
        tasks: [{ key: "reward-unresolved:1", code: "reward-unresolved", questId: 1 }],
      }),
    );
    await writeFile(base, JSON.stringify([{ game: "tbc", kind: "quest", id: 1 }]));
    await assert.rejects(
      exec(process.execPath, [
        script,
        `--backlog=${backlog}`,
        `--base-queue=${base}`,
        `--queue=${join(root, "queue.json")}`,
        `--report=${join(root, "report.json")}`,
      ]),
      /invalid Forever quest task/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
