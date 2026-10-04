import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLevelingMapOverlays } from "./leveling-map-overlays";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; manifest: Record<string, unknown> }> {
  const root = await mkdtemp(join(tmpdir(), "leveling-map-overlays-"));
  roots.push(root);
  const artifact = async (
    path: string,
    rows: readonly unknown[],
    compressed = true,
  ): Promise<{
    path: string;
    recordCount: number;
    sha256: string;
  }> => {
    const value = compressed
      ? gzipSync(rows.map((row) => JSON.stringify(row)).join("\n"))
      : Buffer.from(JSON.stringify(rows[0]));
    await writeFile(join(root, path), value);
    return {
      path,
      recordCount: compressed ? rows.length : 1,
      sha256: createHash("sha256").update(value).digest("hex"),
    };
  };
  const rawTables = {
    "WorldMapOverlay.effective": await artifact("overlay.gz", [
      {
        id: 1,
        UiMapArtID: 2153,
        TextureWidth: 306,
        TextureHeight: 233,
        OffsetX: 100,
        OffsetY: 200,
        PlayerConditionID: 0,
      },
      {
        id: 2,
        UiMapArtID: 2153,
        TextureWidth: 256,
        TextureHeight: 256,
        OffsetX: 0,
        OffsetY: 0,
        PlayerConditionID: 42,
      },
      {
        id: 3,
        UiMapArtID: 2153,
        TextureWidth: 0,
        TextureHeight: 0,
        OffsetX: 0,
        OffsetY: 0,
        PlayerConditionID: 0,
      },
    ]),
    "WorldMapOverlayTile.effective": await artifact("tiles.gz", [
      { WorldMapOverlayID: 1, FileDataID: 300, RowIndex: 0, ColIndex: 0, LayerIndex: 0 },
      { WorldMapOverlayID: 1, FileDataID: 301, RowIndex: 0, ColIndex: 1, LayerIndex: 0 },
      { WorldMapOverlayID: 2, FileDataID: 300, RowIndex: 0, ColIndex: 0, LayerIndex: 0 },
      { WorldMapOverlayID: 3, FileDataID: 300, RowIndex: 0, ColIndex: 0, LayerIndex: 0 },
    ]),
  };
  const media = await artifact(
    "media.json",
    [
      {
        schemaVersion: "map-media-manifest.v1",
        product: "wow_classic_beta",
        clientVersion: "1.60.1.70205",
        buildNumber: 70205,
        extractedAt: "2026-10-04T00:00:00Z",
        tiles: [
          {
            fileDataId: 300,
            path: "media/map-art/300.png",
            width: 256,
            height: 256,
            sha256: "a".repeat(64),
          },
        ],
        unavailableTiles: [],
      },
    ],
    false,
  );
  const manifest = {
    schemaVersion: "world-snapshot-manifest.v1",
    product: "wow_classic_beta",
    clientVersion: "1.60.1.70205",
    buildNumber: 70205,
    buildKey: "a".repeat(32),
    cdnKey: "b".repeat(32),
    locale: "enUS",
    extractedAt: "2026-10-04T00:00:00Z",
    hotfix: { status: "missing", sha256: null },
    definitions: { source: "wowdev/WoWDBDefs", revision: "a".repeat(40) },
    extractor: { name: "wow-trader-world-extractor", version: "0.4.0", revision: null },
    rawTables,
    normalizedArtifacts: {},
    mapMediaManifest: media,
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  vi.stubEnv("WOW_TRADER_WORLD_SNAPSHOT", join(root, "manifest.json"));
  return { root, manifest };
}

describe("validated client map reveal layers", () => {
  it("keeps only decoded, unconditional tiles from the exact world build", async () => {
    await fixture();
    const overlays = await getLevelingMapOverlays("wow_classic_beta", 70205);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      overlayId: 1,
      mapArtId: 2153,
      width: 306,
      height: 233,
      offsetX: 100,
      offsetY: 200,
    });
    expect(overlays[0]?.tiles).toEqual([
      { fileDataId: 300, rowIndex: 0, columnIndex: 0, layerIndex: 0, width: 256, height: 256 },
    ]);
  });
  it("does not combine builds or products", async () => {
    await fixture();
    expect(await getLevelingMapOverlays("wow_classic_beta", 70124)).toEqual([]);
    expect(await getLevelingMapOverlays("wow_anniversary", 70205)).toEqual([]);
  });
  it("rejects a corrupt artifact and allows retry after repair", async () => {
    const { root } = await fixture();
    const original = await readFile(join(root, "overlay.gz"));
    await writeFile(join(root, "overlay.gz"), "corrupt");
    await expect(getLevelingMapOverlays("wow_classic_beta", 70205)).rejects.toThrow(
      "checksum mismatch",
    );
    await writeFile(join(root, "overlay.gz"), original);
    expect(await getLevelingMapOverlays("wow_classic_beta", 70205)).toHaveLength(1);
  });
  it("rejects artifact paths outside the trusted snapshot root", async () => {
    const { root, manifest } = await fixture();
    const rawTables = manifest.rawTables as Record<string, { path: string }>;
    rawTables["WorldMapOverlay.effective"]!.path = "../overlay.gz";
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    await expect(getLevelingMapOverlays("wow_classic_beta", 70205)).rejects.toThrow(
      "escapes the snapshot",
    );
  });
  it("keeps older snapshots without reveal tables usable", async () => {
    const { root, manifest } = await fixture();
    await writeFile(join(root, "manifest.json"), JSON.stringify({ ...manifest, rawTables: {} }));
    expect(await getLevelingMapOverlays("wow_classic_beta", 70205)).toEqual([]);
  });
});
