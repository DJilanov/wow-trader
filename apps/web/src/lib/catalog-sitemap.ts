import type { MetadataRoute } from "next";

import type { SitemapCatalogData } from "./data";

export const FOREVER_CATALOG_SITEMAP_IDS = [0, 1, 2, 3] as const;

const SITEMAP_CHUNK_SIZE = 8_000;

export function buildForeverCatalogSitemapChunk(
  catalog: SitemapCatalogData,
  chunkId: number,
  siteUrl: string,
): MetadataRoute.Sitemap {
  if (!FOREVER_CATALOG_SITEMAP_IDS.includes(chunkId as 0 | 1 | 2 | 3)) return [];

  const start = chunkId * SITEMAP_CHUNK_SIZE;
  const end =
    chunkId === FOREVER_CATALOG_SITEMAP_IDS.at(-1)
      ? Number.POSITIVE_INFINITY
      : start + SITEMAP_CHUNK_SIZE;
  const professionOffset = 0;
  const recipeOffset = catalog.professionSlugs.length;
  const itemOffset = recipeOffset + catalog.recipeSpellIds.length;

  return [
    ...windowSlice(catalog.professionSlugs, professionOffset, start, end).map((slug) => ({
      url: `${siteUrl}/forever/encyclopedia/professions/${encodeURIComponent(slug)}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.78,
    })),
    ...windowSlice(catalog.recipeSpellIds, recipeOffset, start, end).map((spellId) => ({
      url: `${siteUrl}/forever/encyclopedia/recipes/${spellId}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.68,
    })),
    ...windowSlice(catalog.itemIds, itemOffset, start, end).map((itemId) => ({
      url: `${siteUrl}/forever/encyclopedia/items/${itemId}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.64,
    })),
  ];
}

function windowSlice<T>(
  values: readonly T[],
  offset: number,
  start: number,
  end: number,
): readonly T[] {
  const localStart = Math.max(0, start - offset);
  const localEnd = Math.max(0, Math.min(values.length, end - offset));
  return values.slice(localStart, localEnd);
}
