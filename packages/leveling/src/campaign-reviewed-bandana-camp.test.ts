import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { attachCampaignLootTargets } from "./campaign-loot-targets.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { partyQuestLootCost } from "./party-quest-cost.js";

function fixture(): {
  plan: CampaignPlan;
  source: CampaignSource;
  provider: Pick<CombatDataset["provider"], "revision" | "npcSha256">;
} {
  const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 115)!;
  const parsed = parseGuideChapter(
    [
      "step",
      "#loop",
      ".goto 1429/0,-288.51,-9068.87,0",
      ".goto 1429/0,-388.47,-9001.28,0",
      ".goto 1429/0,-288.51,-9068.87,30,0",
      ".goto 1429/0,-335.02,-9108.91,30,0",
      ".goto 1429/0,-376.67,-9073.73,30,0",
      ".goto 1429/0,-388.47,-9001.28,30,0",
      ".goto 1429/0,-333.97,-9028.59,30,0",
      ">>Kill Defias Thugs. Loot them for their Red Burlap Bandanas",
      ".complete 18,1 >>Collect Red Burlap Bandana (x12)",
      ".mob Defias Thug",
    ].join("\n"),
    reference.id,
    "a".repeat(64),
    70205,
  );
  // Synthetic boundary fixture for the independently checked archived source identity.
  const guide = {
    ...parsed,
    version: "import-v2-a9efdb7422cc4125",
    steps: parsed.steps.map((step) => ({ ...step, id: "source-step-0049" })),
  };
  const step = guide.steps[0]!;
  const provider = {
    revision: "e9a67d1a2753a0e64c4c96bf7864788fac7b765f",
    npcSha256: "9ef0d0c232ccfc58f8caeb28094e3332e8cf01e2c035ea5b2502c55301b81232",
  };
  const action = {
    id: "bandanas",
    legId: "starter",
    title: "Brotherhood of Thieves",
    kind: "quests" as const,
    source: { chapterId: reference.id, version: guide.version, stepId: step.id },
    positions: step.directives.flatMap((row) =>
      row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
    ),
    instructions: [
      "Kill Defias Thugs. Loot them for their Red Burlap Bandanas",
      "Collect Red Burlap Bandana (x12)",
    ],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: [
      {
        questId: 18,
        title: "Brotherhood of Thieves",
        state: "objectives-complete" as const,
        objectiveIndex: 1,
      },
    ],
  };
  const plan: CampaignPlan = {
    release: "synthetic-bandana-boundary",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    sourceArchiveSha256: "af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e",
    actions: [action],
    legs: [],
    combat: {
      revision: "synthetic-bandana-boundary",
      sourceRevision: provider.revision,
      targetBuild: 70205,
      notice: null,
      npcs: [
        {
          id: 38,
          name: "Defias Thug",
          minimumLevel: 3,
          maximumLevel: 4,
          rank: 0,
          zoneIds: [12],
          xpEligibility: "assumed",
        },
        {
          id: 246263,
          name: "Defias Thug",
          minimumLevel: null,
          maximumLevel: null,
          rank: 0,
          zoneIds: [],
          xpEligibility: "assumed",
        },
      ],
      activities: [
        {
          id: "bandana-combat",
          actionId: action.id,
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              questId: 18,
              objectiveIndex: 1,
              npcIds: [38, 246263],
              requiredKills: null,
              credit: "personal-loot",
              source: "Synthetic source binding",
              reason: null,
              loot: { itemId: 752, quantity: 12, sharing: "pooled", sourceNpcIds: [38, 246263] },
            },
          ],
        },
      ],
      lootDrops: [
        {
          itemId: 752,
          npcId: 38,
          probability: 9 / 19,
          probabilityBasis: "sample-ratio",
          minimumQuantity: 1,
          maximumQuantity: 1,
          sampleSize: 19,
          targetBuild: 70205,
          sourceUrl: "https://example.test/item=752",
          sourceSha256: "b".repeat(64),
          capturedAt: "2026-10-20T07:02:34.980Z",
        },
      ],
    },
  };
  return { plan, source: { reference, guide }, provider };
}

describe("source-qualified Northshire bandana camp", () => {
  it("selects the spatially qualified creature while preserving the unknown same-name record and full party quota", () => {
    const { plan, source, provider } = fixture(),
      before = structuredClone(plan);
    const selected = attachCampaignLootTargets(plan, provider);
    expect(selected.actions[0]!.creatureTarget).toEqual({ npcId: 38, name: "Defias Thug" });
    expect(selected.actions[0]!.positions).toEqual(plan.actions[0]!.positions);
    expect(selected.combat!.npcs).toEqual(plan.combat!.npcs);
    expect(selected.combat!.lootDrops).toEqual(plan.combat!.lootDrops);
    expect(selected.combat!.activities[0]!.objectives[0]).toMatchObject({
      npcIds: [38],
      loot: { quantity: 12, sourceNpcIds: [38, 246263] },
    });
    expect(partyQuestLootCost(18, selected)).toMatchObject({
      eligible: true,
      expectedKills: 127,
      retainedByDropRate: true,
    });
    const native = campaignNativeInstructions(selected, [source])(selected.actions[0]!);
    expect(
      native?.directives.filter((row) => row.tag === ".complete").map((row) => row.arguments),
    ).toEqual(["18,1"]);
    expect(
      native?.directives.filter((row) => row.tag === ".mob").map((row) => row.arguments),
    ).toEqual(["Defias Thug"]);
    expect(plan).toEqual(before);
    expect(attachCampaignLootTargets(selected, provider)).toEqual(selected);
  });

  it("requires the checked provider and source archive rather than resolving aliases by name", () => {
    const { plan, provider } = fixture();
    expect(attachCampaignLootTargets(plan)).toBe(plan);
    expect(attachCampaignLootTargets(plan, { ...provider, npcSha256: "f".repeat(64) })).toBe(plan);
    expect(attachCampaignLootTargets(plan, { ...provider, revision: "f".repeat(40) })).toBe(plan);
    const { sharedQuestsOnly: _shared, ...legacy } = plan;
    const cases: CampaignPlan[] = [
      legacy,
      { ...plan, sourceArchiveSha256: "f".repeat(64) },
      { ...plan, targetBuild: 70450 },
      {
        ...plan,
        actions: plan.actions.map((action) => ({
          ...action,
          source: { ...action.source!, version: "changed-source" },
        })),
      },
      {
        ...plan,
        actions: plan.actions.map((action) => ({
          ...action,
          positions: action.positions.map((point, index) =>
            index ? point : { ...point, position: { ...point.position, x: point.position.x + 1 } },
          ),
        })),
      },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          npcs: plan.combat!.npcs.map((npc) => (npc.id === 38 ? { ...npc, rank: 1 } : npc)),
        },
      },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          npcs: plan.combat!.npcs.map((npc) => (npc.id === 38 ? { ...npc, maximumLevel: 5 } : npc)),
        },
      },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          npcs: plan.combat!.npcs.map((npc) => (npc.id === 38 ? { ...npc, zoneIds: [] } : npc)),
        },
      },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          activities: plan.combat!.activities.map((activity) => ({
            ...activity,
            objectives: activity.objectives.map((objective) => ({
              ...objective,
              loot: { ...objective.loot!, quantity: 11 },
            })),
          })),
        },
      },
      { ...plan, combat: { ...plan.combat!, lootDrops: [] } },
      {
        ...plan,
        combat: {
          ...plan.combat!,
          lootDrops: plan.combat!.lootDrops!.map((drop) => ({ ...drop, sourceBuild: 70450 })),
        },
      },
    ];
    for (const candidate of cases)
      expect(attachCampaignLootTargets(candidate, provider)).toBe(candidate);
  });
});
