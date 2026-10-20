import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

import {
  buildForeverCatalogSitemapChunk,
  FOREVER_CATALOG_SITEMAP_IDS,
} from "../../../lib/catalog-sitemap";
import { getSitemapCatalogData } from "../../../lib/data";
import { FOREVER_CLIENT_PRODUCT } from "../../../lib/game-versions";
import { HELPER_SITE_URL } from "../../../lib/seo";
import { getIndexableReferenceIds } from "../../../lib/catalog-reference";
import { getCommunityReferenceSitemapData } from "../../../lib/community-reference";

export const dynamic = "force-dynamic";

export function generateSitemaps(): Array<{ readonly id: number }> {
  return FOREVER_CATALOG_SITEMAP_IDS.map((id) => ({ id }));
}

const getCatalog = unstable_cache(
  () => getSitemapCatalogData(FOREVER_CLIENT_PRODUCT),
  ["forever-catalog-sitemap"],
  { revalidate: 3600 },
);
const getCommunity = unstable_cache(
  getCommunityReferenceSitemapData,
  ["forever-community-sitemap"],
  { revalidate: 3600 },
);

export default async function sitemap({
  id,
}: {
  readonly id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const [catalog, community] = await Promise.all([
    getCatalog().catch(() => null),
    getCommunity().catch(() => null),
  ]);
  if (!catalog) return [];
  const chunkId = Number.parseInt(await id, 10);
  const approved = await getIndexableReferenceIds("forever", "item", {
    product: FOREVER_CLIENT_PRODUCT,
  });
  return buildForeverCatalogSitemapChunk(
    { ...catalog, itemIds: catalog.itemIds.filter((itemId) => approved.has(itemId)) },
    chunkId,
    HELPER_SITE_URL,
    community,
  ).map((entry) => {
    const itemId = entry.url.match(/\/items\/(\d+)$/)?.[1];
    return itemId ? { ...entry, lastModified: approved.get(Number(itemId)) } : entry;
  });
}
