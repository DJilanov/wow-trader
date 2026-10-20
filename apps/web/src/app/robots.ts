import type { MetadataRoute } from "next";

import { FOREVER_CATALOG_SITEMAP_IDS } from "../lib/catalog-sitemap";
import { HELPER_SITE_ORIGIN, HELPER_SITE_URL } from "../lib/seo";
import { withHelperBasePath } from "../lib/site-path";

const BLOCKED_CRAWLERS = [
  "GPTBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "PetalBot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/forever-sim/", "/data-status", "/calculator/", "/opportunities"].map(
    withHelperBasePath,
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      {
        userAgent: [...BLOCKED_CRAWLERS],
        disallow: "/",
      },
    ],
    host: HELPER_SITE_ORIGIN,
    sitemap: [
      `${HELPER_SITE_URL}/sitemap.xml`,
      ...FOREVER_CATALOG_SITEMAP_IDS.map(
        (id) => `${HELPER_SITE_URL}/forever/encyclopedia/sitemap/${id}.xml`,
      ),
    ],
  };
}
