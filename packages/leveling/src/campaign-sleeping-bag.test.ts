import { describe, expect, it } from "vitest";
import captured from "./fixtures/sleeping-bag-70205-70450.json" with { type: "json" };
import timed from "./fixtures/quest-client-timing-70205-70450.json" with { type: "json" };
import { attachSleepingBagRoute } from "./campaign-sleeping-bag.js";
import { SLEEPING_BAG_QUESTS } from "./sleeping-bag-reference.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { clientQuestRewardReferenceSchema } from "./quest-client-reward.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { campaignTimedQuestMethodIssues } from "./campaign-quest-timing.js";

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
}

function fixture(): Fixture {
  const catalog = questCatalogSchema.parse(structuredClone(captured.catalog));
  const anchors = [
    ["westfall", "eastern-deadmines-preparation", "1436"],
    ["stonetalon-arrival", "ashenvale-crossing", "1442"],
    ["stonetalon-return", "ashenvale-crossing", "1442"],
    ["wetlands", "excavation-approach", "1437"],
    ["hillsbrad", "dalaran-approach", "1424"],
  ] as const;
  const actions = anchors.map(([id, legId, zone]): CampaignAction => ({
    id,
    legId,
    title: id,
    instructions: [id],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    location: { zone },
  }));
  const facts = captured.rewardFacts.map((row): QuestRewardFact => ({
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
  }));
  return {
    catalog,
    plan: {
      release: "sleeping-bag-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: catalog.sourceArchiveSha256,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: SLEEPING_BAG_QUESTS.map((quest) => quest.questId),
      partyPolicy: {
        revision: "five-player-kill-first-20261102-v9",
        partySize: 5,
        decisions: [],
        unresolvedPrerequisiteIds: [],
      },
      actions,
      legs: [...new Set(actions.map((entry) => entry.legId))].map((id) => ({
        id,
        title: id,
        kind: "preparation",
        from: 14,
        to: 32,
        stopId: null,
        actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
        questIds: [],
        unresolvedQuestIds: [],
      })),
      rewardFacts: facts,
    },
  };
}

function party(level = 14): PremadeProgress {
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      raceId: "human",
      classSlug: classes[index]!,
      level,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("complete sleeping-bag object route", () => {
  it("finishes an active timed delivery before taking the wall detour on the same visit", () => {
    const { plan, catalog } = fixture();
    const attached = attachSleepingBagRoute(plan, catalog);
    const dam = attached.actions.findIndex((entry) => entry.id === "sleeping-bag-dam");
    const deadline = questCatalogSchema.parse({
      ...catalog,
      quests: [
        ...catalog.quests,
        { ...timed.catalog.quests.find((quest) => quest.questId === 647)!, timeLimitSeconds: 900 },
      ],
    });
    const courier = (["accepted", "rewarded"] as const).map((state, index): CampaignAction => ({
      ...plan.actions[0]!,
      id: `courier-${state}`,
      legId: "excavation-approach",
      kind: "quests",
      location: { zone: index === 0 ? "1417" : "1424" },
      questChanges: [{ questId: 647, title: "MacKreel's Moonshine", state, objectiveIndex: null }],
    }));
    const tested = {
      ...attached,
      actions: [
        ...attached.actions.slice(0, dam + 1),
        ...courier,
        ...attached.actions.slice(dam + 1),
      ],
    };
    const result = attachSleepingBagRoute(tested, deadline);
    const wall = result.actions.findIndex((entry) => entry.id === "sleeping-bag-wall");
    expect(wall).toBe(result.actions.indexOf(courier[1]!) + 1);
    expect(
      campaignTimedQuestMethodIssues(result.actions, [
        { questId: 647, title: "MacKreel's Moonshine", timeLimitSeconds: 900 },
      ]).size,
    ).toBe(0);
    expect(attachSleepingBagRoute(result, deadline)).toBe(result);
  });

  it("finishes at the first actual Hillsbrad quest visit after the dam, preserving every phase and bookmark", () => {
    const { plan: original, catalog } = fixture();
    const attached = attachSleepingBagRoute(original, catalog);
    const dam = attached.actions.findIndex((entry) => entry.id === "sleeping-bag-dam");
    const early: CampaignAction = {
      ...original.actions[0]!,
      id: "earlier-hillsbrad",
      legId: "excavation-approach",
      kind: "quests",
      location: { zone: "1424" },
      questChanges: [
        { questId: 536, title: "Down the Coast", state: "accepted", objectiveIndex: null },
      ],
    };
    const actions = [
      ...attached.actions.slice(0, dam + 1),
      early,
      ...attached.actions.slice(dam + 1),
    ];
    const plan = { ...attached, actions };
    const before = structuredClone(plan);
    const result = attachSleepingBagRoute(plan, catalog);
    const wall = result.actions.find((entry) => entry.id === "sleeping-bag-wall")!;
    expect(result.actions.indexOf(wall)).toBe(result.actions.indexOf(early) - 1);
    expect(wall.legId).toBe(early.legId);
    expect({ ...wall, legId: "dalaran-approach" }).toEqual(
      attached.actions.find((entry) => entry.id === wall.id),
    );
    expect(result.actions.filter((entry) => entry.id !== wall.id)).toEqual(
      plan.actions.filter((entry) => entry.id !== wall.id),
    );
    expect(result.actions.filter((entry) => entry.id === wall.id)).toHaveLength(1);
    expect(result.legs.find((leg) => leg.id === "dalaran-approach")!.questIds).not.toContain(79976);
    expect(result.legs.find((leg) => leg.id === early.legId)!.questIds).toContain(79976);
    expect(attachSleepingBagRoute(result, catalog)).toBe(result);
    expect(plan).toEqual(before);
  });

  it.each(["before-dam", "inside-dungeon", "optional", "personal", "position-conflict"])(
    "keeps the wall later when the apparent early visit is %s",
    (kind) => {
      const { plan, catalog } = fixture();
      const attached = attachSleepingBagRoute(plan, catalog);
      const dam = attached.actions.findIndex((entry) => entry.id === "sleeping-bag-dam");
      const { location: _location, ...base } = plan.actions[0]!;
      const visit: CampaignAction = {
        ...base,
        id: "ineligible-hillsbrad",
        legId: "excavation-approach",
        kind: "quests",
        questChanges: [
          { questId: 536, title: "Down the Coast", state: "accepted", objectiveIndex: null },
        ],
        ...(kind === "position-conflict"
          ? {
              positions: ["1424", "1417"].map((zone) => ({
                sourceLine: 1,
                position: { zone, x: 50, y: 50, floor: null, space: "map-percent" as const },
              })),
            }
          : {
              location: {
                zone: "1424",
                ...(kind === "inside-dungeon" ? { insideDungeon: "city-of-dalaran" } : {}),
              },
            }),
        ...(kind === "optional" ? { xpOptional: true } : {}),
        ...(kind === "personal" ? { leaderOnly: true } : {}),
      };
      const at = kind === "before-dam" ? dam : dam + 1;
      const tested = {
        ...attached,
        actions: [...attached.actions.slice(0, at), visit, ...attached.actions.slice(at)],
      };
      expect(attachSleepingBagRoute(tested, catalog)).toBe(tested);
    },
  );

  it("uses unambiguous captured positions before moved phases receive location labels", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map(({ location, ...entry }) => ({
        ...entry,
        positions: [
          {
            sourceLine: 1,
            position: { zone: location!.zone, x: 50, y: 50, floor: 0, space: "world" },
          },
        ],
      })),
    };
    const result = attachSleepingBagRoute(plan, input.catalog);
    expect(result.actions.filter((entry) => entry.id.startsWith("sleeping-bag-"))).toHaveLength(7);
    expect(result.actions.filter((entry) => !entry.id.startsWith("sleeping-bag-"))).toEqual(
      plan.actions,
    );
  });

  it("refuses an unlabeled cross-zone source phase as a regional anchor", () => {
    const input = fixture();
    const plan: CampaignPlan = {
      ...input.plan,
      actions: input.plan.actions.map(({ location, ...entry }) => ({
        ...entry,
        positions: [location!.zone, "1453"].map((zone) => ({
          sourceLine: 1,
          position: { zone, x: 50, y: 50, floor: 0, space: "world" },
        })),
      })),
    };
    expect(attachSleepingBagRoute(plan, input.catalog)).toBe(plan);
  });

  it("keeps all old actions in order and emits each full quest lifecycle on the existing regional visit", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = attachSleepingBagRoute(input.plan, input.catalog);
    expect(result.actions.filter((entry) => !entry.id.startsWith("sleeping-bag-"))).toEqual(
      input.plan.actions,
    );
    expect(result.actions.filter((entry) => entry.id.startsWith("sleeping-bag-"))).toHaveLength(7);
    for (const quest of SLEEPING_BAG_QUESTS) {
      expect(
        result.actions
          .flatMap((entry) =>
            entry.questChanges.filter((change) => change.questId === quest.questId),
          )
          .map((change) => change.state),
      ).toEqual(["accepted", "rewarded"]);
    }
    expect(result.actions.findIndex((entry) => entry.id === "sleeping-bag-barrens")).toBeLessThan(
      result.actions.findIndex((entry) => entry.id === "stonetalon-arrival"),
    );
    expect(
      result.actions.findIndex((entry) => entry.id === "sleeping-bag-camp-trail"),
    ).toBeGreaterThan(result.actions.findIndex((entry) => entry.id === "stonetalon-return"));
    expect(result.actions.find((entry) => entry.id === "sleeping-bag-dam")!.legId).toBe(
      "excavation-approach",
    );
    expect(result.actions.find((entry) => entry.id === "sleeping-bag-wall")!.legId).toBe(
      "dalaran-approach",
    );
    for (const leg of result.legs)
      expect(leg.actionIds).toEqual(
        result.actions.filter((entry) => entry.legId === leg.id).map((entry) => entry.id),
      );
    expect(JSON.stringify(input)).toBe(before);
    expect(attachSleepingBagRoute(result, input.catalog)).toBe(result);
  });

  it("pays 10,950 reference quest XP once per player at the actual hand-ins, with no combat or buff bonus", () => {
    const input = fixture(),
      plan = attachSleepingBagRoute(input.plan, input.catalog);
    const forecast = forecastCampaignXp(plan, party());
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      expect(rows.at(-1)!.blockedAtActionId).toBeNull();
      const rewards = rows.flatMap((row) => row.rewards).filter((row) => row.xp !== null);
      expect(rewards.map((row) => row.questId)).toEqual(
        SLEEPING_BAG_QUESTS.map((quest) => quest.questId),
      );
      expect(rewards.reduce((sum, row) => sum + row.xp!, 0)).toBe(10950);
      expect(rows.reduce((sum, row) => sum + row.combatXp, 0)).toBe(0);
      const pickup = rows
        .flatMap((row) => row.steps)
        .find((step) => step.actionId === "sleeping-bag-westfall")!;
      expect(pickup.questXp).toBe(0);
    }
    const capacity = auditCampaignQuestLog(plan, party());
    expect(capacity.every((row) => row.withinCapacity && row.capacity === 40)).toBe(true);
  });

  it("does not bypass level 14 or award any later hand-ins to a level-13 party", () => {
    const input = fixture(),
      plan = attachSleepingBagRoute(input.plan, input.catalog);
    const forecast = forecastCampaignXp(plan, party(13));
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      expect(rows.find((row) => row.blockedAtActionId)!.blockedAtActionId).toBe(
        "sleeping-bag-westfall",
      );
      expect(rows.flatMap((row) => row.rewards).filter((row) => row.xp !== null)).toHaveLength(0);
    }
  });

  it("keeps reduced rewards at late hand-ins rather than promising the full chain total", () => {
    const input = fixture(),
      plan = attachSleepingBagRoute(input.plan, input.catalog);
    const forecast = forecastCampaignXp(plan, party(32));
    const rewards = forecast
      .flatMap((section) => section.members[0]!.rewards)
      .filter((row) => row.xp !== null);
    expect(rewards[0]!.xp).toBe(180);
    expect(rewards.reduce((sum, row) => sum + row.xp!, 0)).toBeLessThan(10950);
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports all six accepts and returns once for %s without class detours or fabricated combat",
    (classSlug) => {
      const input = fixture(),
        plan = attachSleepingBagRoute(input.plan, input.catalog);
      const compiled = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-sleeping-bag-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        includeObservers: false,
        partyStarter: { race: "human", classSlug },
      });
      const text = compiled.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      for (const quest of SLEEPING_BAG_QUESTS)
        for (const tag of ["accept", "turnin"])
          expect([
            ...text.matchAll(new RegExp("\\." + tag + " " + quest.questId + "\\b", "g")),
          ]).toHaveLength(1);
      expect(text).not.toMatch(/\.complete (?:79008|79192|79980|79974|79975|79976)\b/);
      expect(text).not.toMatch(/\.use\b/);
    },
  );

  it.each([
    "missing-quest",
    "missing-reward",
    "class",
    "race",
    "parent",
    "hold",
    "level",
    "region",
    "partial",
  ])("does not install a partial or incompatible route (%s)", (change) => {
    const input = fixture();
    if (change === "missing-quest") input.catalog.quests = input.catalog.quests.slice(1);
    if (change === "missing-reward")
      input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(1) };
    if (change === "class") input.catalog.quests[0]!.requiredClasses = 1;
    if (change === "race") input.catalog.quests[0]!.requiredRaces = 2;
    if (change === "parent") input.catalog.quests[1]!.prerequisites.allOf = [];
    if (change === "hold")
      input.catalog.quests[0]!.unsupportedRequirements.push("unknown-requirement");
    if (change === "level") input.catalog.quests[0]!.minimumLevel = 15;
    if (change === "region")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.filter((entry) => entry.id !== "hillsbrad"),
      };
    if (change === "partial")
      input.plan = {
        ...input.plan,
        actions: [
          ...input.plan.actions,
          {
            ...input.plan.actions[0]!,
            id: "existing-note",
            questChanges: [
              { questId: 79008, title: "note", state: "accepted", objectiveIndex: null },
            ],
          },
        ],
      };
    expect(attachSleepingBagRoute(input.plan, input.catalog)).toBe(input.plan);
  });

  it("retains the original scope for other editions and rejects foreign inputs", () => {
    const input = fixture();
    const { sharedQuestsOnly: _shared, ...solo } = input.plan;
    expect(attachSleepingBagRoute(solo, input.catalog)).toBe(solo);
    const dwarf = { ...input.plan, race: "dwarf" as const };
    expect(attachSleepingBagRoute(dwarf, input.catalog)).toBe(dwarf);
    expect(() =>
      attachSleepingBagRoute(input.plan, { ...input.catalog, targetBuild: 70450 }),
    ).toThrow(/differ/);
  });
});
