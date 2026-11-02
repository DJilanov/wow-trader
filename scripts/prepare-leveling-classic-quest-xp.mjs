import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  questCatalogManifestSchema,
  questCatalogSchema,
  questRewardFactSchema,
} from "../packages/leveling/dist/index.js";
import {
  referenceTaskSchema,
  buildQuestXpImport,
  atomicJsonWrite,
} from "../packages/reference-data/dist/index.js";
import { extractClassicZeroXpRows } from "./classic-zero-xp.mjs";
import { CLASSIC_QUEST_XP_RULE, extractClassicHandInXpRows } from "./classic-hand-in-xp.mjs";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "zero" },
    "provider-root": { type: "string" },
    revision: { type: "string" },
    catalog: { type: "string" },
    facts: { type: "string" },
    queue: { type: "string" },
    "rule-source": { type: "string" },
    destination: { type: "string" },
    "imported-at": { type: "string" },
  },
  strict: true,
});
assert.ok(["zero", "hand-in"].includes(values.mode), "Use --mode=zero or --mode=hand-in.");
const handIn = values.mode === "hand-in";
assert.ok(
  values["provider-root"] &&
    values.revision &&
    values.catalog &&
    values.facts &&
    values.queue &&
    values["rule-source"] &&
    values.destination,
  "Pass --provider-root=CHECKOUT --revision=SHA --catalog=ROOT --facts=SNAPSHOT --queue=JSON --rule-source=CPP --destination=ROOT.",
);
assert.match(values.revision, /^[a-f0-9]{40}$/);
const provider = path.resolve(values["provider-root"]),
  catalogRoot = path.resolve(values.catalog),
  destination = path.resolve(values.destination),
  databaseFile = "Full_DB/ClassicDB_1_12_1_z2815.sql.gz";
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
assert.ok(
  [provider, catalogRoot].every(
    (input) => !within(input, destination) && !within(destination, input),
  ),
  "Destination must not overlap a source directory.",
);
for (const input of [values.facts, values.queue, values["rule-source"]])
  assert.ok(!within(destination, path.resolve(input)), "Destination contains an input file.");
async function bounded(file, maximum) {
  const metadata = await stat(file);
  assert.ok(metadata.isFile() && metadata.size <= maximum, "Input exceeds file budget.");
  const raw = await readFile(file);
  assert.ok(raw.length <= maximum, "Input grew beyond file budget.");
  return raw;
}
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
  "Historical source must be clean.",
);
assert.equal(
  execFileSync("git", ["-C", provider, "hash-object", "--no-filters", "--", databaseFile], {
    encoding: "utf8",
  }).trim(),
  execFileSync(
    "git",
    ["-C", provider, "rev-parse", "--verify", `${values.revision}:${databaseFile}`],
    { encoding: "utf8" },
  ).trim(),
  "Historical database differs from its pinned Git blob.",
);
const manifest = questCatalogManifestSchema.parse(
  JSON.parse((await bounded(path.join(catalogRoot, "manifest.json"), 4000)).toString("utf8")),
);
const catalogRaw = await bounded(path.join(catalogRoot, manifest.file), 16_000_000);
assert.equal(hash(catalogRaw), manifest.sha256, "Quest catalog checksum differs.");
const catalog = questCatalogSchema.parse(JSON.parse(catalogRaw.toString("utf8")));
assert.equal(catalog.targetBuild, manifest.targetBuild, "Quest catalog build differs.");
const [compressed, rule, factsRaw, queueRaw, license, copyright] = await Promise.all([
  bounded(path.join(provider, databaseFile), 32_000_000),
  bounded(path.resolve(values["rule-source"]), 100_000),
  bounded(path.resolve(values.facts), 8_000_000),
  bounded(path.resolve(values.queue), 8_000_000),
  bounded(path.join(provider, "LICENSE.md"), 100_000),
  bounded(path.join(provider, "COPYRIGHT.md"), 100_000),
]);
assert.equal(
  hash(rule),
  CLASSIC_QUEST_XP_RULE.sha256,
  "The reviewed quest-XP rule source differs.",
);
const snapshot = JSON.parse(factsRaw.toString("utf8"));
assert.equal(snapshot.clientBuild, catalog.targetBuild, "Reward snapshot build differs.");
const facts = questRewardFactSchema.array().max(30000).parse(snapshot.facts);
assert.equal(new Set(facts.map((f) => f.questId)).size, facts.length, "Duplicate reward identity.");
const queue = referenceTaskSchema
  .array()
  .max(10000)
  .parse(JSON.parse(queueRaw.toString("utf8")));
assert.ok(
  queue.length && queue.every((t) => t.game === "forever" && t.kind === "quest"),
  "Use a nonempty Forever quest queue.",
);
assert.equal(
  new Set(queue.map((t) => t.id)).size,
  queue.length,
  "Duplicate requested quest identity.",
);
const byId = new Map(catalog.quests.map((q) => [q.questId, q])),
  known = new Map(facts.map((f) => [f.questId, f]));
const wanted = queue.flatMap((task) => {
  const quest = byId.get(task.id);
  assert.ok(quest, `Quest ${task.id} is outside the guide catalog.`);
  if (handIn) {
    const fact = known.get(task.id);
    assert.ok(
      fact?.status === "available" &&
        fact.evidenceKind === "historical-reference" &&
        fact.fullXp !== null &&
        fact.questLevel !== null,
      `Quest ${task.id} needs an available historical full reward before deriving its level table.`,
    );
    assert.equal(
      quest.questLevel,
      fact.questLevel,
      `Quest ${task.id} catalog/reward levels differ.`,
    );
    return [
      { ...quest, fullXp: fact.fullXp, questLevel: fact.questLevel, xpByLevel: fact.xpByLevel },
    ];
  }
  return ["available", "conflict"].includes(known.get(task.id)?.status) ? [] : [quest];
});
const result = (handIn ? extractClassicHandInXpRows : extractClassicZeroXpRows)(
  gunzipSync(compressed, { maxOutputLength: 128_000_000 }).toString("utf8"),
  wanted,
);
assert.ok(result.records.length, "No requested rewards have a compatible historical reference.");
const imported = await buildQuestXpImport({
  input: JSON.stringify(result.records),
  format: "json",
  game: "forever",
  sourceKind: "server-database",
  rewardBasis: "unscaled-reference",
  sourceRef: `Historical ClassicDB ${databaseFile}; ${handIn ? "matched full reward and reduced hand-in table" : "zero RewMoneyMaxLevel"} via Quest::XPValue`,
  revision: `db:${values.revision};rule:${CLASSIC_QUEST_XP_RULE.revision}`,
  exportSha256: hash(compressed),
  knownIds: new Set(wanted.map((q) => q.questId)),
  ...(values["imported-at"] ? { importedAt: values["imported-at"] } : {}),
});
assert.equal(imported.set.counts.conflicts, 0);
assert.equal(imported.set.counts.unknown, 0);
await mkdir(destination, { recursive: true });
async function immutable(file, raw) {
  try {
    await writeFile(file, raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    assert.equal(hash(await readFile(file)), hash(raw), "Existing output differs.");
  }
}
const raw = JSON.stringify(imported.set) + "\n",
  sha256 = hash(raw),
  file = `quest-xp-${handIn ? "hand-in" : "zero"}-${sha256}.json`;
await immutable(path.join(destination, file), raw);
await immutable(path.join(destination, "classic-db-LICENSE.md"), license);
await immutable(path.join(destination, "classic-db-COPYRIGHT.md"), copyright);
const report = {
  schema: handIn ? "leveling-hand-in-xp-preparation.v1" : "leveling-zero-xp-preparation.v1",
  targetBuild: catalog.targetBuild,
  catalogSha256: manifest.sha256,
  sourceRewardSnapshotSha256: hash(factsRaw),
  sourceQueueSha256: hash(queueRaw),
  source: {
    repository: "https://github.com/cmangos/classic-db",
    revision: values.revision,
    file: databaseFile,
    sha256: hash(compressed),
    sourceBuild: 5875,
  },
  rule: CLASSIC_QUEST_XP_RULE,
  file,
  sha256,
  addedQuestIds: result.records.map((r) => r.id),
  held: result.held,
  skippedExistingRewardIds: handIn
    ? []
    : queue
        .filter((task) => ["available", "conflict"].includes(known.get(task.id)?.status))
        .map((t) => t.id),
  scope: handIn
    ? "Historical level-specific reward tables only, with exact existing full-reward/quest-level matching. No published or observed Forever reward override, SQL execution, crawling or production activation."
    : "Explicit historical zero rewards only; not verified Forever payouts or proof of availability. No SQL execution, crawling, existing reward overwrite or production activation.",
};
await atomicJsonWrite(path.join(destination, "report.json"), report);
process.stdout.write(JSON.stringify(report) + "\n");
