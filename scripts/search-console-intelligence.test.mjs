import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComparisonRanges,
  buildReviewCandidates,
  segmentSearchPage,
} from "./search-console-intelligence.mjs";

test("Search Console periods are two non-overlapping 28-day windows with a finalization lag", () => {
  assert.deepEqual(buildComparisonRanges(new Date("2026-10-18T12:00:00.000Z")), {
    current: { startDate: "2026-09-18", endDate: "2026-10-15" },
    previous: { startDate: "2026-08-21", endDate: "2026-09-17" },
  });
});

test("Search Console pages are segmented without changing content", () => {
  assert.equal(
    segmentSearchPage("https://kfcguild.online/tools/forever/encyclopedia/items/25"),
    "items",
  );
  assert.equal(
    segmentSearchPage("https://kfcguild.online/tools/forever/leveling/routes/alliance-human"),
    "leveling",
  );
});

test("Search Console intelligence emits review candidates, not automatic changes", () => {
  const page = "https://kfcguild.online/tools/forever/encyclopedia/items/25";
  const candidates = buildReviewCandidates(
    [{ page, clicks: 5, impressions: 500, ctr: 0.01, position: 9, segment: "items" }],
    [{ page, clicks: 20, impressions: 400, ctr: 0.05, position: 7, segment: "items" }],
  );
  assert.deepEqual(candidates[0].reasons, ["low_ctr", "striking_distance", "click_decline"]);
  assert.equal(candidates[0].page, page);
});
