import { createHash } from "node:crypto";
import type * as FileSystem from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadWorldSnapshot } from "./snapshot.js";

const streams = vi.hoisted(() => ({ active: 0, maximum: 0, opened: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof FileSystem>();
  return {
    ...original,
    createReadStream: (
      ...args: Parameters<typeof original.createReadStream>
    ): ReturnType<typeof original.createReadStream> => {
      const stream = original.createReadStream(...args);
      if (String(args[0]).includes("/media/")) {
        streams.active += 1;
        streams.opened += 1;
        streams.maximum = Math.max(streams.maximum, streams.active);
        let finished = false;
        const finish = (): void => {
          if (!finished) streams.active -= 1;
          finished = true;
        };
        stream.once("end", finish);
        stream.once("close", finish);
      }
      return stream;
    },
  };
});

const directories: string[] = [];
afterEach(async (): Promise<void> => {
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  streams.active = 0;
  streams.maximum = 0;
  streams.opened = 0;
});

function checksum(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function makeSnapshot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "world-snapshot-streams-"));
  directories.push(root);
  await mkdir(join(root, "media"));
  const records = gzipSync("");
  await writeFile(join(root, "empty.ndjson.gz"), records);
  const artifact = { path: "empty.ndjson.gz", recordCount: 0, sha256: checksum(records) };
  const names = [
    "maps",
    "areas",
    "ui-maps",
    "ui-map-assignments",
    "map-arts",
    "ui-map-art-links",
    "map-art-layers",
    "map-art-tiles",
    "pois",
    "encounters",
    "lfg-dungeons",
    "quests",
    "quest-objectives",
    "quest-lines",
    "quest-line-members",
    "quest-pois",
    "item-source-hints",
    "creature-objectives",
    "bosses",
    "boss-locations",
    "creature-models",
    "boss-spell-candidates",
    "loot-source-candidates",
    "map-difficulties",
    "content-tunings",
  ];
  const image = Buffer.from("checksummed test image");
  const tiles = Array.from({ length: 40 }, (_, index) => ({
    fileDataId: index + 1,
    path: `media/${index + 1}.png`,
    width: 1,
    height: 1,
    sha256: checksum(image),
  }));
  await Promise.all(tiles.map((tile) => writeFile(join(root, tile.path), image)));
  const build = {
    product: "wow_classic_beta",
    clientVersion: "1.60.1.70205",
    buildNumber: 70205,
    extractedAt: "2026-10-04T00:00:00.000Z",
  };
  const media = JSON.stringify({
    schemaVersion: "map-media-manifest.v1",
    ...build,
    tiles,
    unavailableTiles: [],
  });
  await writeFile(join(root, "map-media-manifest.json"), media);
  const manifest = {
    schemaVersion: "world-snapshot-manifest.v1",
    ...build,
    buildKey: "1".repeat(32),
    cdnKey: "2".repeat(32),
    locale: "enUS",
    hotfix: { status: "missing", sha256: null },
    definitions: { source: "fixture", revision: "fixture" },
    extractor: { name: "fixture", version: "1", revision: null },
    rawTables: {},
    normalizedArtifacts: Object.fromEntries(names.map((name) => [name, artifact])),
    mapMediaManifest: {
      path: "map-media-manifest.json",
      recordCount: tiles.length,
      sha256: checksum(media),
    },
  };
  const path = join(root, "manifest.json");
  await writeFile(path, JSON.stringify(manifest));
  return path;
}

describe("world snapshot media validation", (): void => {
  it("checks every tile without opening thousands of streams simultaneously", async (): Promise<void> => {
    const bundle = await loadWorldSnapshot(await makeSnapshot());
    expect(bundle.mapMedia.tiles).toHaveLength(40);
    expect(streams.opened).toBe(40);
    expect(streams.maximum).toBeLessThanOrEqual(16);
  });

  it("still rejects a corrupt tile in the final batch", async (): Promise<void> => {
    const manifest = await makeSnapshot();
    await writeFile(join(directories[0]!, "media/40.png"), "corrupt image");
    await expect(loadWorldSnapshot(manifest)).rejects.toThrow(
      "Checksum mismatch for 'map tile 40'",
    );
  });
});
