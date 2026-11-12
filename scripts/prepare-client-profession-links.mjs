import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { auditCatalogSnapshot, loadCatalogSnapshot } from "../packages/catalog/dist/index.js";
import { qualifyClientProfessionLinks } from "../packages/world-data/dist/index.js";

const { values } = parseArgs({
  options: { manifest: { type: "string" }, base: { type: "string" }, output: { type: "string" } },
  strict: true,
});
if (!values.manifest || !values.base || !values.output)
  throw new Error("Provide --manifest, --base and --output.");
const audit = await auditCatalogSnapshot(values.manifest);
if (!audit.valid) throw new Error("Client catalog failed checksum audit.");
const source = await loadCatalogSnapshot(values.manifest);
if (source.manifest.hotfix.status !== "applied" || !source.manifest.hotfix.sha256)
  throw new Error("Client profession evidence requires a frozen hotfix cache.");
const artifacts = [];
for (const name of [
  "recipe-teaching-items",
  "items",
  "recipes",
  "recipe-inputs",
  "recipe-outputs",
]) {
  const file = source.manifest.normalizedArtifacts[name];
  if (!file) throw new Error(`Missing ${name} evidence`);
  const absolute = path.resolve(path.dirname(values.manifest), file.path);
  artifacts.push({
    fileName: file.path,
    byteSize: (await stat(absolute)).size,
    sha256: file.sha256,
    entityCount: file.recordCount,
  });
}
const result = qualifyClientProfessionLinks(
  {
    build: {
      product: source.manifest.product,
      buildNumber: source.manifest.buildNumber,
      locale: source.manifest.locale,
      hotfixHash: source.manifest.hotfix.sha256,
    },
    items: source.items,
    recipes: source.recipes,
    inputs: source.recipeInputs,
    outputs: source.recipeOutputs,
    teachingItems: source.recipeTeachingItems,
    artifacts,
  },
  JSON.parse(await readFile(values.base, "utf8")),
);
if (!result.report.qualified)
  throw new Error("No client relationships match the published catalog.");
await writeFile(values.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(result.report)}\n`);
