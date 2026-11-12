import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfessionLevelingData } from "../../../../lib/profession-leveling-data";
import type { ProfessionLevelingData } from "../../../../lib/profession-leveling-types";
import { HELPER_SITE_URL } from "../../../../lib/seo";
import Page, { metadata } from "./page";

vi.mock("../../../../lib/profession-leveling-data", () => ({
  getProfessionLevelingData: vi.fn(),
}));

const data: ProfessionLevelingData = {
  professions: [{ id: 164, slug: "blacksmithing", name: "Blacksmithing" }],
  markets: [{ value: "EU|Test|alliance", label: "Test · Alliance" }],
  market: "EU|Test|alliance",
  profession: "blacksmithing",
  scan: { at: "2026-11-12T10:00:00Z", build: 70888, fresh: true },
  recipes: [],
  items: [],
  limitation: null,
};

describe("profession leveling landing page", () => {
  beforeEach(() => {
    vi.mocked(getProfessionLevelingData).mockResolvedValue(data);
  });

  it("consolidates search and social metadata on the canonical calculator URL", () => {
    expect(metadata.title).toBe("WoW Forever Profession Leveling Calculator (1–300)");
    expect(metadata.alternates).toMatchObject({
      canonical: `${HELPER_SITE_URL}/forever/trader/leveling`,
    });
    expect(metadata.openGraph).toMatchObject({
      url: `${HELPER_SITE_URL}/forever/trader/leveling`,
      images: [{ url: `${HELPER_SITE_URL}/og/profession-leveling`, width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [`${HELPER_SITE_URL}/og/profession-leveling`],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("renders useful guidance and crawlable profession links before client hydration", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('aria-label="How to build your plan"');
    expect(html).toContain("unknown learning costs are excluded");
    expect(html).toContain("Your crafting plan will appear here");
    expect(html).toContain("Are recipe purchases and trainer fees included?");
    expect(html).toContain("rather than guaranteeing a global minimum");
    for (const slug of [
      "alchemy",
      "blacksmithing",
      "cooking",
      "enchanting",
      "engineering",
      "first-aid",
      "leatherworking",
      "mining",
      "tailoring",
    ]) {
      expect(html).toContain(`href="/forever/encyclopedia/professions/${slug}"`);
    }
  });

  it("keeps structured breadcrumbs aligned with navigation and free of market parameters", async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ market: "EU|Test|alliance" }) }),
    );
    const documents = [
      ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
    ].map((match): Record<string, unknown> => JSON.parse(match[1]!));
    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      "@type": "WebPage",
      url: `${HELPER_SITE_URL}/forever/trader/leveling`,
    });
    expect(documents[1]).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "WoW Forever", item: `${HELPER_SITE_URL}/forever` },
        { position: 2, name: "Trader", item: `${HELPER_SITE_URL}/forever/trader` },
        {
          position: 3,
          name: "Profession leveling",
          item: `${HELPER_SITE_URL}/forever/trader/leveling`,
        },
      ],
    });
    expect(JSON.stringify(documents)).not.toContain("market=");
  });
});
