import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  questCatalogManifestSchema,
  questCatalogSchema,
  type QuestCatalog,
} from "@wow-trader/leveling";

export interface LevelingQuestCatalogSnapshot {
  readonly data: QuestCatalog | null;
  readonly revision: string;
  readonly notice: string | null;
}

let cache:
  | {
      readonly root: string;
      readonly mtime: number;
      readonly data: QuestCatalog;
      readonly revision: string;
    }
  | undefined;

export async function readLevelingQuestCatalog(
  root: string,
  production: boolean,
): Promise<LevelingQuestCatalogSnapshot> {
  const manifestPath = join(root, "manifest.json");
  try {
    let metadata;
    try {
      metadata = await stat(/* turbopackIgnore: true */ manifestPath);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { data: null, revision: "not-imported", notice: null };
      throw error;
    }
    if (metadata.size > 4000) throw new Error("Quest catalog manifest exceeds its size limit.");
    if (cache?.root !== root || cache.mtime !== metadata.mtimeMs) {
      const manifest = questCatalogManifestSchema.parse(
        JSON.parse(await readFile(/* turbopackIgnore: true */ manifestPath, "utf8")),
      );
      const file = join(root, manifest.file);
      if ((await stat(/* turbopackIgnore: true */ file)).size > 8_000_000)
        throw new Error("Quest catalog exceeds its size limit.");
      const raw = await readFile(/* turbopackIgnore: true */ file, "utf8");
      if (createHash("sha256").update(raw).digest("hex") !== manifest.sha256)
        throw new Error("Quest catalog checksum mismatch.");
      const data = questCatalogSchema.parse(JSON.parse(raw));
      if (data.targetBuild !== manifest.targetBuild)
        throw new Error("Quest catalog build mismatch.");
      cache = { root, mtime: metadata.mtimeMs, data, revision: manifest.sha256 };
    }
    if (production && cache.data.publication !== "authorized")
      return {
        data: null,
        revision: "publication-held",
        notice: "Additional quest references are awaiting publication authorization.",
      };
    return { data: cache.data, revision: cache.revision, notice: null };
  } catch {
    console.error("Leveling quest catalog validation failed.");
    return {
      data: null,
      revision: "validation-failed",
      notice:
        "Additional quest references failed validation and are excluded from the XP forecast.",
    };
  }
}

export async function getLevelingQuestCatalog(): Promise<LevelingQuestCatalogSnapshot> {
  const cwd = process.cwd();
  const repositoryRoot = resolve(
    /* turbopackIgnore: true */ cwd,
    basename(cwd) === "web" && basename(dirname(cwd)) === "apps" ? "../.." : ".",
  );
  const root = resolve(
    /* turbopackIgnore: true */ repositoryRoot,
    process.env.LEVELING_QUEST_CATALOG_ROOT ?? "artifacts/leveling/quest-funding-catalog",
  );
  return readLevelingQuestCatalog(root, process.env.NODE_ENV === "production");
}
