import { describe, expect, it } from "vitest";
import snapshots from "./fixtures/charred-vale-client-counters-70205-70450.json" with { type: "json" };
import darkIron from "./fixtures/dark-iron-client-counters-70205-70450.json" with { type: "json" };
import { reconcileClientKillCounters } from "./combat-client-counters.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CampaignPlan } from "./campaign.js";

function fixture(): {
  combat: CombatDataset;
  catalog: QuestCatalog;
  snapshots: typeof snapshots;
  questIds: number[];
} {
  const objectives = [4022, 4025, 4024, 4023].map((npcId, index) => ({
    index: index + 1,
    npcId,
    count: null,
    positions: [],
  }));
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic provider fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic provider data, not a current-server observation."],
    },
    npcs: objectives.map((objective, index) => ({
      id: objective.npcId,
      name: ["Bloodfury Harpy", "Bloodfury Ambusher", "Bloodfury Slayer", "Bloodfury Roguefeather"][
        index
      ]!,
      minimumLevel: 23,
      maximumLevel: 26,
      rank: 0,
      zoneIds: [406],
      xpEligibility: "assumed",
    })),
    quests: [
      {
        questId: 1057,
        creatureIds: objectives.map((row) => row.npcId),
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        onlyInteractionObjectives: false,
        requiredClasses: 0,
        prerequisites: { allOf: [], anyOf: [] },
        itemObjectives: [],
        objectiveText: [
          "Keeper Albagorm on Stonetalon Peak wants you to slay 7 Bloodfury Harpies, 7 Bloodfury Ambushers, 7 Bloodfury Slayers and 7 Bloodfury Roguefeathers.",
        ],
        killQuotaConflicts: [1, 2, 3, 4],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic catalog fixture",
    providerRevision: "a".repeat(40),
    npcSha256: "b".repeat(64),
    questSha256: "c".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: true,
    quests: [
      {
        questId: 1057,
        title: "Reclaiming the Charred Vale",
        minimumLevel: 20,
        questLevel: 27,
        requiredClasses: 0,
        requiredRaces: 1,
        starts: [],
        ends: [],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "shared-kills",
        objectives,
        unsupportedRequirements: ["kill-quota-conflict", "separate-unresolved-access"],
      },
    ],
  });
  return { combat, catalog, snapshots: structuredClone(snapshots), questIds: [1057] };
}

describe("matching-build server-described kill counters", () => {
  it("resolves the real Dark Iron War conflict as fifteen plus three five-kill counters", () => {
    const base = fixture();
    const combat = combatDatasetSchema.parse({ ...base.combat, quests: [darkIron.reference], npcs: darkIron.npcs });
    const catalog = questCatalogSchema.parse({ ...base.catalog, quests: [darkIron.definition] });
    const result = reconcileClientKillCounters({ combat, catalog, snapshots: darkIron.snapshots, questIds: [303] });
    expect(result.combat.quests[0]!.killQuotas?.map((counter) => [counter.npcId, counter.kills]))
      .toEqual([[1051, 15], [1053, 5], [1052, 5], [1054, 5]]);
    expect(result.catalog.quests[0]!.objectives.map((objective) => objective.count)).toEqual([15, 5, 5, 5]);
    expect(result.catalog.quests[0]!.unsupportedRequirements).not.toContain("kill-quota-conflict");
    expect(result.resolutions[0]!.previous.combat).toEqual(combat.quests[0]);
    expect(result.resolutions[0]!.previous.combat.objectiveText[0]).toContain("10 Dark Iron Dwarves");
    expect(result.combat.npcs).toEqual(combat.npcs);
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
    expect(combatDatasetSchema.parse(result.combat)).toEqual(result.combat);
  });

  it("reconciles all four exact counters in combat and catalog, retaining the older conflict", () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = reconcileClientKillCounters(input);
    expect(
      result.combat.quests[0]!.killQuotas?.map((row) => [row.objectiveIndex, row.npcId, row.kills]),
    ).toEqual([
      [1, 4022, 6],
      [2, 4025, 6],
      [3, 4024, 6],
      [4, 4023, 6],
    ]);
    expect(result.combat.quests[0]!.killQuotaConflicts).toEqual([]);
    expect(result.combat.quests[0]!.objectiveText).toEqual([
      snapshots[0]!.document.quests["1057"].objectivesText,
    ]);
    expect(result.resolutions[0]!.previous.combat.objectiveText).toEqual(
      input.combat.quests[0]!.objectiveText,
    );
    expect(result.catalog.quests[0]!.objectives.map((row) => row.count)).toEqual([6, 6, 6, 6]);
    expect(result.catalog.quests[0]!.unsupportedRequirements).toEqual([
      "separate-unresolved-access",
    ]);
    expect(result.resolutions[0]!.previous).toEqual({
      combat: input.combat.quests[0],
      catalog: input.catalog.quests[0],
    });
    expect(result.resolutions[0]!.counters.map((row) => row.storageIndex)).toEqual([0, 1, 2, 3]);
    for (const source of snapshots)
      expect(result.combat.quests[0]!.killQuotas![0]!.source).toContain(source.sourceSha256);
    expect(result.resolutions[0]!.attribution).toContain("CC BY 4.0");
    expect(combatDatasetSchema.parse(result.combat)).toEqual(result.combat);
    expect(questCatalogSchema.parse(result.catalog)).toEqual(result.catalog);
    expect(input).toEqual(before);
    const repeated = reconcileClientKillCounters({
      ...input,
      combat: result.combat,
      catalog: result.catalog,
    });
    expect(repeated.combat).toEqual(result.combat);
    expect(repeated.catalog).toEqual(result.catalog);
  });

  it("replaces conflicting active prose while preserving its raw evidence, so six-kill counters compile", () => {
    const input = fixture(),
      result = reconcileClientKillCounters(input);
    const plan: CampaignPlan = {
      release: "counter-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      legs: [
        {
          id: "harpies",
          title: "Charred Vale",
          kind: "preparation",
          from: 22,
          to: 27,
          stopId: null,
          actionIds: ["kills"],
          questIds: [1057],
          unresolvedQuestIds: [],
        },
      ],
      actions: [
        {
          id: "kills",
          legId: "harpies",
          title: "Kill harpies",
          kind: "quests",
          source: null,
          positions: [],
          instructions: ["Kill the four harpy types."],
          leaderOnly: false,
          raidOnly: false,
          targetLevel: null,
          targetStopId: null,
          questChanges: [
            {
              questId: 1057,
              state: "objectives-complete",
              objectiveIndex: 1,
              title: "Reclaiming the Charred Vale",
            },
          ],
        },
      ],
    };
    const stale: CombatDataset = {
      ...result.combat,
      quests: result.combat.quests.map((quest) => ({
        ...quest,
        objectiveText: input.combat.quests[0]!.objectiveText,
      })),
    };
    expect(
      attachCampaignCombat(plan, [], stale, "test").combat!.activities[0]!.objectives.every(
        (row) => row.quotaConflict && row.requiredKills === null,
      ),
    ).toBe(true);
    const compiled = attachCampaignCombat(plan, [], result.combat, "test");
    expect(
      compiled.combat!.activities[0]!.objectives.map((row) => [
        row.npcIds,
        row.requiredKills,
        row.credit,
      ]),
    ).toEqual([
      [[4022], 6, "shared-kills"],
      [[4025], 6, "shared-kills"],
      [[4024], 6, "shared-kills"],
      [[4023], 6, "shared-kills"],
    ]);
  });

  it.each([
    "product",
    "locale",
    "build",
    "source-url",
    "source-hash",
    "dates",
    "revision",
    "missing-quest",
    "title",
    "minimum",
    "level",
    "counter-disagreement",
    "non-kill",
    "sparse-index",
    "duplicate-target",
    "extra-objective",
    "catalog-order",
    "provider",
    "class",
    "items",
    "unheld-count",
    "additional-conflict",
    "prose-disagreement",
    "missing-npc",
  ])("retains all input and refuses incompatible evidence: %s", (kind) => {
    const input = fixture();
    const first = input.snapshots[0]!,
      second = input.snapshots[1]!,
      quest = first.document.quests["1057"];
    const ref = input.combat.quests[0]!,
      definition = input.catalog.quests[0]!;
    if (kind === "product") first.document.meta.product = "wow";
    else if (kind === "locale") first.document.meta.locale = "deDE";
    else if (kind === "build") first.document.meta.clientBuild = "1.60.1.70450";
    else if (kind === "source-url")
      first.sourceUrl = first.sourceUrl.replace("wow_classic_beta", "wow");
    else if (kind === "source-hash") second.sourceSha256 = first.sourceSha256;
    else if (kind === "dates") first.document.meta.collectedOn.last = "2020-01-01";
    else if (kind === "revision")
      second.sourceUrl = second.sourceUrl.replace(
        "9c3f82fc7c8ce60760e933db529fd629c2f682d7",
        "a".repeat(40),
      );
    else if (kind === "missing-quest") input.questIds = [1059];
    else if (kind === "title") quest.title = "Another quest";
    else if (kind === "minimum") quest.minLevel = 19;
    else if (kind === "level") quest.level = 26;
    else if (kind === "counter-disagreement")
      second.document.quests["1057"].objectives[0]!.amount = 7;
    else if (kind === "non-kill") quest.objectives[0]!.type = "item";
    else if (kind === "sparse-index") quest.objectives[0]!.storageIndex = 4;
    else if (kind === "duplicate-target")
      quest.objectives[1]!.objectId = quest.objectives[0]!.objectId;
    else if (kind === "extra-objective")
      quest.objectives.push({ ...quest.objectives[0]!, storageIndex: 4 });
    else if (kind === "catalog-order") definition.objectives.reverse();
    else if (kind === "provider") input.catalog.questSha256 = "1".repeat(64);
    else if (kind === "class") ref.requiredClasses = 1;
    else if (kind === "items") ref.itemCreatureIds = [4022];
    else if (kind === "unheld-count") {
      ref.killQuotaConflicts = [];
      definition.objectives[0]!.count = 7;
    } else if (kind === "additional-conflict") ref.killQuotaConflicts!.push(5);
    else if (kind === "prose-disagreement")
      quest.objectivesText = quest.objectivesText.replaceAll("6 ", "7 ");
    else if (kind === "missing-npc") input.combat.npcs.shift();
    const before = structuredClone(input);
    expect(() => reconcileClientKillCounters(input)).toThrow();
    expect(input).toEqual(before);
  });
});
