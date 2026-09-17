import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

import { getSitemapCatalogData } from "../lib/data";
import { TBC_BIS_CLASSES } from "../lib/bis-directory";
import {
  getForeverBossDirectory,
  getForeverInstanceDirectory,
  getForeverMapDirectory,
} from "../lib/forever-world";
import { HELPER_SHARE_IMAGE, HELPER_SITE_URL } from "../lib/seo";

export const dynamic = "force-dynamic";

const getCachedSitemapCatalogData = unstable_cache(getSitemapCatalogData, ["tbc-sitemap-catalog"], {
  revalidate: 3600,
});

const staticLastModified = new Date("2026-09-16T00:00:00.000Z");

const foreverClasses = [
  "warrior",
  "paladin",
  "hunter",
  "rogue",
  "priest",
  "shaman",
  "mage",
  "warlock",
  "druid",
] as const;

const staticEntries: MetadataRoute.Sitemap = [
  {
    url: `${HELPER_SITE_URL}/`,
    lastModified: staticLastModified,
    changeFrequency: "weekly",
    priority: 0.85,
    images: [new URL(HELPER_SHARE_IMAGE, HELPER_SITE_URL).toString()],
  },
  {
    url: `${HELPER_SITE_URL}/forever`,
    lastModified: staticLastModified,
    changeFrequency: "weekly",
    priority: 0.95,
  },
  {
    url: `${HELPER_SITE_URL}/tbc`,
    lastModified: staticLastModified,
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${HELPER_SITE_URL}/tbc/trader`,
    lastModified: staticLastModified,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/tbc/encyclopedia`,
    lastModified: staticLastModified,
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/forever/encyclopedia`,
    lastModified: staticLastModified,
    changeFrequency: "daily",
    priority: 0.95,
  },
  ...[
    "racials",
    "abilities",
    "legacy",
    "changes",
    "maps",
    "zones",
    "instances",
    "bosses",
    "quests",
  ].map((section) => ({
    url: `${HELPER_SITE_URL}/forever/encyclopedia/${section}`,
    lastModified: staticLastModified,
    changeFrequency: "weekly" as const,
    priority: 0.72,
  })),
  ...foreverClasses.flatMap((classSlug) => [
    {
      url: `${HELPER_SITE_URL}/forever/encyclopedia/talents/${classSlug}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.82,
    },
    {
      url: `${HELPER_SITE_URL}/forever/encyclopedia/spellbooks/${classSlug}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.78,
    },
  ]),
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const foreverEntries = await getForeverSitemapEntries().catch(() => []);
  try {
    const catalog = await getCachedSitemapCatalogData();
    if (!catalog) return [...staticEntries, ...foreverEntries];

    const itemEntries: MetadataRoute.Sitemap = catalog.itemIds.map((itemId) => ({
      url: `${HELPER_SITE_URL}/tbc/encyclopedia/items/${itemId}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "monthly",
      priority: 0.62,
    }));
    const recipeEntries: MetadataRoute.Sitemap = catalog.recipeSpellIds.map((spellId) => ({
      url: `${HELPER_SITE_URL}/tbc/encyclopedia/recipes/${spellId}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "monthly",
      priority: 0.64,
    }));
    const professionEntries: MetadataRoute.Sitemap = catalog.professionSlugs.map((slug) => ({
      url: `${HELPER_SITE_URL}/tbc/encyclopedia/professions/${encodeURIComponent(slug)}`,
      lastModified: catalog.publishedAt,
      changeFrequency: "monthly",
      priority: 0.72,
    }));
    const bisEntries: MetadataRoute.Sitemap = TBC_BIS_CLASSES.flatMap(({ lists }) =>
      lists.map(({ slug }) => ({
        url: `${HELPER_SITE_URL}/tbc/encyclopedia/bis/${encodeURIComponent(slug)}`,
        lastModified: staticLastModified,
        changeFrequency: "weekly" as const,
        priority: 0.68,
      })),
    );
    const marketEntries: MetadataRoute.Sitemap = catalog.markets.map(({ region, realmId }) => ({
      url: `${HELPER_SITE_URL}/markets/${encodeURIComponent(region)}/${encodeURIComponent(realmId)}`,
      lastModified: staticLastModified,
      changeFrequency: "daily",
      priority: 0.55,
    }));

    return [
      ...staticEntries,
      ...professionEntries,
      ...bisEntries,
      ...recipeEntries,
      ...itemEntries,
      ...marketEntries,
      ...foreverEntries,
    ];
  } catch {
    return [...staticEntries, ...foreverEntries];
  }
}

async function getForeverSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [maps, instances, bosses] = await Promise.all([
    getForeverMapDirectory(),
    getForeverInstanceDirectory(),
    getForeverBossDirectory(),
  ]);
  return [
    ...maps
      .filter((map) => map.system === 0)
      .map((map) => ({
        url: `${HELPER_SITE_URL}/forever/encyclopedia/maps/${map.uiMapId}`,
        lastModified: staticLastModified,
        changeFrequency: "weekly" as const,
        priority: map.featured ? 0.78 : 0.62,
      })),
    ...instances.map((instance) => ({
      url: `${HELPER_SITE_URL}/forever/encyclopedia/instances/${instance.mapId}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.68,
    })),
    ...bosses.map((boss) => ({
      url: `${HELPER_SITE_URL}/forever/encyclopedia/bosses/${boss.creatureId}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: boss.creatureId >= 200_000 ? 0.76 : 0.64,
    })),
  ];
}
