import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSearchPage, auditedFetch, parseSitemapXml } from "./seo-audit.mjs";

test("SEO audit parses sitemap indexes and URL sets", () => {
  assert.deepEqual(
    parseSitemapXml(
      "<sitemapindex><sitemap><loc>https://example.test/a.xml</loc></sitemap></sitemapindex>",
    ),
    { kind: "index", locations: ["https://example.test/a.xml"] },
  );
  assert.deepEqual(
    parseSitemapXml("<urlset><url><loc>https://example.test/a?a=1&amp;b=2</loc></url></urlset>"),
    {
      kind: "urlset",
      locations: ["https://example.test/a?a=1&b=2"],
    },
  );
});

test("SEO audit accepts a complete self-canonical page", () => {
  const url = "https://kfcguild.online/tools/forever/encyclopedia/items/25";
  const entry = analyzeSearchPage({
    url,
    status: 200,
    html: `<html><head><title>Test item</title><meta name="description" content="Useful item facts"><link href="${url}" rel="canonical"></head><body><a href="/tools/forever/encyclopedia/npcs/1">Vendor</a></body></html>`,
  });
  assert.equal(entry.state, "indexable");
  assert.deepEqual(entry.reasons, ["eligible"]);
  assert.deepEqual(entry.outgoingLinks, [
    "https://kfcguild.online/tools/forever/encyclopedia/npcs/1",
  ]);
});

test("SEO audit rejects noindex and mismatched canonical sitemap pages", () => {
  const entry = analyzeSearchPage({
    url: "https://kfcguild.online/tools/forever/encyclopedia/items/25",
    status: 200,
    html: '<title>Test</title><meta name="description" content="Description"><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://kfcguild.online/tools/forever/encyclopedia/items/26">',
  });
  assert.equal(entry.state, "review_required");
  assert.ok(entry.reasons.includes("canonical_mismatch"));
  assert.ok(entry.reasons.includes("noindex_in_sitemap"));
});

test("SEO audit retries transient transport failures", async () => {
  let attempts = 0;
  const response = await auditedFetch("https://example.test/page", 1000, {
    retries: 2,
    wait: async () => undefined,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("terminated");
      return new globalThis.Response("ok", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
});

test("SEO audit retries retryable HTTP responses but not ordinary client errors", async () => {
  const statuses = [503, 429, 404];
  let attempts = 0;
  const response = await auditedFetch("https://example.test/page", 1000, {
    retries: 3,
    wait: async () => undefined,
    fetchImpl: async () => {
      const status = statuses[attempts] ?? 200;
      attempts += 1;
      return new globalThis.Response("result", { status });
    },
  });

  assert.equal(response.status, 404);
  assert.equal(attempts, 3);
});
