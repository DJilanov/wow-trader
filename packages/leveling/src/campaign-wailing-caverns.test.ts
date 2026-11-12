import { describe, expect, it } from "vitest";
import { offerWailingCavernsCatchUp } from "./campaign-wailing-caverns.js";
import {
  activeCampaignActions,
  campaignActionAlias,
  campaignOptionalXpReady,
  skipCampaignXpBlock,
  type CampaignAction,
  type CampaignPlan,
  type CampaignSource,
} from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { OWNER_DUNGEON_KILL_XP_REFERENCE } from "./combat-dungeon-reference.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";

const bodies: Readonly<Record<number, string>> = {
  15: ".goto 1413,63,37\n.fp Ratchet\n.target Bragok",
  16: ".goto 1413,63,37\n.accept 959\n.target Crane Operator Bigglefuzz",
  17: ".goto 1413,46,36 >>Reach the cave above the entrance",
  18: ">>Talk to Nalpak and Ebru\n.accept 1486\n.accept 1487\n.target Nalpak\n.target Ebru",
  20: ">>Kill Mad Magglish and loot the port\n.complete 959,1\n.mob Mad Magglish",
  21: ">>Zone into Wailing Caverns\n.zoneskip 1414,1",
  23: ">>Kill all types of Deviate creatures\n.complete 1487,1\n.complete 1487,2\n.complete 1487,3\n.complete 1487,4\n.isOnQuest 1487",
  25: ">>Kill Lord Cobrahn, Lord Pythas, Lord Serpentis and Lady Anacondra\n>>Escort the Disciple of Naralex and complete the ritual of awakening\n>>Kill Mutanus the Devourer and loot the Glowing Shard\n.collect 10441,1,6981,1\n.accept 6981\n.use 10441\n.skipgossip\n.target Disciple of Naralex\n.mob Mutanus the Devourer",
  27: ".subzone 392 >>Return to Ratchet",
  28: ">>Talk to Sputtervalve\n.complete 6981,1\n.skipgossip 1\n.target Sputtervalve\n.isOnQuest 6981",
  29: ".turnin 959\n.target Crane Operator Bigglefuzz",
  30: ".goto 1413,48.6,33.3 >>Climb to Falla Sagewind",
  31: ".turnin 6981\n.target Falla Sagewind\n.isQuestComplete 6981",
  32: ".goto 1413,46,36 >>Return to Ebru",
  34: ".turnin 1487\n.target Ebru\n.isQuestComplete 1487",
};

function fixture(overrides: Readonly<Record<number, string>> = {}): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
  catalog: QuestCatalog;
} {
  const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 6)!;
  const guide = parseGuideChapter(
    Array.from(
      { length: 34 },
      (_, index) =>
        `step\n.dungeon ${index === 0 ? "!WC" : "WC"}\n${index === 0 ? ">>Outside WC only" : (overrides[index + 1] ?? bodies[index + 1] ?? ">>Unselected fixture padding")}`,
    ).join("\n"),
    reference.id,
    "e".repeat(64),
    70205,
  );
  const gate: CampaignAction = {
    id: "departure",
    legId: "prepare",
    title: "Northern departure",
    instructions: [],
    questChanges: [],
    positions: [
      {
        sourceLine: 1,
        position: { zone: "1439", x: 36, y: 45, floor: null, space: "map-percent" },
      },
    ],
    source: null,
    kind: "xp-check",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: 18,
    targetStopId: "lordaeron",
  };
  const lead: CampaignAction = {
    ...gate,
    id: "lead",
    instructions: ["Outside WC only"],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[0]!.id },
    kind: "instructions",
    targetLevel: null,
    targetStopId: null,
  };
  const entry: CampaignAction = { ...gate, id: "entry", legId: "dungeon", kind: "checkpoint" };
  const titles = ["Trouble at the Docks", "Deviate Eradication", "The Glowing Shard"];
  const ids = [959, 1487, 6981];
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic WC lifecycle fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: "b".repeat(40),
    questSha256: "c".repeat(64),
    npcSha256: "d".repeat(64),
    itemSha256: "f".repeat(64),
    areaMapSha256: "0".repeat(64),
    includesAuthoredCorrections: false,
    quests: ids.map((questId, index) => ({
      questId,
      title: titles[index]!,
      minimumLevel: index ? 15 : 14,
      questLevel: [18, 21, 26][index]!,
      requiredClasses: 0,
      requiredRaces: 0,
      starts:
        questId === 6981
          ? []
          : [
              {
                npcId: index === 0 ? 3665 : 5768,
                name: index === 0 ? "Crane Operator Bigglefuzz" : "Ebru",
                friendlyToAlliance: true,
                positions: [{ zone: "1413", x: 46, y: 36 }],
              },
            ],
      ends: [
        {
          npcId: [3665, 5768, 8418][index]!,
          name: ["Crane Operator Bigglefuzz", "Ebru", "Falla Sagewind"][index]!,
          friendlyToAlliance: true,
          positions: [{ zone: "1413", x: 46, y: 36 }],
        },
      ],
      prerequisites: { allOf: [], anyOf: [] },
      exclusiveWith: [],
      category: "unsupported",
      objectives: [],
      unsupportedRequirements: ["non-outdoor-zone"],
    })),
  };
  const data: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic exact counters and reference payouts",
    provider: {
      repository: "https://example.test/provider",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256!,
      limitations: ["Synthetic fixture"],
    },
    npcs: [
      [3655, "Mad Magglish", 18],
      [3636, "Deviate Ravager", 18],
      [5755, "Deviate Viper", 20],
      [5761, "Deviate Shambler", 19],
      [5056, "Deviate Dreadfang", 21],
      [3442, "Sputtervalve", 15],
    ].map(([id, name, level]) => ({
      id: Number(id),
      name: String(name),
      minimumLevel: Number(level),
      maximumLevel: Number(level),
      rank: id === 3442 ? 0 : 1,
      zoneIds: [17],
      xpEligibility: "assumed",
    })),
    quests: [
      {
        questId: 959,
        requiredClasses: 0,
        creatureIds: [],
        itemCreatureIds: [3655],
        objectiveText: ["Retrieve the bottle of 99-Year-Old Port from Mad Magglish."],
        onlyCreatureObjectives: false,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 5334,
            itemName: "99-Year-Old Port",
            quantity: 1,
            npcIds: [3655],
            sharing: "shared-roll",
          },
        ],
      },
      {
        questId: 1487,
        requiredClasses: 0,
        creatureIds: [3636, 5755, 5761, 5056],
        itemCreatureIds: [],
        objectiveText: [
          "Kill 7 Deviate Ravagers, 7 Deviate Vipers, 7 Deviate Shamblers and 7 Deviate Dreadfangs.",
        ],
        onlyCreatureObjectives: true,
        itemObjectives: [],
      },
      {
        questId: 6981,
        requiredClasses: 0,
        creatureIds: [3442],
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        itemObjectives: [],
        startItem: { itemId: 10441, name: "Glowing Shard" },
        objectiveText: [
          "Travel to Ratchet to find someone that can tell you more about the glowing shard.",
          "",
          "Then, deliver the shard as you are directed.",
        ],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
    dungeonKillXpReference: OWNER_DUNGEON_KILL_XP_REFERENCE,
    lootDrops: [
      {
        itemId: 5334,
        npcId: 3655,
        probability: 1,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 1,
        targetBuild: 70205,
        sourceUrl: "https://example.test/port",
        sourceSha256: "1".repeat(64),
        capturedAt: "2026-11-02T00:00:00.000Z",
      },
    ],
  };
  const plan: CampaignPlan = {
    release: "wc-test",
    race: "human",
    leaderClass: "warrior",
    sharedQuestsOnly: true,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    targetBuild: 70205,
    actions: [lead, gate, entry],
    legs: [
      {
        id: "prepare",
        title: "Darkshore",
        from: 17,
        to: 18,
        kind: "preparation",
        stopId: null,
        actionIds: [lead.id, gate.id],
        questIds: [],
        unresolvedQuestIds: [],
      },
      {
        id: "dungeon",
        title: "Ruins of Lordaeron",
        from: 18,
        to: 20,
        kind: "dungeon",
        stopId: "lordaeron",
        actionIds: [entry.id],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: ids.map((questId, index) => ({
      questId,
      fullXp: [3200, 4850, 6300][index]!,
      rewardBasis: "final-reward",
      minimumLevel: index ? 15 : 14,
      questLevel: [18, 21, 26][index]!,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/reward",
      capturedAt: "2026-11-02T00:00:00.000Z",
    })),
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
    questFunding: {
      revision: "explicit-quest-funding-20261105-v81",
      providerRevision: catalog.providerRevision,
      addedQuestIds: [],
      remaining: [
        { checkpointId: gate.id, missingXpByPlayer: Array.from({ length: 5 }, () => 8665) },
      ],
      scenarios: [],
    },
  };
  return { plan, sources: [{ reference, guide }], data, catalog };
}

describe("captured Wailing Caverns catch-up", () => {
  it("connects the full three-quest lifecycle before departure without requiring hides or counting gossip as a death", () => {
    const input = fixture(),
      before = structuredClone(input);
    const plan = offerWailingCavernsCatchUp(input.plan, input.sources, input.data, input.catalog);
    expect(plan).not.toBe(input.plan);
    const leg = plan.legs.find((entry) => entry.dungeonVisitId === "wailing-caverns")!;
    expect(leg).toMatchObject({
      kind: "xp-bridge",
      questIds: [959, 1487, 6981],
      unresolvedQuestIds: [],
    });
    const actions = plan.actions.filter((action) => action.legId === leg.id);
    expect(actions.at(-1)?.id).toBe("departure");
    expect(plan.legs[0]!.actionIds).not.toContain("departure");
    expect(plan.actions.findIndex((action) => action.id === "departure")).toBeLessThan(
      plan.actions.findIndex((action) => action.id === "entry"),
    );
    expect(
      actions.flatMap((action) => action.questChanges).some((change) => change.questId === 1486),
    ).toBe(false);
    for (const id of [959, 1487, 6981])
      expect(
        actions
          .flatMap((action) => action.questChanges)
          .filter((change) => change.questId === id)
          .map((change) => change.state),
      ).toEqual(
        id === 1487
          ? [
              "accepted",
              "objectives-complete",
              "objectives-complete",
              "objectives-complete",
              "objectives-complete",
              "rewarded",
            ]
          : ["accepted", "objectives-complete", "rewarded"],
      );
    expect(
      plan.combat?.activities
        .flatMap((activity) => activity.objectives)
        .filter((objective) => objective.questId === 1487)
        .map((objective) => objective.requiredKills),
    ).toEqual([7, 7, 7, 7]);
    expect(
      plan.combat?.activities.some((activity) =>
        activity.objectives.some((objective) => objective.questId === 6981),
      ),
    ).toBe(false);
    expect(
      actions.find((action) =>
        action.questChanges.some(
          (change) => change.questId === 6981 && change.state === "accepted",
        ),
      )?.instructions,
    ).toContain(
      "Each player must loot and use their own Glowing Shard: one each, five for the party.",
    );
    expect(plan.partyPolicy?.decisions).toContainEqual(
      expect.objectContaining({
        questId: 959,
        included: true,
        lootCost: expect.objectContaining({ eligible: true, expectedKills: 1 }),
      }),
    );
    expect(offerWailingCavernsCatchUp(plan, input.sources, input.data, input.catalog)).toBe(plan);
    expect(input).toEqual(before);
    const initial = emptyPremadeProgress(),
      progress = {
        ...initial,
        difficultyPolicy: "experienced-premade" as const,
        members: initial.members.map((member) => ({
          ...member,
          level: 17,
          currentXp: 9035,
          xpNeedsUpdate: false,
          raceId: "human" as const,
        })),
      };
    const forecast = forecastCampaignXp(plan, progress);
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      expect(rows.some((row) => row.blockedAtActionId)).toBe(false);
      expect(rows.flatMap((row) => row.rewards).reduce((sum, row) => sum + (row.xp ?? 0), 0)).toBe(
        14350,
      );
    }
    expect(auditCampaignQuestLog(plan, progress).every((row) => row.withinCapacity)).toBe(true);
    for (const classSlug of ["warrior", "priest", "mage", "rogue", "warlock"] as const) {
      const artifact = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        nativeSources: input.sources,
        includeObservers: false,
        partyStarter: { race: "human", classSlug },
      });
      const text = artifact.documents.map((document) => document.content).join("\n");
      expect(text).toContain(".collect 10441,1,6981,1");
      expect(text).toContain(".use 10441");
      expect(text).toContain(".skipgossip 1");
      expect(text).toContain("Outside WC only");
      expect(text).not.toMatch(/\.(?:accept|complete|turnin) 1486\b/);
    }
  });

  it("keeps inside combat blocked for an unknown or mismatching visit and lets a ready party skip the catch-up without its XP", () => {
    const input = fixture(),
      plan = offerWailingCavernsCatchUp(
        { ...input.plan, leaderClass: "priest" },
        input.sources,
        input.data,
        input.catalog,
      );
    const base = emptyPremadeProgress(),
      progress = {
        ...base,
        difficultyPolicy: "experienced-premade" as const,
        members: base.members.map((member) => ({
          ...member,
          level: 17,
          currentXp: 9035,
          xpNeedsUpdate: false,
        })),
      };
    for (const dungeonVisitId of ["unknown-visit", "deadmines"]) {
      const wrong = {
        ...plan,
        legs: plan.legs.map((leg) => (leg.dungeonVisitId ? { ...leg, dungeonVisitId } : leg)),
      };
      const rows = forecastCampaignXp(wrong, progress).map((section) => section.members[0]!);
      expect(rows.find((row) => row.blockedAtActionId)?.blockedReason).toMatch(
        /before its dungeon visit/,
      );
      expect(rows.flatMap((row) => row.rewards)).toEqual([]);
    }
    const ready = {
      ...progress,
      members: progress.members.map((member) => ({ ...member, level: 19, currentXp: 0 })),
    };
    const skipped = skipCampaignXpBlock(plan, ready, "wailing-caverns-catchup");
    const rows = forecastCampaignXp(plan, skipped).map((section) => section.members[0]!);
    expect(
      rows
        .flatMap((row) => row.rewards)
        .filter((reward) => [959, 1487, 6981].includes(reward.questId)),
    ).toEqual([]);
    expect(rows.some((row) => row.blockedAtActionId)).toBe(false);
  });

  it("keeps the primary five-player trip required despite an older saved opt-out", () => {
    const input = fixture();
    const plan = offerWailingCavernsCatchUp(input.plan, input.sources, input.data, input.catalog);
    const leg = plan.legs.find((entry) => entry.dungeonVisitId === "wailing-caverns")!;
    expect(leg.requiredVisit).toBe(true);
    expect(leg.title).toBe("Wailing Caverns");
    const base = emptyPremadeProgress();
    const progress = { ...base, selectedExtras: { "959": false } };
    const actions = activeCampaignActions(plan, progress);
    expect(leg.actionIds.every((id) => actions.some((action) => action.id === id))).toBe(true);
    expect(campaignActionAlias(plan, progress, leg.actionIds[0]!)).toBe(leg.actionIds[0]);
    const ahead = {
      ...progress,
      members: progress.members.map((member) => ({
        ...member,
        level: 60,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const entry = plan.actions.find((action) => action.id === leg.actionIds[0])!;
    expect(campaignOptionalXpReady(plan, ahead, { ...entry, libraryBackbone: false })).toBe(false);
    expect(() => skipCampaignXpBlock(plan, progress, leg.id)).toThrow(
      "required by the five-player itinerary",
    );
  });

  it("schedules the required visit even when the earlier funding pass reports no XP gap", () => {
    const input = fixture();
    const settled: CampaignPlan = {
      ...input.plan,
      questFunding: { ...input.plan.questFunding!, remaining: [] },
    };
    const primary = offerWailingCavernsCatchUp(settled, input.sources, input.data, input.catalog);
    expect(
      primary.legs.some((leg) => leg.dungeonVisitId === "wailing-caverns" && leg.requiredVisit),
    ).toBe(true);
    const otherEdition: CampaignPlan = { ...settled, leaderClass: "priest" };
    expect(offerWailingCavernsCatchUp(otherEdition, input.sources, input.data, input.catalog)).toBe(
      otherEdition,
    );
  });

  it.each(["dungeons", "mixed"] as const)(
    "moves disabled-trip bookmarks to the next included step with the %s finish",
    (strategy) => {
      const input = fixture();
      const plan = offerWailingCavernsCatchUp(
        { ...input.plan, leaderClass: "priest" },
        input.sources,
        input.data,
        input.catalog,
      );
      const base = emptyPremadeProgress();
      const skipped = {
        ...base,
        dungeonFinish: { ...base.dungeonFinish, strategy },
        selectedExtras: { ...base.selectedExtras, "959": false },
      };
      const leg = plan.legs.find((entry) => entry.optionalQuestId === 959)!;
      for (const id of leg.actionIds) expect(campaignActionAlias(plan, skipped, id)).toBe("entry");
      expect(activeCampaignActions(plan, skipped).some((action) => action.legId === leg.id)).toBe(
        false,
      );
      const enabled = { ...skipped, selectedExtras: { ...skipped.selectedExtras, "959": true } };
      expect(activeCampaignActions(plan, enabled).some((action) => action.legId === leg.id)).toBe(
        true,
      );
      expect(campaignActionAlias(plan, enabled, leg.actionIds[0]!)).toBe(leg.actionIds[0]);
    },
  );

  it.each([
    [25, bodies[25]!.replace(".collect 10441,1,6981,1\n", "")],
    [25, bodies[25]!.replace(".collect 10441,1,6981,1", ".collect 10441,10,6981,1")],
    [25, bodies[25]!.replace(".use 10441", ".use 99999")],
    [25, bodies[25]!.replace("Lord Pythas", "a different boss")],
    [23, bodies[23]! + "\n.cast 123"],
    [28, bodies[28]!.replace(".target Sputtervalve", ".target Another NPC")],
    [21, bodies[21]!.replace("1414,1", "1456,1")],
  ] as const)("declines an unsupported captured program at step %s", (step, body) => {
    const input = fixture({ [step]: body });
    expect(offerWailingCavernsCatchUp(input.plan, input.sources, input.data, input.catalog)).toBe(
      input.plan,
    );
  });

  it("approaches from Redridge through the confirmed Stormwind-Auberdine ship instead of low-level Stranglethorn", () => {
    const input = fixture();
    const previous = input.plan.actions[0]!;
    const plan = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.id === previous.id
          ? { ...action, location: { zone: "1433", visitOverride: true as const } }
          : action,
      ),
    };
    const result = offerWailingCavernsCatchUp(plan, input.sources, input.data, input.catalog);
    expect(result).not.toBe(plan);
    const approach = result.actions.find(
      (action) => action.id === "wailing-caverns-catchup-approach",
    )!;
    expect(approach.instructions.join(" ")).toMatch(/Stormwind Harbor.*ship to Darkshore/);
    expect(approach.instructions.join(" ")).not.toMatch(/Stranglethorn|Booty Bay|Duskwood/);
  });

  it("keeps source XP gates, provider identity, actual quest access and missing quantities in force", () => {
    const input = fixture();
    const sources = input.sources.map((source) => ({
      ...source,
      reference: { ...source.reference, xpRates: [{ value: ">2", condition: "" }] },
    }));
    expect(offerWailingCavernsCatchUp(input.plan, sources, input.data, input.catalog)).toBe(
      input.plan,
    );
    expect(
      offerWailingCavernsCatchUp(
        input.plan,
        input.sources,
        { ...input.data, targetBuild: 70450 },
        input.catalog,
      ),
    ).toBe(input.plan);
    for (const changed of [
      { ...input.catalog, providerRevision: "9".repeat(40) },
      {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) =>
          quest.questId === 1487 ? { ...quest, requiredClasses: 4 } : quest,
        ),
      },
      {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) =>
          quest.questId === 6981 ? { ...quest, requiredRaces: 12 } : quest,
        ),
      },
    ])
      expect(offerWailingCavernsCatchUp(input.plan, input.sources, input.data, changed)).toBe(
        input.plan,
      );
    const unknown = {
      ...input.data,
      quests: input.data.quests.map((quest) =>
        quest.questId === 959
          ? {
              ...quest,
              itemObjectives: quest.itemObjectives!.map((item) => ({ ...item, quantity: null })),
            }
          : quest,
      ),
    };
    expect(offerWailingCavernsCatchUp(input.plan, input.sources, unknown, input.catalog)).toBe(
      input.plan,
    );
    const ready = {
      ...input.plan,
      leaderClass: "priest" as const,
      questFunding: { ...input.plan.questFunding!, remaining: [] },
    };
    expect(offerWailingCavernsCatchUp(ready, input.sources, input.data, input.catalog)).toBe(ready);
  });
});
