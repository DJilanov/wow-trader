import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { campaignAcquisitionXpBaseline } from "./campaign-acquisition-xp.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

function action(
  id: string,
  state: "accepted" | "objectives-complete" | "rewarded",
): CampaignAction {
  return {
    id,
    legId: "world",
    title: "Collect the trophy",
    kind: "quests",
    leaderOnly: false,
    instructions: ["Defeat the named creature and collect one trophy for each player."],
    source: null,
    positions: [],
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [
      {
        questId: 300001,
        state,
        title: "The trophy",
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
  };
}

function fixture(): CampaignPlan {
  const actions = [
    action("accept", "accepted"),
    action("collect", "objectives-complete"),
    action("return", "rewarded"),
  ];
  return {
    release: "unpriced-acquisition-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    acquisitionXpPolicy: "exclude-unpriced-extra",
    actions,
    legs: [
      {
        id: "world",
        title: "World",
        from: 1,
        to: 2,
        kind: "preparation",
        stopId: null,
        actionIds: actions.map((a) => a.id),
        questIds: [300001],
        unresolvedQuestIds: [],
      },
    ],
    itemRequirements: [{ questId: 300001, objectiveIndex: 1, itemId: 10, quantity: 1 }],
    rewardFacts: [
      {
        questId: 300001,
        fullXp: 100,
        minimumLevel: 1,
        questLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest=300001",
        capturedAt: "2026-11-02T00:00:00Z",
      },
    ],
    combat: {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      notice: null,
      questObjectiveIndexes: { "300001": [1] },
      npcs: [
        {
          id: 1,
          name: "Named creature",
          minimumLevel: 1,
          maximumLevel: 1,
          rank: 0,
          xpEligibility: "assumed",
          zoneIds: [12],
        },
      ],
      activities: [
        {
          id: "loot",
          actionId: "collect",
          environment: "outdoor",
          profile: null,
          objectives: [
            {
              questId: 300001,
              objectiveIndex: 1,
              npcIds: [1],
              requiredKills: null,
              credit: "personal-loot",
              source: "Synthetic captured relation",
              reason: null,
              loot: { itemId: 10, quantity: 1, sharing: "unknown" },
            },
          ],
        },
      ],
      lootDrops: [
        {
          itemId: 10,
          npcId: 1,
          targetBuild: 70205,
          sourceBuild: null,
          probability: 0.5,
          probabilityBasis: "sample-ratio",
          minimumQuantity: null,
          maximumQuantity: null,
          sampleSize: 100,
          sourceUrl: "https://example.test/item=10",
          sourceSha256: "a".repeat(64),
          capturedAt: "2026-11-02T00:00:00Z",
        },
      ],
    },
  };
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      raceId: "human",
      classSlug: classes[index]!,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

function knownLootQuotaFixture(): CampaignPlan {
  const plan = fixture();
  return {
    ...plan,
    incidentalKillXpPercent: 10,
    rewardFacts: plan.rewardFacts!.map((fact) => ({ ...fact, questLevel: 26 })),
    combat: {
      ...plan.combat!,
      npcs: plan.combat!.npcs.map((npc) => ({ ...npc, minimumLevel: 18, maximumLevel: 19 })),
      activities: plan.combat!.activities.map((activity) => ({
        ...activity,
        objectives: activity.objectives.map((objective) => ({
          ...objective,
          loot: { ...objective.loot!, sharing: "shared-roll" as const },
        })),
      })),
      lootDrops: plan.combat!.lootDrops!.map((drop) => ({
        ...drop,
        probability: 0.1,
        minimumQuantity: 1,
        maximumQuantity: 1,
      })),
    },
  };
}

function levelSpanningProgress(): ReturnType<typeof progress> {
  const initial = progress();
  return {
    ...initial,
    members: initial.members.map((member) => ({ ...member, level: 25, currentXp: 0 })),
  };
}

const levelSpanningBounds = Array.from({ length: 5 }, () => ({
  minimum: { level: 25, currentXp: 0 },
  maximum: { level: 26, currentXp: 0 },
}));

describe("known collection workload with an unpriced payout", () => {
  it("retains the full collection and reward while omitting only unsupported extra kill XP", () => {
    const plan = knownLootQuotaFixture(),
      before = JSON.stringify(plan);
    const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.referenceQuestXp).toBe(100);
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
      expect(member.knownEndpoint).toEqual({ level: 25, currentXp: 100 });
      expect(member.xpBounds?.finish?.maximum).toEqual({ level: 26, currentXp: 100 });
      expect(member.combatRows).toEqual([
        expect.objectContaining({ npcId: 1, kills: 10, xp: 0, maximumXp: 0, basis: "excluded" }),
      ]);
      expect(member.rewards.filter((reward) => reward.questId === 300001)).toHaveLength(1);
      expect(member.issues.some((issue) => issue.code === "acquisition-xp-excluded")).toBe(true);
    }
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("keeps strict mode held at the same unpriced payout", () => {
    const forecast = forecastCampaignXp(knownLootQuotaFixture(), levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
      acquisitionXpPolicy: "strict",
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("collect");
      expect(member.referenceQuestXp).toBe(0);
      expect(member.combatRows[0]!.xp).toBeNull();
    }
  });

  it.each(["rank", "maximumLevel"] as const)(
    "does not omit a payout with missing creature %s",
    (field) => {
      const original = knownLootQuotaFixture();
      const plan: CampaignPlan = {
        ...original,
        combat: {
          ...original.combat!,
          npcs: original.combat!.npcs.map((npc) => ({ ...npc, [field]: null })),
        },
      };
      const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
        initialBounds: levelSpanningBounds,
      });
      expect(forecast[0]!.members.every((member) => member.blockedAtActionId === "collect")).toBe(
        true,
      );
    },
  );

  it("does not use an incompatible capture to authorize a payout omission", () => {
    const original = knownLootQuotaFixture();
    const plan: CampaignPlan = {
      ...original,
      combat: {
        ...original.combat!,
        lootDrops: original.combat!.lootDrops!.map((drop) => ({ ...drop, sourceBuild: 70450 })),
      },
    };
    const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
    });
    expect(forecast[0]!.members.every((member) => member.blockedAtActionId === "collect")).toBe(
      true,
    );
  });

  it("continues counting supported acquisition combat and incidental XP", () => {
    const original = knownLootQuotaFixture();
    const plan: CampaignPlan = {
      ...original,
      combat: {
        ...original.combat!,
        npcs: original.combat!.npcs.map((npc) => ({ ...npc, minimumLevel: 24, maximumLevel: 24 })),
      },
    };
    const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.combatXp).toBeGreaterThan(0);
      expect(member.incidentalCombatXp).toBeGreaterThan(0);
      expect(member.issues.some((issue) => issue.code === "acquisition-xp-excluded")).toBe(false);
    }
  });

  it("does not omit an unpriced required kill counter", () => {
    const original = knownLootQuotaFixture();
    const plan: CampaignPlan = {
      ...original,
      itemRequirements: [],
      combat: {
        ...original.combat!,
        activities: original.combat!.activities.map((activity) => ({
          ...activity,
          objectives: activity.objectives.map((objective) => {
            const { loot: _loot, ...counter } = objective;
            return { ...counter, credit: "shared-kills" as const, requiredKills: 10 };
          }),
        })),
      },
    };
    const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("collect");
      expect(member.referenceQuestXp).toBe(0);
      expect(member.combatRows[0]!.xp).toBeNull();
    }
  });

  it("requires safe enemy levels before a collection can omit unpriced XP", () => {
    const original = knownLootQuotaFixture();
    const plan: CampaignPlan = {
      ...original,
      combat: {
        ...original.combat!,
        npcs: original.combat!.npcs.map((npc) => ({ ...npc, minimumLevel: 30, maximumLevel: 30 })),
      },
    };
    const forecast = forecastCampaignXp(plan, levelSpanningProgress(), {
      initialBounds: levelSpanningBounds,
    });
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBe("collect");
      expect(member.referenceQuestXp).toBe(0);
      expect(member.combatRows).toEqual([]);
    }
  });
});

describe("explicit known-input acquisition XP baseline", () => {
  it("retains all physical tasks, per-player quantities and raw loot evidence", () => {
    const plan = fixture(),
      before = structuredClone(plan);
    const result = campaignAcquisitionXpBaseline(plan);
    expect(result.plan.actions).toBe(plan.actions);
    expect(result.plan.itemRequirements).toBe(plan.itemRequirements);
    expect(result.plan.combat!.lootDrops).toBe(plan.combat!.lootDrops);
    expect(result.plan.combat!.activities).toEqual([]);
    expect(result.exclusions.get("collect")).toEqual([
      expect.objectContaining({
        questId: 300001,
        itemId: 10,
        quantityPerPlayer: 1,
        npcId: 1,
        sourceUrl: "https://example.test/item=10",
      }),
    ]);
    expect(plan).toEqual(before);
  });

  it("keeps the legacy baseline policy and stops strict forecasts at unresolved acquisition", () => {
    const plan = fixture();
    const { acquisitionXpPolicy: _policy, ...legacy } = plan;
    const { sharedQuestsOnly: _shared, ...personal } = plan;
    expect(campaignAcquisitionXpBaseline(plan, "strict").plan).toBe(plan);
    expect(campaignAcquisitionXpBaseline(legacy).exclusions.size).toBe(0);
    expect(campaignAcquisitionXpBaseline(personal).exclusions.size).toBe(0);
    const member = forecastCampaignXp(plan, progress(), { acquisitionXpPolicy: "strict" })[0]!
      .members[0]!;
    expect(member.blockedAtActionId).toBe("collect");
    expect(member.referenceQuestXp).toBe(0);
  });

  it.each(["minimum", "maximum", "rank", "all"])(
    "omits unpriced acquisition XP with known source identity and missing %s payout metadata",
    (missing) => {
      const original = fixture();
      const plan: CampaignPlan = {
        ...original,
        combat: {
          ...original.combat!,
          npcs: original.combat!.npcs.map((npc) => ({
            ...npc,
            ...(missing === "minimum" || missing === "all" ? { minimumLevel: null } : {}),
            ...(missing === "maximum" || missing === "all" ? { maximumLevel: null } : {}),
            ...(missing === "rank" || missing === "all" ? { rank: null } : {}),
          })),
        },
      };
      const before = structuredClone(plan);
      const baseline = campaignAcquisitionXpBaseline(plan);
      expect(baseline.exclusions.get("collect")).toEqual([
        expect.objectContaining({ questId: 300001, npcId: 1, itemId: 10, quantityPerPlayer: 1 }),
      ]);
      expect(baseline.plan.actions).toBe(plan.actions);
      expect(baseline.plan.itemRequirements).toBe(plan.itemRequirements);
      expect(baseline.plan.combat!.npcs).toBe(plan.combat!.npcs);
      expect(baseline.plan.combat!.lootDrops).toBe(plan.combat!.lootDrops);
      expect(baseline.plan.combat!.activities).toEqual([]);
      for (const member of forecastCampaignXp(plan, progress())[0]!.members) {
        expect(member.endpoint).toEqual({ level: 1, currentXp: 100 });
        expect(member.combatXp).toBe(0);
        expect(member.issues).toContainEqual(
          expect.objectContaining({
            code: "acquisition-xp-excluded",
            questId: 300001,
            blocksForecast: false,
          }),
        );
      }
      expect(campaignAcquisitionXpBaseline(plan, "strict").plan).toBe(plan);
      expect(
        forecastCampaignXp(plan, progress(), { acquisitionXpPolicy: "strict" })[0]!.members[0]!
          .blockedAtActionId,
      ).toBe("collect");
      expect(plan).toEqual(before);
    },
  );

  it.each([
    "no-capture",
    "zero-chance",
    "duplicate",
    "foreign-target",
    "foreign-source",
    "missing-npc",
    "unknown-eligibility",
    "missing-quantity",
    "ambiguous-target",
    "conflict",
    "unknown-method",
    "personal",
    "missing-counter",
    "wrong-counter",
  ])("retains the unresolved %s requirement", (kind) => {
    const plan = structuredClone(fixture()),
      combat = plan.combat!,
      objective = combat.activities[0]!.objectives[0]!,
      drop = combat.lootDrops![0]!;
    const changed: CampaignPlan =
      kind === "no-capture"
        ? { ...plan, combat: { ...combat, lootDrops: [] } }
        : kind === "zero-chance"
          ? { ...plan, combat: { ...combat, lootDrops: [{ ...drop, probability: 0 }] } }
          : kind === "duplicate"
            ? { ...plan, combat: { ...combat, lootDrops: [drop, drop] } }
            : kind === "foreign-target"
              ? { ...plan, combat: { ...combat, lootDrops: [{ ...drop, targetBuild: 1 }] } }
              : kind === "foreign-source"
                ? { ...plan, combat: { ...combat, lootDrops: [{ ...drop, sourceBuild: 1 }] } }
                : kind === "missing-npc"
                  ? { ...plan, combat: { ...combat, npcs: [] } }
                  : kind === "unknown-eligibility"
                    ? {
                        ...plan,
                        combat: {
                          ...combat,
                          npcs: [{ ...combat.npcs[0]!, xpEligibility: "unknown" }],
                        },
                      }
                    : kind === "missing-counter"
                      ? { ...plan, itemRequirements: [] }
                      : kind === "wrong-counter"
                        ? {
                            ...plan,
                            itemRequirements: [{ ...plan.itemRequirements![0]!, quantity: 2 }],
                          }
                        : kind === "personal"
                          ? {
                              ...plan,
                              actions: plan.actions.map((a) =>
                                a.id === "collect" ? { ...a, leaderOnly: true } : a,
                              ),
                            }
                          : {
                              ...plan,
                              combat: {
                                ...combat,
                                activities: [
                                  {
                                    ...combat.activities[0]!,
                                    objectives: [
                                      {
                                        ...objective,
                                        ...(kind === "missing-quantity"
                                          ? { loot: { ...objective.loot!, quantity: null } }
                                          : {}),
                                        ...(kind === "ambiguous-target" ? { npcIds: [1, 2] } : {}),
                                        ...(kind === "conflict" ? { quotaConflict: true } : {}),
                                        ...(kind === "unknown-method"
                                          ? { credit: "unknown" as const }
                                          : {}),
                                      },
                                    ],
                                  },
                                ],
                              },
                            };
    expect(campaignAcquisitionXpBaseline(changed).plan).toBe(changed);
  });

  it("retains a supported collection workload and dungeon profile", () => {
    const plan = fixture(),
      combat = plan.combat!,
      objective = combat.activities[0]!.objectives[0]!,
      drop = combat.lootDrops![0]!;
    const priced: CampaignPlan = {
      ...plan,
      combat: {
        ...combat,
        lootDrops: [{ ...drop, minimumQuantity: 1, maximumQuantity: 1 }],
        activities: [
          {
            ...combat.activities[0]!,
            objectives: [{ ...objective, loot: { ...objective.loot!, sharing: "shared-roll" } }],
          },
        ],
      },
    };
    expect(campaignAcquisitionXpBaseline(priced).plan).toBe(priced);
    const pricedWithoutMetadata: CampaignPlan = {
      ...priced,
      combat: {
        ...priced.combat!,
        npcs: priced.combat!.npcs.map((npc) => ({
          ...npc,
          minimumLevel: null,
          maximumLevel: null,
        })),
      },
    };
    expect(campaignAcquisitionXpBaseline(pricedWithoutMetadata).plan).toBe(pricedWithoutMetadata);
    const profile = {
      id: "profile",
      stopId: "test",
      title: "Known path",
      scope: "quest-path" as const,
      basis: "reference-estimate" as const,
      source: "Synthetic clear",
      sourceBuild: 70205,
      dungeonMultiplier: 1,
      packs: [{ npcId: 1, kills: 3 }],
    };
    const profiled: CampaignPlan = {
      ...plan,
      combat: { ...combat, activities: [{ ...combat.activities[0]!, profile }] },
    };
    expect(campaignAcquisitionXpBaseline(profiled).plan.combat!.activities).toEqual([
      { ...combat.activities[0]!, objectives: [], profile },
    ]);
  });

  it("continues known quest rewards for all five while disclosing omitted acquisition XP", () => {
    const plan = fixture(),
      before = JSON.stringify(plan);
    const rows = forecastCampaignXp(plan, progress())[0]!.members;
    for (const row of rows) {
      expect(row.endpoint).toEqual({ level: 1, currentXp: 100 });
      expect(row.referenceQuestXp).toBe(100);
      expect(row.combatXp).toBe(0);
      expect(row.issues).toContainEqual(
        expect.objectContaining({
          code: "acquisition-xp-excluded",
          questId: 300001,
          blocksForecast: false,
        }),
      );
      expect(row.evidence.combat).toBe("estimated");
    }
    expect(JSON.stringify(plan)).toBe(before);
  });

  it.each([false, true])(
    "retains separate shared kills with missing NPC metadata: %s",
    (missingMetadata) => {
      const base = fixture(),
        combat = base.combat!;
      const killAction = (
        id: string,
        state: "accepted" | "objectives-complete" | "rewarded",
      ): CampaignAction => ({
        ...action(id, state),
        questChanges: [
          {
            questId: 300002,
            title: "Three shared kills",
            state,
            objectiveIndex: state === "objectives-complete" ? 1 : null,
          },
        ],
      });
      const actions = [
        base.actions[0]!,
        killAction("accept-kills", "accepted"),
        killAction("kill", "objectives-complete"),
        base.actions[1]!,
        base.actions[2]!,
        killAction("return-kills", "rewarded"),
      ];
      const plan: CampaignPlan = {
        ...base,
        actions,
        legs: base.legs.map((leg) => ({
          ...leg,
          actionIds: actions.map((a) => a.id),
          questIds: [300001, 300002],
        })),
        rewardFacts: [...base.rewardFacts!, { ...base.rewardFacts![0]!, questId: 300002 }],
        combat: {
          ...combat,
          ...(missingMetadata
            ? {
                npcs: combat.npcs.map((npc) => ({
                  ...npc,
                  minimumLevel: null,
                  maximumLevel: null,
                })),
              }
            : {}),
          questObjectiveIndexes: { ...combat.questObjectiveIndexes, "300002": [1] },
          activities: [
            ...combat.activities,
            {
              id: "known-kills",
              actionId: "kill",
              environment: "outdoor",
              profile: null,
              objectives: [
                {
                  questId: 300002,
                  objectiveIndex: 1,
                  npcIds: [1],
                  requiredKills: 3,
                  credit: "shared-kills",
                  source: "Synthetic captured quota",
                  reason: null,
                },
              ],
            },
          ],
        },
      };
      const projected = campaignAcquisitionXpBaseline(plan).plan;
      expect(projected.combat!.activities.map((a) => a.id)).toEqual(["known-kills"]);
      for (const member of forecastCampaignXp(plan, progress())[0]!.members) {
        if (missingMetadata) {
          expect(member.blockedAtActionId).not.toBeNull();
          expect(member.referenceQuestXp).toBe(0);
          expect(member.combatRows.some((row) => row.xp === null)).toBe(true);
          continue;
        }
        expect(member.blockedAtActionId).toBeNull();
        expect(member.referenceQuestXp).toBe(200);
        expect(member.combatXp).toBeGreaterThan(0);
        expect(member.combatRows.map((row) => row.kills)).toEqual([3]);
        expect(member.endpoint).toEqual({ level: 1, currentXp: 200 + member.combatXp });
      }
    },
  );

  it("keeps a real level gap and never borrows the omitted XP", () => {
    const base = fixture();
    const gate: CampaignAction = {
      ...action("gate", "accepted"),
      kind: "checkpoint",
      questChanges: [],
      targetLevel: 2,
    };
    const plan = {
      ...base,
      actions: [...base.actions, gate],
      legs: base.legs.map((leg) => ({ ...leg, actionIds: [...leg.actionIds, gate.id] })),
    };
    for (const member of forecastCampaignXp(plan, progress())[0]!.members) {
      expect(member.blockedAtActionId).toBe("gate");
      expect(member.checkpoints.find((step) => step.actionId === "gate")?.missingXp).toBe(
        FOREVER_XP_CURVE[1]! - 100,
      );
    }
  });
});
