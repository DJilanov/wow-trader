import { describe, expect, it } from "vitest";
import captured from "./fixtures/quest-client-timing-70205-70450.json" with { type: "json" };
import { reconcileClientQuestTiming } from "./quest-client-timing.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";

function fixture(): {
  catalog: QuestCatalog;
  snapshots: typeof captured.snapshots;
  questIds: number[];
} {
  return {
    catalog: questCatalogSchema.parse(structuredClone(captured.catalog)),
    snapshots: structuredClone(captured.snapshots),
    questIds: [257, 258, 647],
  };
}

describe("corroborated client quest deadlines", () => {
  it("adds only matching deadlines and retains the original records and both source hashes", () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = reconcileClientQuestTiming(input);
    expect(result.catalog.quests.map((quest) => quest.timeLimitSeconds)).toEqual([900, 720, 900]);
    result.catalog.quests.forEach(({ timeLimitSeconds, timeLimitSources, ...quest }, index) => {
      expect(timeLimitSeconds).toBeGreaterThan(0);
      expect(timeLimitSources).toEqual(
        captured.snapshots.map((row) => ({
          build: Number(row.document.meta.clientBuild.split(".").at(-1)),
          url: row.sourceUrl,
          sha256: row.sourceSha256,
        })),
      );
      expect(quest).toEqual(input.catalog.quests[index]);
      expect(result.resolutions[index]!.previous).toEqual(input.catalog.quests[index]);
      expect(result.resolutions[index]!.sources).toEqual(
        captured.snapshots.map((row) => ({
          url: row.sourceUrl,
          sha256: row.sourceSha256,
        })),
      );
    });
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
    expect(reconcileClientQuestTiming({ ...input, catalog: result.catalog }).catalog).toEqual(
      result.catalog,
    );
    expect(input).toEqual(before);
  });

  it("preserves a full-length authorization note and stores timing provenance separately", () => {
    const input = fixture();
    input.catalog.authorizationNote = "a".repeat(2000);
    const result = reconcileClientQuestTiming(input);
    expect(result.catalog.authorizationNote).toBe(input.catalog.authorizationNote);
    expect(result.catalog.quests.every((quest) => quest.timeLimitSources?.length === 2)).toBe(true);
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
  });

  it("leaves unselected quests and access restrictions unchanged", () => {
    const input = fixture();
    input.catalog.quests[0]!.requiredClasses = 1;
    const result = reconcileClientQuestTiming({ ...input, questIds: [257] });
    expect(result.catalog.quests[0]!.requiredClasses).toBe(1);
    expect(result.catalog.quests.slice(1)).toEqual(input.catalog.quests.slice(1));
    expect(result.resolutions).toHaveLength(1);
  });

  it.each([
    "empty",
    "duplicate",
    "unknown",
    "wrong-build",
    "title",
    "level",
    "minimum",
    "existing-conflict",
  ])("refuses incompatible selection or catalog identity: %s", (kind) => {
    const input = fixture();
    if (kind === "empty") input.questIds = [];
    else if (kind === "duplicate") input.questIds = [257, 257];
    else if (kind === "unknown") input.questIds = [999999];
    else if (kind === "wrong-build") input.catalog.targetBuild = 70532;
    else if (kind === "title") input.catalog.quests[0]!.title = "Another quest";
    else if (kind === "level") input.catalog.quests[0]!.questLevel = 17;
    else if (kind === "minimum") input.catalog.quests[0]!.minimumLevel = 12;
    else input.catalog.quests[0]!.timeLimitSeconds = 600;
    expect(() => reconcileClientQuestTiming(input)).toThrow();
  });

  it.each([0, -1, 1.5, 901, Number.MAX_SAFE_INTEGER + 1, null, undefined])(
    "refuses a missing, invalid or conflicting corroborating deadline: %s",
    (seconds) => {
      const input = fixture();
      const snapshots = structuredClone(captured.snapshots);
      const quest: Record<string, unknown> = snapshots[1]!.document.quests["257"];
      quest.timeLimitSeconds = seconds;
      expect(() => reconcileClientQuestTiming({ ...input, snapshots })).toThrow();
    },
  );
});
