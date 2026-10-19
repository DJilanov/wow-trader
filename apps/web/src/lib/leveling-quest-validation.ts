import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAMPAIGN_ADDON_COMPILER_REVISION,
  questValidationCoverageSchema,
  type QuestValidationCoverage,
} from "@wow-trader/leveling";

export interface LevelingQuestValidationSnapshot {
  readonly data: QuestValidationCoverage | null;
  readonly revision: string;
  readonly notice: string | null;
}

let cache:
  | { readonly path: string; readonly signature: string; readonly data: QuestValidationCoverage }
  | undefined;

export async function readLevelingQuestValidationCoverage(
  configuredPath: string | undefined,
  expectedSha256: string | undefined,
  runtimeBuild: number | null,
): Promise<LevelingQuestValidationSnapshot> {
  if (!configuredPath && !expectedSha256)
    return { data: null, revision: "not-configured", notice: null };
  try {
    if (!configuredPath || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256))
      throw new Error("Quest validation needs a checksum-bound coverage artifact.");
    if (runtimeBuild === null || !Number.isSafeInteger(runtimeBuild) || runtimeBuild <= 0)
      throw new Error("Current client identity is unavailable.");
    const path = resolve(configuredPath);
    const info = await stat(path);
    if (!info.isFile() || info.size > 4_000_000)
      throw new Error("Quest validation coverage exceeds its size budget.");
    const signature = `${info.ino}:${info.mtimeMs}:${info.size}:${expectedSha256}`;
    if (!cache || cache.path !== path || cache.signature !== signature) {
      const raw = await readFile(path);
      if (
        raw.byteLength > 4_000_000 ||
        createHash("sha256").update(raw).digest("hex") !== expectedSha256
      )
        throw new Error("Quest validation coverage checksum mismatch.");
      cache = {
        path,
        signature,
        data: questValidationCoverageSchema.parse(JSON.parse(raw.toString("utf8"))),
      };
    }
    if (
      cache.data.runtimeBuild !== runtimeBuild ||
      cache.data.compilerRevision !== CAMPAIGN_ADDON_COMPILER_REVISION
    )
      throw new Error("Quest validation coverage has another runtime build or compiler.");
    return { data: cache.data, revision: `quest-validation-${expectedSha256}`, notice: null };
  } catch (error: unknown) {
    console.error(
      "Quest validation coverage validation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return {
      data: null,
      revision: "validation-failed",
      notice:
        "Reviewed quest validation could not be verified. Affected quest conditions remain unverified; no XP or quest progress was changed.",
    };
  }
}

export async function getLevelingQuestValidationCoverage(
  runtimeBuild: number | null,
): Promise<LevelingQuestValidationSnapshot> {
  const configuredBuild = process.env.WOW_TRADER_LEVELING_RUNTIME_BUILD;
  const expectedBuild = configuredBuild
    ? /^[1-9]\d{0,7}$/.test(configuredBuild)
      ? Number(configuredBuild)
      : null
    : runtimeBuild;
  return readLevelingQuestValidationCoverage(
    process.env.WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE,
    process.env.WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE_SHA256,
    expectedBuild,
  );
}
