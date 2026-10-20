import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { writeRecipeReferenceCrawlQueue } from "./recipe-reference-crawl-queue.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test("expands recipe spells with teaching-item follow-ups and reports evidence coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-profession-crawl-"));
  temporaryDirectories.push(root);
  const staging = join(root, "staging");
  await mkdir(staging);
  const recipes = [
    { game: "forever", kind: "spell", id: 100 },
    { game: "forever", kind: "spell", id: 101 },
    { game: "forever", kind: "spell", id: 102 },
  ];
  const recipesPath = join(root, "recipes.json");
  const sourceReport = join(root, "recipes.report.json");
  await writeFile(recipesPath, JSON.stringify(recipes));
  await writeFile(
    sourceReport,
    JSON.stringify({
      queueSha256: createHash("sha256").update(JSON.stringify(recipes)).digest("hex"),
      catalog: { buildNumber: 70450 },
    }),
  );
  await Promise.all([
    writeReference(staging, "spell", 100, [
      { relation: "taught-by-npc", kind: "npc", id: 1, name: "Trainer" },
    ]),
    writeReference(staging, "spell", 101, [
      { relation: "taught-by-item", kind: "item", id: 900, name: "Recipe: Test" },
    ]),
    writeReference(staging, "spell", 102, [
      { relation: "created-by", kind: "spell", id: 99, name: "Unrelated" },
    ]),
    writeReference(staging, "item", 900, [
      { relation: "sold-by", kind: "npc", id: 2, name: "Vendor" },
    ]),
  ]);
  const queue = join(root, "expanded.json");
  const report = join(root, "expanded.report.json");

  const result = await writeRecipeReferenceCrawlQueue({
    recipes: recipesPath,
    sourceReport,
    staging,
    queue,
    report,
  });

  assert.deepEqual(JSON.parse(await readFile(queue, "utf8")), [
    ...recipes,
    { game: "forever", kind: "item", id: 900 },
  ]);
  assert.deepEqual(result, {
    queue,
    report,
    recipeSpellCount: 3,
    stagedSpellCount: 3,
    trainerRecipeCount: 1,
    teachingItemRecipeCount: 1,
    directSourceRecipeCount: 0,
    incompleteSpellCount: 1,
    teachingItemFollowupCount: 1,
    stagedTeachingItemCount: 1,
    sourcedTeachingItemCount: 1,
    incompleteTeachingItemCount: 0,
    totalCrawlTaskCount: 4,
    pendingCrawlTaskCount: 0,
    listingRecordCount: 0,
    listingSpellRecordCount: 0,
    listingItemRecordCount: 0,
    listingSpellEntryCount: 0,
    listingItemEntryCount: 0,
    listingResolvedSpellCount: 0,
    listingMaterializedSpellCount: 0,
    listingNameJoinCandidates: 0,
    listingNameJoinedSpellCount: 0,
    listingNameJoinMaterializedSpellCount: 0,
    listingNameJoinAmbiguousCount: 0,
    listingNameJoinNoItemCount: 0,
    listingNameJoinDisabled: false,
    listingUnresolvedSpellCount: 0,
    listingAmbiguousSpellCount: 0,
    listingResolvedTeachingItemCount: 0,
    listingItemQueueCount: 0,
    unstagedSpellCount: 0,
  });
  const plan = JSON.parse(await readFile(report, "utf8"));
  assert.equal(plan.source.buildNumber, 70450);
  assert.deepEqual(plan.dataContract.spellPageEvidence, ["taught-by-npc", "taught-by-item"]);
});

test("rejects a recipe queue that does not match its evidence report", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-profession-crawl-"));
  temporaryDirectories.push(root);
  const recipes = join(root, "recipes.json");
  const sourceReport = join(root, "recipes.report.json");
  const staging = join(root, "staging");
  await mkdir(staging);
  await writeFile(recipes, JSON.stringify([{ game: "forever", kind: "spell", id: 100 }]));
  await writeFile(sourceReport, JSON.stringify({ queueSha256: "0".repeat(64) }));

  await assert.rejects(
    writeRecipeReferenceCrawlQueue({
      recipes,
      sourceReport,
      staging,
      queue: join(root, "expanded.json"),
      report: join(root, "expanded.report.json"),
    }),
    /checksum/,
  );
});

test("materializes only exact listing relations and leaves ambiguous rows on the detail queue", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-profession-listings-"));
  temporaryDirectories.push(root);
  const staging = join(root, "staging");
  await mkdir(join(staging, "listings"), { recursive: true });
  const recipes = [
    { game: "forever", kind: "spell", id: 100 },
    { game: "forever", kind: "spell", id: 101 },
    { game: "forever", kind: "spell", id: 102 },
  ];
  const recipesPath = join(root, "recipes.json");
  const sourceReport = join(root, "recipes.report.json");
  await writeFile(recipesPath, JSON.stringify(recipes));
  await writeFile(
    sourceReport,
    JSON.stringify({
      queueSha256: createHash("sha256").update(JSON.stringify(recipes)).digest("hex"),
      unresolvedRecipes: [
        { recipeSpellId: 100, name: "Linen Bandage" },
        { recipeSpellId: 101, name: "Heavy Linen Bandage" },
        { recipeSpellId: 102, name: "Wool Bandage" },
      ],
    }),
  );
  await writeFile(
    join(staging, "listings", "forever-spell-list-alchemy.json"),
    JSON.stringify({
      schema: "wowhead-listing.v1",
      game: "forever",
      kind: "spell-list",
      path: "/forever/spells/professions/alchemy?filter=20%3B1%3B0",
      profession: "alchemy",
      sourceUrl: "https://www.wowhead.com/forever/spells/professions/alchemy",
      capturedAt: "2026-10-18T12:00:00.000Z",
      permissionRef: "test",
      sourceSha256: "a".repeat(64),
      parserVersion: 1,
      warnings: [],
      entries: [
        {
          id: 100,
          name: "Linen Bandage",
          sourceTypes: ["trainer"],
          relations: [{ relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" }],
          teaches: [],
          unresolved: [],
        },
        {
          id: 101,
          name: "Heavy Linen Bandage",
          sourceTypes: ["vendor"],
          relations: [],
          teaches: [],
          unresolved: ["source_label_without_exact_relation"],
        },
      ],
    }),
  );
  await writeFile(
    join(staging, "listings", "forever-item-list-alchemy.json"),
    JSON.stringify({
      schema: "wowhead-listing.v1",
      game: "forever",
      kind: "item-list",
      path: "/forever/items/recipes/alchemy",
      profession: "alchemy",
      sourceUrl: "https://www.wowhead.com/forever/items/recipes/alchemy",
      capturedAt: "2026-10-18T12:01:00.000Z",
      permissionRef: "test",
      sourceSha256: "b".repeat(64),
      parserVersion: 1,
      warnings: [],
      entries: [
        {
          id: 900,
          name: "Recipe: Test",
          sourceTypes: ["vendor"],
          relations: [{ relation: "sold-by", kind: "npc", id: 2, name: "Vendor" }],
          teaches: [102],
          unresolved: [],
        },
      ],
    }),
  );

  const result = await writeRecipeReferenceCrawlQueue({
    recipes: recipesPath,
    sourceReport,
    staging,
    queue: join(root, "expanded.json"),
    report: join(root, "expanded.report.json"),
  });

  const trainer = JSON.parse(await readFile(join(staging, "forever-spell-100.json"), "utf8"));
  assert.equal(trainer.sourceKind, "listing");
  assert.deepEqual(trainer.relations, [
    { relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" },
  ]);
  const taughtByItem = JSON.parse(await readFile(join(staging, "forever-spell-102.json"), "utf8"));
  assert.equal(taughtByItem.sourceKind, "listing");
  assert.deepEqual(taughtByItem.relations, [
    { relation: "taught-by-item", kind: "item", id: 900, name: "Recipe: Test" },
  ]);
  await assert.rejects(readFile(join(staging, "forever-spell-101.json"), "utf8"), /ENOENT/);

  assert.equal(result.stagedSpellCount, 2);
  assert.equal(result.incompleteSpellCount, 1);
  assert.equal(result.listingResolvedSpellCount, 2);
  assert.equal(result.listingMaterializedSpellCount, 2);
  assert.equal(result.listingUnresolvedSpellCount, 1);
  assert.equal(result.listingAmbiguousSpellCount, 1);
  assert.equal(result.listingResolvedTeachingItemCount, 1);
  assert.equal(result.pendingCrawlTaskCount, 2);
  assert.equal(result.totalCrawlTaskCount, 4);
});

test("name-joins unique recipe-item names to client recipe spells", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-name-join-"));
  temporaryDirectories.push(root);
  const staging = join(root, "staging");
  await mkdir(join(staging, "listings"), { recursive: true });
  const recipes = [
    { game: "forever", kind: "spell", id: 100 },
    { game: "forever", kind: "spell", id: 101 },
  ];
  const recipesPath = join(root, "recipes.json");
  const sourceReport = join(root, "recipes.report.json");
  await writeFile(recipesPath, JSON.stringify(recipes));
  await writeFile(
    sourceReport,
    JSON.stringify({
      queueSha256: createHash("sha256").update(JSON.stringify(recipes)).digest("hex"),
      unresolvedRecipes: [
        { recipeSpellId: 100, name: "Linen Bandage", professionName: "Alchemy" },
        { recipeSpellId: 101, name: "Heavy Linen Bandage", professionName: "Alchemy" },
      ],
    }),
  );
  await writeFile(
    join(staging, "listings", "forever-item-list-alchemy.json"),
    JSON.stringify({
      schema: "wowhead-listing.v1",
      game: "forever",
      kind: "item-list",
      path: "/forever/items/recipes/alchemy",
      profession: "alchemy",
      sourceUrl: "https://www.wowhead.com/forever/items/recipes/alchemy",
      capturedAt: "2026-10-18T12:00:00.000Z",
      permissionRef: "test",
      sourceSha256: "d".repeat(64),
      parserVersion: 1,
      warnings: [],
      entries: [
        {
          id: 900,
          name: "Recipe: Linen Bandage",
          sourceTypes: ["vendor"],
          relations: [{ relation: "sold-by", kind: "npc", id: 2, name: "Vendor" }],
          teaches: [],
          unresolved: [],
        },
        {
          id: 901,
          name: "Recipe: Missing",
          sourceTypes: ["vendor"],
          relations: [],
          teaches: [],
          unresolved: [],
        },
      ],
    }),
  );

  const result = await writeRecipeReferenceCrawlQueue({
    recipes: recipesPath,
    sourceReport,
    staging,
    queue: join(root, "expanded.json"),
    report: join(root, "expanded.report.json"),
  });

  const joined = JSON.parse(await readFile(join(staging, "forever-spell-100.json"), "utf8"));
  assert.equal(joined.sourceKind, "listing-name-join");
  assert.equal(joined.name, "Linen Bandage");
  assert.equal(joined.sourceUrl, "https://www.wowhead.com/forever/items/recipes/alchemy");
  assert.deepEqual(joined.relations, [
    { relation: "taught-by-item", kind: "item", id: 900, name: "Recipe: Linen Bandage" },
  ]);
  await assert.rejects(readFile(join(staging, "forever-spell-101.json"), "utf8"), /ENOENT/);

  assert.equal(result.listingNameJoinCandidates, 1);
  assert.equal(result.listingNameJoinedSpellCount, 1);
  assert.equal(result.listingNameJoinNoItemCount, 1);
  assert.equal(result.listingResolvedSpellCount, 1);
  assert.equal(result.listingItemQueueCount, 2);
  assert.equal(result.totalCrawlTaskCount, 4);
  assert.equal(result.pendingCrawlTaskCount, 3);
  const report = JSON.parse(await readFile(join(root, "expanded.report.json"), "utf8"));
  assert.deepEqual(report.listingNameJoins, [
    {
      spellId: 100,
      spellName: "Linen Bandage",
      itemId: 900,
      itemName: "Recipe: Linen Bandage",
      profession: "alchemy",
    },
  ]);
});

test("does not materialize a listing row whose name disagrees with the recipe report", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-profession-name-"));
  temporaryDirectories.push(root);
  const staging = join(root, "staging");
  await mkdir(join(staging, "listings"), { recursive: true });
  const recipes = [{ game: "forever", kind: "spell", id: 100 }];
  const recipesPath = join(root, "recipes.json");
  const sourceReport = join(root, "recipes.report.json");
  await writeFile(recipesPath, JSON.stringify(recipes));
  await writeFile(
    sourceReport,
    JSON.stringify({
      queueSha256: createHash("sha256").update(JSON.stringify(recipes)).digest("hex"),
      unresolvedRecipes: [{ recipeSpellId: 100, name: "Linen Bandage" }],
    }),
  );
  await writeFile(
    join(staging, "listings", "forever-spell-list-alchemy.json"),
    JSON.stringify({
      schema: "wowhead-listing.v1",
      game: "forever",
      kind: "spell-list",
      path: "/forever/spells/professions/alchemy?filter=20%3B1%3B0",
      profession: "alchemy",
      sourceUrl: "https://www.wowhead.com/forever/spells/professions/alchemy",
      capturedAt: "2026-10-18T12:00:00.000Z",
      permissionRef: "test",
      sourceSha256: "c".repeat(64),
      parserVersion: 1,
      warnings: [],
      entries: [
        {
          id: 100,
          name: "Wrong Name",
          sourceTypes: ["trainer"],
          relations: [{ relation: "taught-by-npc", kind: "npc", id: 2326, name: "Thamner Pol" }],
          teaches: [],
          unresolved: [],
        },
      ],
    }),
  );

  const result = await writeRecipeReferenceCrawlQueue({
    recipes: recipesPath,
    sourceReport,
    staging,
    queue: join(root, "expanded.json"),
    report: join(root, "expanded.report.json"),
  });
  assert.equal(result.stagedSpellCount, 0);
  assert.equal(result.listingResolvedSpellCount, 0);
  assert.equal(result.listingUnresolvedSpellCount, 1);
  await assert.rejects(readFile(join(staging, "forever-spell-100.json"), "utf8"), /ENOENT/);
});

async function writeReference(staging, kind, id, relations) {
  await writeFile(
    join(staging, `forever-${kind}-${id}.json`),
    JSON.stringify({
      schema: "wowhead-reference.v1",
      game: "forever",
      kind,
      id,
      relations,
    }),
  );
}
