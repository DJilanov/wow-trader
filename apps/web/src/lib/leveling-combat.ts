import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  combatDatasetSchema,
  combatManifestSchema,
  type CombatDataset,
  type ImportedChapter,
} from "@wow-trader/leveling";

export interface LevelingCombatSnapshot {
  readonly data: CombatDataset | null;
  readonly revision: string;
  readonly notice: string | null;
}
export interface ChapterCombatReference {
  readonly npcs: CombatDataset["npcs"];
  readonly quests: CombatDataset["quests"];
  readonly revision: string;
}

export async function getChapterCombatReference(
  guide: ImportedChapter,
): Promise<ChapterCombatReference | null> {
  const snapshot = await getLevelingCombatSnapshot();
  if (!snapshot.data || snapshot.data.targetBuild !== guide.targetBuild) return null;
  const ids = new Set(
    guide.steps.flatMap((step) =>
      step.directives.flatMap((directive) =>
        directive.questId === null ? [] : [directive.questId],
      ),
    ),
  );
  const quests = snapshot.data.quests.filter((quest) => ids.has(quest.questId));
  const npcIds = new Set(
    quests.flatMap((quest) => [...quest.creatureIds, ...quest.itemCreatureIds]),
  );
  return {
    quests,
    npcs: snapshot.data.npcs.filter((npc) => npcIds.has(npc.id)),
    revision: snapshot.revision,
  };
}
let cache:
  | {
      readonly path: string;
      readonly mtime: number;
      readonly revision: string;
      readonly data: CombatDataset;
    }
  | undefined;

export async function readLevelingCombatSnapshot(
  root: string,
  production: boolean,
): Promise<LevelingCombatSnapshot> {
  const path = join(root, "manifest.json");
  try {
    const info = await stat(/* turbopackIgnore: true */ path);
    if (info.size > 4000) throw new Error("Combat manifest exceeds its size limit.");
    let data: CombatDataset, revision: string;
    if (cache?.path === path && cache.mtime === info.mtimeMs) ({ data, revision } = cache);
    else {
      const manifest = combatManifestSchema.parse(
        JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")),
      );
      const file = join(root, manifest.file);
      if ((await stat(/* turbopackIgnore: true */ file)).size > 16_000_000)
        throw new Error("Combat data exceeds its size limit.");
      const raw = await readFile(/* turbopackIgnore: true */ file, "utf8");
      if (createHash("sha256").update(raw).digest("hex") !== manifest.sha256)
        throw new Error("Combat reference checksum mismatch.");
      data = combatDatasetSchema.parse(JSON.parse(raw));
      if (data.targetBuild !== manifest.targetBuild)
        throw new Error("Combat reference build mismatch.");
      revision = manifest.sha256;
      cache = { path, mtime: info.mtimeMs, data, revision };
    }
    if (production && data.publication !== "authorized")
      return {
        data: null,
        revision: "publication-held",
        notice:
          "Combat reference data is awaiting publication authorization; no private provider data is exposed.",
      };
    return {
      data,
      revision,
      notice:
        data.publication === "private-reference"
          ? "Local reference preview; not authorized for public publication."
          : null,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT" &&
      "path" in error &&
      error.path === path
    )
      return {
        data: null,
        revision: "not-imported",
        notice:
          "Combat references are not imported here. Unknown kill XP is excluded, not assumed to be zero.",
      };
    console.error("Leveling combat reference validation failed.");
    return {
      data: null,
      revision: "validation-failed",
      notice: "Combat references failed validation. No unverified combat data is used.",
    };
  }
}

export async function getLevelingCombatSnapshot(): Promise<LevelingCombatSnapshot> {
  const cwd = process.cwd();
  const repositoryRoot = resolve(
    /* turbopackIgnore: true */ cwd,
    basename(cwd) === "web" && basename(dirname(cwd)) === "apps" ? "../.." : ".",
  );
  const root = resolve(
    /* turbopackIgnore: true */ repositoryRoot,
    process.env.LEVELING_COMBAT_ROOT ?? "artifacts/leveling/combat",
  );
  return readLevelingCombatSnapshot(root, process.env.NODE_ENV === "production");
}
