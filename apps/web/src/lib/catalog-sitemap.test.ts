import { describe, expect, it } from "vitest";

import type { SitemapCatalogData } from "./data";
import {
  buildForeverCatalogSitemapChunk,
  FOREVER_CATALOG_SITEMAP_IDS,
  SITEMAP_URL_LIMIT,
} from "./catalog-sitemap";

describe("Forever catalog sitemap", () => {
  it("partitions every current catalog URL into bounded, non-overlapping shards", () => {
    const catalog = createCatalog(23_819);
    const community = {
      publishedAt: new Date("2026-10-18T00:00:00.000Z"),
      npcIds: Array.from({ length: 13_392 }, (_, index) => index + 1),
      objectIds: Array.from({ length: 6_987 }, (_, index) => index + 1),
      searchSurface: [],
      entities: [],
    };
    const chunks = FOREVER_CATALOG_SITEMAP_IDS.map((id) =>
      buildForeverCatalogSitemapChunk(catalog, id, "https://helper.example", community),
    );
    const urls = chunks.flatMap((chunk) => chunk.map((entry) => entry.url));

    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.length <= SITEMAP_URL_LIMIT)).toBe(true);
    expect(urls).toHaveLength(
      catalog.professionSlugs.length +
        catalog.recipeSpellIds.length +
        catalog.itemIds.length +
        community.npcIds.length +
        community.objectIds.length,
    );
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://helper.example/forever/encyclopedia/items/23819");
    expect(urls).toContain("https://helper.example/forever/encyclopedia/npcs/13392");
    expect(urls).toContain("https://helper.example/forever/encyclopedia/objects/6987");
  });

  it("keeps the sitemap within the protocol limit and rejects unknown shard IDs", () => {
    const catalog = createCatalog(50_000);
    const urls = FOREVER_CATALOG_SITEMAP_IDS.flatMap((id) =>
      buildForeverCatalogSitemapChunk(catalog, id, "https://helper.example"),
    );

    expect(urls).toHaveLength(
      catalog.professionSlugs.length + catalog.recipeSpellIds.length + catalog.itemIds.length,
    );
    expect(buildForeverCatalogSitemapChunk(catalog, 2, "https://helper.example")).toEqual([]);
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
