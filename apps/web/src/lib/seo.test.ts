import { describe, expect, it } from "vitest";

import { createBreadcrumbJsonLd, createHelperMetadata, HELPER_SITE_URL } from "./seo";

describe("Helper SEO metadata", () => {
  it("builds absolute canonical and social metadata for an indexable page", () => {
    const metadata = createHelperMetadata({
      title: "Alchemy Recipes",
      description: "Browse audited Alchemy recipes.",
      path: "/tbc/encyclopedia/professions/alchemy",
      keywords: ["TBC Alchemy recipes"],
    });

    expect(metadata.alternates).toEqual({
      canonical: `${HELPER_SITE_URL}/tbc/encyclopedia/professions/alchemy`,
    });
    expect(metadata.openGraph).toMatchObject({
      title: "Alchemy Recipes · KFC Helper",
      url: `${HELPER_SITE_URL}/tbc/encyclopedia/professions/alchemy`,
      images: [
        {
          url: `${HELPER_SITE_URL}/og/helper`,
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [`${HELPER_SITE_URL}/og/helper`],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("keeps filtered pages crawlable without allowing them into the index", () => {
    const metadata = createHelperMetadata({
      title: "Filtered Trader",
      description: "A filtered Auction House result.",
      path: "/tbc/trader",
      noIndex: true,
    });

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    });
  });

  it("numbers breadcrumbs and resolves their absolute URLs", () => {
    expect(
      createBreadcrumbJsonLd([
        { name: "TBC", path: "/tbc" },
        { name: "Alchemy", path: "/tbc/encyclopedia/professions/alchemy" },
      ]),
    ).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          position: 1,
          name: "TBC",
          item: `${HELPER_SITE_URL}/tbc`,
        },
        {
          position: 2,
          name: "Alchemy",
          item: `${HELPER_SITE_URL}/tbc/encyclopedia/professions/alchemy`,
        },
      ],
    });
  });
});
