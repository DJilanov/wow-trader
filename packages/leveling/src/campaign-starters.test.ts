import { describe, expect, it } from "vitest";
import { buildCampaignStarters, enrichCampaignStarters } from "./campaign-starters.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { LEVELING_RACES } from "./profile.js";
import type { CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";

function sources(): readonly CampaignSource[] {
  return [113, 114, 115, 116, 117, 118, 119, 122, 123, 124, 125, 126, 157].map((id) => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
    return {
      reference,
      guide: parseGuideChapter(
        `step\n.accept ${300000 + id} >> Accept Work\nstep\n.complete ${300000 + id},1 >> Kill enemies\nstep\n.turnin ${300000 + id} >> Turn in Work`,
        reference.id,
        "a".repeat(64),
        70205,
      ),
    };
  });
}

describe("independent party starter catalog", () => {
  it.each([false, true])(
    "reselects archived hand-ins with loaded prerequisites (%s)",
    (dependent) => {
      const input = sources().map((source) => {
        const raw =
          source.reference.sourceId === 119
            ? "step\n.accept 300418\nstep\n.turnin 300418\n.isQuestComplete 300418\nstep\n.accept 300419"
            : source.reference.sourceId === 122
              ? "step\n.turnin 300418"
              : "step\n+Empty companion chapter";
        return {
          ...source,
          guide: parseGuideChapter(raw, source.reference.id, "a".repeat(64), 70205),
        };
      });
      const raw = buildCampaignStarters("b".repeat(64), input);
      const before = JSON.stringify(raw);
      const combat: CombatDataset = {
        schema: "forever-combat-reference.v1",
        targetBuild: 70205,
        publication: "private-reference",
        authorizationNote: "Test-only reference",
        provider: {
          repository: "https://example.test/reference",
          revision: "a".repeat(40),
          layer: "forever-static-with-authored",
          npcSha256: "a".repeat(64),
          questSha256: "a".repeat(64),
          itemSha256: "a".repeat(64),
          limitations: ["Synthetic fixture"],
        },
        npcs: [],
        dungeons: [],
        killXpEvidence: [],
        quests: [
          {
            questId: 300419,
            creatureIds: [],
            itemCreatureIds: [],
            onlyCreatureObjectives: false,
            objectiveText: [],
            prerequisites: { allOf: dependent ? [300418] : [], anyOf: [] },
          },
        ],
      };
      const enriched = enrichCampaignStarters(raw, input, [], {
        data: combat,
        revision: "a".repeat(64),
      });
      const route = enriched.routes.find(
        (entry) => entry.race === "dwarf" && entry.classSlug === "priest",
      )!;
      const handIns = route.actionIndexes
        .map((index) => enriched.entries[index]!.action)
        .filter((action) =>
          action.questChanges.some(
            (change) => change.questId === 300418 && change.state === "rewarded",
          ),
        );
      expect(handIns).toHaveLength(1);
      expect(handIns[0]!.source?.chapterId).toBe(
        input.find((source) => source.reference.sourceId === (dependent ? 119 : 122))!.guide
          .chapterId,
      );
      expect(enriched.sourceArchiveSha256).toBe("b".repeat(64));
      expect(JSON.stringify(raw)).toBe(before);
    },
  );

  it("keeps available starters usable when another race's archive is missing", () => {
    const result = buildCampaignStarters(
      "b".repeat(64),
      sources().filter((source) => [115, 116, 117, 125].includes(source.reference.sourceId)),
    );
    expect(
      result.routes.some((route) => route.race === "human" && route.classSlug === "warrior"),
    ).toBe(true);
    expect(result.routes.some((route) => route.race === "dwarf")).toBe(false);
    expect(result.routes.some((route) => route.classSlug === "hunter")).toBe(false);
  });
  it("covers every supported Alliance race/class and deduplicates common source actions", () => {
    const input = sources();
    const before = JSON.stringify(input);
    const result = buildCampaignStarters("b".repeat(64), input);
    expect(result.routes).toHaveLength(
      LEVELING_RACES.filter((race) => race.faction === "alliance").reduce(
        (sum, race) => sum + race.classes.length + 1,
        0,
      ),
    );
    expect(result.entries.length).toBeLessThan(
      result.routes.reduce((sum, route) => sum + route.actionIndexes.length, 0) / 2,
    );
    expect(result.routes.every((route) => route.legs.every((leg) => leg.kind === "starter"))).toBe(
      true,
    );
    expect(
      result.routes
        .find((route) => route.race === "human" && route.classSlug === "hunter")!
        .legs.at(-1)!.id,
    ).toBe("start-126");
    expect(
      result.routes
        .find((route) => route.race === "dwarf" && route.classSlug === "hunter")!
        .legs.map((leg) => leg.id),
    ).toEqual(["start-118", "start-123", "start-124", "start-126"]);
    expect(
      result.routes
        .find((route) => route.race === "dwarf" && route.classSlug === "priest")!
        .legs.map((leg) => leg.id),
    ).toEqual(["start-118", "start-119", "start-122"]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("compiles each starter's real pickup gates without forcing source chapter levels", () => {
    const input = sources();
    const raw = buildCampaignStarters("b".repeat(64), input);
    const result = enrichCampaignStarters(
      raw,
      input,
      [
        {
          questId: 300115,
          fullXp: 100,
          questLevel: 2,
          minimumLevel: 2,
          xpByLevel: [],
          status: "available",
          evidenceKind: "published-forever",
          sourceUrl: "https://example.test/quest=300115",
          capturedAt: "2026-10-21T00:00:00Z",
        },
      ],
      null,
    );
    const human = result.routes.find(
      (route) => route.race === "human" && route.classSlug === "warrior",
    )!;
    const actions = human.actionIndexes.map((index) => result.entries[index]!.action);
    expect(
      actions.some((action) => action.pickupQuestId === 300115 && action.targetLevel === 2),
    ).toBe(true);
    expect(actions.some((action) => action.id.endsWith("entry-xp"))).toBe(false);
    expect(result.combat).toBeUndefined();
    expect(raw.entries.some((entry) => entry.action.pickupQuestId !== undefined)).toBe(false);
  });
});
