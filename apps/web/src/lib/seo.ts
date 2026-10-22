import type { Metadata } from "next";

import { withHelperBasePath } from "./site-path";

export const HELPER_SITE_ORIGIN = "https://kfcguild.online";
export const HELPER_SITE_URL = `${HELPER_SITE_ORIGIN}/tools`;
export const LEGACY_HELPER_SITE_ORIGIN = "https://helper.kfcguild.online";
export const HELPER_SITE_NAME = "KFC Helper";
export const HELPER_SHARE_IMAGE = "/og/helper";

interface HelperMetadataOptions {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly keywords?: readonly string[];
  readonly noIndex?: boolean;
}

interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

export function createBreadcrumbJsonLd(
  items: readonly BreadcrumbItem[],
): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: helperAbsoluteUrl(path),
    })),
  };
}

export function createHelperMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: HelperMetadataOptions): Metadata {
  const canonical = helperAbsoluteUrl(path);
  const image = helperAbsoluteUrl(HELPER_SHARE_IMAGE);
  const fullTitle = `${title} · ${HELPER_SITE_NAME}`;

  return {
    title,
    description,
    keywords: [
      "KFC Helper",
      "World of Warcraft database",
      "WoW profession calculator",
      "WoW Auction House tools",
      ...keywords,
    ],
    alternates: {
      canonical,
      ...(path.startsWith("/forever")
        ? { types: { "application/rss+xml": helperAbsoluteUrl("/forever/updates.xml") } }
        : {}),
    },
    openGraph: {
      type: "website",
      locale: "en_GB",
      url: canonical,
      siteName: HELPER_SITE_NAME,
      title: fullTitle,
      description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${title} — build-aware World of Warcraft data from KFC Helper`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image],
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
          },
        }
      : undefined,
  };
}

export function helperAbsoluteUrl(path: string): string {
  return new URL(withHelperBasePath(path), HELPER_SITE_ORIGIN).toString().replace(/\/$/, "");
}
