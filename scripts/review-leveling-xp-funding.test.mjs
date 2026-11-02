import assert from "node:assert/strict";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_VERSION,
  DUNGEON_REFERENCE,
  parseGuideChapter,
} from "../packages/leveling/dist/index.js";

const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const archiveHash = "a".repeat(64);
const providerRevision = "e9a67d1a2753a0e64c4c96bf7864788fac7b765f";

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "leveling-funding-audit-"));
  const archive = path.join(root, "archive"),
    combat = path.join(root, "combat"),
    catalog = path.join(root, "catalog");
  await Promise.all([archive, combat, catalog].map((directory) => mkdir(directory)));
  const chapters = [];
  try {
    for (const sourceId of [115, 116, 117]) {
      const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId);
      const guide = parseGuideChapter(
        `step\n.accept ${300000 + sourceId} >> Accept Work\nstep\n.turnin ${300000 + sourceId} >> Turn in Work`,
        reference.id,
        archiveHash,
        70205,
      );
      const raw = JSON.stringify(guide),
        file = `${reference.id}.json`;
      await writeFile(path.join(archive, file), raw);
      chapters.push({
        chapterId: reference.id,
        version: guide.version,
        file,
        sha256: hash(raw),
        sourceSha256: archiveHash,
        stepCount: guide.steps.length,
        questIds: [300000 + sourceId],
      });
    }
    await writeFile(
      path.join(archive, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        parserVersion: "forever-guide-v2",
        publication: "authorized",
        authorizationNote: "Synthetic test fixture",
        sourceSha256: archiveHash,
        inventorySha256: archiveHash,
        targetBuild: 70205,
        chapters,
      }),
    );
    const artifact = async (directory, prefix, data, schema) => {
      const raw = JSON.stringify(data),
        sha256 = hash(raw),
        file = `${prefix}-${sha256}.json`;
      await writeFile(path.join(directory, file), raw);
      await writeFile(
        path.join(directory, "manifest.json"),
        JSON.stringify({ schema, targetBuild: 70205, file, sha256 }),
      );
      return { file, sha256 };
    };
    const catalogManifest = await artifact(
      catalog,
      "quest-catalog",
      {
        schema: "forever-quest-funding-catalog.v1",
        targetBuild: 70205,
        publication: "authorized",
        authorizationNote: "Synthetic fixture",
        providerRevision,
        questSha256: archiveHash,
        npcSha256: archiveHash,
        areaMapSha256: archiveHash,
        includesAuthoredCorrections: false,
        sourceArchiveSha256: archiveHash,
        quests: [],
      },
      "forever-quest-funding-manifest.v1",
    );
    const combatManifest = await artifact(
      combat,
      "combat",
      {
        schema: "forever-combat-reference.v1",
        targetBuild: 70205,
        publication: "authorized",
        authorizationNote: "Synthetic fixture",
        provider: {
          repository: "https://example.test/provider",
          revision: providerRevision,
          layer: "forever-static-with-authored",
          questSha256: archiveHash,
          npcSha256: archiveHash,
          itemSha256: archiveHash,
          limitations: ["Synthetic fixture"],
        },
        npcs: [],
        quests: [],
        dungeons: [],
        killXpEvidence: [],
        questCatalogReference: {
          sha256: catalogManifest.sha256,
          providerRevision,
          sourceArchiveSha256: archiveHash,
        },
      },
      "forever-combat-manifest.v1",
    );
    const facts = path.join(root, "facts.json"),
      report = path.join(root, "report.json");
    await writeFile(facts, JSON.stringify({ clientBuild: 70450, facts: [] }));
    const execute = (...flags) =>
      spawnSync(
        process.execPath,
        [
          "scripts/review-leveling-xp-funding.mjs",
          `--archive=${archive}`,
          `--facts=${facts}`,
          `--catalog=${catalog}`,
          `--combat=${combat}`,
          `--report=${report}`,
          ...flags,
        ],
        { encoding: "utf8", timeout: 30000, maxBuffer: 100000 },
      );
    await run({ execute, report, combat, combatManifest });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("writes every chapter outcome while keeping arithmetic success separate from funding", async () => {
  await fixture(async ({ execute, report }) => {
    const result = execute();
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(await readFile(report, "utf8"));
    assert.equal(data.summary.scenarios, 1);
    assert.equal(data.inputs.campaignRevision, CAMPAIGN_VERSION);
    assert.equal(data.inputs.dungeonReferenceSha256, DUNGEON_REFERENCE.sourceSha256);
    assert.equal(data.inputs.dungeonReferenceReviewedAt, DUNGEON_REFERENCE.reviewedAt);
    assert.ok(data.summary.chapterChecks > 0);
    assert.equal(data.summary.arithmeticWitnessPassed, true);
    assert.equal(data.summary.funded, false);
    assert.equal(data.summary.questLogCapacity, 40);
    assert.equal(data.summary.questLogCapacityPassed, true);
    assert.ok(data.summary.maximumQuestLogUpperBound <= 40);
    assert.equal(data.results[0].questLog.length, 5);
    assert.ok(data.results[0].questLog.every((member) => member.withinCapacity));
    const gated = execute("--require-funded");
    assert.equal(gated.status, 2, gated.stderr);
    assert.equal(JSON.parse(gated.stdout).funded, false);
    const both = execute("--starter-mode=both", "--require-funded");
    assert.equal(both.status, 2, both.stderr);
    const comparison = JSON.parse(await readFile(report, "utf8"));
    assert.equal(comparison.summary.scenarios, 2);
    assert.deepEqual(
      comparison.results.map((result) => result.starterMode),
      ["separate", "together"],
    );
    assert.equal(comparison.summary.arithmeticWitnessPassed, true);
    const invalid = execute("--starter-mode=unverified");
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Use --starter-mode=/);
  });
});

test("rejects modified reference bytes before producing an audit", async () => {
  await fixture(async ({ execute, combat, combatManifest }) => {
    await writeFile(path.join(combat, combatManifest.file), "{}");
    const result = execute("--require-funded");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Artifact checksum mismatch/);
  });
});
