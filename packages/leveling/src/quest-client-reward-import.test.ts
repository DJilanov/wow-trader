import { describe, expect, it } from "vitest";
import fixtureData from "./fixtures/quest-client-rewards-70205-70450.json" with { type: "json" };
import { deriveClientRewardEstimates } from "./quest-client-reward-import.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import {
  resolveQuestReward,
  questRewardFactSchema,
  type QuestRewardFact,
} from "./quest-rewards.js";
import { createCampaignPickupBudget } from "./campaign-pickup-budget.js";

function fixture(): {
  catalog: QuestCatalog;
  facts: QuestRewardFact[];
  snapshots: typeof fixtureData.snapshots;
  tableSnapshots: typeof fixtureData.tableSnapshots;
  questIds: number[];
  questLevelCorrections: number[];
  referencedAt: string;
} {
  const ids = [18, 2922, 472, 224];
  const clients: Readonly<
    Record<string, { readonly title: string; readonly level: number; readonly minLevel: number }>
  > = fixtureData.snapshots[0]!.document.quests;
  const facts = ids.map((questId, index): QuestRewardFact => ({
    questId,
    fullXp: [355, 2650, 1000, 910][index]!,
    questLevel: questId === 472 ? 25 : clients[String(questId)]!.level,
    minimumLevel: clients[String(questId)]!.minLevel,
    xpByLevel: [],
    status: "available",
    rewardBasis: "unscaled-reference",
    evidenceKind: questId === 224 ? "published-forever" : "historical-reference",
    sourceUrl: "https://example.test/synthetic-previous-reward",
    capturedAt: "2026-10-31T00:00:00Z",
  }));
  return {
    catalog: questCatalogSchema.parse({
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic catalog for client-table regression",
      providerRevision: "a".repeat(40),
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      areaMapSha256: "d".repeat(64),
      sourceArchiveSha256: "e".repeat(64),
      includesAuthoredCorrections: true,
      quests: ids.map((questId) => ({
        questId,
        title: clients[String(questId)]!.title,
        minimumLevel: clients[String(questId)]!.minLevel,
        questLevel: questId === 472 ? 25 : clients[String(questId)]!.level,
        requiredRaces: 1,
        requiredClasses: 0,
        starts: [],
        ends: [],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "unsupported",
        objectives: [],
        unsupportedRequirements: ["separate-method-hold"],
      })),
    }),
    facts,
    snapshots: structuredClone(fixtureData.snapshots),
    tableSnapshots: structuredClone(fixtureData.tableSnapshots),
    questIds: ids,
    questLevelCorrections: [472],
    referencedAt: "2026-11-03T00:00:00Z",
  };
}

describe("client-table reward estimates", () => {
  it("uses Techbot's explicit 1.8 multiplier once, retaining published rewards and previous facts", () => {
    const input = fixture(),
      before = structuredClone(input),
      result = deriveClientRewardEstimates(input);
    const techbot = result.facts.find((fact) => fact.questId === 2922)!;
    expect(techbot).toMatchObject({
      evidenceKind: "client-table-reference",
      rewardBasis: "final-reward",
      fullXp: 4750,
    });
    expect(techbot.clientReference).toMatchObject({
      baseXp: 2650,
      xpMultiplier: 1.8,
      difficulty: 6,
    });
    expect(resolveQuestReward(2922, 26, result.facts)).toMatchObject({
      xp: 4750,
      basis: "base-estimate",
    });
    expect(resolveQuestReward(2922, 32, result.facts).xp).toBe(3800);
    expect(resolveQuestReward(2922, 60, result.facts).xp).toBe(0);
    expect(result.facts.find((fact) => fact.questId === 224)).toEqual(input.facts[3]);
    expect(result.resolutions.find((row) => row.questId === 2922)?.previous.reward).toEqual(
      input.facts[1],
    );
    expect(input).toEqual(before);
    expect(
      deriveClientRewardEstimates({ ...input, catalog: result.catalog, facts: [...result.facts] })
        .facts,
    ).toEqual(result.facts);
    for (const fact of result.facts) expect(questRewardFactSchema.parse(fact)).toEqual(fact);
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
  });

  it("corrects the Dun Modr reward level together with its entire curve, preserving method and access holds", () => {
    const input = fixture(),
      result = deriveClientRewardEstimates(input);
    const fact = result.facts.find((entry) => entry.questId === 472)!;
    expect(fact).toMatchObject({ questLevel: 30, minimumLevel: 25, fullXp: 1200 });
    expect(fact.xpByLevel).toContainEqual({ level: 31, xp: 1200 });
    expect(fact.xpByLevel).toContainEqual({ level: 36, xp: 950 });
    expect(fact.xpByLevel).toContainEqual({ level: 40, xp: 120 });
    expect(result.catalog.quests.find((quest) => quest.questId === 472)).toEqual({
      ...input.catalog.quests[2]!,
      questLevel: 30,
    });
    expect(result.resolutions.find((row) => row.questId === 472)?.previous.catalog.questLevel).toBe(
      25,
    );
  });

  it("does not promote a calculated reward into a verified pickup-level proof", () => {
    const result = deriveClientRewardEstimates(fixture());
    const budget = createCampaignPickupBudget(
      result.facts.filter((fact) => fact.evidenceKind === "client-table-reference"),
    );
    for (const questId of [18, 2922, 472]) budget.reward(questId);
    expect(budget.isFunded(2)).toBe(false);
    expect(
      result.facts.filter((fact) => fact.evidenceKind === "client-table-reference"),
    ).toHaveLength(3);
  });

  it.each(["published-forever", "observed-forever"] as const)(
    "retains stronger %s evidence even when a formula disagrees",
    (kind) => {
      const input = fixture();
      input.facts[1] = { ...input.facts[1]!, evidenceKind: kind };
      expect(deriveClientRewardEstimates(input).facts[1]).toEqual(input.facts[1]);
    },
  );

  it.each([
    "conflict",
    "unlabeled",
    "title",
    "minimum",
    "quest-level",
    "multiplier",
    "difficulty",
    "missing-binding",
    "class",
  ])("retains an unqualified record and reports its reason: %s", (kind) => {
    const input = fixture(),
      client = input.snapshots[1]!.document.quests["2922"];
    if (kind === "conflict") input.facts[1] = { ...input.facts[1]!, status: "conflict" };
    else if (kind === "unlabeled") {
      const { evidenceKind: _kind, ...rest } = input.facts[1]!;
      input.facts[1] = rest;
    } else if (kind === "title") client.title = "Different quest";
    else if (kind === "minimum") client.minLevel = 25;
    else if (kind === "quest-level") client.level = 27;
    else if (kind === "multiplier") client.rewards.xpMultiplier = 2.375;
    else if (kind === "difficulty") client.rewards.xpDifficulty = 5;
    else if (kind === "missing-binding") client.rewards.xpMultiplier = -1;
    else if (kind === "class") input.catalog.quests[1]!.requiredClasses = 1;
    const result = deriveClientRewardEstimates(input);
    expect(result.facts[1]).toEqual(input.facts[1]);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ questId: 2922, reason: expect.any(String) }),
    );
  });

  it("does not relabel an old quest level without explicit correction scope", () => {
    const input = fixture(),
      result = deriveClientRewardEstimates({ ...input, questLevelCorrections: [] });
    expect(result.facts[2]).toEqual(input.facts[2]);
    expect(result.catalog).toBe(input.catalog);
  });

  it.each([
    "missing-reference",
    "wrong-reference-build",
    "changed-base",
    "extra-multiplier",
      "wrong-reference-base",
    "full-xp",
    "missing-row",
    "changed-row",
    "unsorted-rows",
    "wrong-quest",
    "promoted-kind",
    "invalid-multiplier",
  ])("rejects a mislabeled or corrupted client-derived fact at the schema boundary: %s", (kind) => {
    const fact = structuredClone(deriveClientRewardEstimates(fixture()).facts[1]!);
    const { clientReference, ...withoutReference } = fact;
    if (kind === "missing-reference") {
      expect(questRewardFactSchema.safeParse(withoutReference).success).toBe(false);
      return;
    }
    const reference = clientReference!;
    let candidate: unknown;
    if (kind === "wrong-reference-build")
      candidate = { ...fact, clientReference: { ...reference, targetBuild: 70450 } };
    else if (kind === "changed-base")
      candidate = { ...fact, clientReference: { ...reference, baseXp: 9999 } };
    else if (kind === "extra-multiplier") candidate = { ...fact, pageMultiplier: 2.375 };
      else if (kind === "wrong-reference-base") candidate = { ...fact, referenceBaseXp: 9999 };
    else if (kind === "full-xp") candidate = { ...fact, fullXp: 6300 };
    else if (kind === "missing-row") candidate = { ...fact, xpByLevel: fact.xpByLevel.slice(1) };
    else if (kind === "changed-row")
      candidate = {
        ...fact,
        xpByLevel: fact.xpByLevel.map((row, index) => (index ? row : { ...row, xp: 6300 })),
      };
    else if (kind === "unsorted-rows")
      candidate = { ...fact, xpByLevel: [...fact.xpByLevel].reverse() };
    else if (kind === "wrong-quest") candidate = { ...fact, questId: 2929 };
    else if (kind === "promoted-kind") candidate = { ...fact, evidenceKind: "observed-forever" };
    else candidate = { ...fact, clientReference: { ...reference, xpMultiplier: NaN } };
    expect(() => questRewardFactSchema.safeParse(candidate)).not.toThrow();
    expect(questRewardFactSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "table-build",
    "table-hash",
    "table-values",
    "duplicate-row",
    "missing-row",
    "metadata-hash",
    "cache-build",
    "duplicate-selection",
    "unselected-correction",
    "date",
  ])("rejects invalid input provenance before deriving rewards: %s", (kind) => {
    const input = fixture();
    if (kind === "table-build") input.tableSnapshots[1]!.document.build.buildNumber = 70532;
    else if (kind === "table-hash") input.tableSnapshots[1]!.questXpSha256 = "f".repeat(64);
    else if (kind === "table-values")
      input.tableSnapshots[1]!.document.questXpRows[25]!.Difficulty[6] = 9999;
    else if (kind === "duplicate-row") input.tableSnapshots[0]!.document.questXpRows[0]!.id = 2;
    else if (kind === "missing-row") input.tableSnapshots[0]!.document.questXpRows.splice(0, 1);
    else if (kind === "metadata-hash")
      input.tableSnapshots[1]!.sourceSha256 = input.tableSnapshots[0]!.sourceSha256;
    else if (kind === "cache-build") input.snapshots[0]!.document.meta.clientBuild = "1.60.1.70450";
    else if (kind === "duplicate-selection") input.questIds.push(18);
    else if (kind === "unselected-correction") input.questLevelCorrections.push(9999);
    else if (kind === "date") input.referencedAt = "not-a-date";
    expect(() => deriveClientRewardEstimates(input)).toThrow();
  });
});
