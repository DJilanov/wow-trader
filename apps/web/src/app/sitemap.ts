import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { WESTFALL_ROUTE } from "@wow-trader/leveling";

import { getSitemapCatalogData, getSitemapMarketData } from "../lib/data";
import { TBC_BIS_CLASSES } from "../lib/bis-directory";
import {
  getForeverBossDirectory,
  getForeverInstanceDirectory,
  getForeverMapDirectory,
  getForeverWorldData,
  getForeverQuestDirectory,
} from "../lib/forever-world";
import { FOREVER_CLIENT_PRODUCT, TBC_CLIENT_PRODUCT } from "../lib/game-versions";
import { getLatestCatalogComparisonIdentity } from "../lib/forever-observatory";
import { helperAbsoluteUrl, HELPER_SITE_URL } from "../lib/seo";
import { WESTFALL_READER_PATH } from "../lib/leveling-experience";
import { getIndexableReferenceIds } from "../lib/catalog-reference";
import {
  getCommunityReferenceSitemapData,
  getIndexableCommunityDirectoryKinds,
} from "../lib/community-reference";
import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";

export const dynamic = "force-dynamic";

const getCachedSitemapCatalogData = unstable_cache(getSitemapCatalogData, ["tbc-sitemap-catalog"], {
  revalidate: 3600,
});
const getCachedForeverSitemapMarkets = unstable_cache(
  () => getSitemapMarketData(FOREVER_CLIENT_PRODUCT),
  ["forever-sitemap-markets"],
  { revalidate: 3600 },
);
const getCachedCommunityReferenceSitemapData = unstable_cache(
  getCommunityReferenceSitemapData,
  ["forever-community-sitemap"],
  { revalidate: 3600 },
);

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
    url: `${HELPER_SITE_URL}/forever/tier-list/healers`,
    lastModified: new Date("2026-10-28T00:00:00Z"),
    changeFrequency: "weekly",
    priority: 0.9,
  },
  ...["/forever/tier-list/tanks", "/forever/tier-list/tanks/solo"].map((path) => ({
    url: `${HELPER_SITE_URL}${path}`,
    lastModified: new Date("2026-10-23T00:00:00Z"),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  })),
  {
    url: `${HELPER_SITE_URL}/forever/tier-list`,
    lastModified: new Date("2026-10-23T00:00:00Z"),
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/forever/tier-list/solo`,
    lastModified: new Date("2026-10-23T00:00:00Z"),
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: HELPER_SITE_URL,
    lastModified: new Date("2026-10-18T00:00:00Z"),
    images: [helperAbsoluteUrl("/og/helper")],
  },
  ...[
    "/forever/simulator",
    ...SIMULATOR_SPECS.map((spec) => `/forever/simulator/${spec.slug}`),
  ].map((path) => ({
    url: `${HELPER_SITE_URL}${path}`,
    lastModified: new Date("2026-10-16T00:00:00Z"),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  })),
  {
    url: `${HELPER_SITE_URL}/forever/leveling`,
    lastModified: new Date(WESTFALL_ROUTE.reviewedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${HELPER_SITE_URL}${WESTFALL_READER_PATH}`,
    lastModified: new Date(WESTFALL_ROUTE.reviewedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${HELPER_SITE_URL}/forever/leveling/routes/alliance-human`,
    lastModified: new Date(WESTFALL_ROUTE.reviewedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${HELPER_SITE_URL}/forever`,
    lastModified: new Date("2026-10-18T00:00:00Z"),
    changeFrequency: "weekly",
    priority: 0.95,
  },
  {
    url: `${HELPER_SITE_URL}/forever/trader`,
    changeFrequency: "daily",
    priority: 0.95,
  },
  {
    url: `${HELPER_SITE_URL}/forever/addon`,
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/forever/data`,
    changeFrequency: "daily",
    priority: 0.88,
  },
  {
    url: `${HELPER_SITE_URL}/tbc`,
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    url: `${HELPER_SITE_URL}/tbc/trader`,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/tbc/encyclopedia`,
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    url: `${HELPER_SITE_URL}/forever/encyclopedia`,
    changeFrequency: "daily",
    priority: 0.95,
  },
  {
    url: `${HELPER_SITE_URL}/forever/encyclopedia/catalog`,
    changeFrequency: "daily",
    priority: 0.9,
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
    changeFrequency: "weekly" as const,
    priority: 0.72,
  })),
  ...foreverClasses.flatMap((classSlug) => [
    {
      url: `${HELPER_SITE_URL}/forever/encyclopedia/talents/${classSlug}`,
      changeFrequency: "weekly" as const,
      priority: 0.82,
    },
    {
      url: `${HELPER_SITE_URL}/forever/encyclopedia/spellbooks/${classSlug}`,
      changeFrequency: "weekly" as const,
      priority: 0.78,
    },
  ]),
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [world, questDirectory] = await Promise.all([
    getForeverWorldData(),
    getForeverQuestDirectory(),
  ]).catch(() => [null, null] as const);
  const questTitles = new Map<number, string | null>(
    world?.quests.map((quest) => [quest.questId, quest.title ?? null]),
  );
  for (const quest of questDirectory?.titledQuests ?? [])
    questTitles.set(quest.questId, quest.title);
  const approvedQuests = await getIndexableReferenceIds("forever", "quest", {
    quests: questTitles,
  });
  const questEntries = [...approvedQuests].map(([id, lastModified]) => ({
    url: `${HELPER_SITE_URL}/forever/encyclopedia/quests/${id}`,
    lastModified,
  }));
  const [foreverEntries, comparison, community] = await Promise.all([
    getForeverSitemapEntries().catch(() => []),
    getLatestCatalogComparisonIdentity().catch(() => null),
    getCachedCommunityReferenceSitemapData().catch(() => null),
  ]);
  const communityDirectoryEntries: MetadataRoute.Sitemap = getIndexableCommunityDirectoryKinds(
    community,
  ).map((kind) => ({
    url: `${HELPER_SITE_URL}/forever/encyclopedia/${kind === "npc" ? "npcs" : "objects"}`,
    lastModified: community?.publishedAt,
    changeFrequency: "weekly",
    priority: 0.72,
  }));
  const changeEntries: MetadataRoute.Sitemap = comparison
    ? [
        {
          url: `${HELPER_SITE_URL}/forever/encyclopedia/changes/${comparison.fromBuildNumber}-to-${comparison.toBuildNumber}`,
          lastModified: comparison.lastModified,
          changeFrequency: "monthly",
          priority: 0.7,
        },
      ]
    : [];
  const foreverMarketEntries = await getCachedForeverSitemapMarkets()
    .then<MetadataRoute.Sitemap>((markets) =>
      markets.map(({ region, realmId }) => ({
        url: `${HELPER_SITE_URL}/forever/markets/${encodeURIComponent(region)}/${encodeURIComponent(realmId)}`,
        changeFrequency: "daily",
        priority: 0.62,
      })),
    )
    .catch(() => []);
  try {
    const catalog = await getCachedSitemapCatalogData();
    if (!catalog)
      return [
        ...staticEntries,
        ...communityDirectoryEntries,
        ...foreverMarketEntries,
        ...foreverEntries,
        ...changeEntries,
        ...questEntries,
      ];
    const approvedItems = await getIndexableReferenceIds("tbc", "item", {
      product: TBC_CLIENT_PRODUCT,
    });

    const itemEntries: MetadataRoute.Sitemap = catalog.itemIds
      .filter((itemId) => approvedItems.has(itemId))
      .map((itemId) => ({
        url: `${HELPER_SITE_URL}/tbc/encyclopedia/items/${itemId}`,
        lastModified: approvedItems.get(itemId),
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
        changeFrequency: "weekly" as const,
        priority: 0.68,
      })),
    );
    const marketEntries: MetadataRoute.Sitemap = catalog.markets.map(({ region, realmId }) => ({
      url: `${HELPER_SITE_URL}/tbc/markets/${encodeURIComponent(region)}/${encodeURIComponent(realmId)}`,
      changeFrequency: "daily",
      priority: 0.55,
    }));

    return [
      ...staticEntries,
      ...communityDirectoryEntries,
      ...professionEntries,
      ...bisEntries,
      ...recipeEntries,
      ...itemEntries,
      ...marketEntries,
      ...foreverMarketEntries,
      ...foreverEntries,
      ...changeEntries,
      ...questEntries,
    ];
  } catch {
    return [
      ...staticEntries,
      ...communityDirectoryEntries,
      ...foreverMarketEntries,
      ...foreverEntries,
      ...changeEntries,
      ...questEntries,
    ];
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
        changeFrequency: "weekly" as const,
        priority: map.featured ? 0.78 : 0.62,
      })),
    ...instances.map((instance) => ({
      url: `${HELPER_SITE_URL}/forever/encyclopedia/instances/${instance.mapId}`,
      changeFrequency: "weekly" as const,
      priority: 0.68,
    })),
    ...bosses.map((boss) => ({
      url: `${HELPER_SITE_URL}/forever/encyclopedia/bosses/${boss.creatureId}`,
      changeFrequency: "weekly" as const,
      priority: boss.creatureId >= 200_000 ? 0.76 : 0.64,
    })),
  ];
}
