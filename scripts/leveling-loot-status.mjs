import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { Buffer } from "node:buffer";
import process from "node:process";
import {
  combatDatasetSchema,
  combatManifestSchema,
  lootQuantityModel,
} from "../packages/leveling/dist/index.js";
import { referenceTaskSchema, readStagedReference } from "../packages/reference-data/dist/index.js";

const { values } = parseArgs({
  options: {
    preparation: { type: "string", default: "artifacts/leveling/loot-preparation" },
    staging: { type: "string" },
    human: { type: "boolean", default: false },
  },
  strict: true,
});
if (!values.staging) throw Error("Pass --staging=<crawler staging>. This command is read-only.");
async function bounded(path, maximum) {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximum) throw Error("Status input exceeds file budget");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw Error("Status input grew beyond file budget");
  return raw;
}
const root = resolve(values.preparation),
  staging = resolve(values.staging);
const manifest = combatManifestSchema.parse(
  JSON.parse(await bounded(join(root, "combat/manifest.json"), 4000)),
);
const raw = await bounded(join(root, "combat", manifest.file), 16_000_000);
if (createHash("sha256").update(raw).digest("hex") !== manifest.sha256)
  throw Error("Combat checksum mismatch");
const dataset = combatDatasetSchema.parse(JSON.parse(raw));
const reportPath = join(root, "report.json");
const report = JSON.parse(await bounded(reportPath, 4_000_000));
if (
  report?.schema !== "leveling-loot-preparation.v1" ||
  report.outputCombatSha256 !== manifest.sha256 ||
  report.targetBuild !== manifest.targetBuild ||
  dataset.targetBuild !== manifest.targetBuild ||
  !Array.isArray(report.reviews) ||
  !Array.isArray(report.cacheErrors)
)
  throw Error("Loot preparation report mismatch");
const queueRaw = await bounded(join(root, "queue.json"), 8_000_000);
if (
  report.queueSha256 !== undefined &&
  createHash("sha256").update(queueRaw).digest("hex") !== report.queueSha256
)
  throw Error(
    "Loot preparation queue checksum mismatch; rerun preparation for a consistent snapshot",
  );
const queue = referenceTaskSchema.array().max(10000).parse(JSON.parse(queueRaw));
if (
  queue.some((task) => task.game !== "forever" || !["quest", "item"].includes(task.kind)) ||
  new Set(queue.map((task) => `${task.kind}:${task.id}`)).size !== queue.length
)
  throw Error("Invalid loot queue");
let captured = 0;
for (const task of queue) if (await readStagedReference(staging, task)) captured++;
const drops = dataset.lootDrops ?? [];
const result = {
  schema: "leveling-loot-status.v1",
  preparedAt: (await stat(reportPath)).mtime.toISOString(),
  targetBuild: dataset.targetBuild,
  combatSha256: manifest.sha256,
  publication: dataset.publication,
  remaining: {
    quests: queue.filter((task) => task.kind === "quest").length,
    items: queue.filter((task) => task.kind === "item").length,
    total: queue.length,
    alreadyCaptured: captured,
    unfetched: queue.length - captured,
  },
  dropFacts: {
    total: drops.length,
    sampled: drops.filter((drop) => drop.probabilityBasis === "sample-ratio").length,
    fixedQuantity: drops.filter((drop) => lootQuantityModel(drop) === "fixed").length,
    weightedQuantity: drops.filter((drop) => lootQuantityModel(drop) === "weighted").length,
    unknownQuantity: drops.filter((drop) => lootQuantityModel(drop) === "unknown").length,
  },
  manualReviews: report.reviews.length,
  cacheErrors: report.cacheErrors.length,
  note: "Capture completeness is not forecast readiness. Queue totals exclude stack/sharing reviews. Reprepare after new captures; sample ratios are not observed current-build rates.",
};
if (values.human)
  process.stdout.write(
    [
      `coverage snapshot: ${result.preparedAt}`,
      `coverage queue:    ${result.remaining.quests} quest(s), ${result.remaining.items} item(s)`,
      `already captured:  ${captured}/${queue.length}; unfetched: ${result.remaining.unfetched}`,
      `drop references:   ${drops.length} (${result.dropFacts.sampled} sample-based); fixed quantity: ${result.dropFacts.fixedQuantity}`,
      `weighted quantity: ${result.dropFacts.weightedQuantity} drop reference(s)`,
      `unknown quantity:  ${result.dropFacts.unknownQuantity} drop reference(s)`,
      `manual reviews:    ${result.manualReviews}; parse errors: ${result.cacheErrors}`,
      `publication:       ${result.publication}`,
      result.note,
    ].join("\n") + "\n",
  );
else process.stdout.write(JSON.stringify(result) + "\n");
