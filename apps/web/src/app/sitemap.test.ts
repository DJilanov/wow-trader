import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSitemapCatalogData } from "../lib/data";
import { HELPER_SITE_URL } from "../lib/seo";
import sitemap from "./sitemap";

vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T): T => fn }));
vi.mock("../lib/data", () => ({
  getSitemapCatalogData: vi.fn().mockResolvedValue(null),
  getSitemapMarketData: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/forever-world", () => ({
  getForeverWorldData: vi.fn().mockResolvedValue(null),
  getForeverQuestDirectory: vi.fn().mockResolvedValue(null),
  getForeverMapDirectory: vi.fn().mockResolvedValue([]),
  getForeverInstanceDirectory: vi.fn().mockResolvedValue([]),
  getForeverBossDirectory: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/forever-observatory", () => ({
  getLatestCatalogComparisonIdentity: vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/catalog-reference", () => ({
  getIndexableReferenceIds: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("../lib/community-reference", () => ({
  getCommunityReferenceSitemapData: vi.fn().mockResolvedValue(null),
  getIndexableCommunityDirectoryKinds: vi.fn().mockReturnValue([]),
}));

describe("public tools sitemap", () => {
  beforeEach(() => {
    vi.mocked(getSitemapCatalogData).mockResolvedValue(null);
  });

  it("includes every published healer workspace without share or release variants", async () => {
    const entries = await sitemap();
    const healers = entries.filter((entry) => entry.url.includes("/simulator/healing-"));

    expect(healers.map((entry) => entry.url).sort()).toEqual(
      ["healing-priest", "healing-druid", "healing-paladin", "healing-shaman"]
        .map((slug) => `${HELPER_SITE_URL}/forever/simulator/${slug}`)
        .sort(),
    );
    for (const entry of healers) {
      expect(new URL(entry.url).search).toBe("");
      expect(new URL(entry.url).hash).toBe("");
      expect(entry.lastModified).toBeUndefined();
    }
  });

  it("keeps existing damage and tank URLs unique alongside healers", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(new Set(urls).size).toBe(urls.length);
    for (const slug of ["warrior", "tank-warrior", "shadow-priest", "protection-paladin"]) {
      expect(urls).toContain(`${HELPER_SITE_URL}/forever/simulator/${slug}`);
    }
  });

  it("retains healer discovery when the optional TBC catalog is unavailable", async () => {
    vi.mocked(getSitemapCatalogData).mockRejectedValueOnce(new Error("Catalog unavailable"));
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.filter((url) => url.includes("/simulator/healing-"))).toHaveLength(4);
    expect(urls.some((url) => url.includes("?build=") || url.includes("?release="))).toBe(false);
  });
});
