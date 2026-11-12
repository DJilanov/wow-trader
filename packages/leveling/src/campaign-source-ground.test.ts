import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function source(body: string, hash = "a"): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 31)!;
  return {
    reference,
    guide: parseGuideChapter(body, reference.id, hash.repeat(64), 70205),
  };
}

function fixture(): { plan: CampaignPlan; data: CombatDataset; sources: CampaignSource[] } {
  const action: CampaignPlan["actions"][number] = {
    id: "dungeon-uldaman-objectives-complete-1360",
    legId: "dungeon-uldaman",
    title: "Complete Reclaimed Treasures",
    kind: "quests",
    instructions: [
      "Recover Krom Stoutarm's Treasure in the North Common Hall outside Uldaman's instance portal. Complete this entrance-cave task before the instanced clear.",
    ],
    positions: [],
    source: null,
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    wholeQuestObjectives: true,
    questChanges: [
      {
        questId: 1360,
        state: "objectives-complete",
        objectiveIndex: 1,
        title: "Reclaimed Treasures",
      },
    ],
  };
  return {
    plan: {
      release: "synthetic-source-ground-regression",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [1360],
      actions: [action],
      legs: [
        {
          id: "dungeon-uldaman",
          title: "Uldaman",
          kind: "dungeon",
          stopId: "uldaman",
          from: 40,
          to: 44,
          actionIds: [action.id],
          questIds: [1360],
          unresolvedQuestIds: [],
        },
      ],
    },
    data: combatDatasetSchema.parse({
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic source precedence regression",
      provider: {
        repository: "https://example.test/provider",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic method fixture; no observed kill payout."],
      },
      npcs: [],
      dungeons: [],
      quests: [
        {
          questId: 1360,
          requiredClasses: 0,
          creatureIds: [],
          itemCreatureIds: [],
          onlyCreatureObjectives: false,
          objectiveText: [
            "Get Krom Stoutarm's treasured possession from his chest in the North Common Hall of Uldaman, and bring it to him in Ironforge.",
          ],
          itemObjectives: [
            {
              objectiveIndex: 1,
              itemId: 8027,
              itemName: "Krom Stoutarm's Treasure",
              quantity: 1,
              npcIds: [],
              objectIds: [124389],
              sharing: "unknown",
            },
          ],
        },
      ],
    }),
    sources: [
      source(
        "step\n.goto 1418,35.56,23.51\n>>Loot Krom Stoutarm's Treasure on the ground\n.complete 1360,1 >>Krom Stoutarm's Treasure (1)",
      ),
    ],
  };
}

describe("archived ground proof before a generated loot fallback", () => {
  it("retains the full quota and native bindings while using the archived ground proof", () => {
    const { plan, data, sources } = fixture(),
      before = structuredClone({ plan, data, sources });
    const result = attachCampaignCombat(plan, sources, data, "test");
    expect(result.combat!.activities).toEqual([]);
    expect(result.itemRequirements).toContainEqual({
      questId: 1360,
      objectiveIndex: 1,
      itemId: 8027,
      quantity: 1,
    });
    expect(result.actions).toEqual(plan.actions);
    expect({ plan, data, sources }).toEqual(before);
    expect(attachCampaignCombat(result, sources, data, "test")).toEqual(result);
  });

  it("accepts multiple agreeing archive variants", () => {
    const { plan, data, sources } = fixture();
    sources.push(
      source(
        "step\n.goto 1418,35.56,23.51\n>>Open the chest on the ground\n.complete 1360,1 >>Krom Stoutarm's Treasure (1)",
        "b",
      ),
    );
    expect(attachCampaignCombat(plan, sources, data, "test").combat!.activities).toEqual([]);
  });

  it.each([
    "no-object",
    "unknown-quantity",
    "wrong-counter",
    "npc-alternative",
    "conflicting-requirement",
    "wrong-build",
    "partial-action",
    "source-conflict",
  ])("keeps unqualified work unresolved (%s)", (change) => {
    const { data, ...initial } = fixture();
    let { plan, sources } = initial;
    const item = data.quests[0]!.itemObjectives![0]!;
    if (change === "no-object") delete item.objectIds;
    if (change === "unknown-quantity") item.quantity = null;
    if (change === "wrong-counter")
      sources = [
        source(
          "step\n.goto 1418,35.56,23.51\n>>Loot Krom Stoutarm's Treasure on the ground\n.complete 1360,1 >>Krom Stoutarm's Treasure (2)",
        ),
      ];
    if (change === "npc-alternative") item.npcIds = [100];
    if (change === "conflicting-requirement")
      plan = {
        ...plan,
        itemRequirements: [
          { questId: 1360, objectiveIndex: 1, itemId: 8027, quantity: null, conflict: true },
        ],
      };
    if (change === "wrong-build")
      sources = sources.map((entry) => ({
        ...entry,
        guide: { ...entry.guide, targetBuild: 99999 },
      }));
    if (change === "partial-action")
      plan = {
        ...plan,
        actions: plan.actions.map((action) => {
          const partial = { ...action };
          delete partial.wholeQuestObjectives;
          return partial;
        }),
      };
    if (change === "source-conflict")
      sources.push(
        source(
          "step\n.goto 1418,35.56,23.51\n>>Kill the guards and loot their treasure\n.complete 1360,1 >>Krom Stoutarm's Treasure (1)",
          "b",
        ),
      );
    expect(attachCampaignCombat(plan, sources, data, "test").combat!.activities).toHaveLength(1);
  });

  it("preserves a separate required kill counter in the same quest", () => {
    const { plan, data, sources } = fixture();
    Object.assign(data.quests[0]!, {
      creatureIds: [100],
      killQuotas: [{ objectiveIndex: 2, npcId: 100, kills: 2, source: "Synthetic kill counter" }],
    });
    const objectives = attachCampaignCombat(plan, sources, data, "test").combat!.activities.flatMap(
      (activity) => activity.objectives,
    );
    expect(objectives).toEqual([
      expect.objectContaining({
        objectiveIndex: 2,
        credit: "shared-kills",
        npcIds: [100],
        requiredKills: 2,
      }),
    ]);
  });

  it("pays all five hand-ins after the full ground counter with zero acquisition XP", () => {
    const input = fixture(),
      objective = input.plan.actions[0]!;
    const phases = ["accepted", "objectives-complete", "rewarded"] as const;
    const actions = phases.map((state) => ({
      ...objective,
      id: state,
      questChanges: [
        {
          questId: 1360,
          title: "Reclaimed Treasures",
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    }));
    const plan = attachCampaignCombat(
      {
        ...input.plan,
        actions,
        legs: input.plan.legs.map((leg) => ({
          ...leg,
          actionIds: actions.map((action) => action.id),
        })),
        rewardFacts: [
          {
            questId: 1360,
            fullXp: 100,
            minimumLevel: 30,
            questLevel: 38,
            xpByLevel: [],
            sourceUrl: "https://example.test/synthetic-ground-reward",
            capturedAt: "2026-11-04T00:00:00Z",
            status: "available",
            evidenceKind: "published-forever",
          },
        ],
      },
      input.sources,
      input.data,
      "test",
    );
    const initial = emptyPremadeProgress();
    const forecast = forecastCampaignXp(plan, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 40,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 40, currentXp: 100 });
      expect(member.rewards.filter((reward) => reward.questId === 1360)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
    }
  });
});
