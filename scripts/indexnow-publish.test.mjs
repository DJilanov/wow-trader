import assert from "node:assert/strict";
import test from "node:test";

import { assertPublishableAudit, selectChangedUrls } from "./indexnow-publish.mjs";

const now = new Date("2026-10-18T12:00:00.000Z");

test("IndexNow refuses partial, stale, or failing release audits", () => {
  const report = fixtureReport();
  assert.throws(() =>
    assertPublishableAudit({ ...report, summary: { ...report.summary, complete: false } }, now),
  );
  assert.throws(() =>
    assertPublishableAudit({ ...report, summary: { ...report.summary, issueCount: 1 } }, now),
  );
  assert.throws(() =>
    assertPublishableAudit({ ...report, generatedAt: "2026-10-18T10:00:00.000Z" }, now, 60),
  );
});

test("IndexNow accepts a recent complete audit containing only canonical pages", () => {
  const report = fixtureReport();
  report.entries = report.entries.slice(0, 2);
  report.summary.uniqueUrlCount = 2;
  assert.doesNotThrow(() => assertPublishableAudit(report, now));
});

test("IndexNow selects only changed, indexable, canonical URLs within the key scope", () => {
  const report = fixtureReport();
  const options = {
    keyLocation: "https://kfcguild.online/tools/indexnow-key.txt",
    canonicalBaseUrl: "https://kfcguild.online/tools",
    host: "kfcguild.online",
    maximumUrls: 1,
  };
  const first = selectChangedUrls(report, { acknowledged: {} }, options);
  assert.equal(first.selected.length, 1);
  assert.equal(first.pendingCount, 1);
  const acknowledged = { [first.selected[0].url]: first.selected[0].fingerprint };
  const second = selectChangedUrls(report, { acknowledged }, options);
  assert.equal(second.selected.length, 1);
  assert.notEqual(second.selected[0].url, first.selected[0].url);
});

function fixtureReport() {
  const entries = [
    page("https://kfcguild.online/tools/forever"),
    page("https://kfcguild.online/tools/forever/encyclopedia"),
    { ...page("https://kfcguild.online/tools/held"), state: "review_required" },
  ];
  return {
    schema: "search-surface-report.v1",
    generatedAt: "2026-10-18T11:30:00.000Z",
    summary: { complete: true, issueCount: 0, uniqueUrlCount: entries.length },
    entries,
  };
}

function page(url) {
  return {
    url,
    canonical: url,
    state: "indexable",
    status: 200,
    title: "Title",
    description: "Description",
    contentHash: null,
    outgoingLinks: [],
  };
}
