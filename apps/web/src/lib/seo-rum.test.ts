import { describe, expect, it } from "vitest";

import { addSeoRumMetric, normalizeSeoRumRoute, seoRumMetricSchema } from "./seo-rum";

describe("privacy-minimal SEO RUM", () => {
  it("reduces concrete URLs to route templates and removes the application base path", () => {
    expect(normalizeSeoRumRoute("/tools/forever/encyclopedia/items/25")).toBe(
      "/forever/encyclopedia/items/[itemId]",
    );
    expect(normalizeSeoRumRoute("/tools/forever/markets/EU/realm-name")).toBe(
      "/forever/markets/[region]/[realm]",
    );
    expect(normalizeSeoRumRoute("/tools/forever/encyclopedia")).toBe("/forever/encyclopedia");
    expect(normalizeSeoRumRoute("https://example.test/private")).toBeNull();
  });

  it("rejects raw URLs, query strings, and unsupported metric fields", () => {
    const base = {
      schema: "seo-rum.v1",
      routeTemplate: "/forever/encyclopedia/items/[itemId]",
      build: "release-20261018",
      metric: "LCP",
      value: 1_200,
      rating: "good",
      device: "desktop",
    } as const;
    expect(seoRumMetricSchema.safeParse(base).success).toBe(true);
    expect(
      seoRumMetricSchema.safeParse({ ...base, routeTemplate: "/items/25?character=private" })
        .success,
    ).toBe(false);
    expect(seoRumMetricSchema.safeParse({ ...base, sessionId: "not-allowed" }).success).toBe(false);
  });

  it("stores only daily histogram aggregates", () => {
    const input = seoRumMetricSchema.parse({
      schema: "seo-rum.v1",
      routeTemplate: "/forever/encyclopedia/items/[itemId]",
      build: "release-20261018",
      metric: "LCP",
      value: 1_200,
      rating: "good",
      device: "mobile",
    });
    const now = new Date("2026-10-18T12:00:00.000Z");
    const first = addSeoRumMetric(null, input, now);
    const second = addSeoRumMetric(first, { ...input, value: 3_000, rating: "poor" }, now);
    const [group] = Object.values(second.groups);

    expect(second.date).toBe("2026-10-18");
    expect(group).toMatchObject({
      count: 2,
      sum: 4_200,
      minimum: 1_200,
      maximum: 3_000,
      ratings: { good: 1, "needs-improvement": 0, poor: 1 },
      histogram: { "<=1200": 1, "<=4000": 1 },
    });
    expect(JSON.stringify(second)).not.toContain("session");
  });
});
