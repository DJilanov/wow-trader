import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { buildRecipeNpcCrawlQueue } from "./recipe-npc-crawl-queue.mjs";

const directories = [];
afterEach(async () => {
  for (const root of directories.splice(0)) await rm(root, { recursive: true });
});

async function fixture() {
  const staging = await mkdtemp(join(tmpdir(), "recipe-npc-candidates-"));
  directories.push(staging);
  await writeFile(
    join(staging, "forever-spell-100.json"),
    JSON.stringify({
      kind: "spell",
      relations: [{ relation: "taught-by-npc", kind: "npc", id: 1, name: "Trainer" }],
    }),
  );
  await writeFile(
    join(staging, "forever-npc-1.json"),
    JSON.stringify({
      kind: "npc",
      relations: [{ relation: "teaches", kind: "spell", id: 100, name: "Recipe" }],
    }),
  );
  return {
    staging,
    queue: join(staging, "queue.json"),
    report: join(staging, "report.json"),
    candidates: join(staging, "candidates.json"),
  };
}

test("merges explicit catalog candidates without claiming they teach or sell anything", async () => {
  const options = await fixture();
  await writeFile(
    options.candidates,
    JSON.stringify([
      { game: "forever", kind: "npc", id: 1 },
      { game: "forever", kind: "npc", id: 2 },
      { game: "forever", kind: "npc", id: 2 },
    ]),
  );
  const result = await buildRecipeNpcCrawlQueue(options);
  assert.equal(result.uniqueNpcCount, 2);
  assert.equal(result.pendingNpcCount, 1);
  assert.equal(result.trainerNpcCount, 1);
  assert.equal(result.vendorNpcCount, 0);
  assert.equal(result.catalogCandidateCount, 2);
  assert.deepEqual(JSON.parse(await readFile(options.queue, "utf8")), [
    { game: "forever", kind: "npc", id: 1 },
    { game: "forever", kind: "npc", id: 2 },
  ]);
});

test("ignores unrelated staged NPCs when counting pending work", async () => {
  const { candidates: ignored, ...options } = await fixture();
  assert.ok(ignored);
  await writeFile(
    join(options.staging, "forever-npc-999.json"),
    JSON.stringify({ kind: "npc", relations: [] }),
  );
  const result = await buildRecipeNpcCrawlQueue(options);
  assert.equal(result.stagedNpcCount, 1);
  assert.equal(result.pendingNpcCount, 0);
});

test("rejects cross-edition, wrong-kind and malformed candidate queues", async () => {
  const options = await fixture();
  for (const rows of [
    {},
    [{ game: "tbc", kind: "npc", id: 2 }],
    [{ game: "forever", kind: "item", id: 2 }],
    [{ game: "forever", kind: "npc", id: 0 }],
    [{ game: "forever", kind: "npc", id: 2, url: "unapproved" }],
  ]) {
    await writeFile(options.candidates, JSON.stringify(rows));
    await assert.rejects(buildRecipeNpcCrawlQueue(options), /candidate/i);
  }
});
