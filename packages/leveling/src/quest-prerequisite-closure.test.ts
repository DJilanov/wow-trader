import { describe, expect, it } from "vitest";
import { guaranteedQuestPrerequisites } from "./quest-prerequisite-closure.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";

function quest(
  questId: number,
  allOf: readonly number[] = [],
  anyOf: readonly number[] = [],
): Pick<QuestCatalogEntry, "questId" | "prerequisites"> {
  return { questId, prerequisites: { allOf: [...allOf], anyOf: [...anyOf] } };
}

describe("guaranteed quest prerequisite closure", () => {
  it("includes mandatory ancestors through a single alternative without changing input", () => {
    const rows = [quest(1), quest(2, [], [1]), quest(3, [], [2])];
    const catalog = new Map(rows.map((row) => [row.questId, row]));
    const before = structuredClone(catalog);
    expect(guaranteedQuestPrerequisites(rows[2]!, catalog)).toEqual(new Set([2, 1]));
    expect(catalog).toEqual(before);
  });

  it("does not treat alternative quests as jointly required", () => {
    const rows = [quest(1), quest(2), quest(3, [], [1, 2])];
    expect(
      guaranteedQuestPrerequisites(rows[2]!, new Map(rows.map((row) => [row.questId, row]))),
    ).toEqual(new Set());
  });

  it("retains only common ancestors of alternatives alongside mandatory branches", () => {
    const rows = [quest(1), quest(2, [1]), quest(3, [], [1]), quest(4), quest(5, [4], [2, 3])];
    expect(
      guaranteedQuestPrerequisites(rows[4]!, new Map(rows.map((row) => [row.questId, row]))),
    ).toEqual(new Set([4, 1]));
  });

  it("also proves ancestors of an explicitly required source branch", () => {
    const rows = [quest(1), quest(2, [1]), quest(3), quest(4, [], [2, 3])];
    expect(
      guaranteedQuestPrerequisites(rows[3]!, new Map(rows.map((row) => [row.questId, row])), [2]),
    ).toEqual(new Set([2, 1]));
  });

  it.each([quest(1, [2]), quest(1, [], [2])])(
    "retains a direct recorded dependency without inventing missing ancestry",
    (root) => {
      expect(guaranteedQuestPrerequisites(root, new Map([[1, root]]))).toEqual(new Set([2]));
    },
  );

  it("does not assume missing alternative records share a known branch's ancestor", () => {
    const rows = [quest(1), quest(2, [1]), quest(4, [], [2, 3])];
    expect(
      guaranteedQuestPrerequisites(rows[2]!, new Map(rows.map((row) => [row.questId, row]))),
    ).toEqual(new Set());
  });

  it.each([[quest(1, [1])], [quest(1, [2]), quest(2, [], [1])]])(
    "holds cycles rather than claiming an ancestor",
    (...rows) => {
      const catalog = new Map(rows.map((row) => [row.questId, row]));
      expect(guaranteedQuestPrerequisites(rows[0]!, catalog)).toBeNull();
    },
  );

  it.each([1, 999])("rejects an unproven additional source requirement %s", (id) => {
    const root = quest(1);
    expect(guaranteedQuestPrerequisites(root, new Map([[1, root]]), [id])).toBeNull();
  });

  it("bounds recursion for malformed or impractically deep source graphs", () => {
    const rows = Array.from({ length: 102 }, (_, index) => quest(index + 1, index ? [index] : []));
    expect(
      guaranteedQuestPrerequisites(rows.at(-1)!, new Map(rows.map((row) => [row.questId, row]))),
    ).toBeNull();
  });
});
