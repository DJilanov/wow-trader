import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { gzipSync } from "node:zlib";

import { writeRecipeAcquisitionQueue } from "./recipe-acquisition-queue.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test("builds a spell crawl queue without treating external data as recipe math", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-recipe-queue-"));
  temporaryDirectories.push(root);
  const normalized = join(root, "normalized");
  await mkdir(normalized);
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: "catalog-snapshot-manifest.v4",
      product: "wow_classic_beta",
      clientVersion: "1.60.1.70009",
      buildNumber: 70009,
      locale: "enUS",
      hotfix: { status: "applied", sha256: "a".repeat(64) },
    }),
  );
  await Promise.all([
    writeNdjson(normalized, "recipes", [
      {
        recipeSpellId: 2149,
        professionSkillLineId: 165,
        requiredSkillRank: 1,
        outputKind: "item",
        rawRecord: { skillLineAbility: { AcquireMethod: 1 } },
      },
    ]),
    writeNdjson(normalized, "spells", [{ spellId: 2149, name: "Handstitched Leather Boots" }]),
    writeNdjson(normalized, "professions", [{ skillLineId: 165, name: "Leatherworking" }]),
    writeNdjson(normalized, "recipe-outputs", [{ recipeSpellId: 2149, outputItemId: 2302 }]),
    writeNdjson(normalized, "recipe-teaching-items", []),
    writeNdjson(normalized, "items", [{ itemId: 2302, name: "Handstitched Leather Boots" }]),
  ]);
  const queue = join(root, "queue.json");
  const report = join(root, "report.json");

  const result = await writeRecipeAcquisitionQueue({
    snapshot: root,
    queue,
    report,
    game: "forever",
  });

  assert.equal(result.recipes, 1);
  assert.deepEqual(JSON.parse(await readFile(queue, "utf8")), [
    { game: "forever", kind: "spell", id: 2149 },
  ]);
  const evidence = JSON.parse(await readFile(report, "utf8"));
  assert.deepEqual(evidence.policy.clientFieldsRemainAuthoritative, [
    "profession",
    "required_skill",
    "reagents",
    "outputs",
    "craft_time",
    "cooldown",
  ]);
  assert.deepEqual(evidence.entries[0], {
    recipeSpellId: 2149,
    name: "Handstitched Leather Boots",
    professionSkillLineId: 165,
    professionName: "Leatherworking",
    requiredSkillRank: 1,
    outputKind: "item",
    outputItems: [{ itemId: 2302, name: "Handstitched Leather Boots" }],
    teachingItemIds: [],
    clientAcquireMethod: 1,
    unresolvedFields: ["acquisition_source"],
    suggestedReference: "https://www.wowhead.com/forever/spell=2149",
  });
});

async function writeNdjson(directory, name, records) {
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(join(directory, `${name}.ndjson.gz`), gzipSync(`${content}\n`));
}
