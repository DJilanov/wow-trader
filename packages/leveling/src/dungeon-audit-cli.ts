import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { guideArchiveManifestSchema, importedChapterSchema } from "./guide-archive.js";
import {
  DUNGEON_FACTS,
  DUNGEON_REFERENCE,
  DUNGEON_QUESTS,
  DUNGEON_RELEASE,
  DUNGEON_VISITS,
} from "./dungeon-catalog.js";
import { auditDungeonCoverage } from "./dungeon-planner.js";

const root = resolve(process.argv[2] ?? "../../artifacts/leveling/archive");
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")),
);
if (manifest.publication !== "authorized")
  throw new Error("Archive is not authorized for publication");
if (manifest.targetBuild !== DUNGEON_FACTS.targetBuild)
  throw new Error("Dungeon overlay/archive build mismatch");
const chapters = [];
for (const entry of manifest.chapters) {
  const raw = await readFile(resolve(root, entry.file), "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== entry.sha256)
    throw new Error(`Checksum failed for ${entry.chapterId}`);
  const chapter = importedChapterSchema.parse(JSON.parse(raw));
  if (
    chapter.version !== entry.version ||
    chapter.chapterId !== entry.chapterId ||
    chapter.targetBuild !== manifest.targetBuild ||
    chapter.sourceSha256 !== entry.sourceSha256 ||
    chapter.steps.length !== entry.stepCount
  )
    throw new Error("Chapter does not match manifest");
  chapters.push(chapter);
}
const coverage = auditDungeonCoverage(chapters);
const sourceTags = new Set(
  chapters.flatMap((chapter) =>
    chapter.steps.flatMap((step) =>
      step.directives
        .filter((directive) => directive.tag === ".dungeon")
        .map((directive) => directive.arguments.replace(/^!/, "").toUpperCase()),
    ),
  ),
);
for (const visit of DUNGEON_VISITS)
  if (visit.availability === "beta" && visit.sourceTag && !sourceTags.has(visit.sourceTag))
    throw new Error(`Dungeon source branch tag not found: ${visit.sourceTag}`);
const missingAssociations = DUNGEON_REFERENCE.associations.filter(
  (entry) => !DUNGEON_VISITS.some((visit) => visit.questIds.includes(entry.questId)),
);
if (missingAssociations.length)
  throw new Error(
    `Uncataloged reference associations: ${missingAssociations.map((entry) => entry.questId).join(",")}`,
  );
process.stdout.write(
  JSON.stringify(
    {
      release: DUNGEON_RELEASE,
      targetBuild: manifest.targetBuild,
      chapters: chapters.length,
      supplementalAssociations: DUNGEON_FACTS.associations.length,
      guideAssociations: DUNGEON_REFERENCE.associations.length,
      distinctQuestRecords: DUNGEON_QUESTS.length,
      unresolvedCurrentXp: DUNGEON_QUESTS.length,
      coverage,
      note: "Counts include all conditional variants, not a runnable per-character itinerary. Unknown facts require review.",
    },
    null,
    2,
  ) + "\n",
);
