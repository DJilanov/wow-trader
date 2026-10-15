import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPublishedQuestXp,
  readQuestXpIndex,
  type QuestXpRecord,
} from "@wow-trader/reference-data";
import { getForeverWorldData, type ForeverWorldData } from "./forever-world";
import { worldQuestSchema } from "@wow-trader/contracts";
import { getLevelingRewardSnapshot } from "./leveling-quest-xp";

vi.mock("@wow-trader/reference-data", (): object => ({
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
async function setup(title = "The Killing Fields"): Promise<void> {
  vi.stubEnv("WOW_TRADER_REFERENCE_DIRECTORY", "/tmp/leveling-xp-test");
  vi.mocked(readQuestXpIndex).mockResolvedValue({
    schema: "quest-xp-index.v1",
    publishedAt: capturedAt,
    records: [
      { game: "forever", id: 9, sha256: "a".repeat(64), capturedAt },
      { game: "tbc", id: 9, sha256: "b".repeat(64), capturedAt },
    ],
  });
  vi.mocked(readPublishedQuestXp).mockResolvedValue(record());
  const world: ForeverWorldData = {
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
  vi.mocked(getForeverWorldData).mockResolvedValue(world);
}
describe("quest XP adapter", () => {
  it("reads only selected Forever IDs and binds their primary name to current client identities", async () => {
    await setup();
    const result = await getLevelingRewardSnapshot([9]);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ questId: 9, fullXp: 1050 });
    expect(readPublishedQuestXp).toHaveBeenCalledTimes(1);
    expect(result.revision).toMatch(/^quest-xp-[a-f0-9]{24}$/);
  });
  it("does not turn a conflicting name or unavailable client into trusted rewards", async () => {
    await setup("Different quest");
    expect((await getLevelingRewardSnapshot([9])).facts).toEqual([]);
    vi.mocked(getForeverWorldData).mockResolvedValue(null);
    expect((await getLevelingRewardSnapshot([9])).revision).toBe("client-unavailable");
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
