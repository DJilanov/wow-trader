import type { Metadata } from "next";

export const HELPER_SITE_URL = "https://helper.kfcguild.online";
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
      item: new URL(path, HELPER_SITE_URL).toString(),
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
  const canonical = new URL(path, HELPER_SITE_URL).toString();
  const image = new URL(HELPER_SHARE_IMAGE, HELPER_SITE_URL).toString();
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
    alternates: { canonical },
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
