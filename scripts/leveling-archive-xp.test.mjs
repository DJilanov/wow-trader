import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import {
  CHAPTER_REFERENCES,
  CHAPTER_CATALOG_SOURCE,
  parseGuideChapter,
} from "../packages/leveling/dist/index.js";

const exec = promisify(execFile);
const generator = resolve("scripts/leveling-archive-xp-queue.mjs");
const status = resolve("scripts/leveling-archive-xp-status.mjs");
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("complete-archive generator includes both factions, validates every chapter and refuses incomplete imports/overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-full-archive-"));
  try {
    const archive = join(root, "archive"),
      destination = join(root, "queue");
    await mkdir(archive);
    const chapters = [];
    for (const [index, reference] of CHAPTER_REFERENCES.entries()) {
      const id = 100000 + index;
      const guide = parseGuideChapter(
        `step << skip\n.accept ${id}\n.isOnQuest ${id + 1000}`,
        reference.id,
        "a".repeat(64),
        70205,
      );
      const raw = JSON.stringify(guide),
        file = `${reference.id}.json`;
      await writeFile(join(archive, file), raw);
      chapters.push({
        chapterId: reference.id,
        version: guide.version,
        file,
        sha256: hash(raw),
        sourceSha256: guide.sourceSha256,
        stepCount: 1,
        questIds: [id],
      });
    }
    const manifest = {
      schemaVersion: 1,
      parserVersion: "forever-guide-v2",
      publication: "authorized",
      authorizationNote: "Synthetic import test only",
      sourceSha256: CHAPTER_CATALOG_SOURCE.sourceSha256,
      inventorySha256: CHAPTER_CATALOG_SOURCE.inventorySha256,
      targetBuild: 70205,
      chapters,
    };
    await writeFile(join(archive, "manifest.json"), JSON.stringify(manifest));
    const flags = ["--archive", archive, "--destination", destination];
    const report = JSON.parse((await exec(process.execPath, [generator, ...flags])).stdout);
    assert.equal(report.chapters, 157);
    assert.equal(report.sourceSteps, 157);
    assert.ok(report.allianceChapters > 0 && report.hordeChapters > 0);
    const tasks = JSON.parse(await readFile(report.queuePath, "utf8"));
    const ids = new Set(tasks.map((task) => task.id));
    for (let index = 0; index < CHAPTER_REFERENCES.length; index++) {
      assert.ok(ids.has(100000 + index));
      assert.ok(ids.has(101000 + index));
    }
    assert.ok(ids.has(96403), "Known dungeon quest was omitted");
    await assert.rejects(exec(process.execPath, [generator, ...flags]), /EEXIST/);
    const path = join(archive, chapters[0].file),
      original = await readFile(path);
    await writeFile(path, "{}");
    await assert.rejects(exec(process.execPath, [generator, ...flags]), /checksum mismatch/);
    await writeFile(path, original);
    await writeFile(
      join(archive, "manifest.json"),
      JSON.stringify({ ...manifest, chapters: chapters.slice(1) }),
    );
    await assert.rejects(exec(process.execPath, [generator, ...flags]), /Full archive/);
    await writeFile(
      join(archive, "manifest.json"),
      JSON.stringify({ ...manifest, publication: "private-reference" }),
    );
    await assert.rejects(exec(process.execPath, [generator, ...flags]), /authorized archives/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage status distinguishes verified zero, unknown XP and unpublished quests and rejects corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-full-status-"));
  try {
    const queue = join(root, "queue.json"),
      rewards = join(root, "rewards");
    const tasks = [1, 2, 3].map((id) => ({ game: "forever", kind: "quest", id }));
    await writeFile(queue, JSON.stringify(tasks));
    const flags = [
      "--queue",
      queue,
      "--rewards",
      rewards,
      "--expected-sha256",
      hash(JSON.stringify(tasks)),
    ];
    const pending = JSON.parse((await exec(process.execPath, [status, ...flags])).stdout);
    assert.equal(pending.notPublished, 3);
    assert.equal(pending.complete, false);
    await mkdir(join(rewards, "quest-xp/records"), { recursive: true });
    const entries = [];
    for (const id of [1, 2]) {
      const record = {
        schema: "quest-xp-evidence.v1",
        parserVersion: "wowhead-quest-xp-20261015-v2",
        game: "forever",
        kind: "quest",
        id,
        name: `Quest ${id}`,
        sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
        sourceSha256: "a".repeat(64),
        capturedAt: new Date().toISOString(),
        questLevel: 10,
        minimumLevel: 5,
        fullXp: id === 1 ? 0 : null,
        referenceBaseXp: null,
        pageMultiplier: null,
        rendererRevision: "quest-5f36c4ad-core-97211824",
        xpByLevel: [],
        status: id === 1 ? "available" : "unknown",
        issues: [],
      };
      const raw = `${JSON.stringify(record)}\n`,
        sha256 = hash(raw);
      await writeFile(join(rewards, "quest-xp/records", `${sha256}.json`), raw);
      entries.push({ game: "forever", id, sha256, capturedAt: record.capturedAt });
    }
    await writeFile(
      join(rewards, "quest-xp/index.json"),
      JSON.stringify({
        schema: "quest-xp-index.v1",
        publishedAt: new Date().toISOString(),
        records: entries,
      }),
    );
    const report = JSON.parse((await exec(process.execPath, [status, ...flags])).stdout);
    assert.equal(report.available, 1);
    assert.equal(report.unknown, 1);
    assert.equal(report.notPublished, 1);
    assert.equal(report.complete, false);
    assert.deepEqual(
      report.unresolved.map((entry) => entry.id),
      [2, 3],
    );
    await assert.rejects(
      exec(process.execPath, [status, ...flags.slice(0, -1), "b".repeat(64)]),
      /queue checksum/,
    );
    await writeFile(join(rewards, "quest-xp/records", `${entries[0].sha256}.json`), "{}");
    await assert.rejects(exec(process.execPath, [status, ...flags]), /checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
