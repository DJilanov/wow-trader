import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, basename, dirname } from "node:path";
import {
  guideArchiveManifestSchema,
  importedChapterSchema,
  type GuideArchiveManifest,
  type ImportedChapter,
} from "@wow-trader/leveling";
import { projectChapterActivity, type ChapterActivity } from "./leveling-chapter-path";

const repositoryRoot = resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  basename(process.cwd()) === "web" && basename(dirname(process.cwd())) === "apps" ? "../.." : ".",
);
function archiveRoot(): string {
  return resolve(
    /* turbopackIgnore: true */ repositoryRoot,
    process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive",
  );
}
let manifestCache: { root: string; mtimeMs: number; value: GuideArchiveManifest } | undefined;
export async function getLevelingArchiveManifest(): Promise<GuideArchiveManifest | null> {
  const root = archiveRoot(),
    path = join(root, "manifest.json");
  let info;
  try {
    info = await stat(/* turbopackIgnore: true */ path);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  if (manifestCache?.root === root && manifestCache.mtimeMs === info.mtimeMs)
    return manifestCache.value;
  if (info.size > 1_000_000) throw new Error("Leveling archive manifest exceeds its size limit");
  // Authorized archives are provisioned separately; tracing must not bundle the maintainer's workspace.
  const manifest = guideArchiveManifestSchema.parse(
    JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")),
  );
  if (manifest.publication !== "authorized") return null;
  manifestCache = { root, mtimeMs: info.mtimeMs, value: manifest };
  return manifest;
}
export async function getImportedLevelingChapter(
  chapterId: string,
): Promise<ImportedChapter | null> {
  const manifest = await getLevelingArchiveManifest();
  const entry = manifest?.chapters.find((chapter) => chapter.chapterId === chapterId);
  if (!entry || !manifest) return null;
  const path = join(/* turbopackIgnore: true */ archiveRoot(), entry.file);
  if ((await stat(/* turbopackIgnore: true */ path)).size > 4_000_000)
    throw new Error("Leveling chapter exceeds its size limit");
  const raw = await readFile(/* turbopackIgnore: true */ path, "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== entry.sha256)
    throw new Error("Leveling chapter checksum failed");
  const chapter = importedChapterSchema.parse(JSON.parse(raw));
  if (
    chapter.chapterId !== chapterId ||
    chapter.sourceSha256 !== entry.sourceSha256 ||
    chapter.version !== entry.version ||
    chapter.targetBuild !== manifest.targetBuild ||
    chapter.steps.length !== entry.stepCount
  )
    throw new Error("Leveling chapter does not match its manifest");
  return chapter;
}

let activityCache:
  { manifest: GuideArchiveManifest; value: Promise<readonly ChapterActivity[]> } | undefined;

export async function getLevelingChapterActivities(): Promise<readonly ChapterActivity[]> {
  const manifest = await getLevelingArchiveManifest();
  if (!manifest) return [];
  if (activityCache?.manifest === manifest) return activityCache.value;
  const value = (async (): Promise<readonly ChapterActivity[]> => {
    const result: ChapterActivity[] = [];
    // Bound disk reads and validate each chapter before projecting counts; no guide text is sent.
    for (let index = 0; index < manifest.chapters.length; index += 8) {
      const batch = await Promise.all(
        manifest.chapters.slice(index, index + 8).map(async (entry): Promise<ChapterActivity> => {
          const chapter = await getImportedLevelingChapter(entry.chapterId);
          if (
            !chapter ||
            chapter.version !== entry.version ||
            chapter.targetBuild !== manifest.targetBuild ||
            chapter.sourceSha256 !== entry.sourceSha256
          )
            throw new Error("Leveling archive changed while loading chapter activity");
          return projectChapterActivity(chapter);
        }),
      );
      result.push(...batch);
    }
    return result;
  })();
  const cache = { manifest, value };
  activityCache = cache;
  try {
    return await value;
  } catch (error: unknown) {
    if (activityCache === cache) activityCache = undefined;
    throw error;
  }
}
