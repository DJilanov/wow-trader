import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile),
  script = resolve("scripts/leveling-loot-status.mjs");
test("reports captures separately from missing fields and model-ready stack evidence, without writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-loot-status-"));
  try {
    const stage = join(root, "staging");
    await mkdir(stage);
    await mkdir(join(root, "combat"));
    const drop = {
      itemId: 750,
      npcId: 299,
      probability: 0.5,
      minimumQuantity: null,
      maximumQuantity: null,
      sampleSize: 20,
      targetBuild: 70205,
      sourceUrl: "https://example.test/item=750",
      sourceSha256: "a".repeat(64),
      capturedAt: "2026-10-21T00:00:00.000Z",
    };
    const dataset = {
      schema: "forever-combat-reference.v1",
      publication: "private-reference",
      authorizationNote: "",
      targetBuild: 70205,
      provider: {
        repository: "https://example.test/provider",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "a".repeat(64),
        questSha256: "b".repeat(64),
        itemSha256: "c".repeat(64),
        limitations: ["Synthetic fixture"],
      },
      npcs: [
        {
          id: 299,
          name: "Synthetic Wolf",
          minimumLevel: 1,
          maximumLevel: 1,
          rank: 0,
          xpEligibility: "assumed",
          zoneIds: [],
        },
      ],
      quests: [],
      dungeons: [],
      killXpEvidence: [],
      lootDrops: [
        { ...drop, probabilityBasis: "sample-ratio" },
        { ...drop, itemId: 751, quantityDistribution: [{ quantity: 1, percent: 100 }] },
        {
          ...drop,
          itemId: 752,
          quantityDistribution: [
            { quantity: 1, percent: 75 },
            { quantity: 3, percent: 25 },
          ],
        },
      ],
    };
    const dataRaw = JSON.stringify(dataset),
      sha256 = createHash("sha256").update(dataRaw).digest("hex");
    const file = `combat-${sha256}.json`;
    await writeFile(join(root, "combat", file), dataRaw);
    await writeFile(
      join(root, "combat/manifest.json"),
      JSON.stringify({ schema: "forever-combat-manifest.v1", targetBuild: 70205, file, sha256 }),
    );
    const report = {
      schema: "leveling-loot-preparation.v1",
      outputCombatSha256: sha256,
      targetBuild: 70205,
      reviews: [{ reason: "Unknown stack size" }],
      cacheErrors: [],
    };
    await writeFile(join(root, "report.json"), JSON.stringify(report));
    await writeFile(
      join(root, "queue.json"),
      JSON.stringify([
        { game: "forever", kind: "quest", id: 33 },
        { game: "forever", kind: "item", id: 750 },
      ]),
    );
    const capture = {
      schema: "wowhead-reference.v1",
      game: "forever",
      kind: "quest",
      id: 33,
      name: "Synthetic Quest",
      sourceUrl: "https://www.wowhead.com/forever/quest=33",
      sourceSha256: "a".repeat(64),
      capturedAt: "2026-10-21T00:00:00.000Z",
      permissionRef: "synthetic-test",
      tooltipLines: [],
      numericFacts: {},
      quickFacts: [],
      objectives: [],
      description: "",
      rewards: [],
      relations: [],
    };
    const captureRaw = JSON.stringify(capture);
    await writeFile(join(stage, "forever-quest-33.json"), captureRaw);
    const args = [script, `--preparation=${root}`, `--staging=${stage}`];
    const result = JSON.parse((await exec(process.execPath, args)).stdout);
    assert.deepEqual(result.remaining, {
      quests: 1,
      items: 1,
      total: 2,
      alreadyCaptured: 1,
      unfetched: 1,
    });
    assert.deepEqual(result.dropFacts, {
      total: 3,
      sampled: 1,
      fixedQuantity: 1,
      weightedQuantity: 1,
      unknownQuantity: 1,
    });
    assert.equal(result.manualReviews, 1);
    assert.match(result.note, /not forecast readiness/);
    assert.equal(await readFile(join(stage, "forever-quest-33.json"), "utf8"), captureRaw);
    assert.match(
      (await exec(process.execPath, [...args, "--human"])).stdout,
      /already captured:.*1\/2/,
    );
    await writeFile(
      join(root, "report.json"),
      JSON.stringify({ ...report, outputCombatSha256: "b".repeat(64) }),
    );
    await assert.rejects(exec(process.execPath, args), /report mismatch/);
    await writeFile(
      join(root, "report.json"),
      JSON.stringify({ ...report, queueSha256: "b".repeat(64) }),
    );
    await assert.rejects(exec(process.execPath, args), /queue checksum mismatch/);
    const queueRaw = await readFile(join(root, "queue.json"));
    await writeFile(
      join(root, "report.json"),
      JSON.stringify({
        ...report,
        queueSha256: createHash("sha256").update(queueRaw).digest("hex"),
      }),
    );
    assert.equal(JSON.parse((await exec(process.execPath, args)).stdout).remaining.total, 2);
    await writeFile(join(root, "report.json"), JSON.stringify(report));
    await writeFile(join(stage, "forever-quest-33.json"), JSON.stringify({ ...capture, id: 99 }));
    await assert.rejects(
      exec(process.execPath, args),
      /identity mismatch|edition or entity identity mismatch/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
