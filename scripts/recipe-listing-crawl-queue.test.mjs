import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { buildRecipeListingCrawlQueue } from "./recipe-listing-crawl-queue.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test("builds one spell and one item listing per profession", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-listing-queue-"));
  temporaryDirectories.push(root);
  const sourceReport = join(root, "acquisition.report.json");
  await writeFile(
    sourceReport,
    JSON.stringify({
      unresolvedRecipes: [
        { recipeSpellId: 1, professionName: "Alchemy" },
        { recipeSpellId: 2, professionName: "First Aid" },
        { recipeSpellId: 3, professionName: "Alchemy" },
      ],
    }),
  );

  const result = await buildRecipeListingCrawlQueue({ sourceReport });
  assert.deepEqual(result.tasks, [
    {
      game: "forever",
      kind: "spell-list",
      path: "/forever/spells/professions/alchemy?filter=20%3B1%3B0",
    },
    { game: "forever", kind: "item-list", path: "/forever/items/recipes/alchemy" },
    {
      game: "forever",
      kind: "spell-list",
      path: "/forever/spells/professions/first-aid?filter=20%3B1%3B0",
    },
    { game: "forever", kind: "item-list", path: "/forever/items/recipes/first-aid" },
  ]);
  assert.deepEqual(result.report.summary, {
    professionCount: 2,
    spellListingCount: 2,
    itemListingCount: 2,
    totalTaskCount: 4,
  });
});

test("rejects a report without profession names", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-listing-queue-"));
  temporaryDirectories.push(root);
  const sourceReport = join(root, "acquisition.report.json");
  await writeFile(sourceReport, JSON.stringify({ unresolvedRecipes: [] }));
  await assert.rejects(
    buildRecipeListingCrawlQueue({ sourceReport }),
    /does not contain any profession names/,
  );
});
