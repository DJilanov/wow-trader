import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { basename, resolve, join } from "node:path";
import { z } from "zod";
import {
  auditChapterCatalog,
  chapterEligibility,
  extractChapterReferences,
  getChapterLabel,
  parseGuideInventoryCsv,
} from "./chapter-catalog.js";
import { CHAPTER_CATALOG_SOURCE, CHAPTER_REFERENCES } from "./chapter-data.js";
import { LEVELING_RACES, createCharacterProfile } from "./profile.js";
import {
  guideArchiveManifestSchema,
  parseGuideChapter,
  type GuideArchiveManifest,
  type RaceGuideCoverage,
} from "./guide-archive.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [sourceRoot, outputRoot, ...flags] = args;
  if (!sourceRoot || !outputRoot || flags.some((flag) => flag !== "--authorized"))
    throw new Error(
      "Usage: archive <private-analysis-directory> <output-directory> [--authorized]",
    );
  const sourceDirectory = resolve(sourceRoot),
    output = resolve(outputRoot);
  if (output === sourceDirectory || output.startsWith(`${sourceDirectory}/`))
    throw new Error("Output must not overwrite the source analysis");
  const csv = await readFile(join(sourceDirectory, "guide_inventory.csv"), "utf8");
  const summary = z
    .object({
      source_sha256: z.string(),
      guide_count: z.number().int(),
      raw_step_count: z.number().int(),
      bundle_checksum_verified: z.literal(true),
      cached_guides_match_bundle: z.literal(true),
    })
    .parse(JSON.parse(await readFile(join(sourceDirectory, "summary.json"), "utf8")));
  if (
    sha256(csv) !== CHAPTER_CATALOG_SOURCE.inventorySha256 ||
    summary.source_sha256 !== CHAPTER_CATALOG_SOURCE.sourceSha256
  )
    throw new Error("Source inventory/bundle changed; review catalog provenance before importing");
  const references = extractChapterReferences(csv),
    rows = parseGuideInventoryCsv(csv);
  if (
    JSON.stringify(references) !== JSON.stringify(CHAPTER_REFERENCES) ||
    references.length !== summary.guide_count
  )
    throw new Error("Guide inventory does not match the reviewed chapter catalog");
  const chapters: GuideArchiveManifest["chapters"] = [];
  const parsed = [];
  for (const [index, reference] of references.entries()) {
    const row = rows[index];
    const file = basename(row?.guide_file ?? "");
    if (!file.endsWith(".txt")) throw new Error(`Missing source file for ${reference.id}`);
    const source = await readFile(join(sourceDirectory, "guides", file), "utf8");
    const chapter = parseGuideChapter(source, reference.id, sha256(source), 70205);
    if (chapter.steps.length !== Number(row?.step_count))
      throw new Error(`Step count mismatch for ${reference.id}`);
    parsed.push(chapter);
    const body = JSON.stringify(chapter);
    chapters.push({
      chapterId: reference.id,
      version: chapter.version,
      file: `${reference.id}-v2-${chapter.sourceSha256.slice(0, 16)}.json`,
      sha256: sha256(body),
      sourceSha256: chapter.sourceSha256,
      stepCount: chapter.steps.length,
      questIds: [
        ...new Set(
          chapter.steps.flatMap((step) =>
            step.directives.flatMap((directive) =>
              directive.questId === null ? [] : [directive.questId],
            ),
          ),
        ),
      ].sort((a, b) => a - b),
    });
  }
  const totalSteps = parsed.reduce((total, chapter) => total + chapter.steps.length, 0);
  if (totalSteps !== summary.raw_step_count)
    throw new Error("Aggregate step count does not match extraction summary");
  const manifest = guideArchiveManifestSchema.parse({
    schemaVersion: 1,
    parserVersion: "forever-guide-v2",
    publication: flags.includes("--authorized") ? "authorized" : "private-reference",
    authorizationNote: flags.includes("--authorized")
      ? "Owner confirmed redistribution authorization on 2026-10-04; import explicitly run with --authorized."
      : "Private reference; redistribution not approved.",
    sourceSha256: summary.source_sha256,
    inventorySha256: sha256(csv),
    targetBuild: 70205,
    chapters,
  });
  const coverage: RaceGuideCoverage[] = LEVELING_RACES.flatMap((race) =>
    race.classes.map((classSlug) => {
      const profile = { ...createCharacterProfile(race.faction, race.id), classSlug, xpRate: 1 };
      const selected = references.filter(
        (chapter) =>
          chapter.family === "questing" && chapterEligibility(chapter, profile) === "match",
      );
      const labels = selected.map((chapter) => getChapterLabel(chapter, profile));
      return {
        faction: race.faction,
        raceId: race.id,
        classSlug,
        minimumLevel: labels.length ? Math.min(...labels.map((label) => label.minimumLevel)) : null,
        maximumLevel: labels.length ? Math.max(...labels.map((label) => label.maximumLevel)) : null,
        missingBrackets: Array.from({ length: 59 }, (_, index) => index + 1).filter(
          (level) =>
            !labels.some((label) => label.minimumLevel <= level && label.maximumLevel > level),
        ),
        chapterIds: selected.map((chapter) => chapter.id),
      };
    }),
  );
  const directiveCounts: Record<string, number> = {};
  for (const chapter of parsed)
    for (const step of chapter.steps)
      for (const directive of step.directives)
        directiveCounts[directive.tag] = (directiveCounts[directive.tag] ?? 0) + 1;
  const report = {
    guideCount: parsed.length,
    totalSteps,
    uniqueQuestIds: new Set(chapters.flatMap((chapter) => chapter.questIds)).size,
    publication: manifest.publication,
    ...auditChapterCatalog(references),
    coverage,
    notes: [
      "Level coverage is available chapter metadata, not a continuous playtested chain.",
      "XP-rate 1 used for the coverage audit only; reader preserves unknown player XP rate.",
      "Horde Skyborne continuation is absent in the source header.",
      "World coordinates retain their original space and are never presented as map percentages.",
    ],
    directiveCounts,
  };
  await mkdir(output, { recursive: true });
  for (const [index, chapter] of parsed.entries()) {
    const entry = chapters[index]!;
    const file = join(output, entry.file);
    try {
      await writeFile(file, JSON.stringify(chapter), { flag: "wx", mode: 0o600 });
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      if (sha256(await readFile(file, "utf8")) !== entry.sha256)
        throw new Error(`Immutable archived chapter was modified: ${entry.chapterId}`);
    }
  }
  for (const [file, value] of [
    ["manifest.json", manifest],
    ["audit.json", report],
  ] as const) {
    const temp = join(output, `${file}.${process.pid}.tmp`);
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, join(output, file));
  }
  console.log(
    JSON.stringify(
      {
        output,
        guideCount: parsed.length,
        totalSteps,
        uniqueQuestIds: report.uniqueQuestIds,
        publication: manifest.publication,
        coverageGaps: coverage
          .filter((row) => row.missingBrackets.length > 0)
          .map(({ chapterIds: _chapterIds, ...row }) => row),
        unresolvedTargets: report.unresolvedTargets,
        cycles: report.cycles,
      },
      null,
      2,
    ),
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Guide archive import failed");
  process.exitCode = 1;
});
