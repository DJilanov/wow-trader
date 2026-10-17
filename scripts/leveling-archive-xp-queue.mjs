import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { parseArgs } from "node:util";
import process from "node:process";
import console from "node:console";
import {
  CHAPTER_REFERENCES,
  CHAPTER_CATALOG_SOURCE,
  DUNGEON_FACTS,
  DUNGEON_REFERENCE,
  DUNGEON_QUESTS,
  buildArchiveQuestInventory,
  guideArchiveManifestSchema,
  importedChapterSchema,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    archive: { type: "string" },
    destination: { type: "string" },
  },
});
if (!values.destination)
  throw new Error("Pass --destination=<new queue directory> [--archive=<authorized archive>]");
const root = resolve(
  values.archive ?? process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function readBounded(path, maximum) {
  if ((await stat(path)).size > maximum) throw new Error("Archive input exceeds size budget");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw new Error("Archive input exceeds size budget");
  return raw;
}
const manifestRaw = await readBounded(join(root, "manifest.json"), 4000000);
const manifest = guideArchiveManifestSchema.parse(JSON.parse(manifestRaw));
if (manifest.publication !== "authorized")
  throw new Error("Only authorized archives can seed collection");
if (
  manifest.sourceSha256 !== CHAPTER_CATALOG_SOURCE.sourceSha256 ||
  manifest.inventorySha256 !== CHAPTER_CATALOG_SOURCE.inventorySha256 ||
  manifest.chapters.length !== CHAPTER_REFERENCES.length
)
  throw new Error("Full archive does not match the reviewed source catalog");
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (!reference) throw new Error(`Missing chapter metadata: ${entry.chapterId}`);
  const raw = await readBounded(join(root, entry.file), 8000000);
  if (hash(raw) !== entry.sha256) throw new Error(`Source checksum mismatch: ${entry.chapterId}`);
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  if (
    guide.chapterId !== entry.chapterId ||
    guide.targetBuild !== manifest.targetBuild ||
    guide.version !== entry.version ||
    guide.sourceSha256 !== entry.sourceSha256 ||
    guide.steps.length !== entry.stepCount
  )
    throw new Error(`Source manifest mismatch: ${entry.chapterId}`);
  const ids = [
    ...new Set(
      guide.steps.flatMap((step) =>
        step.directives.flatMap((directive) =>
          directive.questId === null ? [] : [directive.questId],
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  if (JSON.stringify(ids) !== JSON.stringify(entry.questIds))
    throw new Error(`Source quest inventory mismatch: ${entry.chapterId}`);
  sources.push({ reference, guide });
}
const entries = buildArchiveQuestInventory(sources, DUNGEON_QUESTS, [
  ...DUNGEON_FACTS.associations,
  ...DUNGEON_REFERENCE.associations,
]);
if (!entries.length || entries.length > 10000)
  throw new Error("Archive queue must contain 1-10000 quests");
const tasks = entries.map((entry) => ({ game: "forever", kind: "quest", id: entry.id }));
const raw = JSON.stringify(tasks),
  queueSha256 = hash(raw);
const summary = {
  chapters: sources.length,
  sourceSteps: sources.reduce((count, source) => count + source.guide.steps.length, 0),
  sourceActionQuestIds: new Set(manifest.chapters.flatMap((entry) => entry.questIds)).size,
  allianceChapters: sources.filter((source) => source.reference.factions.includes("alliance"))
    .length,
  hordeChapters: sources.filter((source) => source.reference.factions.includes("horde")).length,
  sharedChapters: sources.filter((source) => source.reference.factions.length > 1).length,
  allianceQuestIds: entries.filter((entry) => entry.factions.includes("alliance")).length,
  hordeQuestIds: entries.filter((entry) => entry.factions.includes("horde")).length,
  guideReferencedQuestIds: entries.filter((entry) =>
    entry.origins.some((origin) => origin.kind === "guide"),
  ).length,
  dungeonReferencedQuestIds: entries.filter((entry) =>
    entry.origins.some((origin) => origin.kind === "dungeon"),
  ).length,
  total: entries.length,
};
const directory = resolve(values.destination),
  prefix = `forever-archive-xp-${queueSha256.slice(0, 16)}`;
await mkdir(directory, { recursive: true });
const queuePath = join(directory, `${prefix}.json`);
await writeFile(queuePath, `${raw}\n`, { flag: "wx", mode: 0o600 });
await writeFile(
  join(directory, `${prefix}.inventory.json`),
  `${JSON.stringify(
    {
      schema: "leveling-archive-xp-priority.v1",
      createdAt: new Date().toISOString(),
      archiveSha256: manifest.sourceSha256,
      manifestSha256: hash(manifestRaw),
      targetBuild: manifest.targetBuild,
      queueSha256,
      summary,
      notes: [
        "All factions, guide families and conditional branches are retained for collection, not route eligibility.",
        "Condition references are not asserted to be mandatory prerequisites or additional payable quests.",
        "Known dungeon identities/gates are included; unmodeled dungeons remain unresolved, not assumed empty.",
      ],
      entries,
    },
    null,
    2,
  )}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify({ queuePath, queueSha256, ...summary }));
