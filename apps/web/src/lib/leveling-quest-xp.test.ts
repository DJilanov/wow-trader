import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPublishedQuestXp,
  readQuestXpIndex,
  type QuestXpRecord,
} from "@wow-trader/reference-data";
import type * as ReferenceDataModule from "@wow-trader/reference-data";
import { getForeverWorldData, type ForeverWorldData } from "./forever-world";
import { worldQuestSchema } from "@wow-trader/contracts";
import { getLevelingRewardSnapshot } from "./leveling-quest-xp";

vi.mock("@wow-trader/reference-data", async (importOriginal): Promise<object> => ({
  ...(await importOriginal<typeof ReferenceDataModule>()),
  readPublishedQuestXp: vi.fn(),
  readQuestXpIndex: vi.fn(),
}));
vi.mock("./forever-world", (): object => ({ getForeverWorldData: vi.fn() }));
afterEach((): void => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
const capturedAt = new Date().toISOString();
function record(): QuestXpRecord {
  return {
    schema: "quest-xp-evidence.v1",
    parserVersion: "wowhead-quest-xp-20261014-v1",
    game: "forever",
    kind: "quest",
    id: 9,
    name: "The Killing Fields",
    sourceUrl: "https://www.wowhead.com/forever/quest=9",
    sourceSha256: "a".repeat(64),
    capturedAt,
    questLevel: 15,
    minimumLevel: 8,
    fullXp: 1050,
    referenceBaseXp: 1050,
    pageMultiplier: 1,
    rendererRevision: "quest-5f36c4ad-core-52d4f803",
    xpByLevel: [{ level: 15, xp: 1050 }],
    status: "available",
    issues: [],
  };
}
function createWorld(title = "The Killing Fields"): ForeverWorldData {
  return {
    build: {
      id: null,
      product: "wow_classic_beta",
      clientVersion: "1.60.1",
      buildNumber: 70205,
      locale: "enUS",
      state: "published",
    },
    maps: [],
    areas: [],
    uiMaps: [],
    uiMapAssignments: [],
    mapArts: [],
    uiMapArtLinks: [],
    mapArtLayers: [],
    mapArtTiles: [],
    pois: [],
    encounters: [],
    lfgDungeons: [],
    quests: [
      worldQuestSchema.parse({
        questId: 9,
        title,
        uniqueBitFlag: 0,
        uiQuestDetailsThemeId: 0,
        rawRecord: {},
      }),
    ],
    questObjectives: [],
    questLines: [],
    questLineMembers: [],
    questPois: [],
    itemSourceHints: [],
    creatureObjectives: [],
    bosses: [],
    bossLocations: [],
    creatureModels: [],
    bossSpellCandidates: [],
    lootSourceCandidates: [],
    mapDifficulties: [],
    contentTunings: [],
  };
}
async function setup(title = "The Killing Fields"): Promise<void> {
  vi.stubEnv("WOW_TRADER_REFERENCE_DIRECTORY", "/tmp/leveling-xp-test");
  vi.stubEnv("WOW_TRADER_LEVELING_QUEST_XP_IMPORT", "");
  vi.mocked(readQuestXpIndex).mockResolvedValue({
    schema: "quest-xp-index.v1",
    publishedAt: capturedAt,
    records: [
      { game: "forever", id: 9, sha256: "a".repeat(64), capturedAt },
      { game: "tbc", id: 9, sha256: "b".repeat(64), capturedAt },
    ],
  });
  vi.mocked(readPublishedQuestXp).mockResolvedValue(record());
  vi.mocked(getForeverWorldData).mockResolvedValue(createWorld(title));
}
describe("quest XP adapter", () => {
  it("reads only selected Forever IDs and binds their primary name to current client identities", async () => {
    await setup();
    const result = await getLevelingRewardSnapshot([9]);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ questId: 9, fullXp: 1050 });
    expect(readPublishedQuestXp).toHaveBeenCalledTimes(1);
    expect(result.clientBuild).toBe(70205);
    expect(result.revision).toMatch(/^quest-xp-[a-f0-9]{24}$/);
  });
  it("binds the reward revision to the current client identity build", async () => {
    await setup();
    const first = await getLevelingRewardSnapshot([9]);
    const current = createWorld();
    vi.mocked(getForeverWorldData).mockResolvedValue({
      ...current,
      build: { ...current.build, buildNumber: 70450, clientVersion: "1.60.1.70450" },
    });

    const second = await getLevelingRewardSnapshot([9]);

    expect(second.clientBuild).toBe(70450);
    expect(second.revision).not.toBe(first.revision);
  });
  it("does not turn a conflicting name or unavailable client into trusted rewards", async () => {
    await setup("Different quest");
    expect((await getLevelingRewardSnapshot([9])).facts).toEqual([]);
    vi.mocked(getForeverWorldData).mockResolvedValue(null);
    expect((await getLevelingRewardSnapshot([9])).revision).toBe("client-unavailable");
  });
  it("accepts an allowlisted route quest without a static client task row", async () => {
    await setup();
    vi.mocked(getForeverWorldData).mockResolvedValue({
      ...createWorld(),
      quests: [],
    });

    const result = await getLevelingRewardSnapshot([9]);

    expect(result.facts).toHaveLength(1);
    expect(result.notice).toBeNull();
  });
  it("uses an explicitly configured historical import only as labeled estimate evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "leveling-reward-import-"));
    try {
      await setup();
      vi.mocked(readPublishedQuestXp).mockResolvedValue({
        ...record(),
        fullXp: null,
        referenceBaseXp: null,
        pageMultiplier: null,
        rendererRevision: null,
        xpByLevel: [],
        status: "unknown",
        issues: ["missing_numeric_quest_xp"],
      });
      const input = join(root, "quest-xp-import.json");
      await writeFile(
        input,
        JSON.stringify({
          schema: "quest-xp-import-set.v1",
          game: "forever",
          sourceKind: "addon-database",
          sourceRef: "Pinned QuestieDB export",
          revision: "test-revision",
          exportSha256: "b".repeat(64),
          importedAt: capturedAt,
          counts: { records: 1, available: 1, unknown: 0, conflicts: 0, unexpected: 0 },
          records: [
            {
              game: "forever",
              kind: "quest",
              id: 9,
              schema: "quest-xp-import.v1",
              sourceKind: "addon-database",
              sourceRef: "Pinned QuestieDB export",
              revision: "test-revision",
              exportSha256: "b".repeat(64),
              importedAt: capturedAt,
              questLevel: 15,
              minimumLevel: null,
              rewardXpId: null,
              fullXp: 900,
              xpByLevel: [],
              status: "available",
              issues: [],
            },
          ],
        }),
      );
      vi.stubEnv("WOW_TRADER_LEVELING_QUEST_XP_IMPORT", input);

      const result = await getLevelingRewardSnapshot([9]);

      expect(result.facts[0]).toMatchObject({
        questId: 9,
        fullXp: 900,
        minimumLevel: 8,
        evidenceKind: "historical-reference",
      });
      expect(result.notice).toContain("remain estimates");

      await setup("Different quest");
      vi.stubEnv("WOW_TRADER_LEVELING_QUEST_XP_IMPORT", input);
      const held = await getLevelingRewardSnapshot([9]);

      expect(held.facts).toEqual([]);
      expect(held.notice).toContain("held for current-client identity checks");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("keeps published Forever rewards when the optional historical import is unavailable", async () => {
    await setup();
    vi.stubEnv(
      "WOW_TRADER_LEVELING_QUEST_XP_IMPORT",
      "/tmp/does-not-exist/leveling-quest-xp-import.json",
    );
    const log = vi.spyOn(console, "error").mockImplementation((): void => {});

    const result = await getLevelingRewardSnapshot([9]);

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ questId: 9, evidenceKind: "published-forever" });
    expect(result.revision).toMatch(/^quest-xp-[a-f0-9]{24}$/);
    expect(result.notice).toContain("published Forever rewards remain available");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("reports missing configuration, missing publication and failed checksum validation without inventing XP", async () => {
    vi.stubEnv("WOW_TRADER_REFERENCE_DIRECTORY", "");
    expect((await getLevelingRewardSnapshot([9])).facts).toEqual([]);
    await setup();
    vi.mocked(readQuestXpIndex).mockResolvedValue(null);
    expect((await getLevelingRewardSnapshot([9])).revision).toBe("not-collected");
    await setup();
    vi.mocked(readPublishedQuestXp).mockRejectedValue(new Error("checksum mismatch"));
    const log = vi.spyOn(console, "error").mockImplementation((): void => {});
    expect((await getLevelingRewardSnapshot([9])).revision).toBe("validation-failed");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
