import assert from "node:assert/strict";
import test from "node:test";

import { resolveCatalogPromotionApproval } from "./catalog-review-approval.mjs";

const manifestSha256 = "a".repeat(64);

test("automatic promotion does not require a review override", () => {
  assert.deepEqual(resolveCatalogPromotionApproval("auto_publish", manifestSha256, undefined), {
    approved: true,
    mode: "automatic",
    manifestSha256,
  });
});

test("review-required promotion remains blocked without an exact approval", () => {
  assert.deepEqual(resolveCatalogPromotionApproval("review_required", manifestSha256, undefined), {
    approved: false,
    mode: null,
    manifestSha256,
  });
});

test("review approval is accepted only for the current manifest", () => {
  assert.deepEqual(
    resolveCatalogPromotionApproval("review_required", manifestSha256, manifestSha256),
    { approved: true, mode: "reviewed", manifestSha256 },
  );
  assert.throws(
    () => resolveCatalogPromotionApproval("review_required", manifestSha256, "b".repeat(64)),
    /does not match/,
  );
});

test("malformed fingerprints and unknown decisions fail closed", () => {
  assert.throws(
    () => resolveCatalogPromotionApproval("review_required", "invalid", undefined),
    /invalid SHA-256/,
  );
  assert.throws(
    () => resolveCatalogPromotionApproval("review_required", manifestSha256, "INVALID"),
    /exact lowercase SHA-256/,
  );
  assert.throws(
    () => resolveCatalogPromotionApproval("unexpected", manifestSha256, undefined),
    /Unsupported catalog promotion decision/,
  );
});
