import type { MetadataRoute } from "next";

import type { SitemapCatalogData } from "./data";
import type { CommunityReferenceSitemapData } from "./community-reference";

export const FOREVER_CATALOG_SITEMAP_IDS = [0, 1] as const;

export const SITEMAP_URL_LIMIT = 50_000;

export function buildForeverCatalogSitemapChunk(
  catalog: SitemapCatalogData,
  chunkId: number,
  siteUrl: string,
  community: CommunityReferenceSitemapData | null = null,
): MetadataRoute.Sitemap {
  if (!FOREVER_CATALOG_SITEMAP_IDS.includes(chunkId as 0 | 1)) return [];

  const start = chunkId * SITEMAP_URL_LIMIT;
  const end = start + SITEMAP_URL_LIMIT;
  const professionOffset = 0;
  const recipeOffset = catalog.professionSlugs.length;
  const itemOffset = recipeOffset + catalog.recipeSpellIds.length;
  const npcOffset = itemOffset + catalog.itemIds.length;
  const objectOffset = npcOffset + (community?.npcIds.length ?? 0);

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
    ...windowSlice(community?.npcIds ?? [], npcOffset, start, end).map((npcId) => ({
      url: `${siteUrl}/forever/encyclopedia/npcs/${npcId}`,
      lastModified: community?.publishedAt ?? catalog.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.64,
    })),
    ...windowSlice(community?.objectIds ?? [], objectOffset, start, end).map((objectId) => ({
      url: `${siteUrl}/forever/encyclopedia/objects/${objectId}`,
      lastModified: community?.publishedAt ?? catalog.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.62,
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
