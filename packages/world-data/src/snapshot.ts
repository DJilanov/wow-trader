import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import {
  mapMediaManifestSchema,
  worldAreaSchema,
  worldBossLocationSchema,
  worldBossSchema,
  worldBossSpellCandidateSchema,
  worldContentTuningSchema,
  worldCreatureModelSchema,
  worldCreatureObjectiveSchema,
  worldEncounterSchema,
  worldItemSourceHintSchema,
  worldLfgDungeonSchema,
  worldLootSourceCandidateSchema,
  worldMapArtLayerSchema,
  worldMapArtSchema,
  worldMapArtTileSchema,
  worldMapDifficultySchema,
  worldMapSchema,
  worldPoiSchema,
  worldQuestLineMemberSchema,
  worldQuestLineSchema,
  worldQuestPoiSchema,
  worldQuestSchema,
  worldSnapshotManifestSchema,
  worldUiMapArtLinkSchema,
  worldUiMapAssignmentSchema,
  worldUiMapSchema,
  type WorldBundle,
} from "@wow-trader/contracts";
import type { z } from "zod";

export async function loadWorldSnapshot(manifestPath: string): Promise<WorldBundle> {
  const absoluteManifestPath = resolve(manifestPath);
  const snapshotDirectory = dirname(absoluteManifestPath);
  const manifest = worldSnapshotManifestSchema.parse(
    JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown,
  );

  const loadArtifact = async <T>(name: string, schema: z.ZodType<T>): Promise<T[]> => {
    const artifact = manifest.normalizedArtifacts[name];
    if (!artifact) throw new Error(`Manifest is missing normalized artifact '${name}'`);
    const artifactPath = resolveArtifactPath(snapshotDirectory, artifact.path);
    await assertChecksum(artifactPath, artifact.sha256, name);
    const records = await readNdjson(artifactPath, schema);
    if (records.length !== artifact.recordCount) {
      throw new Error(
        `Record count mismatch for '${name}': expected ${artifact.recordCount}, received ${records.length}`,
      );
    }
    return records;
  };

  const loadOptionalArtifact = async <T>(name: string, schema: z.ZodType<T>): Promise<T[]> =>
    manifest.normalizedArtifacts[name] ? loadArtifact(name, schema) : [];

  const [
    maps,
    areas,
    uiMaps,
    uiMapAssignments,
    mapArts,
    uiMapArtLinks,
    mapArtLayers,
    mapArtTiles,
    pois,
    encounters,
    lfgDungeons,
    quests,
    questLines,
    questLineMembers,
    questPois,
    itemSourceHints,
    creatureObjectives,
    bosses,
    bossLocations,
    creatureModels,
    bossSpellCandidates,
    lootSourceCandidates,
    mapDifficulties,
    contentTunings,
  ] = await Promise.all([
    loadArtifact("maps", worldMapSchema),
    loadArtifact("areas", worldAreaSchema),
    loadArtifact("ui-maps", worldUiMapSchema),
    loadArtifact("ui-map-assignments", worldUiMapAssignmentSchema),
    loadArtifact("map-arts", worldMapArtSchema),
    loadArtifact("ui-map-art-links", worldUiMapArtLinkSchema),
    loadArtifact("map-art-layers", worldMapArtLayerSchema),
    loadArtifact("map-art-tiles", worldMapArtTileSchema),
    loadArtifact("pois", worldPoiSchema),
    loadArtifact("encounters", worldEncounterSchema),
    loadArtifact("lfg-dungeons", worldLfgDungeonSchema),
    loadArtifact("quests", worldQuestSchema),
    loadArtifact("quest-lines", worldQuestLineSchema),
    loadArtifact("quest-line-members", worldQuestLineMemberSchema),
    loadArtifact("quest-pois", worldQuestPoiSchema),
    loadArtifact("item-source-hints", worldItemSourceHintSchema),
    loadOptionalArtifact("creature-objectives", worldCreatureObjectiveSchema),
    loadOptionalArtifact("bosses", worldBossSchema),
    loadOptionalArtifact("boss-locations", worldBossLocationSchema),
    loadOptionalArtifact("creature-models", worldCreatureModelSchema),
    loadOptionalArtifact("boss-spell-candidates", worldBossSpellCandidateSchema),
    loadOptionalArtifact("loot-source-candidates", worldLootSourceCandidateSchema),
    loadOptionalArtifact("map-difficulties", worldMapDifficultySchema),
    loadOptionalArtifact("content-tunings", worldContentTuningSchema),
  ]);

  const mediaPath = resolveArtifactPath(snapshotDirectory, manifest.mapMediaManifest.path);
  await assertChecksum(mediaPath, manifest.mapMediaManifest.sha256, "map-media-manifest");
  const mapMedia = mapMediaManifestSchema.parse(JSON.parse(await readFile(mediaPath, "utf8")));
  if (mapMedia.tiles.length !== manifest.mapMediaManifest.recordCount) {
    throw new Error(
      `Map media count mismatch: expected ${manifest.mapMediaManifest.recordCount}, received ${mapMedia.tiles.length}`,
    );
  }
  await Promise.all(
    mapMedia.tiles.map(async (tile) => {
      const tilePath = resolveArtifactPath(snapshotDirectory, tile.path);
      await assertChecksum(tilePath, tile.sha256, `map tile ${tile.fileDataId}`);
    }),
  );

  return {
    manifest,
    maps,
    areas,
    uiMaps,
    uiMapAssignments,
    mapArts,
    uiMapArtLinks,
    mapArtLayers,
    mapArtTiles,
    pois,
    encounters,
    lfgDungeons,
    quests,
    questLines,
    questLineMembers,
    questPois,
    itemSourceHints,
    creatureObjectives,
    bosses,
    bossLocations,
    creatureModels,
    bossSpellCandidates,
    lootSourceCandidates,
    mapDifficulties,
    contentTunings,
    mapMedia,
  };
}

async function readNdjson<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  const source = createReadStream(path);
  const input = extname(path) === ".gz" ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const records: T[] = [];
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;
    try {
      records.push(schema.parse(JSON.parse(line) as unknown));
    } catch (error: unknown) {
      throw new Error(`Invalid record in ${path}:${lineNumber}`, { cause: error });
    }
  }
  return records;
}

function resolveArtifactPath(snapshotDirectory: string, artifactPath: string): string {
  const absolutePath = resolve(snapshotDirectory, artifactPath);
  const traversal = relative(snapshotDirectory, absolutePath);
  if (
    traversal.startsWith("..") ||
    traversal.includes(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Artifact path escapes the snapshot directory: ${artifactPath}`);
  }
  return absolutePath;
}

async function assertChecksum(path: string, expected: string, name: string): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`Checksum mismatch for '${name}': expected ${expected}, received ${actual}`);
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
