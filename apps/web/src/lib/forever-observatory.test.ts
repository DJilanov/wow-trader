import { describe, expect, it } from "vitest";

import {
  createCatalogChangeSet,
  type BuildSummary,
  type CatalogChangeSummary,
} from "./forever-observatory";

describe("catalog change sets", () => {
  it("creates an immutable, deterministic identity for a published build pair", () => {
    const first = createCatalogChangeSet(build(70449), build(70450), changes());
    const second = createCatalogChangeSet(build(70449), build(70450), changes());

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe("catalog-change-set.v1");
    expect(first.id).toMatch(/^70449-to-70450-[a-f0-9]{12}$/);
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.review).toEqual({
      status: "approved",
      basis: "published_catalog_pair",
      approvedAt: "2026-10-18T00:00:00.000Z",
    });
  });

  it("refuses to label an unpublished comparison as reviewed", () => {
    expect(() =>
      createCatalogChangeSet({ ...build(70449), publishedAt: null }, build(70450), changes()),
    ).toThrow("require two published builds");
  });
});

function build(buildNumber: number): BuildSummary {
  return {
    snapshotKey: `wow_classic_beta-${buildNumber}-enUS-test`,
    buildNumber,
    version: "1.15.8",
    hotfixHash: null,
    definitionsRevision: "test",
    extractorVersion: "test",
    publishedAt: "2026-10-18T00:00:00.000Z",
    extractedAt: "2026-10-17T00:00:00.000Z",
  };
}

function changes(): CatalogChangeSummary {
  return {
    items: {
      added: 1,
      removed: 0,
      changed: 1,
      sampleIds: [25, 26],
      ids: { added: [25], removed: [], changed: [26] },
    },
    recipes: {
      added: 0,
      removed: 0,
      changed: 1,
      sampleIds: [3275],
      ids: { added: [], removed: [], changed: [3275] },
    },
    note: "Normalized changes.",
  };
}
