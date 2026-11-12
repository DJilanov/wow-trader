import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { attachDungeonStarterWork } from "./campaign-dungeon-starters.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { campaignItemStateSignature } from "./campaign-items.js";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";

function dataset(): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic retained-starter regression",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["No drop sharing or kill count is known."],
    },
    npcs: [
      {
        id: 260326,
        name: "Relic Guardian",
        minimumLevel: 31,
        maximumLevel: 31,
        rank: 1,
        zoneIds: [],
        xpEligibility: "assumed",
      },
    ],
    bossReferences: [
      {
        npcId: 260326,
        name: "Relic Guardian",
        targetBuild: 70205,
        instanceMapId: 2998,
        dungeonVisitIds: ["excavation"],
        encounterIds: [3482],
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
    quests: [95810, 98824].map((questId) => ({
      questId,
      creatureIds: [],
      itemCreatureIds: questId === 95810 ? [260326] : [],
      objectiveText: [campaignDungeonQuest(questId)!.objective],
      onlyCreatureObjectives: false,
      onlyInteractionObjectives: false,
      requiredClasses: 0,
      ...(questId === 95810 ? { startItem: { itemId: 270865, name: "Titan Relic" } } : {}),
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: questId === 95810 ? 270865 : 287959,
          itemName: "Titan Relic",
          quantity: 1,
          npcIds: questId === 95810 ? [260326] : [],
          sharing: "unknown",
          ...(questId === 98824 ? { provided: true } : {}),
        },
      ],
    })),
    dungeons: [],
    killXpEvidence: [],
  });
}

function route(): CampaignPlan {
  const actions: CampaignAction[] = [95810, 98824].flatMap((questId) => {
    const journal = campaignDungeonQuest(questId)!;
    return (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      id: `dungeon-excavation-${state}-${questId}`,
      legId: "excavation",
      title: `${state} ${journal.title}`,
      kind: "quests",
      source: null,
      instructions: [
        state === "accepted"
          ? journal.pickup!
          : state === "rewarded"
            ? journal.turnin!
            : journal.objective!,
      ],
      positions: [],
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
      location: {
        zone: "1437",
        ...(questId === 95810 && state === "accepted" ? { insideDungeon: "excavation" } : {}),
      },
      questChanges: [
        {
          questId,
          state,
          title: journal.title,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    }));
  });
  return {
    release: "starter-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sharedQuestsOnly: true,
    actions,
    legs: [
      {
        id: "excavation",
        title: "Excavation",
        kind: "dungeon",
        from: 26,
        to: 31,
        stopId: "excavation",
        actionIds: actions.map((action) => action.id),
        questIds: [95810, 98824],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [95810, 98824].map((questId) => ({
      questId,
      fullXp: 100,
      minimumLevel: 1,
      questLevel: 30,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: `https://example.test/quest=${questId}`,
      capturedAt: "2026-11-03T00:00:00Z",
    })),
  };
}

function progress(level: number): PremadeProgress {
  const raw = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return {
    ...raw,
    members: raw.members.map((member, index) => ({
      ...member,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
      raceId: "human",
      classSlug: classes[index]!,
    })),
  };
}

function compiled(): CampaignPlan {
  return attachCampaignCombat(route(), [], dataset(), "test");
}

function ringPlan(): CampaignPlan {
  const original = route(), journal = campaignDungeonQuest(2945)!;
  const actions = original.actions.slice(0, 3).map((action) => ({
    ...action,
    id: action.id.replace("95810", "2945"),
    legId: "gnomeregan",
    title: journal.title,
    instructions: [action.questChanges[0]!.state === "accepted" ? journal.pickup!
      : action.questChanges[0]!.state === "rewarded" ? journal.turnin! : journal.objective!],
    location: { zone: "1426", insideDungeon: "gnomeregan" },
    questChanges: action.questChanges.map((change) => ({ ...change, questId: 2945 })),
  }));
  const source = dataset(), quest = source.quests[0]!;
  const data: CombatDataset = {
    ...source,
    bossReferences: [],
    npcs: [{ id: 6212, name: "Dark Iron Agent", minimumLevel: 32, maximumLevel: 33,
      rank: 1, zoneIds: [721], xpEligibility: "assumed" }],
    quests: [{ ...quest, questId: 2945, itemCreatureIds: [6212],
      objectiveText: [journal.objective!],
      startItem: { itemId: 9326, name: "Grime-Encrusted Ring" },
      itemObjectives: [{ objectiveIndex: 1, itemId: 9326, itemName: "Grime-Encrusted Ring",
        quantity: 1, npcIds: [6212], sharing: "shared-roll" }],
    }],
  };
  return attachCampaignCombat({
    ...original, actions, dungeonCollectionPolicy: "selected-clear",
    acquisitionXpPolicy: "exclude-unpriced-extra",
    legs: [{ ...original.legs[0]!, id: "gnomeregan", stopId: "gnomeregan",
      from: 29, to: 31, questIds: [2945], actionIds: actions.map((action) => action.id) }],
    rewardFacts: [{ ...original.rewardFacts![0]!, questId: 2945, minimumLevel: 28 }],
  }, [], data, "test");
}

describe("selected Gnomeregan ring starter", () => {
  it("requires every player's ring before accepting and counts only the single hand-in", () => {
    const plan = ringPlan();
    const stock = plan.actions[0]!;
    expect(stock.itemCollections).toEqual([
      expect.objectContaining({ questId: 2945, itemId: 9326, quantity: 1 }),
    ]);
    expect(plan.actions[1]!.questChanges[0]).toMatchObject({ questId: 2945, state: "accepted" });
    for (const member of forecastCampaignXp(plan, progress(29))[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([2945]);
      expect(member.referenceQuestXp).toBe(100);
      expect(member.combatXp).toBe(0);
    }
    expect(createCampaignCombatReadiness(plan)(stock).targetLevel).toBe(29);
  });

  it("exports the ring acquisition before use and retains the cleaning fee instructions", () => {
    const plan = ringPlan();
    const addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0", runtimeBuild: 70450, interfaceVersion: 11508,
      restedXpVersion: "v4.11.27",
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      expect(text.match(/\.collect 9326,1,2945,1/g)).toHaveLength(1);
      expect(text.indexOf(".collect 9326,1,2945,1")).toBeLessThan(text.indexOf(".accept 2945"));
      expect(text).toContain("Each player pays 3 silver");
    }
  });
});

describe("retained dungeon item starters", () => {
  it("acquires one starter per player inside, before acceptance and the non-combat carry", () => {
    const plan = route(),
      data = dataset(),
      before = structuredClone({ plan, data });
    const result = attachCampaignCombat(plan, [], data, "test");
    const stock = result.actions[0]!;
    expect(stock.id).toBe(`${plan.actions[0]!.id}-starter`);
    expect(stock.location?.insideDungeon).toBe("excavation");
    expect(stock.questChanges).toEqual([]);
    expect(stock.itemCollections).toEqual([
      expect.objectContaining({ questId: 95810, itemId: 270865, quantity: 1, objectiveBitmask: 1 }),
    ]);
    expect(result.actions.slice(1)).toEqual(plan.actions);
    expect(result.legs[0]!.actionIds).toEqual(result.actions.map((action) => action.id));
    expect(result.combat!.activities).toEqual([]);
    expect(result.combat!.materialWork).toEqual([
      expect.objectContaining({
        actionId: stock.id,
        environment: "dungeon",
        targets: [
          expect.objectContaining({
            possibleDropNpcIds: [260326],
            objective: expect.objectContaining({
              requiredKills: null,
              credit: "personal-loot",
              loot: { itemId: 270865, quantity: 1, sharing: "unknown" },
            }),
          }),
        ],
      }),
    ]);
    expect({ plan, data }).toEqual(before);
    expect(attachCampaignCombat(result, [], data, "test")).toEqual(result);
  });

  it.each([24, 25])(
    "blocks a level-%s party before pickup, any reward, or acquisition XP",
    (level) => {
      const plan = compiled();
      for (const member of forecastCampaignXp(plan, progress(level))[0]!.members) {
        expect(member.blockedAtActionId).toBe(plan.actions[0]!.id);
        expect(member.checkpoints).toContainEqual(
          expect.objectContaining({ targetLevel: 26, ready: false }),
        );
        expect(member.rewards).toEqual([]);
        expect(member.combatXp).toBe(0);
      }
    },
  );

  it("permits the qualified +5 boss at 26 and carries the supplied follow-up relic without a refight", () => {
    const plan = compiled();
    expect(plan.itemRequirements?.map((row) => [row.questId, row.itemId, row.quantity])).toEqual([
      [95810, 270865, 1],
      [98824, 287959, 1],
    ]);
    const readiness = createCampaignCombatReadiness(plan);
    expect(readiness(plan.actions[0]!).targetLevel).toBe(26);
    expect(readiness(plan.actions[2]!).targetLevel).toBeNull();
    for (const member of forecastCampaignXp(plan, progress(26))[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([95810, 98824]);
      expect(member.referenceQuestXp).toBe(200);
      expect(member.combatXp).toBe(0);
      expect(member.combatRows).toEqual([]);
      expect(member.issues).toContainEqual(
        expect.objectContaining({ code: "item-acquisition-unqualified" }),
      );
    }
  });

  it("consumes the boss relic separately from the supplied follow-up, without inventing saved holdings", () => {
    const ledger = new CampaignItemLedger(indexCampaignItems(compiled().itemRequirements!), {
      "98824": "accepted",
    }, { "270865": 1 });
    expect(ledger.readyObjectives(95810)).toEqual([1]);
    expect(ledger.readyObjectives(98824)).toEqual([]);
    ledger.consume(95810);
    expect(ledger.snapshot()).toEqual({});
    expect(ledger.readyObjectives(98824)).toEqual([]);
    ledger.completeObjective(98824, 1);
    expect(ledger.snapshot()).toEqual({ "287959": 1 });
    ledger.consume(98824);
    expect(ledger.snapshot()).toEqual({});
  });

  it.each(["not-started", "accepted", "objectives-complete", "rewarded"] as const)(
    "does not refight a boss for a compatible already-held or finished starter (%s)",
    (state) => {
      const plan = compiled(),
        initial = progress(25);
      const saved: PremadeProgress = {
        ...initial,
        members: initial.members.map((member) => {
          const questStates = state === "not-started" ? {} : { "95810": state };
          return {
            ...member,
            questStates,
            itemHoldings: {
              revision: "campaign-items-v1",
              sourceBuild: 70205,
              raceId: member.raceId!,
              classSlug: member.classSlug,
              signature: campaignItemStateSignature(questStates, member.confirmations),
              minimums:
                state === "objectives-complete" || state === "rewarded" ? {} : { "270865": 1 },
            },
          };
        }),
      };
      for (const member of forecastCampaignXp(plan, saved)[0]!.members) {
        expect(member.blockedAtActionId).toBeNull();
        expect(member.rewards.map((reward) => reward.questId)).toEqual(
          state === "rewarded" ? [98824] : [95810, 98824],
        );
        expect(member.combatXp).toBe(0);
      }
    },
  );

  it("checks the missing starter for every party member, rejecting stale build holdings", () => {
    const plan = compiled(),
      initial = progress(25);
    const saved: PremadeProgress = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        questStates: { "95810": "accepted" },
        itemHoldings: {
          revision: "campaign-items-v1",
          sourceBuild: index === 4 ? 70450 : 70205,
          raceId: member.raceId!,
          classSlug: member.classSlug,
          signature: campaignItemStateSignature({ "95810": "accepted" }, member.confirmations),
          minimums: { "270865": 1 },
        },
      })),
    };
    expect(
      forecastCampaignXp(plan, saved)[0]!.members.every(
        (member) => member.blockedAtActionId === plan.actions[0]!.id,
      ),
    ).toBe(true);
  });

  it("exports a blocking collection before .accept, retaining all original quest phase IDs", () => {
    const plan = compiled();
    const addon = compileCampaignAddon(plan, plan.actions, {
      version: "0.1.0",
      runtimeBuild: 70450,
      interfaceVersion: 11508,
      restedXpVersion: "v4.11.27",
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents
        .filter((document) => document.role === role)
        .map((document) => document.content)
        .join("\n");
      expect(text.match(/\.collect 270865,1,95810,1/g)).toHaveLength(1);
      expect(text.indexOf(".collect 270865,1,95810,1")).toBeLessThan(text.indexOf(".accept 95810"));
      expect(text).toContain(
        "Use the Titan Relic dropped by the Relic Guardian inside Excavation Site: Wetlands.",
      );
      expect(addon.guides.find((guide) => guide.role === role)!.actionIds).toEqual(
        plan.actions.map((action) => action.id),
      );
    }
  });

  it.each([
    "name",
    "boss-build",
    "source-build",
    "visit",
    "starter-id",
    "quantity",
    "extra-objective",
    "changed-pickup",
    "changed-carry",
    "missing-pickup",
    "late-pickup",
    "intervening-consumption",
    "quantity-conflict",
  ])("does not waive the existing carry combat without complete matching evidence: %s", (kind) => {
    const data = dataset();
    let plan = attachCampaignCombat(route(), [], data, "test");
    plan = { ...plan, actions: plan.actions.filter((action) => !action.itemCollections?.length) };
    const quest = data.quests[0]!,
      item = quest.itemObjectives![0]!,
      boss = data.bossReferences![0]!;
    if (kind === "name") data.npcs[0]!.name = "Another guardian";
    else if (kind === "boss-build") data.bossReferences = [{ ...boss, targetBuild: 70450 }];
    else if (kind === "source-build")
      data.bossReferences = [{ ...boss, source: { ...boss.source, build: 70450 } }];
    else if (kind === "visit") data.bossReferences = [{ ...boss, dungeonVisitIds: ["dalaran"] }];
    else if (kind === "starter-id") quest.startItem = { ...quest.startItem!, itemId: 1 };
    else if (kind === "quantity") item.quantity = 2;
    else if (kind === "extra-objective")
      quest.itemObjectives = [item, { ...item, objectiveIndex: 2 }];
    else if (kind === "changed-pickup" || kind === "changed-carry") {
      const index = kind === "changed-pickup" ? 0 : 1;
      plan = {
        ...plan,
        actions: plan.actions.map((action, at) =>
          at === index ? { ...action, instructions: ["Collect some other item."] } : action,
        ),
      };
    } else if (kind === "missing-pickup") plan = { ...plan, actions: plan.actions.slice(1) };
    else if (kind === "late-pickup")
      plan = { ...plan, actions: [plan.actions[1]!, plan.actions[0]!, ...plan.actions.slice(2)] };
    else if (kind === "quantity-conflict")
      plan = {
        ...plan,
        itemRequirements: plan.itemRequirements!.map((row) =>
          row.questId === 95810 ? { ...row, quantity: null, conflict: true } : row,
        ),
      };
    else if (kind === "intervening-consumption")
      plan = {
        ...plan,
        itemRequirements: [
          ...plan.itemRequirements!,
          { questId: 10, itemId: 270865, objectiveIndex: 1, quantity: 1 },
        ],
        actions: [
          plan.actions[0]!,
          {
            ...plan.actions[2]!,
            id: "other-reward",
            questChanges: [
              { questId: 10, state: "rewarded", title: "Other quest", objectiveIndex: null },
            ],
          },
          ...plan.actions.slice(1),
        ],
      };
    const result = attachDungeonStarterWork(plan, data);
    expect(result.plan).toBe(plan);
    expect(result.work).toEqual([]);
    expect(result.retainedObjectiveKeys.size).toBe(0);
  });
});
