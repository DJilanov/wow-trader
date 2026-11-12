import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { earlyNorthernCourier } from "./campaign-northern-courier.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";

function fixture(
  objective = "Find Balthule Shadowstrike near the Tower of Althalaxx in Darkshore.",
): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
  catalog: QuestCatalog;
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
  const guide = parseGuideChapter(
    [
      "step\n.goto 1439,39,43\n.accept 965\n.target Sentinel Elissa Starbreeze",
      "step\n.goto 1439,50,25\n>>Continue north",
      "step\n.goto 1439,55,25\n.turnin 965\n.target Balthule Shadowstrike",
      "step\n.goto 1439,55,31\n>>Continue to the cave",
    ].join("\n"),
    reference.id,
    "a".repeat(64),
    70205,
  );
  const sources = [{ reference, guide }];
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic source courier fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: "b".repeat(40),
      npcSha256: "c".repeat(64),
      questSha256: "d".repeat(64),
      itemSha256: "e".repeat(64),
      layer: "forever-static-with-authored",
      limitations: ["Synthetic source binding, no observed payout"],
    },
    npcs: [],
    quests: [
      {
        questId: 965,
        creatureIds: [],
        itemCreatureIds: [],
        requiredClasses: 0,
        onlyCreatureObjectives: false,
        objectiveText: [objective],
        itemObjectives: [],
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic courier fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: data.provider.revision,
    questSha256: data.provider.questSha256,
    npcSha256: data.provider.npcSha256,
    itemSha256: data.provider.itemSha256,
    areaMapSha256: "f".repeat(64),
    includesAuthoredCorrections: false,
    quests: [
      {
        questId: 965,
        title: "The Tower of Althalaxx",
        minimumLevel: 13,
        questLevel: 18,
        requiredRaces: 4294967373,
        requiredClasses: 0,
        category: "delivery",
        objectives: [],
        starts: [
          {
            npcId: 3657,
            name: "Sentinel Elissa Starbreeze",
            friendlyToAlliance: true,
            positions: [{ zone: "1439", x: 39, y: 43 }],
          },
        ],
        ends: [
          {
            npcId: 3661,
            name: "Balthule Shadowstrike",
            friendlyToAlliance: true,
            positions: [{ zone: "1439", x: 55, y: 25 }],
          },
        ],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        unsupportedRequirements: ["unresolved-objective-text"],
      },
    ],
  };
  let plan: CampaignPlan = {
    release: "northern-courier-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [965],
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
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
  const owned = library
    .find((entry) => entry.questId === 965)!
    .actions.map((action) => ({
      ...action,
      id: `owned-${action.questChanges[0]!.state}`,
      legId: "later-ashenvale",
      fundingCheckpointId: "later-gate",
    }));
  const anchors = [1, 3].map((index, ordinal): CampaignAction => ({
    ...owned[0]!,
    id: `anchor-${ordinal}`,
    legId: "northern-approach",
    kind: "instructions",
    questChanges: [],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[index]!.id },
    positions: guide.steps[index]!.directives.flatMap((row) =>
      row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
    ),
  }));
  const actions = [...anchors, ...owned];
  plan = {
    ...plan,
    actions,
    legs: ["northern-approach", "later-ashenvale"].map((id) => ({
      id,
      title: id,
      kind: "preparation",
      from: 13,
      to: 25,
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: id === "later-ashenvale" ? [965] : [],
      unresolvedQuestIds: [],
      stopId: null,
    })),
  };
  return { plan, sources, data, catalog };
}

describe("captured northern courier relocation", () => {
  it("reuses the owned actions at their original source-order stops without mutating inputs", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = earlyNorthernCourier(input.plan, input.sources, input.data, input.catalog)!;
    expect(result.beforeActionIds).toEqual(["anchor-0", "anchor-1"]);
    expect(result.actions.map((action) => action.id)).toEqual(["owned-accepted", "owned-rewarded"]);
    expect(result.actions[0]).toBe(input.plan.actions[2]);
    expect(result.actions[1]).toBe(input.plan.actions[3]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    "Kill guards then find Balthule Shadowstrike.",
    "Find a hidden scroll near Balthule Shadowstrike.",
  ])("refuses objective work beyond the captured conversation: %s", (objective) => {
    const input = fixture(objective);
    expect(earlyNorthernCourier(input.plan, input.sources, input.data, input.catalog)).toBeNull();
  });

  it("requires both original phases and refuses changed source positions", () => {
    const input = fixture();
    const incomplete = { ...input.plan, actions: input.plan.actions.slice(0, -1) };
    expect(earlyNorthernCourier(incomplete, input.sources, input.data, input.catalog)).toBeNull();
    const changed = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.id !== "owned-accepted"
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
    expect(earlyNorthernCourier(changed, input.sources, input.data, input.catalog)).toBeNull();
  });

  it("requires matching build, provenance and recipient", () => {
    const input = fixture();
    for (const catalog of [
      { ...input.catalog, targetBuild: 70450 },
      { ...input.catalog, npcSha256: "0".repeat(64) },
      {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          ends: quest.ends.map((npc) => ({ ...npc, name: "Another recipient" })),
        })),
      },
    ])
      expect(earlyNorthernCourier(input.plan, input.sources, input.data, catalog)).toBeNull();
  });

  it("refuses class, race and prerequisite detours", () => {
    const input = fixture();
    for (const patch of [
      { requiredClasses: 16 },
      { requiredRaces: 1 },
      { prerequisites: { allOf: [999], anyOf: [] } },
    ]) {
      const catalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({ ...quest, ...patch })),
      };
      expect(earlyNorthernCourier(input.plan, input.sources, input.data, catalog)).toBeNull();
    }
  });

  it("requires two ordered source anchors in the earlier region", () => {
    const input = fixture();
    const reversed = {
      ...input.plan,
      actions: [input.plan.actions[1]!, input.plan.actions[0]!, ...input.plan.actions.slice(2)],
    };
    expect(earlyNorthernCourier(reversed, input.sources, input.data, input.catalog)).toBeNull();
    const foreign = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.legId !== "northern-approach"
          ? action
          : {
              ...action,
              positions: action.positions.map((entry) => ({
                ...entry,
                position: { ...entry.position, zone: "1433" },
              })),
            },
      ),
    };
    expect(earlyNorthernCourier(foreign, input.sources, input.data, input.catalog)).toBeNull();
  });

  it.each([
    { leaderOnly: true },
    { raidOnly: true },
    { dungeonFinishOnly: true },
    { legId: "northern-approach" },
  ])("does not move personal, raid, finish or already-placed work: %j", (patch) => {
    const input = fixture(),
      plan = {
        ...input.plan,
        actions: input.plan.actions.map((action) =>
          action.id.startsWith("owned-") ? { ...action, ...patch } : action,
        ),
      };
    expect(earlyNorthernCourier(plan, input.sources, input.data, input.catalog)).toBeNull();
  });
});
