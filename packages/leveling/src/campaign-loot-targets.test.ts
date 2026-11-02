import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { attachCampaignLootTargets } from "./campaign-loot-targets.js";
import { attachCampaignReferenceFarmTargets } from "./campaign-reference-farm-targets.js";
import { resolveJointCombatQuota } from "./combat-loot-joint.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";

const instruction =
  "Kill Kobold Tunnelers and Kobold Miners. Loot them for their Kobold Candles and Gold Dust";
function fixture(): { plan: CampaignPlan; source: CampaignSource } {
  const reference = CHAPTER_REFERENCES.find((c) => c.sourceId === 116)!;
  const parsed = parseGuideChapter(
    `step\n.isNotOnQuest 91775\n.complete 60,1 >>Kobold Candle (8)\n.complete 47,1 >>Gold Dust (10)\n.mob Kobold Tunneler\n.mob Kobold Miner`,
    reference.id,
    "a".repeat(64),
    70205,
  );
  const guide = {
    ...parsed,
    steps: parsed.steps.map((step) => ({ ...step, id: "source-step-0054" })),
  };
  const changes = (
    [
      { questId: 60, title: "Kobold Candles" },
      { questId: 47, title: "Gold Dust Exchange" },
    ] as const
  ).map((q) => ({ ...q, state: "objectives-complete" as const, objectiveIndex: 1 }));
  const action = {
    id: "collect",
    legId: "starter",
    title: "Collect",
    instructions: [instruction],
    questChanges: changes,
    positions: [],
    source: { chapterId: reference.id, version: guide.version, stepId: "source-step-0054" },
    kind: "quests" as const,
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  const plan: CampaignPlan = {
    release: "fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [action],
    legs: [
      {
        id: "starter",
        title: "Elwynn",
        kind: "starter",
        from: 4,
        to: 11,
        actionIds: [action.id],
        questIds: [47, 60],
        unresolvedQuestIds: [],
        stopId: null,
      },
    ],
    combat: {
      revision: "fixture",
      sourceRevision: "fixture",
      targetBuild: 70205,
      notice: null,
      npcs: [
        {
          id: 475,
          name: "Kobold Tunneler",
          minimumLevel: 5,
          maximumLevel: 6,
          rank: 0,
          zoneIds: [12],
          xpEligibility: "assumed",
        },
        {
          id: 40,
          name: "Kobold Miner",
          minimumLevel: 6,
          maximumLevel: 7,
          rank: 0,
          zoneIds: [12],
          xpEligibility: "assumed",
        },
      ],
      activities: [
        {
          id: "collect-combat",
          actionId: action.id,
          environment: "outdoor",
          profile: null,
          objectives: changes.map((change) => ({
            questId: change.questId,
            objectiveIndex: 1,
            npcIds: [40, 475],
            requiredKills: null,
            credit: "personal-loot",
            source: "fixture",
            reason: null,
            loot: {
              itemId: change.questId === 60 ? 772 : 773,
              quantity: change.questId === 60 ? 8 : 10,
              sharing: "pooled",
            },
          })),
        },
      ],
      lootDrops: [
        { itemId: 772, probability: 0.66 },
        { itemId: 773, probability: 0.5 },
      ].map((item) => ({
        ...item,
        npcId: 475,
        probabilityBasis: "reported",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 100,
        targetBuild: 70205,
        sourceUrl: "https://example.test/drop",
        sourceSha256: "b".repeat(64),
        capturedAt: "2026-11-01T00:00:00.000Z",
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "c".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: "d".repeat(64),
          sourceBuild: 5875,
          referencedAt: "2026-11-01T00:00:00.000Z",
          itemId: item.itemId,
          npcId: 475,
          lootEntry: 475,
          probability: item.probability,
          questOnly: true,
          rateMultiplier: 1,
        },
      })),
    },
  };
  return { plan, source: { reference, guide } };
}
describe("reviewed source creature targets", () => {
  it("selects a single source-authorized creature jointly and keeps native hints and source candidates", () => {
    const { plan: original, source } = fixture();
    const combat = original.combat!;
    const plan: CampaignPlan = {
      ...original,
      combat: {
        ...combat,
        activities: combat.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => ({
            ...objective,
            loot: { ...objective.loot!, sourceNpcIds: [40, 475] },
          })),
        })),
        lootDrops: [
          ...combat.lootDrops!,
          ...combat.lootDrops!.map((drop) => ({
            ...drop,
            npcId: 40,
            probability: 0.9,
            probabilityReference: {
              ...drop.probabilityReference!,
              npcId: 40,
              lootEntry: 40,
              probability: 0.9,
            },
          })),
        ],
      },
    };
    const before = JSON.stringify(plan);
    const selected = attachCampaignReferenceFarmTargets(plan);
    expect(selected.actions[0]!.referenceCreatureTargets).toEqual([
      { npcId: 40, name: "Kobold Miner" },
    ]);
    expect(selected.actions[0]!.instructions.at(-1)).toContain("focus on Kobold Miner");
    const objectives = selected.combat!.activities[0]!.objectives;
    expect(objectives.map((objective) => objective.npcIds)).toEqual([[40], [40]]);
    expect(objectives[0]!.loot!.sourceNpcIds).toEqual([40, 475]);
    expect(resolveJointCombatQuota(objectives, selected.combat!, 5, "expected").status).toBe(
      "estimated",
    );
    const native = campaignNativeInstructions(selected, [source])(selected.actions[0]!);
    expect(
      native?.directives
        .filter((directive) => directive.tag === ".mob")
        .map((directive) => directive.arguments),
    ).toEqual(["Kobold Miner"]);
    expect(native?.directives.filter((directive) => directive.tag === ".complete")).toHaveLength(2);
    expect(JSON.stringify(plan)).toBe(before);
    expect(attachCampaignReferenceFarmTargets(selected)).toBe(selected);
    const reattached: CampaignPlan = { ...selected, combat: plan.combat! };
    expect(attachCampaignReferenceFarmTargets(reattached)).toEqual(selected);
  });
  it("holds multi-creature choices without source identity or a supported joint probability law", () => {
    const { plan } = fixture();
    expect(attachCampaignReferenceFarmTargets(plan)).toBe(plan);
    const noJoint: CampaignPlan = {
      ...plan,
      combat: {
        ...plan.combat!,
        activities: plan.combat!.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => ({
            ...objective,
            loot: { ...objective.loot!, sourceNpcIds: [40, 475] },
          })),
        })),
        lootDrops: plan.combat!.lootDrops!.map((drop) => {
          const { probabilityReference: _reference, ...withoutReference } = drop;
          return withoutReference;
        }),
      },
    };
    expect(attachCampaignReferenceFarmTargets(noJoint)).toBe(noJoint);
    const duplicateName: CampaignPlan = {
      ...noJoint,
      combat: {
        ...noJoint.combat!,
        lootDrops: plan.combat!.lootDrops!,
        npcs: noJoint.combat!.npcs.map((npc) => ({ ...npc, name: "Indistinguishable Creature" })),
      },
    };
    expect(attachCampaignReferenceFarmTargets(duplicateName)).toBe(duplicateName);
  });
  it("keeps browser wording, native mob hints and combat targets consistent without changing the source", () => {
    const { plan, source } = fixture(),
      before = JSON.stringify({ plan, source });
    const selected = attachCampaignLootTargets(plan),
      action = selected.actions[0]!;
    expect(action.instructions).toEqual([
      expect.stringContaining("Kill Kobold Tunnelers in Fargodeep Mine"),
    ]);
    expect(action.creatureTarget).toEqual({ npcId: 475, name: "Kobold Tunneler" });
    expect(
      selected.combat!.activities[0]!.objectives.every(
        (o) => o.npcIds.length === 1 && o.npcIds[0] === 475,
      ),
    ).toBe(true);
    const native = campaignNativeInstructions(selected, [source])(action);
    expect(native?.directives.filter((d) => d.tag === ".mob").map((d) => d.arguments)).toEqual([
      "Kobold Tunneler",
    ]);
    expect(native?.directives.filter((d) => d.tag === ".complete")).toHaveLength(2);
    expect(native?.directives.some((d) => d.tag === ".isNotOnQuest")).toBe(false);
    expect(JSON.stringify({ plan, source })).toBe(before);
    expect(attachCampaignLootTargets(selected)).toEqual(selected);
  });
  it("leaves an unreviewed source, unsuitable creature or additional objective unchanged", () => {
    for (const kind of ["wording", "rank", "target", "extra"] as const) {
      const { plan } = fixture();
      const changed: CampaignPlan =
        kind === "wording"
          ? { ...plan, actions: [{ ...plan.actions[0]!, instructions: ["A different route"] }] }
          : kind === "extra"
            ? {
                ...plan,
                actions: [
                  {
                    ...plan.actions[0]!,
                    questChanges: [
                      ...plan.actions[0]!.questChanges,
                      {
                        questId: 1,
                        state: "objectives-complete",
                        objectiveIndex: 1,
                        title: "Other",
                      },
                    ],
                  },
                ],
              }
            : {
                ...plan,
                combat: {
                  ...plan.combat!,
                  npcs: plan.combat!.npcs.map((npc) =>
                    npc.id === 475
                      ? { ...npc, ...(kind === "rank" ? { rank: 1 } : { name: "Other Creature" }) }
                      : npc,
                  ),
                },
              };
      expect(attachCampaignLootTargets(changed)).toBe(changed);
    }
  });
  it("credits the grouped collection once in the full XP ledger", () => {
    const { plan } = fixture(),
      selected = attachCampaignLootTargets(plan),
      gather = selected.actions[0]!;
    const pickup = {
      ...gather,
      id: "accept",
      instructions: [],
      source: null,
      questChanges: gather.questChanges.map((change) => ({
        ...change,
        state: "accepted" as const,
        objectiveIndex: null,
      })),
    };
    const route = {
      ...selected,
      actions: [pickup, gather],
      legs: selected.legs.map((leg) => ({ ...leg, actionIds: [pickup.id, gather.id] })),
    };
    const base = emptyPremadeProgress(),
      progress = {
        ...base,
        members: base.members.map((member) => ({
          ...member,
          level: 4,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      };
    const rows = forecastCampaignXp(route, progress);
    expect(rows[0]!.members[0]!.combatRows).toHaveLength(1);
    expect(rows[0]!.members[0]!.combatRows[0]!.lootEstimate?.expectedKills).toBeGreaterThan(20);
    expect(rows[0]!.members[0]!.combatXp).toBeGreaterThan(0);
  });
});
