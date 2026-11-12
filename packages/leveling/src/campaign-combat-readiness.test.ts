import { describe, expect, it } from "vitest";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import type { CampaignCombatParticipant } from "./campaign-combat-readiness.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { OWNER_DUNGEON_KILL_XP_REFERENCE } from "./combat-dungeon-reference.js";

function fixture(dungeon = false): CampaignPlan {
  const base: CampaignAction = {
    id: "kills",
    legId: "visit",
    title: "Required enemies",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    ...(dungeon ? { location: { zone: "Wailing Caverns", insideDungeon: "wailing-caverns" } } : {}),
    questChanges: [
      { questId: 100, title: "Test quest", state: "objectives-complete", objectiveIndex: 1 },
    ],
  };
  return {
    release: "combat-readiness-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    legs: [
      {
        id: "visit",
        title: "Test visit",
        kind: "preparation",
        from: 15,
        to: 20,
        actionIds: ["accept", "kills", "reward"],
        questIds: [100],
        unresolvedQuestIds: [],
        stopId: null,
        ...(dungeon ? { dungeonVisitId: "wailing-caverns" } : {}),
      },
    ],
    actions: [
      {
        ...base,
        id: "accept",
        questChanges: [{ ...base.questChanges[0]!, state: "accepted", objectiveIndex: null }],
      },
      base,
      {
        ...base,
        id: "reward",
        questChanges: [{ ...base.questChanges[0]!, state: "rewarded", objectiveIndex: null }],
      },
    ],
    rewardFacts: [
      {
        questId: 100,
        fullXp: 50000,
        minimumLevel: 1,
        questLevel: 20,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest=100",
        capturedAt: "2026-11-03T00:00:00.000Z",
      },
    ],
    combat: {
      revision: "test",
      sourceRevision: "a".repeat(40),
      targetBuild: 70205,
      notice: null,
      npcs: [
        {
          id: 5056,
          name: "Synthetic enemy",
          minimumLevel: 20,
          maximumLevel: 20,
          rank: dungeon ? 1 : 0,
          xpEligibility: "assumed",
          zoneIds: [],
        },
      ],
      activities: [
        {
          id: "test-combat",
          actionId: "kills",
          environment: dungeon ? "dungeon" : "outdoor",
          profile: null,
          objectives: [
            {
              questId: 100,
              objectiveIndex: 1,
              npcIds: [5056],
              requiredKills: 10,
              credit: "shared-kills",
              source: "synthetic quota",
              reason: null,
            },
          ],
        },
      ],
    },
  };
}

function participant(): CampaignCombatParticipant {
  return {
    execute: true,
    questStates: { "100": "accepted" },
    confirmations: {},
    minimumItems: new Map(),
    combat: { counters: new Map(), paid: new Set(), pathKills: new Map() },
  };
}

function withBoss(plan: CampaignPlan): CampaignPlan {
  return {
    ...plan,
    combat: {
      ...plan.combat!,
      bossReferences: [
        {
          npcId: 5056,
          name: "Synthetic enemy",
          targetBuild: 70205,
          instanceMapId: 43,
          dungeonVisitIds: ["wailing-caverns"],
          encounterIds: [1],
          identityEvidence: "client-creature-id",
          source: {
            build: 70205,
            manifestSha256: "a".repeat(64),
            encountersSha256: "b".repeat(64),
            bossesSha256: "c".repeat(64),
            mapsSha256: "d".repeat(64),
          },
        },
      ],
    },
  };
}

describe("pre-combat party readiness", () => {
  it.each([false, true])(
    "requires level 16 for level-20 non-boss enemies (dungeon=%s)",
    (dungeon) => {
      const plan = fixture(dungeon);
      expect(createCampaignCombatReadiness(plan)(plan.actions[1]!).targetLevel).toBe(16);
    },
  );

  it("does not exempt an elite without encounter identity", () => {
    const plan = fixture(true);
    expect(
      createCampaignCombatReadiness(plan)(plan.actions[1]!).nonBossNpcs.map((npc) => npc.id),
    ).toEqual([5056]);
  });

  it("allows a sourced boss only up to+5 inside its matching dungeon", () => {
    const plan = withBoss(fixture(true));
    const check = createCampaignCombatReadiness(plan);
    expect(check(plan.actions[1]!).targetLevel).toBe(15);
    expect(
      check({
        ...plan.actions[1]!,
        location: { zone: "Blackfathom Deeps", insideDungeon: "blackfathom" },
      }).targetLevel,
    ).toBe(16);
    const outdoor = withBoss(fixture());
    expect(createCampaignCombatReadiness(outdoor)(outdoor.actions[1]!).targetLevel).toBe(16);
  });

  it("rejects a mismatched boss name or build even on a directly constructed plan", () => {
    for (const patch of [{ name: "Different enemy" }, { targetBuild: 70450 }]) {
      const plan = withBoss(fixture(true));
      const changed = {
        ...plan,
        combat: {
          ...plan.combat!,
          bossReferences: [{ ...plan.combat!.bossReferences![0]!, ...patch }],
        },
      };
      expect(createCampaignCombatReadiness(changed)(plan.actions[1]!).targetLevel).toBe(16);
    }
  });

  it("resolves an aggregate dungeon stop and its missing-location actions to verified visits", () => {
    const raw = withBoss(fixture());
    const plan: CampaignPlan = {
      ...raw,
      legs: raw.legs.map((leg) => ({ ...leg, kind: "dungeon", stopId: "scarlet-monastery" })),
      combat: {
        ...raw.combat!,
        activities: raw.combat!.activities.map((activity) => ({
          ...activity,
          environment: "dungeon",
        })),
        bossReferences: raw.combat!.bossReferences!.map((boss) => ({
          ...boss,
          instanceMapId: 189,
          dungeonVisitIds: ["sm-library"],
        })),
      },
    };
    const check = createCampaignCombatReadiness(plan),
      action = plan.actions[1]!;
    expect(check(action).targetLevel).toBe(15);
    expect(
      check({ ...action, location: { zone: "1420", insideDungeon: "scarlet-monastery" } })
        .targetLevel,
    ).toBe(15);
    expect(
      check({ ...action, location: { zone: "1439", insideDungeon: "blackfathom" } }).targetLevel,
    ).toBe(16);
  });

  it.each(["objectives-complete", "rewarded"] as const)(
    "does not gate already %s objectives",
    (state) => {
      const plan = fixture();
      const member = { ...participant(), questStates: { "100": state } };
      expect(
        createCampaignCombatReadiness(plan)(plan.actions[1]!, [member]).targetLevel,
      ).toBeNull();
    },
  );

  it("does not gate confirmed or fully counted objectives, or source-skipped work", () => {
    const plan = fixture(),
      check = createCampaignCombatReadiness(plan),
      action = plan.actions[1]!;
    expect(
      check(action, [{ ...participant(), confirmations: { "campaign-objective-100-1": true } }])
        .targetLevel,
    ).toBeNull();
    expect(check(action, [{ ...participant(), execute: false }]).targetLevel).toBeNull();
    const member = participant();
    member.combat.counters.set("100:1", 10);
    expect(check(action, [member]).targetLevel).toBeNull();
  });

  it("still checks a pending member when another already completed the objective", () => {
    const plan = fixture();
    expect(
      createCampaignCombatReadiness(plan)(plan.actions[1]!, [
        participant(),
        { ...participant(), questStates: { "100": "rewarded" } },
      ]).targetLevel,
    ).toBe(16);
  });

  it("checks remaining path packs independently of completed quest objectives", () => {
    const raw = fixture(true),
      activity = raw.combat!.activities[0]!;
    const plan = {
      ...raw,
      combat: {
        ...raw.combat!,
        activities: [
          {
            ...activity,
            pathId: "path",
            profile: {
              id: "path",
              stopId: "wailing-caverns",
              scope: "quest-path" as const,
              sourceBuild: 70205,
              source: "synthetic path",
              title: "Synthetic path",
              basis: "reference-estimate" as const,
              dungeonMultiplier: 1,
              packs: [{ npcId: 5056, kills: 3 }],
            },
          },
        ],
      },
    };
    const member = { ...participant(), questStates: { "100": "rewarded" as const } };
    const check = createCampaignCombatReadiness(plan);
    expect(check(plan.actions[1]!, [member]).targetLevel).toBe(16);
    member.combat.pathKills.set("path:5056", 3);
    expect(check(plan.actions[1]!, [member]).targetLevel).toBeNull();
  });

  it("blocks before any kill XP or hand-in, even one XP below the required level", () => {
    const plan = fixture();
    const raw = emptyPremadeProgress();
    const progress = {
      ...raw,
      members: raw.members.map((member) => ({
        ...member,
        level: 15,
        currentXp: FOREVER_XP_CURVE[15]! - 1,
        xpNeedsUpdate: false,
      })),
    };
    const reports = forecastCampaignXp(plan, progress);
    for (const member of reports.flatMap((section) => section.members)) {
      expect(member.blockedAtActionId).toBe("kills");
      expect(member.combatXp).toBe(0);
      expect(member.rewards).toEqual([]);
      expect(member.checkpoints).toContainEqual(
        expect.objectContaining({ actionId: "kills", targetLevel: 16, missingXp: 1, ready: false }),
      );
      expect(member.steps).toContainEqual(
        expect.objectContaining({
          actionId: "kills",
          phase: "combat",
          status: "blocked",
          combatXp: 0,
        }),
      );
    }
  });

  it("uses the lowest participant rather than the leader's level", () => {
    const plan = fixture(),
      raw = emptyPremadeProgress();
    const progress = {
      ...raw,
      members: raw.members.map((member, index) => ({
        ...member,
        level: index === 4 ? 15 : 16,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const reports = forecastCampaignXp(plan, progress);
    expect(
      reports[0]!.members.every(
        (member) => member.blockedAtActionId === "kills" && member.combatXp === 0,
      ),
    ).toBe(true);
    expect(reports[0]!.members[0]!.issues.some((issue) => issue.message.includes("Player 5"))).toBe(
      true,
    );
  });

  it.each([14, 15])(
    "enforces the boss+5 floor before awarding any of its XP at level%s",
    (level) => {
      const rawPlan = withBoss(fixture(true)),
        plan = {
          ...rawPlan,
          legs: rawPlan.legs.map((leg) => ({ ...leg, kind: "dungeon" as const })),
          combat: {
            ...rawPlan.combat!,
            dungeonKillXpReference: {
              ...OWNER_DUNGEON_KILL_XP_REFERENCE,
              minimumXpPerPlayer: 30,
              maximumXpPerPlayer: 30,
              source: "Synthetic exact payout for the readiness regression only",
            },
          },
        },
        raw = emptyPremadeProgress();
      const progress = {
        ...raw,
        members: raw.members.map((member) => ({
          ...member,
          level,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      };
      for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
        expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBe(
          level === 14 ? "kills" : null,
        );
        if (level === 14) {
          expect(member.combatXp).toBe(0);
          expect(member.rewards).toEqual([]);
        } else expect(member.combatXp).toBeGreaterThan(0);
      }
    },
  );

  it("retains an unknown boss level as unresolved instead of exempting it", () => {
    const raw = withBoss(fixture(true));
    const plan = {
      ...raw,
      combat: {
        ...raw.combat!,
        npcs: raw.combat!.npcs.map((npc) => ({
          ...npc,
          minimumLevel: null,
          maximumLevel: null,
        })),
      },
    };
    expect(createCampaignCombatReadiness(plan)(plan.actions[1]!)).toEqual({
      targetLevel: null,
      nonBossNpcs: [],
      unknownNpcIds: [5056],
    });
  });

  it("permits exactly +4 and leaves the input unchanged", () => {
    const plan = fixture(),
      raw = emptyPremadeProgress(),
      before = JSON.stringify(plan);
    const progress = {
      ...raw,
      members: raw.members.map((member) => ({
        ...member,
        level: 16,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    expect(
      forecastCampaignXp(plan, progress)[0]!.members.every(
        (member) => member.combatXp > 0 && member.blockedAtActionId === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("checks physical stock work but skips already held or auction-supplied items", () => {
    const raw = fixture();
    const collection = {
      questId: 100,
      itemId: 200,
      quantity: 4,
      objectiveBitmask: 1,
      confirmationKey: "required-stock",
    };
    const action = { ...raw.actions[1]!, questChanges: [], itemCollections: [collection] };
    const plan: CampaignPlan = {
      ...raw,
      actions: [action],
      combat: {
        ...raw.combat!,
        activities: [],
        materialWork: [
          {
            id: "stock",
            actionId: action.id,
            targets: [
              {
                confirmationKey: collection.confirmationKey,
                sourceOrdinal: 1,
                sourceBlocksCompletion: true,
                possibleDropNpcIds: [5056],
                objective: {
                  ...raw.combat!.activities[0]!.objectives[0]!,
                  credit: "personal-loot",
                  requiredKills: null,
                },
              },
            ],
          },
        ],
      },
    };
    const check = createCampaignCombatReadiness(plan),
      member = participant();
    expect(check(action, [member]).targetLevel).toBe(16);
    expect(check(action, [member], new Set(["100:200"])).targetLevel).toBeNull();
    expect(
      check(action, [{ ...member, minimumItems: new Map([[200, 4]]) }]).targetLevel,
    ).toBeNull();
    expect(
      check(action, [{ ...member, confirmations: { "required-stock": true } }]).targetLevel,
    ).toBeNull();
  });

  it("still gates physical collection when its additional kill XP is deliberately excluded", () => {
    const raw = fixture();
    const plan: CampaignPlan = {
      ...raw,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [100],
      acquisitionXpPolicy: "exclude-unpriced-extra",
      itemRequirements: [{ questId: 100, objectiveIndex: 1, itemId: 200, quantity: 4 }],
      combat: {
        ...raw.combat!,
        lootDrops: [
          {
            itemId: 200,
            npcId: 5056,
            probability: 0.5,
            minimumQuantity: 1,
            maximumQuantity: 1,
            sampleSize: 100,
            targetBuild: 70205,
            sourceUrl: "https://example.test/item=200",
            sourceSha256: "a".repeat(64),
            capturedAt: "2026-11-03T00:00:00.000Z",
          },
        ],
        activities: [
          {
            ...raw.combat!.activities[0]!,
            objectives: [
              {
                ...raw.combat!.activities[0]!.objectives[0]!,
                credit: "personal-loot",
                requiredKills: null,
                loot: { itemId: 200, quantity: 4, sharing: "unknown" },
              },
            ],
          },
        ],
      },
    };
    const initial = emptyPremadeProgress();
    const progress = {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 15,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    expect(
      forecastCampaignXp(plan, progress)[0]!.members.every(
        (member) =>
          member.blockedAtActionId === "kills" &&
          member.combatXp === 0 &&
          member.rewards.length === 0,
      ),
    ).toBe(true);
  });

  it.each([false, true])(
    "puts native XP readiness before combat, retaining lifecycle guards (boss=%s)",
    (boss) => {
      const plan = boss ? withBoss(fixture(true)) : fixture();
      const result = compileCampaignAddon(plan, plan.actions, {
        version: "0.1.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
      });
      for (const document of result.documents) {
        const prefix = document.content
          .split("#label kfc-kills-combat-ready\n")[1]!
          .split("\nstep")[0]!;
        expect(prefix).toContain(`.xp ${boss ? 15 : 16}`);
        expect(prefix).toContain(".isOnQuest 100");
        expect(prefix).not.toContain(".complete");
        expect(document.content.indexOf("#label kfc-kills-combat-ready")).toBeLessThan(
          document.content.indexOf("#label kfc-kills\n"),
        );
      }
    },
  );
});
