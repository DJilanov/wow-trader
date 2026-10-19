import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  decodeQuestieSpawnLocations,
  deriveQuestieForeverRelations,
  getQuestieForeverFieldNames,
  loadQuestieForeverExport,
  parseQuestieForeverSource,
} from "./questie-forever.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("QuestieDB Forever export", () => {
  it("decodes literal rows, nil holes, and keyed spawn maps without executing Lua", () => {
    const rows = parseQuestieForeverSource(
      "npc",
      [
        "local npc = {}",
        "npc[42]={'Road Agent',nil,nil,12,13,nil,{[14]={{42.5,63.25}}},nil,14,{581},{582}}",
        "return npc",
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        kind: "npc",
        id: 42,
        name: "Road Agent",
        data: {
          name: "Road Agent",
          minLevel: 12,
          maxLevel: 13,
          spawns: { "14": [[42.5, 63.25]] },
          zoneID: 14,
          questStarts: [581],
          questEnds: [582],
        },
      },
    ]);
  });

  it("rejects executable statements and duplicate entity ids", () => {
    expect(() =>
      parseQuestieForeverSource(
        "item",
        "local item = {}\nitem[1]={'First'}\nrunCode()\nreturn item",
      ),
    ).toThrow(/executable or unsupported/);
    expect(() =>
      parseQuestieForeverSource(
        "item",
        "local item = {}\nitem[1]={'First'}\nitem[1]={'Second'}\nreturn item",
      ),
    ).toThrow(/duplicate item id 1/);
  });

  it("loads the four pinned artifacts and derives acquisition relations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wow-trader-questie-"));
    temporaryDirectories.push(directory);
    await Promise.all([
      writeFile(
        join(directory, "foreverQuestDB.lua"),
        exportSource("quest", "quest[581]={'Hunt',{{100},{200},{300}},{{101}}}"),
      ),
      writeFile(
        join(directory, "foreverNpcDB.lua"),
        exportSource(
          "npc",
          "npc[100]={'Hunter',nil,nil,30,30,nil,{[33]={{40,50}}},nil,nil,{581},{581}}",
        ),
      ),
      writeFile(
        join(directory, "foreverItemDB.lua"),
        exportSource(
          "item",
          "item[400]={'Recipe',{100},{200},{500},nil,{581},nil,nil,nil,nil,nil,nil,nil,{101},nil,900}",
        ),
      ),
      writeFile(
        join(directory, "foreverObjectDB.lua"),
        exportSource("object", "object[200]={'Chest',{581},{581},{[33]={{41,51}}}}"),
      ),
    ]);

    const bundle = await loadQuestieForeverExport(directory, {
      sourceVersion: "v1.2.3",
      sourceRevision: "abc123",
      licenseRef: "https://example.test/license",
    });

    expect(bundle.artifacts).toHaveLength(4);
    expect(bundle.entities).toHaveLength(4);
    expect(bundle.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "item",
          sourceId: 400,
          relationKind: "dropped_by_npc",
          targetKind: "npc",
          targetId: 100,
        }),
        expect.objectContaining({
          sourceKind: "item",
          sourceId: 400,
          relationKind: "sold_by_npc",
          targetKind: "npc",
          targetId: 101,
        }),
        expect.objectContaining({
          sourceKind: "item",
          sourceId: 400,
          relationKind: "teaches_spell",
          targetKind: "spell",
          targetId: 900,
        }),
        expect.objectContaining({
          sourceKind: "quest",
          sourceId: 581,
          relationKind: "started_by",
          targetKind: "object",
          targetId: 200,
        }),
      ]),
    );
  });

  it("deduplicates relations repeated by one source row", () => {
    const [item] = parseQuestieForeverSource(
      "item",
      "local item = {}\nitem[1]={'Item',{2,2}}\nreturn item",
    );
    expect(deriveQuestieForeverRelations([item!])).toHaveLength(1);
  });

  it("accepts bounded spawn coordinates and reports malformed points", () => {
    expect(
      decodeQuestieSpawnLocations({
        "12": [[48.89, 36.44], [101, 20], [20]],
        "40": [[0, 100]],
        invalid: [[10, 10]],
      }),
    ).toEqual({
      locations: [
        { areaId: 12, xPercent: 48.89, yPercent: 36.44 },
        { areaId: 40, xPercent: 0, yPercent: 100 },
      ],
      rejectedCount: 3,
    });
    expect(decodeQuestieSpawnLocations(null)).toEqual({ locations: [], rejectedCount: 0 });
    expect(decodeQuestieSpawnLocations([[10, 10]])).toEqual({
      locations: [],
      rejectedCount: 1,
    });
  });
});

function exportSource(kind: "quest" | "npc" | "item" | "object", assignment: string): string {
  const legend = getQuestieForeverFieldNames(kind)
    .map((field, index) => `-- [${index + 1}] = ${field}`)
    .join("\n");
  return `local ${kind} = {}\n${legend}\n${assignment}\nreturn ${kind}\n`;
}
