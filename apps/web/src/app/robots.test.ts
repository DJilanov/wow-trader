import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots", () => {
  it("allows search crawling while excluding operational routes", () => {
    const result = robots();

    expect(result.rules).toContainEqual({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/tools/api/",
        "/tools/forever-sim/",
        "/tools/data-status",
        "/tools/calculator/",
        "/tools/opportunities",
      ],
    });
  });

  it("asks non-search crawlers not to crawl the site", () => {
    const result = robots();
    const blockedRule = Array.isArray(result.rules)
      ? result.rules.find(
          (rule) => Array.isArray(rule.userAgent) && rule.userAgent.includes("GPTBot"),
        )
      : undefined;

    expect(blockedRule).toMatchObject({ disallow: "/" });
  });

  it("publishes every bounded Forever catalog sitemap shard", () => {
    const result = robots();

    expect(result.sitemap).toEqual([
      "https://kfcguild.online/tools/sitemap.xml",
      "https://kfcguild.online/tools/forever/encyclopedia/sitemap/0.xml",
      "https://kfcguild.online/tools/forever/encyclopedia/sitemap/1.xml",
    ]);
  });
});
