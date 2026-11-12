import { describe, expect, it } from "vitest";
import { connectEarlyNorthernFollowups } from "./campaign-northern-followups.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignTravelActions } from "./campaign-flow.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function fixture(withLetter = false): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
  catalog: QuestCatalog;
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
  const guide = parseGuideChapter(
    [
      "step\n.goto 1439,39,43\n.accept 965\n.target Sentinel Elissa Starbreeze",
      "step\n.goto 1439,55,25\n.turnin 965\n.accept 966\n.target Balthule Shadowstrike",
      "step\n.goto 1439,55,27\n.complete 966,1 >>Worn Parchment (4)\n>>Kill Dark Strand Fanatics and collect Worn Parchment\n.mob Dark Strand Fanatic",
      "step\n.goto 1439,55,25\n.turnin 966\n.accept 967\n.target Balthule Shadowstrike",
      "step\n.goto 1440,26,38\n.turnin 967\n.target Delgren the Purifier",
    ].join("\n"),
    reference.id,
    "a".repeat(64),
    70205,
  );
  const sources = [{ reference, guide }];
  const giver = (
    npcId: number,
    name: string,
    zone: string,
  ): QuestCatalogEntry["starts"][number] => ({
    npcId,
    name,
    friendlyToAlliance: true,
    positions: [{ zone, x: 55, y: 25 }],
  });
  const balthule = giver(3661, "Balthule Shadowstrike", "1439");
  const quests: QuestCatalogEntry[] = [965, 966, 967].map((questId) => ({
    questId,
    title: "The Tower of Althalaxx",
    minimumLevel: 13,
    questLevel: 18,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: questId === 965 ? [giver(3657, "Sentinel Elissa Starbreeze", "1439")] : [balthule],
    ends: questId === 967 ? [giver(3663, "Delgren the Purifier", "1440")] : [balthule],
    prerequisites: { allOf: [], anyOf: questId === 965 ? [] : [questId - 1] },
    exclusiveWith: [],
    ...(questId === 967 && withLetter
      ? { providedItem: { itemId: 5354, name: "Letter to Delgren" } }
      : {}),
    category: questId === 966 ? "unsupported" : "delivery",
    objectives: [],
    unsupportedRequirements:
      questId === 966
        ? []
        : [
            "unresolved-objective-text",
            ...(questId === 967 && withLetter ? ["provided-item-interaction"] : []),
          ],
  }));
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic northern follow-up fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: "b".repeat(40),
      npcSha256: "c".repeat(64),
      questSha256: "d".repeat(64),
      itemSha256: "e".repeat(64),
      layer: "forever-static-with-authored",
      limitations: ["Synthetic source binding; no observed payout"],
    },
    npcs: [
      {
        id: 2336,
        name: "Dark Strand Fanatic",
        minimumLevel: 17,
        maximumLevel: 17,
        rank: 0,
        zoneIds: [148],
        xpEligibility: "assumed",
      },
    ],
    quests: quests.map((quest) => ({
      questId: quest.questId,
      requiredClasses: 0,
      creatureIds: [],
      itemCreatureIds: quest.questId === 966 ? [2336] : [],
      onlyCreatureObjectives: false,
      prerequisites: quest.prerequisites,
      objectiveText: [
        quest.questId === 965
          ? "Find Balthule Shadowstrike near the Tower of Althalaxx in Darkshore."
          : quest.questId === 966
            ? "Bring 4 Worn Parchment to Balthule Shadowstrike."
            : withLetter
              ? "Deliver Balthule's letter to Delgren the Purifier in Ashenvale Forest."
              : "Find Delgren the Purifier in Ashenvale.",
      ],
      itemObjectives:
        quest.questId === 966
          ? [
              {
                objectiveIndex: 1,
                itemId: 5348,
                itemName: "Worn Parchment",
                quantity: 4,
                npcIds: [2336],
                sharing: "pooled",
              },
            ]
          : [],
    })),
    lootDrops: [
      {
        itemId: 5348,
        npcId: 2336,
        probability: 1,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/drop",
        sourceSha256: "0".repeat(64),
        capturedAt: "2026-11-03T00:00:00.000Z",
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "0".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: "0".repeat(64),
          sourceBuild: 5875,
          referencedAt: "2026-11-03T00:00:00.000Z",
          itemId: 5348,
          npcId: 2336,
          lootEntry: 2336,
          probability: 1,
          questOnly: true,
          rateMultiplier: 1,
        },
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic follow-up fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: data.provider.revision,
    questSha256: data.provider.questSha256,
    npcSha256: data.provider.npcSha256,
    itemSha256: data.provider.itemSha256,
    areaMapSha256: "f".repeat(64),
    includesAuthoredCorrections: false,
    quests,
  };
  let plan: CampaignPlan = {
    release: "northern-followups-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [965, 966, 967],
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
    rewardFacts: [680, 1350, 1000].map((fullXp, index) => ({
      questId: 965 + index,
      fullXp,
      minimumLevel: 13,
      questLevel: 18,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-03T00:00:00.000Z",
    })),
    actions: [],
    legs: [],
  };
  const library = buildCampaignQuestLibrary(
    sources,
    campaignPlanSourceProfile(plan),
    [],
    new Set(),
    data.quests,
    campaignLibraryOptions(plan),
  );
  const owned = library.flatMap((entry) =>
    entry.actions.map((action) => ({
      ...action,
      id: `owned-${entry.questId}-${action.questChanges[0]!.state}`,
      fundingCheckpointId: "later-gate",
      legId: entry.questId === 965 ? "northern-approach" : "later-ashenvale",
    })),
  );
  const instruction = (id: string, legId: string, zone: string): CampaignAction => ({
    id,
    legId,
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    location: { zone },
  });
  const approach = {
    ...instruction("wc-approach", "wc", "1413"),
    instructions: [
      "Keep the group together.",
      ...campaignGroundJourney("1439", "1413")!.map((leg) => leg.instruction),
    ],
  };
  const actions = [
    ...owned.filter((action) => action.legId === "northern-approach"),
    instruction("north-finish", "northern-approach", "1439"),
    approach,
    instruction("eastern-first", "east", "1453"),
    ...owned.filter((action) => action.legId === "later-ashenvale"),
  ];
  plan = {
    ...plan,
    actions,
    legs: ["northern-approach", "wc", "east", "later-ashenvale"].map((id) => ({
      id,
      title: id,
      kind: "preparation",
      from: 16,
      to: 25,
      stopId: null,
      ...(id === "wc" ? { optionalQuestId: 959, dungeonVisitId: "wailing-caverns" } : {}),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      unresolvedQuestIds: [],
    })),
  };
  return { plan, sources, data, catalog };
}

describe("complete northern follow-up sequence", () => {
  it("moves the original full collection and handoff once, preserving all captured work", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = connectEarlyNorthernFollowups(
      input.plan,
      input.sources,
      input.data,
      input.catalog,
    );
    expect(result).not.toBe(input.plan);
    expect(result.actions.map((action) => action.id)).toEqual([
      "owned-965-accepted",
      "owned-965-rewarded",
      "owned-966-accepted",
      "owned-966-objectives-complete",
      "owned-966-rewarded",
      "owned-967-accepted",
      "north-finish",
      "owned-967-rewarded",
      "wc-approach",
      "eastern-first",
    ]);
    for (const prior of input.plan.actions) {
      const retained = result.actions.find((action) => action.id === prior.id)!;
      expect([retained.source, retained.questChanges, retained.positions]).toEqual([
        prior.source,
        prior.questChanges,
        prior.positions,
      ]);
    }
    for (const leg of result.legs)
      expect(leg.actionIds).toEqual(
        result.actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      );
    expect(result.legs.find((leg) => leg.id === "later-ashenvale")!.questIds).toEqual([]);
    expect(connectEarlyNorthernFollowups(result, input.sources, input.data, input.catalog)).toBe(
      result,
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it("retains a source-provided letter when moving its acceptance and recipient visit", () => {
    const input = fixture(true);
    expect(input.catalog.quests.find((quest) => quest.questId === 967)!.providedItem?.itemId).toBe(
      5354,
    );
    const result = connectEarlyNorthernFollowups(
      input.plan,
      input.sources,
      input.data,
      input.catalog,
    );
    expect(result).not.toBe(input.plan);
    expect(
      result.actions.filter((action) =>
        action.questChanges.some((change) => change.questId === 967),
      ),
    ).toHaveLength(2);
  });

  it("keeps real road directions with WC and the ship return when WC is omitted", () => {
    const input = fixture(),
      result = connectEarlyNorthernFollowups(input.plan, input.sources, input.data, input.catalog);
    const enabled = campaignTravelActions(result, result.actions),
      approach = enabled.find((action) => action.id === "wc-approach")!;
    expect(approach.instructions).toContain("Keep the group together.");
    expect(approach.instructions).not.toContain(
      campaignGroundJourney("1439", "1440")![0]!.instruction,
    );
    const road = campaignGroundJourney("1440", "1413")!.map((leg) => leg.instruction);
    expect(approach.travelInstructions!.slice(-road.length)).toEqual(road);
    const skipped = campaignTravelActions(
      result,
      result.actions.filter((action) => action.legId !== "wc"),
    );
    expect(
      skipped.find((action) => action.id === "eastern-first")!.travelInstructions!.join(" "),
    ).toContain("Stormwind Harbor ship");
    expect(
      skipped.find((action) => action.id === "eastern-first")!.travelInstructions!.join(" "),
    ).not.toContain("Ratchet");
  });

  it("retains all five players' loot work and rewards each quest only once", () => {
    const input = fixture(),
      result = connectEarlyNorthernFollowups(input.plan, input.sources, input.data, input.catalog);
    const raw = emptyPremadeProgress(),
      progress = {
        ...raw,
        members: raw.members.map((member) => ({
          ...member,
          level: 16,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      };
    const loot = result
      .combat!.activities.flatMap((activity) => activity.objectives)
      .find((objective) => objective.questId === 966)!.loot!;
    expect(loot.quantity).toBe(4);
    expect(loot.sharing).toBe("pooled");
    const forecast = forecastCampaignXp(result, progress);
    for (let index = 0; index < 5; index++) {
      const rows = forecast.map((section) => section.members[index]!);
      expect(rows.flatMap((row) => row.rewards).map((reward) => reward.questId)).toEqual([
        965, 966, 967,
      ]);
      expect(rows.flatMap((row) => row.combatRows).reduce((sum, row) => sum + row.kills, 0)).toBe(
        20,
      );
    }
    const compiled = compileCampaignAddon(result, result.actions, {
      version: "0.1.0-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    const text = compiled.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    for (const id of [965, 966, 967])
      expect([...text.matchAll(new RegExp("\\.turnin " + id + "\\b", "g"))]).toHaveLength(1);
    expect(text).toContain(".complete 966,1");
  });

  it("delivers on the first road crossing when other northern work already reaches Ratchet", () => {
    const input = fixture();
    const prototype = input.plan.actions.find((action) => action.id === "north-finish")!;
    const astranaar = { ...prototype, id: "astranaar", location: { zone: "1440" } };
    const ratchet = { ...prototype, id: "ratchet", location: { zone: "1413" } };
    const plan = {
      ...input.plan,
      actions: input.plan.actions.flatMap((action) =>
        action.id !== "wc-approach"
          ? [action]
          : [astranaar, ratchet, { ...action, instructions: ["Keep the group together."] }],
      ),
    };
    const result = connectEarlyNorthernFollowups(plan, input.sources, input.data, input.catalog);
    expect(result).not.toBe(plan);
    const at = (id: string): number => result.actions.findIndex((action) => action.id === id);
    expect(at("owned-967-rewarded")).toBeLessThan(at("astranaar"));
    expect(at("astranaar")).toBeLessThan(at("ratchet"));
    expect(result.actions.find((action) => action.id === "wc-approach")!.instructions).toEqual([
      "Keep the group together.",
    ]);
  });

  it.each([
    "incomplete",
    "coordinate",
    "parent",
    "class",
    "rep",
    "recipient",
    "directions",
    "build",
  ])("refuses unsupported %s inputs atomically", (kind) => {
    const input = fixture();
    let { plan, data, catalog } = input;
    if (kind === "incomplete")
      plan = {
        ...plan,
        actions: plan.actions.filter((action) => action.id !== "owned-966-objectives-complete"),
      };
    if (kind === "coordinate")
      plan = {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id !== "owned-966-accepted"
            ? action
            : {
                ...action,
                positions: action.positions.map((entry) => ({
                  ...entry,
                  position: { ...entry.position, x: 99 },
                })),
              },
        ),
      };
    if (kind === "directions")
      plan = {
        ...plan,
        actions: plan.actions.map((action) =>
          action.id !== "wc-approach" ? action : { ...action, location: { zone: "1433" } },
        ),
      };
    if (kind === "build") data = { ...data, targetBuild: 70450 };
    if (["parent", "class", "rep"].includes(kind))
      catalog = {
        ...catalog,
        quests: catalog.quests.map((quest) =>
          quest.questId !== 966
            ? quest
            : {
                ...quest,
                ...(kind === "parent" ? { prerequisites: { allOf: [999], anyOf: [] } } : {}),
                ...(kind === "class" ? { requiredClasses: 16 } : {}),
                ...(kind === "rep" ? { unsupportedRequirements: ["requiredMinRep"] } : {}),
              },
        ),
      };
    if (kind === "recipient")
      catalog = {
        ...catalog,
        quests: catalog.quests.map((quest) =>
          quest.questId !== 967
            ? quest
            : {
                ...quest,
                ends: quest.ends.map((npc) => ({ ...npc, name: "Another recipient" })),
              },
        ),
      };
    const before = JSON.stringify({ plan, data, catalog });
    expect(connectEarlyNorthernFollowups(plan, input.sources, data, catalog)).toBe(plan);
    expect(JSON.stringify({ plan, data, catalog })).toBe(before);
  });
});
