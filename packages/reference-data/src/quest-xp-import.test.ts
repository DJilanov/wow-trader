import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicJsonWrite } from "./store.js";
import {
  QUEST_XP_PARSER_VERSION,
  questXpRecordSchema,
  type QuestXpRecord,
} from "./quest-xp-contracts.js";
import { buildQuestXpImport, parseCsv } from "./quest-xp-import.js";

const CSV = [
  "id,level,min_level,reward_xp_id,xp",
  "581,32,25,24,2450",
  "582,33,0,25,2520",
  "583,34,30,0,",
].join("\n");

function staged(overrides: Partial<QuestXpRecord> = {}): QuestXpRecord {
  return questXpRecordSchema.parse({
    game: "forever",
    kind: "quest",
    id: 581,
    schema: "quest-xp-evidence.v1",
    parserVersion: QUEST_XP_PARSER_VERSION,
    name: "Hunt for Yenniku",
    sourceUrl: "https://www.wowhead.com/forever/quest=581",
    sourceSha256: "a".repeat(64),
    capturedAt: "2026-10-16T00:00:00.000Z",
    questLevel: 32,
    minimumLevel: 25,
    fullXp: 2450,
    referenceBaseXp: 2450,
    pageMultiplier: 1,
    rendererRevision: "quest-5f36c4ad-core-52d4f803",
    xpByLevel: [{ level: 32, xp: 2450 }],
    status: "available",
    issues: [],
    ...overrides,
  });
}

const base = {
  game: "forever",
  sourceKind: "server-database",
  sourceRef: "kfcguild world database export",
  revision: "forever-2026-10-17",
  importedAt: "2026-10-17T09:00:00.000Z",
} as const;

describe("external quest XP import", () => {
  it("keeps zero minimum level as no-requirement and flags formula-derived rewards", async () => {
    const result = await buildQuestXpImport({ ...base, input: CSV, format: "csv" });
    expect(result.report).toMatchObject({
      records: 3,
      available: 2,
      unknown: 1,
      conflicts: 0,
      unexpected: 0,
    });
    expect(result.set.exportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.set.records.map((record) => record.id)).toEqual([581, 582, 583]);
    expect(result.set.records[1]).toMatchObject({
      minimumLevel: null,
      rewardXpId: 25,
      fullXp: 2520,
      status: "available",
    });
    expect(result.set.records[2]).toMatchObject({
      fullXp: null,
      rewardXpId: 0,
      status: "unknown",
    });
    expect(result.set.records[2]!.issues).toEqual(
      expect.arrayContaining(["missing_reward_xp", "formula_derived_reward"]),
    );
    for (const record of result.set.records)
      expect(record.sourceKind).toBe("server-database");
  });

  it("is deterministic for the same input and rejects duplicate identities", async () => {
    const first = await buildQuestXpImport({ ...base, input: CSV, format: "csv" });
    const second = await buildQuestXpImport({ ...base, input: CSV, format: "csv" });
    expect(second.set).toEqual(first.set);
    await expect(
      buildQuestXpImport({
        ...base,
        format: "csv",
        input: "id,level,xp\n1,2,30\n1,3,40",
      }),
    ).rejects.toThrow(/Duplicate imported quest id/);
  });

  it("flags ids outside the known queue instead of dropping them", async () => {
    const result = await buildQuestXpImport({
      ...base,
      input: CSV,
      format: "csv",
      knownIds: new Set([581]),
    });
    expect(result.report).toMatchObject({ unexpected: 2, available: 1 });
    expect(result.set.records[1]!.issues).toContain("unexpected_id");
    expect(result.set.records[1]!.status).toBe("unknown");
    expect(result.set.records[2]!.issues).toContain("unexpected_id");
  });

  it("keeps the import separate and reports a Wowhead disagreement as a conflict", async () => {
    const root = await mkdtemp(join(tmpdir(), "quest-xp-import-"));
    try {
      await atomicJsonWrite(join(root, "forever-quest-581.xp.json"), staged());
      const result = await buildQuestXpImport({
        ...base,
        stagedDirectory: root,
        format: "csv",
        input: "id,level,min_level,reward_xp_id,xp\n581,32,25,24,2500",
      });
      expect(result.set.records[0]).toMatchObject({ status: "conflict", fullXp: 2500 });
      expect(result.set.records[0]!.issues).toContain("wowhead_conflict:forever-quest-581");
      expect(result.report.conflictsWithWowhead).toEqual([
        { key: "forever-quest-581", fields: ["fullXp"] },
      ]);
      expect(result.set.counts).toMatchObject({ conflicts: 1, available: 0, unknown: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts JSON records with a reward curve and normalizes key spelling", async () => {
    const result = await buildQuestXpImport({
      ...base,
      format: "json",
      input: JSON.stringify({
        records: [
          {
            questId: 581,
            questLevel: 32,
            minimumLevel: 25,
            rewardXpId: 24,
            xpByLevel: [
              { level: 33, xp: 2600 },
              { level: 32, xp: 2500 },
            ],
          },
        ],
      }),
    });
    expect(result.set.records[0]).toMatchObject({
      id: 581,
      questLevel: 32,
      minimumLevel: 25,
      fullXp: null,
      status: "available",
      xpByLevel: [
        { level: 32, xp: 2500 },
        { level: 33, xp: 2600 },
      ],
    });
  });

  it("parses quoted CSV fields and rejects malformed numbers", () => {
    expect(parseCsv('a,b\r\n"1,5","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["1,5", 'say "hi"'],
    ]);
    return expect(
      buildQuestXpImport({ ...base, format: "csv", input: "id,level,xp\n581,many,10" }),
    ).rejects.toThrow(/Invalid level/);
  });
});
