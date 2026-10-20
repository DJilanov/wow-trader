import { describe, expect, it } from "vitest";

import { assessSearchSurface, isIndexableSearchSurface } from "./search-surface";

describe("search surface eligibility", () => {
  const eligibleFacts = {
    url: "https://kfcguild.online/tools/forever/encyclopedia/items/25",
    pageExists: true,
    authoritativeIdentityPresent: true,
    requiredEvidencePresent: true,
    evidenceKinds: ["published_reference", "exact_client"] as const,
  };

  it("admits only a real canonical page with identity and required evidence", () => {
    const entry = assessSearchSurface(eligibleFacts);

    expect(entry.state).toBe("indexable");
    expect(entry.reasons).toEqual(["eligible"]);
    expect(entry.evidenceKinds).toEqual(["exact_client", "published_reference"]);
    expect(isIndexableSearchSurface(entry)).toBe(true);
  });

  it("holds conflicts and incomplete evidence for review", () => {
    const entry = assessSearchSurface({
      ...eligibleFacts,
      identityConflict: true,
      requiredEvidencePresent: false,
    });

    expect(entry.state).toBe("review_required");
    expect(entry.reasons).toEqual(["identity_conflict", "required_evidence_missing"]);
    expect(isIndexableSearchSurface(entry)).toBe(false);
  });

  it("excludes missing pages and malformed canonicals", () => {
    const entry = assessSearchSurface({
      ...eligibleFacts,
      url: "/relative-only",
      pageExists: false,
    });

    expect(entry.state).toBe("excluded");
    expect(entry.reasons).toContain("invalid_canonical");
    expect(entry.reasons).toContain("page_missing");
  });
});
