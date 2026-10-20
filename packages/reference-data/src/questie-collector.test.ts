import { describe, expect, it } from "vitest";
import { collectQuestieQuestXp, questieCollectionReportSchema } from "./questie-collector.js";
import {
  parseQuestieBaseQuestIds,
  parseQuestieTocRevision,
  parseQuestieXpDatabase,
} from "./questie-source.js";

const XP_SOURCE = `
local QuestXP = QuestieLoader:ImportModule("QuestXP")
QuestXP.db = {
  [581] = {34, 2000}, -- usable
  [582] = {35, 0}, -- present without reliable XP
  [8053] = {61, 3400}, -- Classic raid quest above the player-level cap
  [77574] = {2, 170}, -- SoD and excluded from Forever
}
`;

const SOD_SOURCE = `
function SeasonOfDiscovery:LoadBaseQuests()
    return {
        [77574] = {
            [1] = "Meditation on Elune",
            [2] = {{205951}},
        },
    }
end
`;

describe("Questie source parsing", () => {
  it("parses generated XP rows without executing Lua", () => {
    expect(parseQuestieXpDatabase(XP_SOURCE)).toEqual([
      { questId: 581, questLevel: 34, baseXp: 2000 },
      { questId: 582, questLevel: 35, baseXp: 0 },
      { questId: 8053, questLevel: 61, baseXp: 3400 },
      { questId: 77574, questLevel: 2, baseXp: 170 },
    ]);
  });

  it("extracts only top-level base quest ids and reads a pinned TOC revision", () => {
    expect([...parseQuestieBaseQuestIds(SOD_SOURCE)]).toEqual([77574]);
    expect(
      parseQuestieTocRevision(
        "## Version: 1.0.4\n## X-BUILD-COMMIT: 365537a340473291f5af3b7a53a5eca94e2a5f1a\n",
      ),
    ).toBe("version:1.0.4;commit:365537a340473291f5af3b7a53a5eca94e2a5f1a");
  });

  it("rejects malformed and duplicate generated rows", () => {
    expect(() => parseQuestieXpDatabase("QuestXP.db = {\n[1] = {2, 3},\n[1] = {2, 3},\n}")).toThrow(
      /Duplicate Questie quest id/,
    );
    expect(() => parseQuestieXpDatabase("QuestXP.db = {\nrunCode()\n}")).toThrow(
      /Unsupported Questie XP row/,
    );
  });
});

describe("Questie quest XP collection", () => {
  it("imports usable evidence, isolates SoD quests, and queues only unresolved Forever quests", async () => {
    const tasks = [581, 582, 77574, 999].map((id) => ({
      game: "forever" as const,
      kind: "quest" as const,
      id,
    }));
    const result = await collectQuestieQuestXp({
      tasks,
      xpSource: XP_SOURCE,
      sodQuestSource: SOD_SOURCE,
      sourceRef: "QuestieDB/support/Forever/QuestXP/xpDB-classic.lua",
      sodSourceRef: "QuestieDB/src/corrections/Sod/sodBaseQuests.lua",
      revision: "commit:365537a340473291f5af3b7a53a5eca94e2a5f1a",
      targetFlavor: "forever",
      importedAt: "2026-10-17T12:00:00.000Z",
    });

    expect(result.counts).toEqual({
      total: 4,
      available: 1,
      missing: 1,
      missingXp: 1,
      excluded: 1,
    });
    expect(result.importResult.set.sourceKind).toBe("addon-database");
    expect(result.importResult.set.exportSha256).toBe(result.report.source.sha256);
    expect(result.importResult.set.records).toEqual([
      expect.objectContaining({ id: 581, fullXp: 2000, status: "available" }),
      expect.objectContaining({ id: 582, fullXp: null, status: "unknown" }),
    ]);
    expect(result.fallbackTasks.map((task) => task.id)).toEqual([582, 999]);
    expect(result.exclusions).toEqual([
      { task: { game: "forever", kind: "quest", id: 77574 }, reason: "season-of-discovery" },
    ]);
    expect(result.report.flavorFilter.excludedIds).toEqual([77574]);
    expect(() =>
      questieCollectionReportSchema.parse({
        ...result.report,
        counts: { ...result.report.counts, excluded: 0 },
      }),
    ).toThrow(/Flavor-filter exclusion count mismatch/);
  });

  it("rejects duplicate queue identities", async () => {
    await expect(
      collectQuestieQuestXp({
        tasks: [
          { game: "forever", kind: "quest", id: 581 },
          { game: "forever", kind: "quest", id: 581 },
        ],
        xpSource: XP_SOURCE,
        sodQuestSource: SOD_SOURCE,
        sourceRef: "Questie XP",
        sodSourceRef: "Questie SoD quests",
        revision: "test",
        targetFlavor: "forever",
      }),
    ).rejects.toThrow(/duplicate quest ids/);
  });
});
