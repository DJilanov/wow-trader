import { describe, expect, it } from "vitest";
import { enrichCombatClassicLoot } from "./combat-classic-loot.js";
import { classicLootReferenceSchema, type ClassicLootReference } from "./loot-classic-source.js";
import { combatDatasetSchema, type CombatDataset, type CombatObjective } from "./combat-model.js";
import { questItemObjectiveSchema, questLootDropSchema } from "./quest-loot.js";
import { resolveCombatQuota } from "./combat-loot.js";
import { reuseCombatLootReferences } from "./combat-reference-enrichment.js";
import { prepareCampaignLootReferences } from "./loot-coverage.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { estimateCreatureKills } from "./combat-xp.js";

const checksum = "a".repeat(64);
function fixture(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/provider",
      revision: "b".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: checksum,
      questSha256: checksum,
      itemSha256: checksum,
      limitations: ["Synthetic fixture"],
    },
    npcs: [
      {
        id: 1,
        name: "Forest Wolf",
        minimumLevel: 5,
        maximumLevel: 5,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 2,
        creatureIds: [],
        itemCreatureIds: [1],
        objectiveText: [],
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 3,
            itemName: "Wolf Tooth",
            quantity: 2,
            npcIds: [1],
            sharing: "unknown",
          },
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
    lootDrops: [
      {
        itemId: 3,
        npcId: 1,
        probability: 0.5,
        probabilityBasis: "sample-ratio",
        minimumQuantity: null,
        maximumQuantity: null,
        sampleSize: 100,
        targetBuild: 70205,
        sourceBuild: null,
        sourceUrl: "https://www.wowhead.com/forever/item=3",
        sourceSha256: checksum,
        capturedAt: "2026-10-31T00:00:00.000Z",
      },
    ],
  });
}
function reference(): ClassicLootReference {
  return classicLootReferenceSchema.parse({
    schema: "classic-loot-reference.v1",
    targetBuild: 70205,
    targetCombatSha256: checksum,
    source: {
      kind: "classic-1.12-reference",
      repository: "https://github.com/cmangos/classic-db",
      revision: "c".repeat(40),
      file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
      sha256: "d".repeat(64),
      sourceBuild: 5875,
      referencedAt: "2026-10-31T00:00:00.000Z",
    },
    items: [{ itemId: 3, name: "Wolf Tooth", flags: 0 }],
    drops: [
      {
        itemId: 3,
        itemName: "Wolf Tooth",
        npcId: 1,
        npcName: "Forest Wolf",
        lootEntry: 400,
        minimumQuantity: 1,
        maximumQuantity: 1,
        probability: 0.8,
        questOnly: true,
      },
    ],
  });
}
function quota(data: CombatDataset): ReturnType<typeof resolveCombatQuota> {
  const item = data.quests[0]!.itemObjectives![0]!;
  const objective: CombatObjective = {
    questId: 2,
    objectiveIndex: 1,
    npcIds: [1],
    requiredKills: null,
    credit: "personal-loot",
    source: "Synthetic source step",
    reason: null,
    loot: {
      itemId: 3,
      quantity: 2,
      sharing: item.sharing,
      ...(item.sharingReference ? { sharingReference: item.sharingReference } : {}),
    },
  };
  return resolveCombatQuota(
    objective,
    {
      revision: "fixture",
      sourceRevision: "fixture",
      targetBuild: 70205,
      npcs: data.npcs,
      activities: [],
      notice: null,
      lootDrops: data.lootDrops ?? [],
      ...(data.historicalLoot ? { historicalLoot: data.historicalLoot } : {}),
    },
    5,
    "expected",
  );
}

describe("explicit historical loot field references", () => {
  it.each([true, false])(
    "uses reference-only drops in the main ledger, without duplicate rewards (personal=%s)",
    (leaderOnly) => {
      const data = enrichCombatClassicLoot(
        { ...fixture(), lootDrops: [] },
        reference(),
        checksum,
      ).data;
      const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
      const guide = parseGuideChapter(
        "step\n.accept 2\nstep\n.complete 2,1 >>Collect Wolf Tooth (2)\n.mob Forest Wolf\nstep\n.turnin 2\nstep\n.turnin 2",
        chapter.id,
        checksum,
        70205,
      );
      const source: CampaignSource = { reference: chapter, guide };
      const actions = guide.steps.map((step, index) => ({
        id: `historical-${step.id}`,
        legId: "starter",
        title: "Tooth task",
        instructions: [],
        positions: [],
        source: campaignActionSource(guide, step, step.directives),
        kind: "quests" as const,
        leaderOnly,
        raidOnly: false,
        targetLevel: null,
        targetStopId: null,
        questChanges: [
          {
            questId: 2,
            title: "Wolf Teeth",
            state:
              index === 0
                ? ("accepted" as const)
                : index === 1
                  ? ("objectives-complete" as const)
                  : ("rewarded" as const),
            objectiveIndex: index === 1 ? 1 : null,
          },
        ],
      }));
      const plan: CampaignPlan = {
        release: "historical-ledger-fixture",
        race: "human",
        leaderClass: "warrior",
        targetBuild: 70205,
        actions,
        legs: [
          {
            id: "starter",
            title: "Starter",
            kind: "starter",
            from: 1,
            to: 5,
            stopId: null,
            actionIds: actions.map((action) => action.id),
            questIds: [2],
            unresolvedQuestIds: [],
          },
        ],
        rewardFacts: [
          {
            questId: 2,
            fullXp: 100,
            questLevel: 5,
            minimumLevel: 1,
            xpByLevel: [],
            status: "available",
            evidenceKind: "published-forever",
            sourceUrl: "https://example.test/quest=2",
            capturedAt: "2026-10-31T00:00:00.000Z",
          },
        ],
      };
      const attached = attachCampaignCombat(plan, [source], data, checksum);
      expect(attached.combat?.historicalLoot).toEqual(data.historicalLoot);
      expect(attached.combat?.lootDrops).toEqual([]);
      const base = emptyPremadeProgress();
      const progress = {
        ...base,
        members: base.members.map((member) => ({
          ...member,
          level: 5,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      };
      const forecast = forecastCampaignXp(attached, progress);
      const kills = leaderOnly ? 3 : 13;
      const expected = estimateCreatureKills({
        npc: data.npcs[0]!,
        kills,
        position: { level: 5, currentXp: 0 },
        partySize: leaderOnly ? 1 : 5,
        environment: "outdoor",
        build: 70205,
      });
      for (const player of leaderOnly ? [0] : [0, 1, 2, 3, 4]) {
        const member = forecast[0]!.members[player]!;
        expect(member.blockedAtActionId).toBeNull();
        expect(member.combatXp).toBe(expected.xp);
        expect(member.combatRows).toHaveLength(1);
        expect(member.combatRows[0]).toMatchObject({ kills, basis: "reference-estimate" });
        expect(member.combatRows[0]!.source).toContain("not a measured Forever rate");
        expect(member.referenceQuestXp).toBe(100);
        expect(member.rewards.filter((reward) => (reward.xp ?? 0) > 0)).toHaveLength(1);
        expect(member.questLog.used).toBe(0);
      }
    },
  );

  it("models an uncaptured pair as historical evidence without fabricating a capture", () => {
    const data = { ...fixture(), lootDrops: [] };
    const before = JSON.stringify(data);
    const result = enrichCombatClassicLoot(data, reference(), checksum);
    expect(result.missingDropReferencesAdded).toBe(1);
    expect(result.data.lootDrops).toEqual([]);
    expect(result.data.historicalLoot?.source.sourceBuild).toBe(5875);
    const estimate = quota(result.data);
    expect(estimate).toMatchObject({ kills: 13, lootEstimate: { expectedKills: 12.5 } });
    expect(estimate.source).toContain("not a measured Forever rate");
    expect(estimate.collection?.drop).not.toHaveProperty("capturedAt");
    expect(estimate.collection?.drop).not.toHaveProperty("sourceBuild");
    expect(JSON.stringify(data)).toBe(before);
    const second = enrichCombatClassicLoot(result.data, reference(), checksum);
    expect(second.missingDropReferencesAdded).toBe(0);
    expect(second.data).toEqual(result.data);
  });

  it("preserves a captured reported rate and a captured foreign-build hold over historical fallback", () => {
    const historical = enrichCombatClassicLoot(
      { ...fixture(), lootDrops: [] },
      reference(),
      checksum,
    ).data;
    const captured = fixture().lootDrops![0]!;
    const data = {
      ...historical,
      lootDrops: [
        {
          ...captured,
          probability: 0.2,
          probabilityBasis: "reported" as const,
          minimumQuantity: 1,
          maximumQuantity: 1,
        },
      ],
    };
    expect(quota(data).kills).toBe(50);
    expect(
      quota({ ...data, lootDrops: [{ ...data.lootDrops[0]!, sourceBuild: 70450 }] }),
    ).toMatchObject({
      kills: null,
      reason: "The drop reference was captured for a different client build.",
    });
    expect(
      quota({ ...data, lootDrops: [data.lootDrops[0]!, data.lootDrops[0]!] }).kills,
    ).toBeNull();
  });

  it("keeps an unresolved captured sample unresolved instead of silently replacing it", () => {
    const historical = enrichCombatClassicLoot(
      { ...fixture(), lootDrops: [] },
      reference(),
      checksum,
    ).data;
    const captured = fixture().lootDrops![0]!;
    expect(
      quota({
        ...historical,
        lootDrops: [{ ...captured, minimumQuantity: 1, maximumQuantity: 1 }],
      }).kills,
    ).toBeNull();
  });

  it("does not treat a foreign-target capture as an absent capture", () => {
    const historical = enrichCombatClassicLoot(
      { ...fixture(), lootDrops: [] },
      reference(),
      checksum,
    ).data;
    const foreign = { ...fixture().lootDrops![0]!, targetBuild: 70450 };
    expect(quota({ ...historical, lootDrops: [foreign] })).toMatchObject({
      kills: null,
      reason: "A unique compatible drop probability is missing.",
    });
  });

  it("does not add missing pairs for provided items or unknown corrected creature relations", () => {
    for (const change of [{ provided: true }, { npcIds: [] }]) {
      const data = { ...fixture(), lootDrops: [] };
      Object.assign(data.quests[0]!.itemObjectives![0]!, change);
      const result = enrichCombatClassicLoot(data, reference(), checksum);
      expect(result.missingDropReferencesAdded).toBe(0);
      expect(result.data.historicalLoot).toBeUndefined();
    }
  });

  it("validates reference-only evidence against corrected names, relations and target build", () => {
    const data = enrichCombatClassicLoot(
      { ...fixture(), lootDrops: [] },
      reference(),
      checksum,
    ).data;
    const otherBuild = { ...data.historicalLoot!, targetBuild: 70450 };
    expect(() => combatDatasetSchema.parse({ ...data, historicalLoot: otherBuild })).toThrow(
      /Historical loot/,
    );
    expect(() =>
      combatDatasetSchema.parse({ ...data, npcs: [{ ...data.npcs[0]!, name: "Other Wolf" }] }),
    ).toThrow(/Historical loot/);
    const quests = [
      {
        ...data.quests[0]!,
        itemObjectives: [{ ...data.quests[0]!.itemObjectives![0]!, npcIds: [] }],
      },
    ];
    expect(() => combatDatasetSchema.parse({ ...data, quests })).toThrow(/Historical loot/);
  });

  it("does not combine different immutable historical sources", () => {
    const data = enrichCombatClassicLoot(
      { ...fixture(), lootDrops: [] },
      reference(),
      checksum,
    ).data;
    const changed = reference();
    changed.source.sha256 = "e".repeat(64);
    expect(() => enrichCombatClassicLoot(data, changed, checksum)).toThrow(/sources differ/);
  });

  it("preserves sharing provenance across provider upgrades and invalidates it after an explicit override", () => {
    const previous = enrichCombatClassicLoot(fixture(), reference(), checksum).data;
    const reused = reuseCombatLootReferences(fixture(), previous, checksum);
    expect(reused.quests[0]!.itemObjectives![0]!.sharingReference).toEqual(
      previous.quests[0]!.itemObjectives![0]!.sharingReference,
    );
    const changed = prepareCampaignLootReferences(
      previous,
      new Set([2]),
      [],
      [{ questId: 2, itemId: 3, sharing: "shared-roll" }],
    );
    expect(changed.data.quests[0]!.itemObjectives![0]).toMatchObject({ sharing: "shared-roll" });
    expect(changed.data.quests[0]!.itemObjectives![0]!.sharingReference).toBeUndefined();
  });
  it("supplies fixed-one and pooled assumptions without changing the captured probability or source", () => {
    const data = fixture(),
      input = reference(),
      before = JSON.stringify({ data, input });
    expect(quota(data).kills).toBeNull();
    const result = enrichCombatClassicLoot(data, input, checksum);
    expect(result).toMatchObject({
      stackReferencesAdded: 1,
      sharingReferencesAdded: 1,
      probabilityReferencesAdded: 1,
    });
    const { stackReference, probabilityReference, minimumQuantity, maximumQuantity, ...retained } =
      result.data.lootDrops![0]!;
    const {
      minimumQuantity: oldMinimum,
      maximumQuantity: oldMaximum,
      ...original
    } = data.lootDrops![0]!;
    expect([oldMinimum, oldMaximum]).toEqual([null, null]);
    expect(retained).toEqual(original);
    expect([minimumQuantity, maximumQuantity]).toEqual([1, 1]);
    expect(stackReference).toMatchObject({
      sourceBuild: 5875,
      itemId: 3,
      npcId: 1,
      lootEntry: 400,
    });
    expect(probabilityReference).toMatchObject({
      probability: 0.8,
      questOnly: true,
      rateMultiplier: 1,
      sourceBuild: 5875,
    });
    expect(quota(result.data)).toMatchObject({ kills: 13, lootEstimate: { expectedKills: 12.5 } });
    expect(quota(result.data).source).toContain("Historical Classic stack assumption:");
    expect(quota(result.data).source).toContain("Historical Classic sharing assumption:");
    expect(quota(result.data).source).toContain("Historical Classic quest-roll probability 0.8");
    expect(JSON.stringify({ data, input })).toBe(before);
  });
  it("keeps explicit current sharing and drop quantities", () => {
    const data = fixture();
    data.quests[0]!.itemObjectives![0]!.sharing = "shared-roll";
    data.lootDrops![0]!.minimumQuantity = 2;
    data.lootDrops![0]!.maximumQuantity = 2;
    const result = enrichCombatClassicLoot(data, reference(), checksum);
    expect(result).toMatchObject({ stackReferencesAdded: 0, sharingReferencesAdded: 0 });
    expect(result.data.quests).toEqual(data.quests);
    expect(result.data.lootDrops).toEqual(data.lootDrops);
  });
  it("does not relax the existing foreign-build guard", () => {
    const data = fixture();
    data.lootDrops![0]!.sourceBuild = 70450;
    expect(quota(enrichCombatClassicLoot(data, reference(), checksum).data)).toMatchObject({
      kills: null,
      reason: "The drop reference was captured for a different client build.",
    });
  });
  it("requires the exact input checksum and target build", () => {
    expect(() => enrichCombatClassicLoot(fixture(), reference(), "f".repeat(64))).toThrow(
      "different combat input",
    );
    expect(() =>
      enrichCombatClassicLoot({ ...fixture(), targetBuild: 70450 }, reference(), checksum),
    ).toThrow("different combat input");
    const otherClient = reference();
    otherClient.source.file = "Full_DB/ClassicDB_1_12_3_z2815.sql.gz";
    expect(() => classicLootReferenceSchema.parse(otherClient)).toThrow();
  });
  it("does not join renamed creatures or items by numeric ID alone", () => {
    const npc = fixture();
    npc.npcs[0]!.name = "Different Wolf";
    expect(enrichCombatClassicLoot(npc, reference(), checksum).stackReferencesAdded).toBe(0);
    const item = fixture();
    item.quests[0]!.itemObjectives![0]!.itemName = "Different Tooth";
    expect(enrichCombatClassicLoot(item, reference(), checksum)).toMatchObject({
      stackReferencesAdded: 0,
      sharingReferencesAdded: 0,
    });
  });
  it("binds reference metadata to its actual item, creature, quantity and sharing rule", () => {
    const data = enrichCombatClassicLoot(fixture(), reference(), checksum).data;
    expect(() => questLootDropSchema.parse({ ...data.lootDrops![0], npcId: 9 })).toThrow(
      /Historical (?:stack|probability) reference differs/,
    );
    expect(() => questLootDropSchema.parse({ ...data.lootDrops![0], maximumQuantity: 2 })).toThrow(
      /Historical (?:stack|probability) reference differs/,
    );
    expect(() =>
      questItemObjectiveSchema.parse({
        ...data.quests[0]!.itemObjectives![0],
        sharing: "shared-roll",
      }),
    ).toThrow("Historical sharing reference differs");
  });
  it("preserves variable-stack evidence and rejects ambiguous reference identities", () => {
    const data = fixture();
    data.lootDrops![0]!.quantityDistribution = [
      { quantity: 1, percent: 50 },
      { quantity: 2, percent: 50 },
    ];
    expect(enrichCombatClassicLoot(data, reference(), checksum).stackReferencesAdded).toBe(0);
    const input = reference();
    input.drops.push({ ...input.drops[0]! });
    expect(() => enrichCombatClassicLoot(fixture(), input, checksum)).toThrow(
      "Duplicate historical drop",
    );
  });
  it("does not treat an older stack-only reference as a quest-eligible sample", () => {
    const legacy = reference();
    delete legacy.drops[0]!.probability;
    delete legacy.drops[0]!.questOnly;
    const result = enrichCombatClassicLoot(fixture(), legacy, checksum);
    expect(result.probabilityReferencesAdded).toBe(0);
    expect(quota(result.data)).toMatchObject({
      kills: null,
      reason: expect.stringContaining("quest eligibility"),
    });
  });
  it("requires requalification after a provider creature or item identity changes", () => {
    const previous = enrichCombatClassicLoot(fixture(), reference(), checksum).data;
    for (const kind of ["npc", "item"] as const) {
      const current = fixture();
      current.lootDrops = [];
      if (kind === "npc") current.npcs[0]!.name = "Different Wolf";
      else current.quests[0]!.itemObjectives![0]!.itemName = "Different Tooth";
      const result = reuseCombatLootReferences(current, previous, checksum);
      expect(result.lootDrops![0]!.probabilityReference).toBeUndefined();
      expect(result.lootDrops![0]!.probability).toBe(previous.lootDrops![0]!.probability);
      expect(quota(result)).toMatchObject({
        kills: null,
        reason: expect.stringContaining("quest eligibility"),
      });
    }
  });
});
