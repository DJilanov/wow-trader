import type { ReferenceRecord } from "@wow-trader/reference-data";
import { describe, expect, it } from "vitest";
import {
  buildQuestDirectoryEntries,
  filterQuestDirectory,
  questDirectoryFilters,
  questDirectoryHasFilters,
  questDirectoryHref,
  QUEST_DIRECTORY_PAGE_SIZE,
} from "./forever-quest-directory";

function reference(id: number, name: string): ReferenceRecord {
  return {
    schema: "wowhead-reference.v1",
    game: "forever",
    kind: "quest",
    id,
    name,
    sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
    capturedAt: "2026-10-20T10:00:00.000Z",
    permissionRef: "unit-test",
    sourceSha256: "a".repeat(64),
    tooltipLines: [],
    numericFacts: {},
    quickFacts: ["Level: 10", "Requires level 5", "Side: Alliance"],
    objectives: ["Speak to the quest contact."],
    description: "Unit fixture",
    rewards: ["100 experience"],
    relations: [],
  };
}

describe("quest discovery", () => {
  it("discovers approved references without pretending they were observed in the client", () => {
    const rows = buildQuestDirectoryEntries(
      [{ questId: 10, title: null }],
      [],
      new Map([[10, reference(10, "A named reference")]]),
    );
    expect(rows).toEqual([
      {
        questId: 10,
        title: "A named reference",
        evidenceKind: "published_reference",
        capturedAt: null,
        referenceCapturedAt: new Date("2026-10-20T10:00:00.000Z"),
        questLevel: 10,
        minimumLevel: 5,
        side: "alliance",
      },
    ]);
  });

  it("retains exact titles and observations, rejects conflicting and foreign identities", () => {
    const capturedAt = new Date("2026-10-21T12:00:00.000Z");
    const rows = buildQuestDirectoryEntries(
      [
        { questId: 10, title: "Client name", minimumLevel: 6 },
        { questId: 20, title: null },
      ],
      [{ questId: 20, title: "Observed name", evidenceKind: "quest_log", capturedAt }],
      new Map([
        [10, reference(10, "Conflicting name")],
        [20, reference(20, "Observed name")],
        [30, reference(30, "Absent identity")],
        [40, { ...reference(40, "Other game"), game: "tbc" }],
      ]),
    );
    expect(rows.map((row) => row.questId)).toEqual([10, 20]);
    expect(rows[0]).toMatchObject({
      title: "Client name",
      evidenceKind: "client_task",
      minimumLevel: 6,
      referenceCapturedAt: null,
    });
    expect(rows[1]).toMatchObject({
      title: "Observed name",
      evidenceKind: "quest_log",
      capturedAt,
    });
  });

  it("supports useful filters without treating unknown restrictions as a match", () => {
    const entries = buildQuestDirectoryEntries(
      [
        { questId: 10, title: null },
        { questId: 20, title: null },
        { questId: 30, title: "Unknown restrictions" },
      ],
      [],
      new Map([
        [10, reference(10, "Alliance errand")],
        [20, { ...reference(20, "Shared errand"), quickFacts: ["Level: 20", "Side: Both"] }],
      ]),
    );
    expect(filterQuestDirectory(entries, questDirectoryFilters({ q: "ERRAND" }))).toHaveLength(2);
    expect(
      filterQuestDirectory(entries, questDirectoryFilters({ q: "10" })).map((row) => row.questId),
    ).toEqual([10]);
    expect(
      filterQuestDirectory(entries, questDirectoryFilters({ side: "alliance" })).map(
        (row) => row.questId,
      ),
    ).toEqual([10, 20]);
    expect(
      filterQuestDirectory(entries, questDirectoryFilters({ side: "horde" })).map(
        (row) => row.questId,
      ),
    ).toEqual([20]);
    expect(
      filterQuestDirectory(entries, questDirectoryFilters({ min: "11", max: "30" })).map(
        (row) => row.questId,
      ),
    ).toEqual([20]);
    expect(filterQuestDirectory(entries, questDirectoryFilters({ min: "30", max: "10" }))).toEqual(
      [],
    );
    expect(QUEST_DIRECTORY_PAGE_SIZE).toBe(60);
  });

  it("bounds input and preserves filters through crawlable pagination links", () => {
    expect(
      questDirectoryFilters({ q: ["10", "20"], side: "invalid", min: "0", max: "Infinity" }),
    ).toEqual({ query: "", side: "all", minimumLevel: null, maximumLevel: null });
    expect(questDirectoryFilters({ q: "x".repeat(1000) }).query).toHaveLength(100);
    const filters = questDirectoryFilters({ q: "A & B", side: "horde", min: "5", max: "20" });
    expect(questDirectoryHref(1, filters)).toBe(
      "/forever/encyclopedia/quests?q=A+%26+B&side=horde&min=5&max=20",
    );
    expect(questDirectoryHref(2, filters)).toBe(
      "/forever/encyclopedia/quests/page/2?q=A+%26+B&side=horde&min=5&max=20",
    );
    expect(questDirectoryHasFilters(filters)).toBe(true);
    expect(questDirectoryHasFilters(questDirectoryFilters({}))).toBe(false);
  });
});
