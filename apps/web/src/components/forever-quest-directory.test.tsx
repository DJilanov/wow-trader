import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForeverQuestDirectory } from "./forever-quest-directory";
import { questDirectoryFilters, type QuestDirectoryEntry } from "../lib/forever-quest-directory";

const entries: readonly QuestDirectoryEntry[] = Array.from({ length: 61 }, (_, index) => ({
  questId: index + 1,
  title: `Named quest ${String(index + 1).padStart(2, "0")}`,
  evidenceKind: "published_reference",
  capturedAt: null,
  referenceCapturedAt: new Date("2026-10-20T10:00:00.000Z"),
  questLevel: 10,
  minimumLevel: 5,
  side: "alliance",
}));

const data = {
  build: {
    id: null,
    product: "test",
    clientVersion: "1.60.1",
    buildNumber: 70450,
    locale: "enUS",
    state: "review_required" as const,
  },
  questCount: 100,
  poiQuestCount: 0,
  lines: [],
  discoverableQuestIds: [],
  titledQuests: entries,
};

describe("rendered quest directory", () => {
  it("renders useful named references, bounded pages and accessible native search", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverQuestDirectory, { data, filters: questDirectoryFilters({}), page: 1 }),
    );
    expect(html).toContain("Named quest 01");
    expect(html).toContain("Named quest 60");
    expect(html).not.toContain("Named quest 61");
    expect(html).toContain("Reviewed external reference");
    expect(html).toContain("quest-directory-filters");
    expect(html).toContain('method="get"');
    expect(html).toContain('href="/forever/encyclopedia/quests/page/2"');
    expect(html).toContain("Reference captured 2026-10-20 UTC");
  });

  it("shows an actionable empty state and escapes user-entered search text", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverQuestDirectory, {
        data,
        filters: questDirectoryFilters({ q: "<script>alert(1)</script>" }),
        page: 1,
      }),
    );
    expect(html).toContain("No named quests match these filters");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the second page without repeating the first page", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverQuestDirectory, { data, filters: questDirectoryFilters({}), page: 2 }),
    );
    expect(html).toContain("Named quest 61");
    expect(html).not.toContain("Named quest 01");
    expect(html).toContain("Page 2 of 2");
  });

  it("rejects nonexistent directory pages rather than emitting duplicate empty pages", () => {
    expect(() =>
      ForeverQuestDirectory({ data, filters: questDirectoryFilters({}), page: 3 }),
    ).toThrow();
  });
});
