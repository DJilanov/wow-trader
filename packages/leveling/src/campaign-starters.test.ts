import { describe, expect, it } from "vitest";
import { buildCampaignStarters, enrichCampaignStarters } from "./campaign-starters.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { LEVELING_RACES } from "./profile.js";
import type { CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { questCatalogSchema } from "./quest-catalog.js";

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
  it("locates captured visits before qualifying Priest timing for an embedded personal route", () => {
    const input = sources()
      .filter((source) => [115, 116, 117].includes(source.reference.sourceId))
      .map((source) => {
        const body =
          source.reference.sourceId === 115
            ? "step\n.goto 1429,45,45\n.accept 300001\nstep\n.turnin 300001"
            : source.reference.sourceId === 116
              ? [
                  "step <<Priest\n.goto 1429,45,65\n.accept 5623\n.target Priestess Anetta",
                  "step <<Priest\n.goto 1429,43,65\n.turnin 5623\n.accept 5624\n.target Priestess Josetta",
                  "step <<Priest\n.goto 1429,44,65\n>>Cast Lesser Heal (Rank 2) and Power Word: Fortitude on Guard Roberts\n.complete 5624,1 >>Heal and fortify Guard Roberts\n.target Guard Roberts",
                  "step <<Priest\n.goto 1429,43,65\n.turnin 5624\n.target Priestess Josetta",
                  "step\n.goto 1429,43,65\n.accept 300002\nstep\n.turnin 300002",
                  "step\n.goto 1429,43,65\n.vendor\n.target Vendor",
                ].join("\n")
              : "step\n+Empty companion chapter";
        const parsed = parseGuideChapter(body, source.reference.id, "a".repeat(64), 70205);
        return {
          ...source,
          guide:
            source.reference.sourceId === 116
              ? {
                  ...parsed,
                  steps: parsed.steps.map((step, index) =>
                    index === parsed.steps.length - 1 ? { ...step, id: "source-step-0109" } : step,
                  ),
                }
              : parsed,
        };
      });
    const provider = {
      repository: "https://example.test/reference",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored" as const,
      npcSha256: "a".repeat(64),
      questSha256: "a".repeat(64),
      itemSha256: "a".repeat(64),
      limitations: ["Synthetic starter regression"],
    };
    const combat: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic starter regression",
      provider,
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
      quests: [300001, 300002, 5623, 5624].map((questId) => ({
        questId,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText:
          questId === 5624
            ? ["Use Lesser Heal (Rank 2) and Power Word: Fortitude on Guard Roberts."]
            : [],
        onlyCreatureObjectives: false,
        onlyInteractionObjectives: questId === 5624,
        requiredClasses: questId < 300000 ? 16 : 0,
        prerequisites: { allOf: [], anyOf: [] },
      })),
    };
    const catalog = questCatalogSchema.parse({
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic starter regression",
      providerRevision: provider.revision,
      questSha256: provider.questSha256,
      npcSha256: provider.npcSha256,
      itemSha256: provider.itemSha256,
      areaMapSha256: "a".repeat(64),
      sourceArchiveSha256: "b".repeat(64),
      includesAuthoredCorrections: false,
      quests: [5623, 5624].map((questId) => ({
        questId,
        title: `Quest ${questId}`,
        minimumLevel: 5,
        questLevel: 5,
        requiredClasses: 16,
        requiredRaces: 1,
        starts: [],
        ends: [],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "delivery",
        objectives: [],
        unsupportedRequirements: [],
      })),
    });
    const raw = buildCampaignStarters("b".repeat(64), input);
    const result = enrichCampaignStarters(
      raw,
      input,
      [300001, 300002, 5623, 5624].map((questId) => ({
        questId,
        fullXp: questId === 300001 ? 3200 : questId === 300002 ? 1700 : 150,
        questLevel: 10,
        minimumLevel: questId < 300000 ? 5 : 1,
        xpByLevel: [],
        status: "available" as const,
        evidenceKind: "published-forever" as const,
        sourceUrl: `https://example.test/quest=${questId}`,
        capturedAt: "2026-11-02T00:00:00Z",
      })),
      { data: combat, revision: "a".repeat(64) },
      catalog,
    );
    const route = result.routes.find((row) => row.race === "human" && row.classSlug === "priest")!;
    const actions = route.actionIndexes.map((index) => result.entries[index]!.action);
    const anchor = actions.findIndex((action) => action.id === "start-116-116-source-step-0109");
    const pickup = actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 5623 && change.state === "accepted"),
    );
    expect(anchor).toBeGreaterThanOrEqual(0);
    expect(pickup).toBeGreaterThan(anchor);
    expect(actions[pickup]!.source?.stepId).toBe("source-step-0001");
    expect(actions[pickup]!.location?.zone).toBe("1429");
    expect(
      actions
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === 5624 && change.state === "rewarded"),
    ).toHaveLength(1);
  });
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
