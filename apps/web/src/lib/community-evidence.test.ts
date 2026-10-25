import { describe, expect, it } from "vitest";
import { communityEvidenceMethod } from "./community-evidence";
import { communitySnapshotFreshnessCondition } from "./community-publication";
import { PgDialect } from "drizzle-orm/pg-core";

describe("published community provenance", () => {
  it("keeps inferred teaching separate from explicit sources", () => {
    expect(communityEvidenceMethod({ matchMethod: "unique_profession_name_match" })).toBe(
      "Name-matched teaching item",
    );
    expect(communityEvidenceMethod({ matchMethod: "explicit_teaching_id" })).toBe(
      "Source-reported relationship",
    );
    expect(communityEvidenceMethod(null)).toBe("Published source reference");
  });
  it("requires a nonexpired validity bound for the Wowhead profession source", () => {
    const query = new PgDialect().sqlToQuery(
      communitySnapshotFreshnessCondition(new Date("2026-11-01T00:00:00.000Z")),
    );
    expect(query.sql).toContain("wowhead_profession_review");
    expect(query.sql).toContain("validUntil");
    expect(query.params).toContain("2026-11-01T00:00:00.000Z");
  });
});
