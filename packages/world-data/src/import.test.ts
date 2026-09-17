import { describe, expect, it } from "vitest";

import { worldSnapshotManifestSchema, type WorldBundle } from "@wow-trader/contracts";

import { createWorldSnapshotKey } from "./import.js";

const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);

function makeBundle(): Pick<WorldBundle, "manifest"> {
  return {
    manifest: worldSnapshotManifestSchema.parse({
      schemaVersion: "world-snapshot-manifest.v1",
      product: "wow_classic_beta",
      clientVersion: "1.60.1.69893",
      buildNumber: 69893,
      buildKey: "1".repeat(32),
      cdnKey: "2".repeat(32),
      locale: "enUS",
      extractedAt: "2026-09-17T12:00:00.000Z",
      hotfix: { status: "missing", sha256: null },
      definitions: { source: "wowdev/WoWDBDefs", revision: "revision" },
      extractor: { name: "test", version: "1", revision: null },
      rawTables: {},
      normalizedArtifacts: {
        maps: { path: "normalized/maps.ndjson.gz", recordCount: 1, sha256: checksumA },
        areas: { path: "normalized/areas.ndjson.gz", recordCount: 1, sha256: checksumB },
      },
      mapMediaManifest: {
        path: "map-media-manifest.json",
        recordCount: 1,
        sha256: checksumA,
      },
    }),
  };
}

describe("world snapshot identity", () => {
  it("is stable when normalized artifact insertion order changes", () => {
    const first = makeBundle();
    const second = makeBundle();
    second.manifest.normalizedArtifacts = {
      areas: second.manifest.normalizedArtifacts.areas!,
      maps: second.manifest.normalizedArtifacts.maps!,
    };

    expect(createWorldSnapshotKey(first)).toBe(createWorldSnapshotKey(second));
  });

  it("changes when decoded map media changes", () => {
    const first = makeBundle();
    const second = makeBundle();
    second.manifest.mapMediaManifest.sha256 = checksumB;

    expect(createWorldSnapshotKey(first)).not.toBe(createWorldSnapshotKey(second));
  });
});
