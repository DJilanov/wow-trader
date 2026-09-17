import type { MetadataRoute } from "next";

import { HELPER_SITE_URL } from "../lib/seo";

const BLOCKED_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
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
  const disallow = ["/api/", "/data-status", "/calculator/", "/opportunities"];

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
    host: HELPER_SITE_URL,
    sitemap: `${HELPER_SITE_URL}/sitemap.xml`,
  };
}
