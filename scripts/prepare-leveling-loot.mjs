import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import console from "node:console";
import { resolve, join, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  combatManifestSchema,
  combatDatasetSchema,
  guideArchiveManifestSchema,
  importedChapterSchema,
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  getLevelingRace,
  buildCampaignPlan,
  prepareCampaignLootReferences,
  lootSharingSchema,
  lootQuantityModel,
  indexCombatReferences,
  resolveCombatObjectives,
} from "../packages/leveling/dist/index.js";
import {
  readStagedReference,
  parseWowheadPage,
  atomicJsonWrite,
  normalizeDropStatistics,
} from "../packages/reference-data/dist/index.js";

const { values } = parseArgs({
  options: {
    combat: { type: "string", default: "artifacts/leveling/combat" },
    archive: { type: "string", default: "artifacts/leveling/archive" },
    staging: { type: "string" },
    destination: { type: "string", default: "artifacts/leveling/loot-preparation" },
    "html-directory": { type: "string" },
    "permission-ref": { type: "string" },
    "sharing-overrides": { type: "string" },
  },
  strict: true,
});
if (!values.staging)
  throw Error(
    "Pass --staging=<your existing crawler staging directory>. This tool makes no network requests.",
  );
const destination = resolve(values.destination),
  combatRoot = resolve(values.combat),
  archiveRoot = resolve(values.archive);
function within(parent, child) {
  const path = relative(parent, child);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
if (
  [combatRoot, archiveRoot, resolve(values.staging)].some(
    (input) => within(input, destination) || within(destination, input),
  )
)
  throw Error("Destination must not overwrite an input directory.");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function bounded(path, maximum) {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximum) throw Error(`Input exceeds file budget: ${path}`);
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw Error(`Input grew beyond budget: ${path}`);
  return raw;
}
const manifest = combatManifestSchema.parse(
  JSON.parse(await bounded(join(combatRoot, "manifest.json"), 4000)),
);
const raw = await bounded(join(combatRoot, manifest.file), 16_000_000);
if (hash(raw) !== manifest.sha256) throw Error("Combat checksum mismatch");
let dataset = combatDatasetSchema.parse(JSON.parse(raw));
if (dataset.targetBuild !== manifest.targetBuild) throw Error("Combat build mismatch");
const archive = guideArchiveManifestSchema.parse(
  JSON.parse(await bounded(join(archiveRoot, "manifest.json"), 1000000)),
);
if (archive.targetBuild !== dataset.targetBuild) throw Error("Archive and combat builds differ");
const sources = [];
for (const entry of archive.chapters) {
  const reference = CHAPTER_REFERENCES.find((r) => r.id === entry.chapterId);
  if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
    continue;
  const chapter = await bounded(join(archiveRoot, entry.file), 8_000_000);
  if (hash(chapter) !== entry.sha256) throw Error("Guide checksum mismatch");
  const guide = importedChapterSchema.parse(JSON.parse(chapter));
  if (
    guide.chapterId !== entry.chapterId ||
    guide.targetBuild !== archive.targetBuild ||
    guide.sourceSha256 !== entry.sourceSha256 ||
    guide.version !== entry.version ||
    guide.steps.length !== entry.stepCount
  )
    throw Error("Guide manifest metadata mismatch");
  sources.push({ reference, guide });
}
const questIds = new Set();
let editions = 0;
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of getLevelingRace("alliance", race).classes) {
    const plan = buildCampaignPlan(race, archive.sourceSha256, sources, leaderClass);
    for (const action of [
      ...plan.actions,
      ...(plan.catchUpBatches ?? []).flatMap((batch) => batch.actions),
    ])
      for (const change of action.questChanges)
        if (change.state === "objectives-complete") questIds.add(change.questId);
    editions++;
  }
const quantityClaims = new Map(),
  quantityConflicts = [];
const references = indexCombatReferences(dataset);
for (const { guide } of sources)
  for (const step of guide.steps)
    for (const objective of resolveCombatObjectives(
      step.directives,
      references,
      `${guide.chapterId}:${step.id}`,
    )) {
      if (!questIds.has(objective.questId) || !objective.loot || objective.loot.quantity === null)
        continue;
      const key = `${objective.questId}:${objective.loot.itemId}`;
      if (!quantityClaims.has(key)) quantityClaims.set(key, new Set());
      quantityClaims.get(key).add(objective.loot.quantity);
    }
let sourceQuantitiesRecovered = 0;
dataset = combatDatasetSchema.parse({
  ...dataset,
  quests: dataset.quests.map((quest) => ({
    ...quest,
    ...(quest.itemObjectives
      ? {
          itemObjectives: quest.itemObjectives.map((item) => {
            const claims = quantityClaims.get(`${quest.questId}:${item.itemId}`);
            if (claims?.size > 1)
              quantityConflicts.push({
                questId: quest.questId,
                itemId: item.itemId,
                reason:
                  "Source variants disagree on the required item quantity; use reviewed quest evidence.",
              });
            if (item.quantity !== null || claims?.size !== 1) return item;
            sourceQuantitiesRecovered++;
            return { ...item, quantity: [...claims][0] };
          }),
        }
      : {}),
  })),
});
const overrides = [];
if (values["sharing-overrides"]) {
  const input = JSON.parse(await bounded(resolve(values["sharing-overrides"]), 1_000_000));
  if (!Array.isArray(input) || input.length > 10000) throw Error("Invalid sharing overrides");
  const seen = new Set();
  for (const entry of input) {
    if (
      !entry ||
      Object.keys(entry).some((key) => !["questId", "itemId", "sharing"].includes(key)) ||
      !Number.isSafeInteger(entry.questId) ||
      entry.questId < 1 ||
      !Number.isSafeInteger(entry.itemId) ||
      entry.itemId < 1
    )
      throw Error("Invalid sharing identity");
    const key = `${entry.questId}:${entry.itemId}`;
    if (seen.has(key)) throw Error("Duplicate sharing override");
    seen.add(key);
    overrides.push({ ...entry, sharing: lootSharingSchema.parse(entry.sharing) });
  }
}
const captures = [],
  cacheErrors = [];
const captureKeys = new Set();
async function capture(kind, id) {
  const key = `${kind}:${id}`;
  if (captureKeys.has(key)) return;
  captureKeys.add(key);
  const task = { game: "forever", kind, id };
  let record = await readStagedReference(resolve(values.staging), task);
  if (values["html-directory"]) {
    const path = join(resolve(values["html-directory"]), `forever-${kind}-${id}.html`);
    try {
      const html = await bounded(path, 4_000_000);
      const permissionRef = record?.permissionRef ?? values["permission-ref"];
      if (!permissionRef)
        throw Error("Cached HTML without a staged record requires --permission-ref");
      record = parseWowheadPage(html, task, {
        url: `https://www.wowhead.com/forever/${kind}=${id}`,
        capturedAt: record?.capturedAt ?? (await stat(path)).mtime.toISOString(),
        permissionRef,
      });
    } catch (error) {
      if (error?.code !== "ENOENT")
        cacheErrors.push({
          kind,
          id,
          reason: error instanceof Error ? error.message : "Invalid cached page",
        });
    }
  }
  if (record)
    captures.push({
      ...record,
      relations: record.relations.map((relation) => ({
        ...relation,
        ...(relation.dropStatistics
          ? { dropStatistics: normalizeDropStatistics(relation.dropStatistics) }
          : {}),
      })),
    });
}
for (const quest of dataset.quests)
  if (questIds.has(quest.questId) && (quest.itemCreatureIds.length || quest.itemObjectives?.length))
    await capture("quest", quest.questId);
const initial = prepareCampaignLootReferences(dataset, questIds, captures, overrides);
for (const quest of initial.data.quests)
  if (questIds.has(quest.questId))
    for (const item of quest.itemObjectives ?? []) await capture("item", item.itemId);
for (const item of [...captures])
  if (item.kind === "item")
    for (const relation of item.relations)
      if (relation.relation === "reward-from" && relation.kind === "quest")
        await capture("quest", relation.id);
const prepared = prepareCampaignLootReferences(dataset, questIds, captures, overrides);
const capturedKeys = new Set(captures.map((capture) => `${capture.kind}:${capture.id}`));
const outputRoot = join(destination, "combat");
await mkdir(outputRoot, { recursive: true });
const serialized = JSON.stringify(prepared.data) + "\n",
  emittedHash = hash(serialized);
const emittedFile = `combat-${emittedHash}.json`;
try {
  await writeFile(join(outputRoot, emittedFile), serialized, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
  if (hash(await bounded(join(outputRoot, emittedFile), 16_000_000)) !== emittedHash)
    throw Error("Existing prepared combat artifact is corrupt");
}
await atomicJsonWrite(
  join(outputRoot, "manifest.json"),
  combatManifestSchema.parse({
    schema: "forever-combat-manifest.v1",
    targetBuild: dataset.targetBuild,
    file: emittedFile,
    sha256: emittedHash,
  }),
);
const report = {
  schema: "leveling-loot-preparation.v1",
  targetBuild: dataset.targetBuild,
  sourceCombatSha256: manifest.sha256,
  archiveSha256: archive.sourceSha256,
  editions,
  publication: prepared.data.publication,
  outputCombatSha256: emittedHash,
  queueSha256: hash(JSON.stringify(prepared.queue) + "\n"),
  refreshQueueSha256: hash(JSON.stringify(prepared.refreshQueue) + "\n"),
  summary: {
    lootQuests: prepared.questIds.length,
    providedItemObjectives: prepared.data.quests.reduce(
      (total, quest) => total + (quest.itemObjectives?.filter((item) => item.provided).length ?? 0),
      0,
    ),
    questsNeedingItemIdentityOrQuantity: prepared.queue.filter((t) => t.kind === "quest").length,
    itemsNeedingDropRates: prepared.queue.filter((t) => t.kind === "item").length,
    capturedRateRefreshCandidates: prepared.refreshQueue.length,
    quantifiedDrops: prepared.data.lootDrops?.length ?? 0,
    sampleBasedDrops:
      prepared.data.lootDrops?.filter((drop) => drop.probabilityBasis === "sample-ratio").length ??
      0,
    fixedQuantityDrops:
      prepared.data.lootDrops?.filter((drop) => lootQuantityModel(drop) === "fixed").length ?? 0,
    weightedQuantityDrops:
      prepared.data.lootDrops?.filter((drop) => lootQuantityModel(drop) === "weighted").length ?? 0,
    pendingCapturedTasks: prepared.queue.filter((task) =>
      capturedKeys.has(`${task.kind}:${task.id}`),
    ).length,
    pendingUncapturedTasks: prepared.queue.filter(
      (task) => !capturedKeys.has(`${task.kind}:${task.id}`),
    ).length,
    sourceQuantitiesRecovered,
    manualReviews: prepared.reviews.length + quantityConflicts.length,
    cachedReferences: captures.length,
  },
  reviews: [...prepared.reviews, ...quantityConflicts],
  cacheErrors,
};
await atomicJsonWrite(join(destination, "queue.json"), prepared.queue);
await atomicJsonWrite(join(destination, "rate-refresh-queue.json"), prepared.refreshQueue);
await atomicJsonWrite(join(destination, "report.json"), report);
console.log(
  JSON.stringify({
    status: "prepared",
    queue: join(destination, "queue.json"),
    report: join(destination, "report.json"),
    combat: outputRoot,
    ...report.summary,
    networkRequests: 0,
    stagingChanged: false,
  }),
);
