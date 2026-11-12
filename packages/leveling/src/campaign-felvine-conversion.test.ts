import { describe, expect, it } from "vitest";
import type { CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { combatDatasetSchema } from "./combat-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { felvineConversionObjectives } from "./campaign-felvine-conversion.js";
import combatData from "./fixtures/felvine-conversion-input-combat.json" with { type: "json" };

interface Fixture {
  plan: CampaignPlan;
  data: CombatDataset;
}
function fixture(): Fixture {
  const actions: CampaignPlan["actions"] = (
    ["accepted", "objectives-complete", "rewarded"] as const
  ).map((state) => ({
    id: state,
    legId: "east",
    kind: "quests",
    title: "Shards of the Felvine",
    source: null,
    positions: [],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    instructions:
      state === "objectives-complete"
        ? [
            "After defeating Alzzin the Wildshaper, collect a Felvine Shard and seal it in the supplied Reliquary of Purity. Everyone must finish the sealed-shard objective.",
          ]
        : [],
    location:
      state === "objectives-complete"
        ? { zone: "1444", insideDungeon: "dire-maul-east" }
        : { zone: "1450" },
    ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
    ...(state === "accepted" ? { requiredQuestIds: [5527] } : {}),
    questChanges: [
      {
        questId: 5526,
        title: "Shards of the Felvine",
        state,
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
  }));
  return {
    plan: {
      release: "staged-felvine-conversion",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sharedQuestsOnly: true,
      actions,
      legs: [
        {
          id: "east",
          kind: "dungeon",
          title: "Dire Maul East",
          from: 56,
          to: 57,
          stopId: null,
          dungeonVisitId: "dire-maul-east",
          questIds: [5526],
          unresolvedQuestIds: [],
          actionIds: actions.map((action) => action.id),
        },
      ],
      rewardFacts: [
        {
          questId: 5526,
          fullXp: 1000,
          minimumLevel: 56,
          questLevel: 60,
          xpByLevel: [],
          status: "available",
          evidenceKind: "published-forever",
          sourceUrl: "https://example.test/synthetic-felvine-reward",
          capturedAt: "2026-11-04T00:00:00Z",
        },
      ],
    },
    data: combatDatasetSchema.parse(structuredClone(combatData)),
  };
}

function progressAt(level: number): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  return {
    ...initial,
    members: initial.members.map((member) => ({
      ...member,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: { "5527": "rewarded" as const },
    })),
  };
}

describe("staged Felvine production-hook contract", () => {
  it("keeps the supplied container, gathered shard and final sealed item distinct", () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = felvineConversionObjectives(input.plan, input.data);
    expect(result.get("objectives-complete")).toMatchObject({
      questId: 5526,
      objectiveIndex: 1,
      credit: "non-combat",
      npcIds: [],
      requiredKills: null,
      combatAccess: { npcIds: [11492], itemId: 18540, quantity: 1 },
    });
    expect(result.get("objectives-complete")!.loot).toBeUndefined();
    expect(input).toEqual(before);
    expect(felvineConversionObjectives(input.plan, input.data)).toEqual(result);
  });

  it.each([
    "wrong-provider",
    "wrong-build",
    "wrong-object-source",
    "unknown-quantity",
    "wrong-quantity",
    "wrong-output",
    "changed-objective",
    "drop-instead-of-conversion",
    "missing-enemy",
    "renamed-enemy",
    "partial-action",
    "wrong-wing",
    "duplicate-conversion",
  ])("keeps an unsupported conversion unresolved (%s)", (change) => {
    const input = fixture();
    if (change === "wrong-provider") input.data.provider.revision = "0".repeat(40);
    if (change === "wrong-build") input.data.targetBuild = 70450;
    if (change === "wrong-object-source") input.data.provider.objectSha256 = "0".repeat(64);
    if (change === "unknown-quantity") input.data.quests[0]!.itemObjectives![0]!.quantity = null;
    if (change === "wrong-quantity") input.data.quests[0]!.itemObjectives![0]!.quantity = 2;
    if (change === "wrong-output") input.data.quests[0]!.itemObjectives![0]!.itemId = 18501;
    if (change === "changed-objective")
      input.data.quests[0]!.objectiveText = ["Collect another item"];
    if (change === "drop-instead-of-conversion")
      input.data.quests[0]!.itemObjectives![0]!.npcIds = [11492];
    if (change === "missing-enemy") input.data.npcs = [];
    if (change === "renamed-enemy") input.data.npcs[0]!.name = "A different creature";
    if (change === "partial-action")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((action) => {
          const copy = { ...action };
          delete copy.wholeQuestObjectives;
          return copy;
        }),
      };
    if (change === "wrong-wing")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((action) => ({
          ...action,
          location: { zone: "1444", insideDungeon: "dire-maul-north" },
        })),
      };
    if (change === "duplicate-conversion")
      input.plan = {
        ...input.plan,
        actions: [...input.plan.actions, { ...input.plan.actions[1]!, id: "second-conversion" }],
      };
    expect(felvineConversionObjectives(input.plan, input.data).size).toBe(0);
  });

  it("uses the actual encounter level and does not grant an unsourced boss exemption", () => {
    const input = fixture(),
      plan = attachCampaignCombat(input.plan, [], input.data, "staged-felvine-hook");
    const result = createCampaignCombatReadiness(plan)(plan.actions[1]!);
    expect(result.targetLevel).toBe(54);
    expect(result.unknownNpcIds).toEqual([]);
    expect(result.nonBossNpcs.map((npc) => npc.id)).toEqual([11492]);
  });

  it("leaves missing physical levels unresolved", () => {
    const input = fixture();
    input.data.npcs[0]!.minimumLevel = null;
    input.data.npcs[0]!.maximumLevel = null;
    const plan = attachCampaignCombat(input.plan, [], input.data, "staged-felvine-hook");
    expect(createCampaignCombatReadiness(plan)(plan.actions[1]!).unknownNpcIds).toEqual([11492]);
    expect(plan.combat!.npcs[0]!.maximumLevel).toBeNull();
  });

  it("retains both the real level-56 pickup and the parent quest requirement", () => {
    const input = fixture(),
      plan = attachCampaignCombat(input.plan, [], input.data, "staged-felvine-hook");
    const initial = progressAt(56);
    const noParent = {
      ...initial,
      members: initial.members.map((member) => ({ ...member, questStates: {} })),
    };
    for (const progress of [progressAt(55), noParent])
      for (const member of forecastCampaignXp(plan, progress)[0]!.members) {
        expect(member.blockedAtActionId).toBe("accepted");
        expect(member.rewards).toEqual([]);
      }
    expect(plan.actions.map((action) => action.questChanges)).toEqual(
      input.plan.actions.map((action) => action.questChanges),
    );
    expect(plan.actions[0]!.requiredQuestIds).toEqual([5527]);
  });

  it("credits all five sealed results once without farming the supplied container or inventing encounter XP", () => {
    const input = fixture(),
      plan = attachCampaignCombat(input.plan, [], input.data, "staged-felvine-hook");
    const baseline = attachCampaignCombat(
      input.plan,
      [],
      { ...input.data, provider: { ...input.data.provider, revision: "0".repeat(40) } },
      "unqualified-conversion",
    );
    expect(forecastCampaignXp(baseline, progressAt(56))[0]!.members[0]!.blockedAtActionId).toBe(
      "objectives-complete",
    );
    for (const member of forecastCampaignXp(plan, progressAt(56))[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 56, currentXp: 1000 });
      expect(member.rewards.filter((reward) => reward.questId === 5526)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
      expect(member.incidentalCombatXp).toBe(0);
    }
    expect(plan.itemRequirements).toContainEqual({
      questId: 5526,
      objectiveIndex: 1,
      itemId: 18540,
      quantity: 1,
    });
    expect(plan.actions).toEqual(input.plan.actions);
    const compiled = compileCampaignAddon(plan, plan.actions, {
      version: "0.2.0-staged-felvine-contract",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    const native = compiled.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    for (const tag of ["accept", "turnin"])
      expect(native.match(new RegExp("\\." + tag + " 5526\\b", "g"))).toHaveLength(1);
    expect(native.match(/\.complete 5526,1\b/g)).toHaveLength(1);
    expect(native).not.toContain(".collect 18539,");
    expect(native).not.toContain(".collect 18501,");
  });
});
