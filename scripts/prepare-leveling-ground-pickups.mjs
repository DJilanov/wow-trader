import assert from "node:assert/strict";
import console from "node:console";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  CHAPTER_REFERENCES,
  combatManifestSchema,
  combatDatasetSchema,
  questCatalogManifestSchema,
  questCatalogSchema,
  guideArchiveManifestSchema,
  importedChapterSchema,
  campaignZoneId,
} from "../packages/leveling/dist/index.js";
import { parseQuestieForeverSource } from "../packages/world-data/dist/index.js";
import { deriveGroundPickupReferences } from "./leveling-ground-pickups.mjs";

const { values } = parseArgs({
  options: {
    catalog: { type: "string" },
    combat: { type: "string" },
    destination: { type: "string" },
    "provider-root": { type: "string" },
    revision: { type: "string" },
    archive: { type: "string", default: "artifacts/leveling/archive" },
  },
});
assert.ok(
  values.catalog &&
    values.combat &&
    values.destination &&
    values["provider-root"] &&
    /^[a-f0-9]{40}$/.test(values.revision ?? ""),
  "Pass --catalog=ROOT --combat=ROOT --provider-root=CHECKOUT --revision=SHA --destination=NEW_ROOT.",
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(file, maximum) {
  const meta = await stat(file);
  assert.ok(meta.isFile() && meta.size <= maximum, `Oversized input: ${file}`);
  const raw = await readFile(file, "utf8");
  assert.ok(Buffer.byteLength(raw) <= maximum);
  return raw;
}
async function artifact(root, schema, dataSchema) {
  const manifest = schema.parse(JSON.parse(await bounded(path.join(root, "manifest.json"), 4000)));
  const file = path.resolve(root, manifest.file);
  assert.ok(file.startsWith(path.resolve(root) + path.sep));
  const raw = await bounded(file, 16_000_000);
  assert.equal(hash(raw), manifest.sha256);
  const data = dataSchema.parse(JSON.parse(raw));
  assert.equal(data.publication, "authorized");
  assert.equal(data.targetBuild, manifest.targetBuild);
  return { manifest, data };
}
async function writeArtifact(root, prefix, schema, data) {
  await mkdir(root, { recursive: true });
  const raw = JSON.stringify(data) + "\n",
    sha256 = hash(raw),
    file = `${prefix}-${sha256}.json`;
  try {
    await writeFile(path.join(root, file), raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    assert.equal(await readFile(path.join(root, file), "utf8"), raw);
  }
  const manifest = { schema, file, sha256, targetBuild: data.targetBuild };
  const temp = path.join(root, `manifest-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(manifest) + "\n", { flag: "wx", mode: 0o600 });
  await rename(temp, path.join(root, "manifest.json"));
  return manifest;
}
const [catalogInput, combatInput] = await Promise.all([
  artifact(path.resolve(values.catalog), questCatalogManifestSchema, questCatalogSchema),
  artifact(path.resolve(values.combat), combatManifestSchema, combatDatasetSchema),
]);
const catalog = catalogInput.data,
  combat = combatInput.data,
  provider = path.resolve(values["provider-root"]);
assert.equal(catalog.targetBuild, combat.targetBuild);
assert.equal(catalog.providerRevision, values.revision);
assert.equal(combat.provider.revision, values.revision);
for (const field of ["questSha256", "npcSha256", "itemSha256"])
  assert.equal(catalog[field], combat.provider[field], `Input ${field} differs.`);
assert.equal(combat.questCatalogReference?.sha256, catalogInput.manifest.sha256);
assert.equal(combat.questCatalogReference?.providerRevision, catalog.providerRevision);
assert.equal(combat.questCatalogReference?.sourceArchiveSha256, catalog.sourceArchiveSha256);
assert.equal(
  execFileSync("git", ["-C", provider, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  values.revision,
);
assert.equal(
  execFileSync("git", ["-C", provider, "status", "--porcelain", "--untracked-files=no"], {
    encoding: "utf8",
  }).trim(),
  "",
);
const exportRoot = path.join(provider, "src/corrections/Forever/combined");
const [itemRaw, objectRaw, mapRaw] = await Promise.all([
  bounded(path.join(exportRoot, "foreverItemDB.lua"), 32_000_000),
  bounded(path.join(exportRoot, "foreverObjectDB.lua"), 32_000_000),
  bounded(path.join(provider, "support/Forever/Zones/areaIdToUiMapId.lua"), 200_000),
]);
assert.equal(hash(itemRaw), catalog.itemSha256);
assert.equal(hash(itemRaw), combat.provider.itemSha256);
assert.equal(hash(mapRaw), catalog.areaMapSha256);
assert.ok(objectRaw.includes(" -> authored corrections."));
const block = /ZoneDB\.private\.areaIdToUiMapId\s*=\s*\[\[return\s*\{([\s\S]*?)\}\]\]/.exec(mapRaw);
assert.ok(block);
const areaMap = new Map(
  [...block[1].matchAll(/\[(\d+)\]\s*=\s*(\d+)/g)].flatMap((m) => {
    const zone = campaignZoneId(m[2]);
    return zone ? [[Number(m[1]), zone]] : [];
  }),
);
const archiveRoot = path.resolve(values.archive);
const archive = guideArchiveManifestSchema.parse(
  JSON.parse(await bounded(path.join(archiveRoot, "manifest.json"), 1_000_000)),
);
assert.equal(archive.publication, "authorized");
assert.equal(archive.sourceSha256, catalog.sourceArchiveSha256);
assert.equal(archive.targetBuild, catalog.targetBuild);
const chapters = [];
for (const member of archive.chapters) {
  const reference = CHAPTER_REFERENCES.find((c) => c.id === member.chapterId);
  if (reference?.family !== "questing" || !reference.factions.includes("alliance")) continue;
  const file = path.resolve(archiveRoot, member.file);
  assert.ok(file.startsWith(archiveRoot + path.sep));
  const raw = await bounded(file, 1_000_000);
  assert.equal(hash(raw), member.sha256);
  const chapter = importedChapterSchema.parse(JSON.parse(raw));
  assert.equal(chapter.targetBuild, catalog.targetBuild);
  chapters.push(chapter);
}
const items = new Map(parseQuestieForeverSource("item", itemRaw).map((i) => [i.id, i]));
const objects = new Map(parseQuestieForeverSource("object", objectRaw).map((o) => [o.id, o]));
const { proofs, conflicts } = deriveGroundPickupReferences(
  catalog,
  combat,
  chapters,
  items,
  objects,
  areaMap,
);
function replaceGroundReference(record, proof) {
  const original = { ...record };
  delete original.groundPickup;
  return proof ? { ...original, groundPickup: proof } : original;
}
const preparedCatalog = questCatalogSchema.parse({
  ...catalog,
  objectSha256: hash(objectRaw),
  quests: catalog.quests.map((q) => replaceGroundReference(q, proofs.get(q.questId))),
});
const catalogSha = hash(JSON.stringify(preparedCatalog) + "\n");
const preparedCombat = combatDatasetSchema.parse({
  ...combat,
  provider: { ...combat.provider, objectSha256: hash(objectRaw) },
  questCatalogReference: { ...combat.questCatalogReference, sha256: catalogSha },
  quests: combat.quests.map((q) =>
    q.itemObjectives
      ? {
          ...q,
          itemObjectives: q.itemObjectives.map((item) =>
            replaceGroundReference(item, proofs.get(q.questId)),
          ),
        }
      : q,
  ),
});
assert.deepEqual(preparedCombat.npcs, combat.npcs);
assert.deepEqual(preparedCombat.lootDrops, combat.lootDrops);
const destination = path.resolve(values.destination);
assert.notEqual(destination, path.resolve(values.catalog));
assert.notEqual(path.join(destination, "combat"), path.resolve(values.combat));
const writtenCatalog = await writeArtifact(
  destination,
  "quest-catalog",
  "forever-quest-funding-manifest.v1",
  preparedCatalog,
);
const writtenCombat = await writeArtifact(
  path.join(destination, "combat"),
  "combat",
  "forever-combat-manifest.v1",
  preparedCombat,
);
const sourceNotices = [];
for (const name of ["classic-db-LICENSE.md", "classic-db-COPYRIGHT.md"]) {
  let raw;
  try {
    raw = await bounded(path.join(path.resolve(values.combat), "..", name), 100_000);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  await writeFile(path.join(destination, name), raw, { mode: 0o600 });
  sourceNotices.push({ file: name, sha256: hash(raw) });
}
const report = {
  scope:
    "Normalized item/object/source proofs only. Existing flags, rewards, quantities and probabilities preserved; no recordings, path kills, loot sharing or respawn timings inferred.",
  inputs: {
    catalog: catalogInput.manifest.sha256,
    combat: combatInput.manifest.sha256,
    objects: hash(objectRaw),
    items: hash(itemRaw),
    archive: archive.sourceSha256,
    providerRevision: values.revision,
  },
  catalog: writtenCatalog.sha256,
  combat: writtenCombat.sha256,
  groundPickupQuestIds: [...proofs.keys()].sort((a, b) => a - b),
  conflicts,
  sourceNotices,
};
await writeFile(path.join(destination, "review.json"), JSON.stringify(report, null, 2) + "\n", {
  mode: 0o600,
});
console.log(JSON.stringify(report));
