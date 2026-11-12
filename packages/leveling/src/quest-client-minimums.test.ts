import { describe, expect, it } from "vitest";
import snapshots from "./fixtures/quest-client-corrections-70205-70450.json" with { type: "json" };
import { reconcileClientMinimumLevels } from "./quest-client-minimums.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";

function fixture(): { catalog: QuestCatalog; snapshots: typeof snapshots; questIds: number[] } {
  const minima = [28, 28, 23, null];
  const questIds = [631, 632, 1144, 96395];
  const clients: Readonly<Record<string, { readonly title: string; readonly level: number }>> =
    snapshots[0]!.document.quests;
  return {
    catalog: questCatalogSchema.parse({
      schema: "forever-quest-funding-catalog.v1", targetBuild: 70205, publication: "private-reference",
      authorizationNote: "Synthetic catalog", providerRevision: "a".repeat(40), npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64), areaMapSha256: "d".repeat(64), sourceArchiveSha256: "e".repeat(64),
      includesAuthoredCorrections: true,
      quests: questIds.map((questId, index) => {
        const client = clients[String(questId)]!;
        return { questId, title: client.title, minimumLevel: minima[index], questLevel: client.level,
          requiredClasses: 0, requiredRaces: 1, starts: [], ends: [], prerequisites: { allOf: [], anyOf: [] },
          exclusiveWith: [], category: "unsupported", objectives: [], unsupportedRequirements: ["unresolved-method"] };
      }),
    }),
    snapshots: structuredClone(snapshots),
    questIds,
  };
}

describe("matching-build quest pickup minima", () => {
  it("corrects only pickup minima and retains previous facts without touching reward levels or other gates", () => {
    const input = fixture(), before = structuredClone(input);
    const result = reconcileClientMinimumLevels(input);
    expect(result.catalog.quests.map((quest) => quest.minimumLevel)).toEqual([26, 26, 22, 10]);
    expect(result.resolutions.map((row) => row.previous.minimumLevel)).toEqual([28, 28, 23, null]);
    result.catalog.quests.forEach((quest, index) => {
      expect({ ...quest, minimumLevel: input.catalog.quests[index]!.minimumLevel }).toEqual(input.catalog.quests[index]);
    });
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
    expect(input).toEqual(before);
    expect(reconcileClientMinimumLevels({ ...input, catalog: result.catalog }).catalog).toEqual(result.catalog);
  });

  it.each(["quest-level", "minimum-disagreement", "title", "class", "missing", "duplicate", "empty", "wrong-build"])(
    "holds incompatible client facts: %s", (kind) => {
      const input = fixture();
      if (kind === "quest-level") input.catalog.quests[0]!.questLevel = 25;
      else if (kind === "minimum-disagreement") input.snapshots[1]!.document.quests["631"].minLevel = 28;
      else if (kind === "title") input.catalog.quests[0]!.title = "Different quest";
      else if (kind === "class") input.catalog.quests[0]!.requiredClasses = 1;
      else if (kind === "missing") input.catalog.quests = [];
      else if (kind === "duplicate") input.questIds.push(631);
      else if (kind === "empty") input.questIds = [];
      else if (kind === "wrong-build") input.catalog.targetBuild = 70532;
      expect(() => reconcileClientMinimumLevels(input)).toThrow();
    },
  );
});
