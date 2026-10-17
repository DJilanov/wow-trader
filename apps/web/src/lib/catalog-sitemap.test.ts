import { describe, expect, it } from "vitest";

import type { SitemapCatalogData } from "./data";
import { buildForeverCatalogSitemapChunk, FOREVER_CATALOG_SITEMAP_IDS } from "./catalog-sitemap";

describe("Forever catalog sitemap", () => {
  it("partitions every current catalog URL into bounded, non-overlapping shards", () => {
    const catalog = createCatalog(23_819);
    const chunks = FOREVER_CATALOG_SITEMAP_IDS.map((id) =>
      buildForeverCatalogSitemapChunk(catalog, id, "https://helper.example"),
    );
    const urls = chunks.flatMap((chunk) => chunk.map((entry) => entry.url));

    expect(chunks.every((chunk) => chunk.length <= 8_000)).toBe(true);
    expect(urls).toHaveLength(
      catalog.professionSlugs.length + catalog.recipeSpellIds.length + catalog.itemIds.length,
    );
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://helper.example/forever/encyclopedia/items/23819");
  });

  it("keeps future overflow in the final shard and rejects unknown shard IDs", () => {
    const catalog = createCatalog(40_000);
    const urls = FOREVER_CATALOG_SITEMAP_IDS.flatMap((id) =>
      buildForeverCatalogSitemapChunk(catalog, id, "https://helper.example"),
    );

    expect(urls).toHaveLength(
      catalog.professionSlugs.length + catalog.recipeSpellIds.length + catalog.itemIds.length,
    );
    expect(buildForeverCatalogSitemapChunk(catalog, 4, "https://helper.example")).toEqual([]);
  });
});

function createCatalog(itemCount: number): SitemapCatalogData {
  return {
    publishedAt: new Date("2026-10-04T00:00:00.000Z"),
    professionSlugs: ["alchemy", "blacksmithing"],
    recipeSpellIds: Array.from({ length: 2_239 }, (_, index) => index + 1),
    itemIds: Array.from({ length: itemCount }, (_, index) => index + 1),
    markets: [],
  };
}
