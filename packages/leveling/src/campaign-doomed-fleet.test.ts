import { describe, expect, it } from "vitest";
import reviewed from "./fixtures/doomed-fleet-70205-70450.json" with { type: "json" };
import { attachDoomedFleetRoute } from "./campaign-doomed-fleet.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import { clientQuestRewardReferenceSchema } from "./quest-client-reward.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { compileCampaignAddon } from "./campaign-addon.js";

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
}

function fixture(): Fixture {
  const provider = reviewed.provider;
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: reviewed.targetBuild,
    publication: "private-reference",
    authorizationNote: "Reviewed fleet fixture",
    providerRevision: provider.revision,
    questSha256: provider.questSha256,
    npcSha256: provider.npcSha256,
    itemSha256: provider.itemSha256,
    objectSha256: provider.objectSha256,
    areaMapSha256: "a".repeat(64),
    sourceArchiveSha256: reviewed.sourceArchiveSha256,
    includesAuthoredCorrections: true,
    quests: reviewed.quests,
  });
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: reviewed.targetBuild,
    publication: "private-reference",
    authorizationNote: "Reviewed fleet fixture",
    provider,
    npcs: reviewed.npcs,
    quests: reviewed.references,
    lootDrops: reviewed.lootDrops,
    dungeons: [],
    killXpEvidence: [],
  });
  const anchors = [
    ["dungeon-excavation-deliveries", "dungeon-excavation", "1437"],
    ["lonebrow-rfk-preparation-brief", "lonebrow-rfk-preparation", "1437"],
    ["later-stormwind", "gnomeregan-approach", "1453"],
  ] as const;
  const actions = anchors.map(([id, legId, zone]): CampaignAction => ({
    id,
    legId,
    title: id,
    instructions: [id],
    questChanges: [],
    positions: [],
    source: null,
    kind: id === "later-stormwind" ? "quests" : "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    location: { zone },
  }));
  const plan: CampaignPlan = {
    release: "fleet-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: reviewed.targetBuild,
    sourceArchiveSha256: reviewed.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: reviewed.quests.map((quest) => quest.questId),
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      decisions: [],
      unresolvedPrerequisiteIds: [],
    },
    actions,
    legs: anchors.map(([, id]) => ({
      id,
      title: id,
      kind: "preparation",
      from: 26,
      to: 29,
      stopId: null,
      actionIds: actions.filter((action) => action.legId === id).map((action) => action.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
    rewardFacts: reviewed.rewardFacts.map((row): QuestRewardFact => ({
      questId: row.questId,
      fullXp: row.fullXp,
      questLevel: row.questLevel,
      minimumLevel: row.minimumLevel,
      xpByLevel: row.xpByLevel,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
      status: "available",
      evidenceKind: "client-table-reference",
      rewardBasis: "final-reward",
      referenceBaseXp: row.referenceBaseXp,
      clientReference: clientQuestRewardReferenceSchema.parse(row.clientReference),
    })),
  };
  return { plan, catalog, combat };
}

function party(level = 26): PremadeProgress {
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
      raceId: "human",
      classSlug: classes[index]!,
    })),
  };
}

function prepared(input: Fixture): CampaignPlan {
  return attachCampaignCombat(
    attachDoomedFleetRoute(input.plan, input.catalog, input.combat),
    [],
    input.combat,
    "fleet-test",
  );
}

describe("reviewed Doomed Fleet chain", () => {
  it("finishes the wrecks before outbound city returns and uses the actual Stormwind transit", () => {
    const input = fixture();
    const base = input.plan.actions[0]!;
    const extra = (id: string, zone: string, inside = false): CampaignAction => ({
      ...base,
      id,
      kind: "quests",
      location: inside ? { zone, insideDungeon: "excavation" } : { zone },
    });
    const inside = extra("inside-finish", "1437", true);
    const local = extra("local-rewards", "1437");
    const ironforge = extra("ironforge-prism", "1455");
    const lakeshire = extra("lakeshire-songblade", "1433");
    const { location: _summaryLocation, ...summary } = base;
    const actions = [inside, local, ironforge, lakeshire, summary, ...input.plan.actions.slice(1)];
    input.plan = {
      ...input.plan,
      actions,
      legs: input.plan.legs.map((leg) => ({
        ...leg,
        ...(leg.id === "dungeon-excavation"
          ? { kind: "dungeon" as const, stopId: "excavation" as const }
          : {}),
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    };
    const result = prepared(input),
      order = result.actions.map((action) => action.id);
    expect(order.indexOf("local-rewards")).toBeLessThan(order.indexOf("doomed-fleet-accept-288"));
    expect(order.indexOf("doomed-fleet-glorin")).toBeLessThan(order.indexOf("ironforge-prism"));
    expect(order.indexOf("ironforge-prism")).toBeLessThan(order.indexOf("doomed-fleet-benedictus"));
    expect(order.indexOf("doomed-fleet-benedictus")).toBeLessThan(
      order.indexOf("lakeshire-songblade"),
    );
    expect(result.actions.find((action) => action.id === "doomed-fleet-benedictus")!.legId).toBe(
      "dungeon-excavation",
    );
    const recipient = reviewed.quests.find((quest) => quest.questId === 293)!.ends[0]!
      .positions[0]!;
    expect(
      result.actions.find((action) => action.id === "doomed-fleet-benedictus")!.positions[0]!
        .position,
    ).toMatchObject(recipient);
    expect(result.combat!.activities).toHaveLength(2);
    expect(result.combat!.activities.every((activity) => activity.environment === "outdoor")).toBe(
      true,
    );
    expect(result.actions.filter((action) => !action.id.startsWith("doomed-fleet-"))).toEqual(
      actions,
    );
    const forecast = forecastCampaignXp(result, party());
    for (let index = 0; index < 5; index++) {
      const rows = forecast.map((section) => section.members[index]!);
      expect(rows.at(-1)!.blockedAtActionId).toBeNull();
      expect(
        rows
          .flatMap((section) => section.rewards)
          .filter((reward) => reward.questId === 293 && reward.xp !== null),
      ).toHaveLength(1);
    }
  });

  it.each(["1437", null])(
    "keeps the later fleet visit when an outstanding return has zone %s",
    (zone) => {
      const input = fixture(),
        base = input.plan.actions[0]!;
      const inside: CampaignAction = {
        ...base,
        id: "inside-finish",
        location: { zone: "1437", insideDungeon: "excavation" },
      };
      const remote: CampaignAction = {
        ...base,
        id: "remote-return",
        kind: "quests",
        location: { zone: "1455" },
      };
      const { location: _baseLocation, ...withoutLocation } = base;
      const unresolved: CampaignAction = {
        ...withoutLocation,
        id: "remaining-return",
        kind: "quests",
        questChanges: [
          { questId: 95809, title: "Return", state: "rewarded", objectiveIndex: null },
        ],
        ...(zone === null ? {} : { location: { zone } }),
      };
      const actions = [inside, remote, unresolved, ...input.plan.actions];
      input.plan = {
        ...input.plan,
        actions,
        legs: input.plan.legs.map((leg) => ({
          ...leg,
          ...(leg.id === "dungeon-excavation"
            ? { kind: "dungeon" as const, stopId: "excavation" as const }
            : {}),
          actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
        })),
      };
      const result = attachDoomedFleetRoute(input.plan, input.catalog, input.combat);
      const order = result.actions.map((action) => action.id);
      expect(order.indexOf("lonebrow-rfk-preparation-brief")).toBeLessThan(
        order.indexOf("doomed-fleet-accept-288"),
      );
      expect(result.actions.filter((action) => !action.id.startsWith("doomed-fleet-"))).toEqual(
        actions,
      );
    },
  );

  it("recognizes a real route through Stormwind without requiring a pre-existing city quest", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      actions: input.plan.actions.map((action) =>
        action.id === "later-stormwind"
          ? { ...action, id: "duskwood-next", location: { zone: "1431" } }
          : action,
      ),
    };
    const result = attachDoomedFleetRoute(input.plan, input.catalog, input.combat);
    const order = result.actions.map((action) => action.id);
    expect(order.indexOf("doomed-fleet-glorin")).toBeLessThan(
      order.indexOf("doomed-fleet-benedictus"),
    );
    expect(order.indexOf("doomed-fleet-benedictus")).toBeLessThan(order.indexOf("duskwood-next"));
    expect(
      result.actions.find((action) => action.id === "doomed-fleet-benedictus")!.instructions[0],
    ).toContain("passes through Stormwind");
  });

  it("rejects an outdoor override that contradicts an inside-dungeon location", () => {
    const input = fixture(),
      plan = attachDoomedFleetRoute(input.plan, input.catalog, input.combat);
    const wrong = {
      ...plan,
      actions: plan.actions.map((action) =>
        action.id === "doomed-fleet-crew"
          ? { ...action, location: { zone: "1437", insideDungeon: "excavation" } }
          : action,
      ),
    };
    expect(() => attachCampaignCombat(wrong, [], input.combat, "test")).toThrow(
      "Outdoor combat task has an inside-dungeon location",
    );
  });
  it("keeps every old task in order, all five lifecycles once, and the final delivery on the next real Stormwind visit", () => {
    const input = fixture(),
      before = JSON.stringify(input),
      plan = prepared(input);
    expect(plan.actions.filter((action) => !action.id.startsWith("doomed-fleet-"))).toEqual(
      input.plan.actions,
    );
    expect(plan.actions.filter((action) => action.id.startsWith("doomed-fleet-"))).toHaveLength(10);
    for (const id of [288, 289, 290, 292, 293]) {
      const phases = plan.actions.flatMap((action) =>
        action.questChanges.filter((change) => change.questId === id),
      );
      expect(phases.filter((change) => change.state === "accepted")).toHaveLength(1);
      expect(phases.filter((change) => change.state === "rewarded")).toHaveLength(1);
    }
    expect(plan.actions.find((action) => action.id === "doomed-fleet-benedictus")!.legId).toBe(
      "gnomeregan-approach",
    );
    for (const leg of plan.legs)
      expect(leg.actionIds).toEqual(
        plan.actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      );
    expect(JSON.stringify(input)).toBe(before);
    expect(attachDoomedFleetRoute(plan, input.catalog, input.combat)).toBe(plan);
  });

  it("retains both shared kill counters and one separate trophy, with no duplicate physical activities", () => {
    const plan = prepared(fixture());
    const crew = plan.combat!.activities.find(
      (activity) => activity.actionId === "doomed-fleet-crew",
    )!;
    expect(crew.environment).toBe("outdoor");
    expect(crew.questWide).toBe(true);
    expect(
      crew.objectives.map((objective) => [
        objective.objectiveIndex,
        objective.npcIds,
        objective.requiredKills,
        objective.credit,
      ]),
    ).toEqual([
      [1, [1157], 13, "shared-kills"],
      [2, [1158], 5, "shared-kills"],
      [3, [1159], null, "personal-loot"],
    ]);
    expect(crew.objectives[2]!.loot?.sharing).toBe("shared-roll");
    expect(
      plan.combat!.activities.some((activity) => activity.actionId === "doomed-fleet-buy-mead"),
    ).toBe(false);
    expect(
      plan
        .combat!.activities.flatMap((activity) => activity.objectives)
        .some((objective) => [288, 292, 293].includes(objective.questId)),
    ).toBe(false);
    expect(plan.combat!.activities).toHaveLength(2);
  });

  it("pays all five existing rewards only at reached hand-ins, including the later city delivery", () => {
    const plan = prepared(fixture()),
      forecast = forecastCampaignXp(plan, party());
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      expect(rows.at(-1)!.blockedAtActionId).toBeNull();
      const rewards = rows.flatMap((row) => row.rewards).filter((reward) => reward.xp !== null);
      expect(rewards.map((reward) => reward.questId)).toEqual([288, 289, 290, 292, 293]);
      expect(rewards.reduce((sum, reward) => sum + reward.xp!, 0)).toBe(6820);
      expect(
        rows.flatMap((row) => row.steps).find((step) => step.actionId === "doomed-fleet-buy-mead")!
          .combatXp,
      ).toBe(0);
    }
    const beforeCity = {
      ...plan,
      actions: plan.actions.filter((action) => action.id !== "doomed-fleet-benedictus"),
    };
    for (const section of forecastCampaignXp(beforeCity, party()))
      for (const row of section.members)
        expect(row.rewards.some((reward) => reward.questId === 293)).toBe(false);
    expect(
      auditCampaignQuestLog(plan, party()).every(
        (row) => row.withinCapacity && row.capacity === 40,
      ),
    ).toBe(true);
  });

  it("does not permit a level25 party to fight level30 Halyndor", () => {
    const forecast = forecastCampaignXp(prepared(fixture()), party(25));
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      expect(rows.find((row) => row.blockedAtActionId)!.blockedAtActionId).toBe(
        "doomed-fleet-halyndor",
      );
      expect(
        rows
          .flatMap((row) => row.rewards)
          .filter((reward) => reward.xp !== null)
          .map((reward) => reward.questId),
      ).toEqual([288, 289]);
    }
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports every counter and handoff exactly once for %s",
    (classSlug) => {
      const plan = prepared(fixture());
      const addon = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-fleet-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        includeObservers: false,
        partyStarter: { race: "human", classSlug },
      });
      const text = addon.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      for (const id of [288, 289, 290, 292, 293]) {
        expect(text.match(new RegExp(`\\.accept ${id}(?=\\D|$)`, "g"))).toHaveLength(1);
        expect(text.match(new RegExp(`\\.turnin ${id}(?=\\D|$)`, "g"))).toHaveLength(1);
      }
      for (const index of [1, 2, 3]) expect(text).toContain(`.complete 289,${index}`);
      expect(text).toContain("Ward of the Eye");
    },
  );

  it.each([
    "missing-quest",
    "changed-counter",
    "changed-npc",
    "changed-vendor",
    "missing-reward",
    "partial-chain",
    "missing-stormwind",
    "missing-excavation",
  ])("does not insert an incomplete or incompatible method: %s", (kind) => {
    const input = fixture();
    if (kind === "missing-quest") input.catalog.quests.pop();
    if (kind === "changed-counter")
      input.combat.quests.find((quest) => quest.questId === 289)!.killQuotas![0]!.kills = 14;
    if (kind === "changed-npc") input.combat.npcs[0]!.maximumLevel = 40;
    if (kind === "changed-vendor")
      input.combat.quests.find(
        (quest) => quest.questId === 288,
      )!.itemObjectives![0]!.vendorEvidence!.npcIds = [999];
    if (kind === "missing-reward") input.plan = { ...input.plan, rewardFacts: [] };
    if (kind === "partial-chain")
      input.plan = {
        ...input.plan,
        actions: [
          ...input.plan.actions,
          {
            ...input.plan.actions[0]!,
            id: "existing-fleet",
            questChanges: [
              { questId: 288, state: "accepted", title: "The Third Fleet", objectiveIndex: null },
            ],
          },
        ],
      };
    if (kind === "missing-stormwind")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.filter((action) => action.id !== "later-stormwind"),
      };
    if (kind === "missing-excavation")
      input.plan = { ...input.plan, actions: input.plan.actions.slice(1) };
    expect(attachDoomedFleetRoute(input.plan, input.catalog, input.combat)).toBe(input.plan);
  });
});
