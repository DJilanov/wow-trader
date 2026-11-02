import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  classicLootSourceSchema,
  classicLootReferenceSchema,
  combatDatasetSchema,
  combatManifestSchema,
  enrichCombatClassicLoot,
} from "../packages/leveling/dist/index.js";
import { extractClassicLootTables, selectClassicLootReferences } from "./classic-loot-sql.mjs";

const { values } = parseArgs({
  options: {
    combat: { type: "string" },
    "provider-root": { type: "string" },
    revision: { type: "string" },
    "database-file": { type: "string", default: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz" },
    destination: { type: "string" },
    "authorization-note": { type: "string" },
    "referenced-at": { type: "string" },
    "include-reference-only-drops": { type: "boolean", default: false },
  },
  strict: true,
});
assert.ok(
  values.combat && values["provider-root"] && values.destination && values.revision,
  "Pass --combat=ROOT --provider-root=CHECKOUT --revision=SHA --destination=ROOT.",
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const combatRoot = path.resolve(values.combat),
  provider = path.resolve(values["provider-root"]),
  destination = path.resolve(values.destination);
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
assert.ok(
  [combatRoot, provider].every(
    (input) => !within(input, destination) && !within(destination, input),
  ),
  "Destination must not overlap an input directory.",
);
async function bounded(file, maximum) {
  const metadata = await stat(file);
  assert.ok(metadata.isFile() && metadata.size <= maximum, "Input exceeds file budget.");
  const raw = await readFile(file);
  assert.ok(raw.length <= maximum, "Input grew beyond file budget.");
  return raw;
}
async function immutable(file, raw) {
  try {
    await writeFile(file, raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    assert.equal(hash(await readFile(file)), hash(raw), "Existing artifact differs.");
  }
}
async function atomicJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value) + "\n", { flag: "wx", mode: 0o600 });
  await rename(temp, file);
}
assert.match(values.revision, /^[a-f0-9]{40}$/);
assert.equal(
  execFileSync("git", ["-C", provider, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  values.revision,
  "Historical provider revision differs.",
);
assert.equal(
  execFileSync("git", ["-C", provider, "status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  }).trim(),
  "",
  "Historical provider checkout must be clean.",
);
const sourceIdentity = classicLootSourceSchema.omit({ sha256: true }).parse({
  kind: "classic-1.12-reference",
  repository: "https://github.com/cmangos/classic-db",
  revision: values.revision,
  file: values["database-file"],
  sourceBuild: 5875,
  referencedAt: values["referenced-at"] ?? new Date().toISOString(),
});
assert.equal(
  execFileSync("git", ["-C", provider, "hash-object", "--no-filters", "--", sourceIdentity.file], {
    encoding: "utf8",
  }).trim(),
  execFileSync(
    "git",
    ["-C", provider, "rev-parse", "--verify", `${values.revision}:${sourceIdentity.file}`],
    {
      encoding: "utf8",
    },
  ).trim(),
  "Historical database file differs from the pinned Git blob.",
);
const manifest = combatManifestSchema.parse(
  JSON.parse((await bounded(path.join(combatRoot, "manifest.json"), 4000)).toString("utf8")),
);
const raw = await bounded(path.join(combatRoot, manifest.file), 16_000_000);
assert.equal(hash(raw), manifest.sha256, "Combat checksum differs.");
const combat = combatDatasetSchema.parse(JSON.parse(raw.toString("utf8")));
assert.equal(combat.targetBuild, manifest.targetBuild, "Combat build differs.");
const [compressed, license, copyright] = await Promise.all([
  bounded(path.join(provider, sourceIdentity.file), 32_000_000),
  bounded(path.join(provider, "LICENSE.md"), 100_000),
  bounded(path.join(provider, "COPYRIGHT.md"), 100_000),
]);
const sql = gunzipSync(compressed, { maxOutputLength: 128_000_000 }).toString("utf8");
assert.ok(Buffer.byteLength(sql) <= 128_000_000, "Decoded SQL exceeds its budget.");
const tables = extractClassicLootTables(
  sql,
  new Set(combat.npcs.map((n) => n.id)),
  new Set(combat.quests.flatMap((q) => (q.itemObjectives ?? []).map((i) => i.itemId))),
);
const selected = selectClassicLootReferences(tables, combat, {
  includeUncapturedQuestDrops: values["include-reference-only-drops"],
});
const reference = classicLootReferenceSchema.parse({
  schema: "classic-loot-reference.v1",
  targetBuild: combat.targetBuild,
  targetCombatSha256: manifest.sha256,
  source: { ...sourceIdentity, sha256: hash(compressed) },
  items: selected.items,
  drops: selected.drops,
});
const result = enrichCombatClassicLoot(combat, reference, manifest.sha256);
const authorizationNote = values["authorization-note"]?.trim() ?? "";
const output = combatDatasetSchema.parse({
  ...result.data,
  publication: authorizationNote ? "authorized" : "private-reference",
  authorizationNote,
});
const referenceRaw = JSON.stringify(reference) + "\n",
  referenceHash = hash(referenceRaw);
const outputRaw = JSON.stringify(output) + "\n",
  outputHash = hash(outputRaw);
await mkdir(path.join(destination, "combat"), { recursive: true });
await immutable(path.join(destination, `classic-loot-${referenceHash}.json`), referenceRaw);
await immutable(path.join(destination, "classic-db-LICENSE.md"), license);
await immutable(path.join(destination, "classic-db-COPYRIGHT.md"), copyright);
await immutable(path.join(destination, "combat", `combat-${outputHash}.json`), outputRaw);
await atomicJson(path.join(destination, "combat/manifest.json"), {
  schema: "forever-combat-manifest.v1",
  file: `combat-${outputHash}.json`,
  sha256: outputHash,
  targetBuild: output.targetBuild,
});
const report = {
  schema: "leveling-classic-loot-preparation.v1",
  sourceCombatSha256: manifest.sha256,
  referenceSha256: referenceHash,
  outputCombatSha256: outputHash,
  targetBuild: output.targetBuild,
  publication: output.publication,
  source: reference.source,
  scannedRows: tables.counts,
  compatibleItems: selected.items.length,
  compatibleFixedOneDrops: selected.drops.length,
  ambiguousReferences: selected.ambiguousReferences,
  stackReferencesAdded: result.stackReferencesAdded,
  sharingReferencesAdded: result.sharingReferencesAdded,
  probabilityReferencesAdded: result.probabilityReferencesAdded,
  missingDropReferencesAdded: result.missingDropReferencesAdded,
  dropProbabilitiesChanged: 0,
  scope:
    "Historical stack, sharing and base quest-roll probability assumptions; not current Forever observations. Captured probabilities and sources remain unchanged. No SQL execution, crawling, production activation or player data.",
};
await atomicJson(path.join(destination, "report.json"), report);
process.stdout.write(JSON.stringify(report) + "\n");
