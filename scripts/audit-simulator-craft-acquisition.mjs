import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { resolve, join, relative as relativePath } from "node:path";
import process from "node:process";
import console from "node:console";
import { auditCraftInputs, raidMaterialIds } from "../infra/simulator/craft-acquisition.mjs";

const root = resolve(import.meta.dirname, "..");
const defaultSnapshot =
  "artifacts/local-catalog/70425-simulator-audit/catalog-snapshots/wow_classic_beta/70425/enUS/8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8/catalog-snapshot-manifest.v4";
const args = process.argv.slice(2);
assert(
  new Set(args.map((value) => value.split("=")[0])).size === args.length &&
    args.every((value) => /^--(snapshot|output)=.+$/.test(value)),
  "Use --snapshot=<catalog-snapshot-directory> --output=<staged-audit.json>",
);
const argument = (name) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const snapshotArgument = argument("snapshot");
const outputArgument = argument("output");
const activeOutput = join(root, "artifacts/forever-simulator/craft-acquisition.json");
assert(
  !snapshotArgument || outputArgument,
  "A different snapshot requires an explicit staged --output",
);
const output = resolve(root, outputArgument ?? activeOutput);
assert(
  !snapshotArgument || output !== activeOutput,
  "Stage the new snapshot separately; do not replace the active acquisition audit during a run",
);
const directory = resolve(root, snapshotArgument ?? defaultSnapshot);
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, "catalog-snapshot-manifest.v4");
assert.equal(manifest.product, "wow_classic_beta");
assert.equal(manifest.hotfix?.status, "applied", "A hotfix-backed catalog is required");
const validation = JSON.parse(await readFile(join(directory, "validation-report.json"), "utf8"));
assert.equal(validation.valid, true, "Catalog validation failed");
assert.equal(validation.build?.buildNumber, manifest.buildNumber);
const hashes = {};
const rows = async (name) => {
  const entry = manifest.normalizedArtifacts[name];
  const bytes = await readFile(join(directory, entry.path));
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== entry.sha256) throw new Error(`Recipe evidence checksum mismatch: ${name}`);
  hashes[name] = sha;
  const data = gunzipSync(bytes).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
  if (data.length !== entry.recordCount) throw new Error(`Recipe evidence count mismatch: ${name}`);
  return data;
};
const catalog = JSON.parse(
  await readFile(
    join(root, ".cache/forever-sim-upstream/assets/db_inputs/forever_gear_catalog.json"),
    "utf8",
  ),
);
const inputs = await rows("recipe-inputs");
const recipes = await rows("recipes");
const items = auditCraftInputs(
  catalog.items,
  inputs,
  new Set(recipes.map((recipe) => recipe.recipeSpellId)),
);
const audit = {
  schema: "kfc-prebis-craft-acquisition.v1",
  build: manifest.buildNumber,
  source: relativePath(root, directory),
  hashes,
  raidMaterialIds,
  notice: `Conservative recipe-input guard using the checksummed Forever build-${manifest.buildNumber} extraction. Historical raid material identities are corroborated by the installed AtlasLoot Classic raid tables. Elementium Bar is also raid-dependent via Elementium Ore. This excludes known raid dependencies; it does not prove that every pattern, reputation unlock or new reagent is available before raids in release builds. Missing recipe evidence is not allowed in the strict optimization pool.`,
  items,
};
await writeFile(output, JSON.stringify(audit, null, 2) + "\n", {
  flag: output === activeOutput ? "w" : "wx",
}).catch(async (error) => {
  if (error.code !== "EEXIST" || output === activeOutput) throw error;
  assert.deepEqual(
    JSON.parse(await readFile(output, "utf8")),
    audit,
    "Existing staged audit differs",
  );
});
console.log(
  JSON.stringify(
    {
      output,
      build: audit.build,
      counts: items.reduce(
        (acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }),
        {},
      ),
      blocked: items
        .filter((item) => item.status === "raid-dependent")
        .map((item) => ({ id: item.id, name: item.name })),
      unresolved: items
        .filter((item) => item.status === "unresolved")
        .map((item) => ({ id: item.id, name: item.name })),
    },
    null,
    2,
  ),
);
