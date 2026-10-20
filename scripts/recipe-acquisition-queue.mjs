import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

export async function buildRecipeAcquisitionQueue(snapshotDirectory, game = "forever") {
  const snapshot = resolve(snapshotDirectory);
  const manifest = JSON.parse(await readFile(join(snapshot, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== "catalog-snapshot-manifest.v4") {
    throw new Error(`Unsupported catalog schema: ${String(manifest.schemaVersion)}`);
  }

  const [recipes, spells, professions, outputs, teachingItems, items] = await Promise.all([
    readGzipNdjson(join(snapshot, "normalized/recipes.ndjson.gz")),
    readGzipNdjson(join(snapshot, "normalized/spells.ndjson.gz")),
    readGzipNdjson(join(snapshot, "normalized/professions.ndjson.gz")),
    readGzipNdjson(join(snapshot, "normalized/recipe-outputs.ndjson.gz")),
    readGzipNdjson(join(snapshot, "normalized/recipe-teaching-items.ndjson.gz")),
    readGzipNdjson(join(snapshot, "normalized/items.ndjson.gz")),
  ]);
  const spellNames = new Map(spells.map((spell) => [spell.spellId, spell.name]));
  const professionNames = new Map(
    professions.map((profession) => [profession.skillLineId, profession.name]),
  );
  const itemNames = new Map(items.map((item) => [item.itemId, item.name]));
  const outputsByRecipe = groupBy(outputs, (output) => output.recipeSpellId);
  const teachingItemsByRecipe = groupBy(teachingItems, (item) => item.recipeSpellId);

  const entries = recipes
    .map((recipe) => {
      const recipeOutputs = outputsByRecipe.get(recipe.recipeSpellId) ?? [];
      const recipeTeachingItems = teachingItemsByRecipe.get(recipe.recipeSpellId) ?? [];
      return {
        recipeSpellId: recipe.recipeSpellId,
        name: spellNames.get(recipe.recipeSpellId) ?? null,
        professionSkillLineId: recipe.professionSkillLineId,
        professionName: professionNames.get(recipe.professionSkillLineId) ?? null,
        requiredSkillRank: recipe.requiredSkillRank,
        outputKind: recipe.outputKind,
        outputItems: recipeOutputs
          .filter((output) => Number.isSafeInteger(output.outputItemId))
          .map((output) => ({
            itemId: output.outputItemId,
            name: itemNames.get(output.outputItemId) ?? null,
          })),
        teachingItemIds: recipeTeachingItems.map((item) => item.teachingItemId),
        clientAcquireMethod: readAcquireMethod(recipe),
        unresolvedFields: ["acquisition_source"],
        suggestedReference: `https://www.wowhead.com/${game}/spell=${recipe.recipeSpellId}`,
      };
    })
    .sort(
      (left, right) =>
        left.professionSkillLineId - right.professionSkillLineId ||
        left.recipeSpellId - right.recipeSpellId,
    );
  const tasks = entries.map((entry) => ({ game, kind: "spell", id: entry.recipeSpellId }));
  const queueSha256 = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");

  return {
    tasks,
    report: {
      schemaVersion: "recipe-acquisition-queue-report.v1",
      generatedAt: new Date().toISOString(),
      sourceCatalog: {
        product: manifest.product,
        clientVersion: manifest.clientVersion,
        buildNumber: manifest.buildNumber,
        locale: manifest.locale,
        hotfix: manifest.hotfix,
      },
      queueSha256,
      summary: {
        recipeCount: recipes.length,
        unresolvedAcquisitionCount: entries.length,
        resolvedTeachingItemCount: teachingItems.length,
      },
      policy: {
        purpose: "Targeted acquisition-source enrichment only",
        clientFieldsRemainAuthoritative: [
          "profession",
          "required_skill",
          "reagents",
          "outputs",
          "craft_time",
          "cooldown",
        ],
        externalFields: ["trainer", "vendor", "drop", "quest", "reputation", "location"],
      },
      entries,
    },
  };
}

export async function writeRecipeAcquisitionQueue(options) {
  const { tasks, report } = await buildRecipeAcquisitionQueue(options.snapshot, options.game);
  const queuePath = resolve(options.queue);
  const reportPath = resolve(options.report);
  await Promise.all([atomicJsonWrite(queuePath, tasks), atomicJsonWrite(reportPath, report)]);
  return {
    queuePath,
    reportPath,
    queueSha256: report.queueSha256,
    recipes: tasks.length,
  };
}

async function readGzipNdjson(path) {
  const input = createReadStream(path).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const records = [];
  for await (const line of lines) {
    if (line.trim() !== "") records.push(JSON.parse(line));
  }
  return records;
}

function groupBy(records, keyFor) {
  const result = new Map();
  for (const record of records) {
    const key = keyFor(record);
    const group = result.get(key);
    if (group) group.push(record);
    else result.set(key, [record]);
  }
  return result;
}

function readAcquireMethod(recipe) {
  const value = recipe?.rawRecord?.skillLineAbility?.AcquireMethod;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function atomicJsonWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function parseArguments(arguments_) {
  const parsedArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const values = new Map();
  for (let index = 0; index < parsedArguments.length; index += 1) {
    const argument = parsedArguments[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const [name, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? parsedArguments[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    values.set(name, value);
  }
  const snapshot = values.get("snapshot");
  const queue = values.get("queue");
  if (!snapshot || !queue) {
    throw new Error(
      "Usage: node scripts/recipe-acquisition-queue.mjs --snapshot <catalog snapshot> --queue <queue.json> [--report <report.json>] [--game forever]",
    );
  }
  return {
    snapshot,
    queue,
    report: values.get("report") ?? `${queue}.report.json`,
    game: values.get("game") ?? "forever",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeRecipeAcquisitionQueue(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
