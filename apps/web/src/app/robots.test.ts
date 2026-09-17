import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots", () => {
  it("allows search crawling while excluding operational routes", () => {
    const result = robots();

    expect(result.rules).toContainEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/data-status", "/calculator/", "/opportunities"],
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
});
