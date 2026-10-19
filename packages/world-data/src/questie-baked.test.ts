import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { encodeCbor } from "./cbor-test-encoder.js";
import { loadQuestieForeverBaked } from "./questie-baked.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("QuestieDB baked Forever reader", () => {
  it("extracts selected quests and their giver locations without executing Lua", async () => {
    const root = await mkdtemp(join(tmpdir(), "questie-baked-"));
    temporaryDirectories.push(root);
    const toc = join(root, "QuestieDB_Forever.toc");
    await writeFile(
      toc,
      [
        "## Interface: 16001",
        "## Version: 1.0.4",
        "## X-Contract-Version: 2",
        "## X-Flavor: Forever",
        "## X-Mode: baked",
        "## X-BUILD-COMMIT: test-revision",
        metadata("X-Quest-1053-S", {
          "1": "In the Name of the Light",
          "4": 34,
          "5": 40,
          "6": 77,
          "7": 2,
          "17": 796,
          "23": 8,
          p: 6,
        }),
        metadata("X-Quest-1053-2", { "1": [3977], "3": [400] }),
        metadata("X-Quest-1053-3", [[1449], null]),
        metadata("X-Quest-1053-8", ["Kill the Scarlet leaders."]),
        metadata("X-Quest-1053-13", [1052]),
        metadata("X-Npc-3977-S", { "1": "High Priest Thel'danis", "9": 1519, p: 64 }),
        metadata("X-Npc-3977-7", { "1519": [[42.5, 24]] }),
        metadata("X-Npc-1449-S", { "1": "Witch Doctor Unbagwa", "9": 1519 }),
      ].join("\n"),
    );

    const bundle = await loadQuestieForeverBaked(
      toc,
      { questIds: [1053, 1053], includeQuestGivers: true },
      {
        sourceVersion: "1.0.4",
        sourceRevision: "test-revision",
        licenseRef: "https://example.test/license",
      },
    );

    expect(bundle.artifacts).toHaveLength(1);
    expect(bundle.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quest",
          id: 1053,
          data: expect.objectContaining({
            requiredLevel: 34,
            preQuestSingle: [1052],
            startedBy: { "1": [3977], "3": [400] },
          }),
        }),
        expect.objectContaining({
          kind: "npc",
          id: 3977,
          data: expect.objectContaining({
            name: "High Priest Thel'danis",
            spawns: { "1519": [[42.5, 24]] },
          }),
        }),
      ]),
    );
    expect(bundle.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "quest",
          sourceId: 1053,
          relationKind: "requires_quest",
          targetId: 1052,
        }),
        expect.objectContaining({
          sourceKind: "quest",
          sourceId: 1053,
          relationKind: "started_by",
          targetKind: "npc",
          targetId: 3977,
        }),
        expect.objectContaining({
          sourceKind: "quest",
          sourceId: 1053,
          relationKind: "started_by",
          targetKind: "item",
          targetId: 400,
        }),
      ]),
    );
  });

  it("rejects the wrong flavor and missing quests without silently fabricating rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "questie-baked-invalid-"));
    temporaryDirectories.push(root);
    const toc = join(root, "QuestieDB_Forever.toc");
    await writeFile(
      toc,
      [
        "## X-Contract-Version: 2",
        "## X-Flavor: Tbc",
        "## X-Mode: baked",
        metadata("X-Quest-1-S", { "1": "Wrong flavor" }),
      ].join("\n"),
    );
    await expect(
      loadQuestieForeverBaked(toc, { questIds: [1] }, metadataOptions()),
    ).rejects.toThrow(/not the Forever flavor/);
    await writeFile(
      toc,
      [
        "## Version: 1.0.4",
        "## X-Contract-Version: 2",
        "## X-Flavor: Forever",
        "## X-Mode: baked",
        "## X-BUILD-COMMIT: test-revision",
      ].join("\n"),
    );
    const bundle = await loadQuestieForeverBaked(toc, { questIds: [1] }, metadataOptions());
    expect(bundle.entities).toEqual([]);
  });

  it("includes bounded direct starter-item sources and binds the selection policy to its checksum", async () => {
    const root = await mkdtemp(join(tmpdir(), "questie-baked-item-sources-"));
    temporaryDirectories.push(root);
    const toc = join(root, "QuestieDB_Forever.toc");
    await writeFile(
      toc,
      [
        "## Version: 1.0.4",
        "## X-Contract-Version: 2",
        "## X-Flavor: Forever",
        "## X-Mode: baked",
        "## X-BUILD-COMMIT: test-revision",
        metadata("X-Quest-3373-S", { "1": "The Essence of Eranikus" }),
        metadata("X-Quest-3373-2", { "3": [10454, 400] }),
        metadata("X-Item-10454-S", { "1": "Essence of Eranikus", "5": 3373 }),
        metadata("X-Item-10454-2", [5709, 5709, 99999, -1]),
        metadata("X-Item-10454-3", [148512]),
        metadata("X-Item-10454-4", [200]),
        metadata("X-Npc-5709-S", { "1": "Shade of Eranikus", "9": 1477 }),
        metadata("X-Npc-5709-7", { "1477": [[-1, -1]] }),
        metadata("X-Object-148512-S", { "1": "Essence Font", "5": 1477 }),
        metadata("X-Object-148512-2", [999]),
        metadata("X-Item-200-S", { "1": "Nested item", "5": 3373 }),
        metadata("X-Item-400-S", { "1": "Unrelated starter", "5": 999 }),
        metadata("X-Item-400-2", [123]),
        metadata("X-Npc-123-S", { "1": "Unrelated source", "9": 1 }),
      ].join("\n"),
    );

    const bundle = await loadQuestieForeverBaked(toc, { questIds: [3373] }, metadataOptions());
    expect(bundle.entities.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "item:400",
      "item:10454",
      "npc:5709",
      "object:148512",
      "quest:3373",
    ]);
    expect(bundle.relations).toContainEqual(
      expect.objectContaining({
        sourceKind: "item",
        sourceId: 10454,
        relationKind: "dropped_by_npc",
        targetKind: "npc",
        targetId: 5709,
      }),
    );
    const repeated = await loadQuestieForeverBaked(
      toc,
      { questIds: [3373, 3373], includeQuestGivers: true },
      metadataOptions(),
    );
    expect(repeated.checksum).toBe(bundle.checksum);
    const questOnly = await loadQuestieForeverBaked(
      toc,
      { questIds: [3373], includeQuestGivers: false },
      metadataOptions(),
    );
    expect(questOnly.entities.map(({ kind, id }) => `${kind}:${id}`)).toEqual(["quest:3373"]);
    expect(questOnly.checksum).not.toBe(bundle.checksum);
  });
});

function metadata(key: string, value: unknown): string {
  return `## ${key}: ${encodeCbor(value).toString("base64")}`;
}

function metadataOptions() {
  return {
    sourceVersion: "1.0.4",
    sourceRevision: "test-revision",
    licenseRef: "https://example.test/license",
  };
}
