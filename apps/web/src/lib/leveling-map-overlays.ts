import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { mapMediaManifestSchema, worldSnapshotManifestSchema } from "@wow-trader/contracts";
import { z } from "zod";
import type { LevelingMapOverlay } from "./leveling-map-data";

const overlaySchema = z.object({
  id: z.number().int().positive(),
  UiMapArtID: z.number().int().positive(),
  TextureWidth: z.number().int().nonnegative(),
  TextureHeight: z.number().int().nonnegative(),
  OffsetX: z.number().int(),
  OffsetY: z.number().int(),
  PlayerConditionID: z.number().int().nonnegative(),
});
const overlayTileSchema = z.object({
  WorldMapOverlayID: z.number().int().positive(),
  FileDataID: z.number().int().positive(),
  RowIndex: z.number().int().nonnegative(),
  ColIndex: z.number().int().nonnegative(),
  LayerIndex: z.number().int().nonnegative(),
});
type Artifact = z.infer<typeof worldSnapshotManifestSchema>["mapMediaManifest"];
const cache = new Map<string, Promise<readonly LevelingMapOverlay[]>>();

async function readArtifact(root: string, artifact: Artifact): Promise<Buffer> {
  const path = resolve(root, artifact.path);
  const traversal = relative(root, path);
  if (traversal.startsWith("..") || isAbsolute(traversal))
    throw new Error("Map overlay artifact escapes the snapshot directory");
  const data = await readFile(path);
  if (createHash("sha256").update(data).digest("hex") !== artifact.sha256.toLowerCase())
    throw new Error("Map overlay artifact checksum mismatch");
  return data;
}

async function readRecords<T>(
  root: string,
  artifact: Artifact,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const data = gunzipSync(await readArtifact(root, artifact));
  const records = data
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => schema.parse(JSON.parse(line) as unknown));
  if (records.length !== artifact.recordCount) throw new Error("Map overlay record count mismatch");
  return records;
}

async function loadOverlays(
  manifestPath: string,
  product: string,
  buildNumber: number,
): Promise<readonly LevelingMapOverlay[]> {
  if (!isAbsolute(manifestPath))
    throw new Error("WOW_TRADER_WORLD_SNAPSHOT must be an absolute path");
  const manifest = worldSnapshotManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  if (manifest.product !== product || manifest.buildNumber !== buildNumber) return [];
  const overlayArtifact = manifest.rawTables["WorldMapOverlay.effective"];
  const tileArtifact = manifest.rawTables["WorldMapOverlayTile.effective"];
  if (!overlayArtifact || !tileArtifact) return [];
  const root = dirname(manifestPath);
  const [overlays, tiles, mediaData] = await Promise.all([
    readRecords(root, overlayArtifact, overlaySchema),
    readRecords(root, tileArtifact, overlayTileSchema),
    readArtifact(root, manifest.mapMediaManifest),
  ]);
  const media = mapMediaManifestSchema.parse(JSON.parse(mediaData.toString("utf8")) as unknown);
  if (media.product !== product || media.buildNumber !== buildNumber)
    throw new Error("Map overlay media build mismatch");
  if (media.tiles.length !== manifest.mapMediaManifest.recordCount)
    throw new Error("Map overlay media record count mismatch");
  const dimensions = new Map(media.tiles.map((tile) => [tile.fileDataId, tile]));
  return overlays
    .filter(
      (overlay) =>
        overlay.PlayerConditionID === 0 && overlay.TextureWidth > 0 && overlay.TextureHeight > 0,
    )
    .map((overlay) => ({
      overlayId: overlay.id,
      mapArtId: overlay.UiMapArtID,
      width: overlay.TextureWidth,
      height: overlay.TextureHeight,
      offsetX: overlay.OffsetX,
      offsetY: overlay.OffsetY,
      tiles: tiles
        .filter((tile) => tile.WorldMapOverlayID === overlay.id)
        .flatMap((tile) => {
          const image = dimensions.get(tile.FileDataID);
          return image
            ? [
                {
                  fileDataId: tile.FileDataID,
                  rowIndex: tile.RowIndex,
                  columnIndex: tile.ColIndex,
                  layerIndex: tile.LayerIndex,
                  width: image.width,
                  height: image.height,
                },
              ]
            : [];
        }),
    }))
    .filter((overlay) => overlay.tiles.length > 0);
}

export async function getLevelingMapOverlays(
  product: string,
  buildNumber: number,
): Promise<readonly LevelingMapOverlay[]> {
  const manifestPath = process.env.WOW_TRADER_WORLD_SNAPSHOT;
  if (!manifestPath) return [];
  const key = `${manifestPath}:${product}:${buildNumber}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = loadOverlays(manifestPath, product, buildNumber).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}
