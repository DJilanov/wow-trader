import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { updateCampaignAction } from "./campaign.js";
import { attachCampaignMeatSupplyHints, MEAT_TRADE_REFERENCE } from "./campaign-meat-supplies.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { campaignSupplyXpBaseline } from "./campaign-supply-xp.js";
import type { CombatActivity, CombatObjective } from "./combat-model.js";

function fixture(leaderOnly = true): CampaignPlan {
  const action: CampaignAction = {
    id: "meat",
    legId: "starter",
    title: "Four Chunks of Boar Meat",
    instructions: ["Loot boars for meat."],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    itemCollections: [
      {
        questId: 86,
        itemId: 769,
        quantity: 4,
        objectiveBitmask: 1,
        confirmationKey: "campaign-item-86-769",
      },
    ],
  };
  const actions: CampaignAction[] = [
    action,
    ...(["accepted", "rewarded"] as const).map((state) => ({
      ...action,
      id: state,
      itemCollections: [],
      kind: "quests" as const,
      questChanges: [{ questId: 86, title: "Pie for Billy", state, objectiveIndex: null }],
    })),
  ];
  return {
    release: "meat-supply-regression",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "starter",
        title: "Starter",
        kind: "starter",
        from: 1,
        to: 2,
        stopId: null,
        actionIds: actions.map((row) => row.id),
        questIds: [86],
        unresolvedQuestIds: [],
      },
    ],
    itemRequirements: [{ questId: 86, objectiveIndex: 1, itemId: 769, quantity: 4 }],
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      unresolvedPrerequisiteIds: [],
      decisions: [
        {
          questId: 86,
          objective: "collection",
          included: true,
          requiredFor: [],
          reason: "Synthetic ordinary-meat fixture",
          lootCost: {
            eligible: true,
            expectedKills: 38,
            slowKills: 48,
            reason: "Synthetic gathering cost",
            auctionItems: [
              {
                questId: 86,
                itemId: 769,
                name: "Chunk of Boar Meat",
                quantityPerPlayer: 4,
                tradeReference: MEAT_TRADE_REFERENCE,
              },
            ],
          },
        },
      ],
    },
    rewardFacts: [
      {
        questId: 86,
        fullXp: 100,
        minimumLevel: 1,
        questLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest=86",
        capturedAt: "2026-11-02T00:00:00.000Z",
      },
    ],
  };
}

describe("ordinary meat supply choices", () => {
  it("preserves dungeon clear profiles, required kills and starter ownership in the XP-only projection", () => {
    const base = attachCampaignMeatSupplyHints(fixture());
    const loot: CombatObjective = {
      questId: 86,
      objectiveIndex: 1,
      npcIds: [1],
      requiredKills: null,
      credit: "personal-loot",
      source: "Synthetic fixture",
      reason: null,
      loot: { itemId: 769, quantity: 4, sharing: "pooled" },
    };
    const required: CombatObjective = {
      questId: 200,
      objectiveIndex: 1,
      npcIds: [1],
      requiredKills: 3,
      credit: "shared-kills",
      source: "Synthetic fixture",
      reason: null,
    };
    const activity: CombatActivity = {
      id: "mixed",
      actionId: "meat",
      environment: "dungeon",
      objectives: [loot, required],
      profile: {
        id: "test-profile",
        stopId: "test",
        title: "Synthetic clear",
        scope: "quest-path",
        basis: "reference-estimate",
        source: "Synthetic fixture",
        sourceBuild: 70205,
        packs: [{ npcId: 1, kills: 8 }],
        dungeonMultiplier: 1,
      },
    };
    const plan: CampaignPlan = {
      ...base,
      combat: {
        revision: "test",
        sourceRevision: "test",
        targetBuild: 70205,
        npcs: [],
        activities: [activity],
        notice: null,
      },
      starters: { entries: [{ action: base.actions[0]!, activities: [activity] }], routes: [] },
    };
    const before = structuredClone(plan);
    const result = campaignSupplyXpBaseline(plan);
    expect([...result.excludedItems]).toEqual(["86:769"]);
    expect(result.plan.combat!.activities[0]!.objectives).toEqual([required]);
    expect(result.plan.combat!.activities[0]!.profile).toBe(activity.profile);
    expect(result.plan.starters!.entries[0]!.activities[0]!.objectives).toEqual([required]);
    expect(result.plan.starters!.entries[0]!.action).toBe(plan.actions[0]);
    expect(plan).toEqual(before);
    const onlyLoot = {
      ...plan,
      combat: { ...plan.combat!, activities: [{ ...activity, objectives: [loot] }] },
    };
    expect(campaignSupplyXpBaseline(onlyLoot).plan.combat!.activities[0]!.profile).toBe(
      activity.profile,
    );
  });
  it("adds one stock/AH/gather instruction without changing the source task or its quota", () => {
    const plan = fixture(),
      before = structuredClone(plan);
    const result = attachCampaignMeatSupplyHints(plan);
    const action = result.actions[0]!;
    expect(action.instructions.at(-1)).toContain("4 Chunk of Boar Meat per character");
    expect(action.instructions.at(-1)).toContain("Auction House if affordable");
    expect(action.instructions.at(-1)).toContain("purchased supplies earn no kill XP");
    expect(action.itemCollections).toEqual(plan.actions[0]!.itemCollections);
    expect(action.auctionSupplies).toHaveLength(1);
    expect(attachCampaignMeatSupplyHints(result)).toEqual(result);
    expect(plan).toEqual(before);
    expect(result.actions[1]!.auctionSupplies).toBeUndefined();
  });

  it.each([true, false])(
    "confirms existing supplies without inventing combat XP or asking for an XP correction (personal=%s)",
    (personal) => {
      const plan = attachCampaignMeatSupplyHints(fixture(personal));
      const base = emptyPremadeProgress();
      const fresh = {
        ...base,
        members: base.members.map((member) => ({
          ...member,
          level: 1,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      };
      const confirmed = updateCampaignAction(plan, fresh, "meat", true, "existing-stock");
      for (const [index, member] of confirmed.members.entries()) {
        expect(member.xpNeedsUpdate).toBe(false);
        expect(member.itemHoldings?.minimums).toEqual(
          !personal || index === 0 ? { "769": 4 } : undefined,
        );
      }
      const member = forecastCampaignXp(plan, confirmed)[0]!.members[0]!;
      expect(member.referenceQuestXp).toBe(100);
      expect(member.combatXp).toBe(0);
      expect(member.unknownQuestIds).toEqual([]);
      expect(member.endpoint).toEqual({ level: 1, currentXp: 100 });
      // The ordinary completion path can include unreported gathering; it still requires a fresh bar.
      expect(updateCampaignAction(plan, fresh, "meat", true).members[0]!.xpNeedsUpdate).toBe(true);
    },
  );

  it("records all three cooking ingredients for each player without adding gathering XP", () => {
    const ingredients = [
      [3172, "Boar Intestines"],
      [3173, "Bear Meat"],
      [3174, "Spider Ichor"],
    ] as const;
    const base = fixture(false);
    const plan = attachCampaignMeatSupplyHints({
      ...base,
      actions: base.actions.map((action) => ({
        ...action,
        questChanges: action.questChanges.map((change) => ({ ...change, questId: 418 })),
        itemCollections: action.itemCollections?.length
          ? ingredients.map(([itemId]) => ({
              questId: 418,
              itemId,
              quantity: 3,
              objectiveBitmask: 1,
              confirmationKey: `campaign-item-418-${itemId}`,
            }))
          : [],
      })),
      itemRequirements: ingredients.map(([itemId], index) => ({
        questId: 418,
        objectiveIndex: index + 1,
        itemId,
        quantity: 3,
      })),
      partyPolicy: {
        ...base.partyPolicy!,
        decisions: base.partyPolicy!.decisions.map((decision) => ({
          ...decision,
          questId: 418,
          lootCost: {
            ...decision.lootCost!,
            auctionItems: ingredients.map(([itemId, name]) => ({
              questId: 418,
              itemId,
              name,
              quantityPerPlayer: 3,
              tradeReference: MEAT_TRADE_REFERENCE,
            })),
          },
        })),
      },
      rewardFacts: base.rewardFacts!.map((fact) => ({
        ...fact,
        questId: 418,
        minimumLevel: 7,
        questLevel: 11,
        fullXp: 880,
      })),
    });
    const initial = emptyPremadeProgress();
    const progress = {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 7,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const confirmed = updateCampaignAction(plan, progress, "meat", true, "existing-stock");
    for (const member of confirmed.members) {
      expect(member.itemHoldings?.minimums).toEqual({ "3172": 3, "3173": 3, "3174": 3 });
      expect(member.xpNeedsUpdate).toBe(false);
    }
    for (const member of forecastCampaignXp(plan, confirmed)[0]!.members) {
      expect(member.rewards.filter((reward) => reward.questId === 418)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
      expect(member.endpoint).toEqual({ level: 7, currentXp: 880 });
    }
  });

  it("does not let the stock confirmation complete quests or unqualified materials", () => {
    const plan = attachCampaignMeatSupplyHints(fixture());
    expect(() =>
      updateCampaignAction(plan, emptyPremadeProgress(), "accepted", true, "existing-stock"),
    ).toThrow("qualified meat-supply task");
    expect(() =>
      updateCampaignAction(fixture(), emptyPremadeProgress(), "meat", true, "existing-stock"),
    ).toThrow("qualified meat-supply task");
    const partial = {
      ...plan,
      actions: plan.actions.map((action) =>
        action.id !== "meat"
          ? action
          : {
              ...action,
              itemCollections: [
                ...action.itemCollections!,
                {
                  questId: 86,
                  itemId: 750,
                  quantity: 1,
                  objectiveBitmask: 2,
                  confirmationKey: "campaign-item-86-750",
                },
              ],
            },
      ),
    };
    expect(() =>
      updateCampaignAction(partial, emptyPremadeProgress(), "meat", true, "existing-stock"),
    ).toThrow("qualified meat-supply task");
  });

  it("exports the acquisition choice alongside the original blocking collection counter", () => {
    const plan = fixture(false);
    const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
    const guide = parseGuideChapter(
      "step\n.collect 769,4,86,1\nstep\n.accept 86\nstep\n.turnin 86",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const enriched = attachCampaignMeatSupplyHints({
      ...plan,
      actions: plan.actions.map((action, index) => ({
        ...action,
        source: {
          chapterId: guide.chapterId,
          version: guide.version,
          stepId: guide.steps[index]!.id,
        },
      })),
    });
    const result = compileCampaignAddon(enriched, enriched.actions, {
      version: "0.2.0-local-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      includeObservers: false,
      nativeSources: [{ reference, guide }],
    });
    const content = result.documents.map((document) => document.content).join("\n");
    expect(content).toContain(".collect 769,4,86,1");
    expect(content).toContain("Auction House if affordable");
    expect(content).toContain("purchased supplies earn no kill XP");
  });
});
