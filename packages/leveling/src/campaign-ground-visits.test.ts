import { describe, expect, it } from "vitest";
import { offerCampaignGroundVisits } from "./campaign-ground-visits.js";
import type { CampaignAction, CampaignLeg, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { compileCampaignAddon } from "./campaign-addon.js";

const city = { zone: "1453", x: 40, y: 40 };
const field = { zone: "1436", x: 36, y: 54 };
const archive = "a".repeat(64);
const ground = {
  questId: 399,
  itemId: 2998,
  objectiveIndex: 1 as const,
  objectId: 1166,
  objectName: "Test compass chest",
  positions: [field],
  sourceArchiveSha256: archive,
  source: { chapterId: "ground-source", version: "v1", stepId: "step-1" },
};

function action(id: string, legId: string, zone = city.zone): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    positions: [
      { sourceLine: 0, position: { zone, x: 40, y: 40, floor: null, space: "map-percent" } },
    ],
    questChanges: [],
    kind: "instructions",
    source: null,
    leaderOnly: legId === "starter",
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
  };
}

function fixture(): { plan: CampaignPlan; combat: CombatDataset; catalog: QuestCatalog } {
  const boost: CampaignAction = {
    ...action("starter-boost", "starter"),
    kind: "quests",
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 320010,
      title: "Starter reward",
      state,
      objectiveIndex: null,
    })),
  };
  const visitIds = [
    "start-117-117-source-step-0076",
    "start-117-117-source-step-0084",
    "start-116-116-source-step-0242",
  ];
  const visits = visitIds.map((id, index): CampaignAction => ({
    ...action(id, "starter"),
    ...(index
      ? {
          movement: {
            kind: "flight",
            destination: index === 1 ? field.zone : city.zone,
            terminal: false,
          },
        }
      : {}),
  }));
  const later = (["accepted", "objectives-complete", "rewarded"] as const).map(
    (state, index): CampaignAction => ({
      ...action(`later-compass-${state}`, "prepare"),
      kind: "quests",
      questChanges: [
        { questId: 399, title: "Humble Beginnings", state, objectiveIndex: index === 1 ? 1 : null },
      ],
      positions: [
        {
          sourceLine: 0,
          position: { ...(index === 1 ? field : city), floor: null, space: "map-percent" },
        },
      ],
      libraryQuestId: 399,
      libraryObjective: "interaction",
      fundingCheckpointId: "later-gate",
      xpOptional: true,
      xpTargetLevel: 18,
    }),
  );
  const gate: CampaignAction = {
    ...action("early-party-kills-departure-level-14-before-thanes", "prepare"),
    kind: "xp-check",
    targetLevel: 14,
  };
  const actions = [boost, ...visits, ...later, gate];
  const giver = { npcId: 234, name: "Cartographer", friendlyToAlliance: true, positions: [city] };
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    providerRevision: "b".repeat(40),
    questSha256: "c".repeat(64),
    npcSha256: "d".repeat(64),
    itemSha256: "e".repeat(64),
    objectSha256: "f".repeat(64),
    areaMapSha256: "0".repeat(64),
    sourceArchiveSha256: archive,
    includesAuthoredCorrections: true,
    quests: [
      {
        questId: 399,
        title: "Humble Beginnings",
        minimumLevel: 2,
        questLevel: 14,
        requiredRaces: 0,
        requiredClasses: 0,
        starts: [giver],
        ends: [giver],
        prerequisites: { allOf: [], anyOf: [] },
        exclusiveWith: [],
        category: "unsupported",
        objectives: [],
        unsupportedRequirements: [],
        groundPickup: ground,
      },
    ],
  });
  const combat = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256,
      objectSha256: catalog.objectSha256,
      limitations: ["Synthetic fixture"],
    },
    questCatalogReference: {
      sha256: "0".repeat(64),
      providerRevision: catalog.providerRevision,
      sourceArchiveSha256: archive,
    },
    npcs: [],
    quests: [
      {
        questId: 399,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: ["Open the compass chest and return to the cartographer."],
        onlyCreatureObjectives: false,
        onlyInteractionObjectives: false,
        requiredClasses: 0,
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 2998,
            itemName: "Compass",
            quantity: 1,
            npcIds: [],
            sharing: "pooled",
            groundPickup: ground,
          },
        ],
      },
    ],
    dungeons: [],
    lootDrops: [],
    killXpEvidence: [],
  });
  const plan: CampaignPlan = {
    release: "ground-visit-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: archive,
    actions,
    legs: ["starter", "prepare"].map((id): CampaignLeg => ({
      id,
      title: id,
      kind: id === "starter" ? "starter" : "preparation",
      from: 1,
      to: 14,
      stopId: null,
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
      questIds: id === "starter" ? [320010] : [399],
      unresolvedQuestIds: [],
    })),
    rewardFacts: [
      {
        questId: 320010,
        fullXp: 1500,
        questLevel: 14,
        minimumLevel: 1,
        xpByLevel: [],
        sourceUrl: "https://example.test/boost",
        capturedAt: "2026-11-02T00:00:00.000Z",
        status: "available",
      },
      {
        questId: 399,
        fullXp: 1000,
        questLevel: 14,
        minimumLevel: 2,
        xpByLevel: [],
        sourceUrl: "https://example.test/compass",
        capturedAt: "2026-11-02T00:00:00.000Z",
        status: "available",
      },
    ],
  };
  return { plan: attachCampaignCombat(plan, [], combat, "test-reference"), combat, catalog };
}

function offer(input: ReturnType<typeof fixture>): CampaignPlan {
  return offerCampaignGroundVisits(input.plan, [], input.combat, input.catalog);
}

describe("earlier ground-pickup visits", () => {
  it("preserves one reward per player and the later fallback in both starter modes", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const proposed = offer(input);
    expect(proposed).not.toBe(input.plan);
    expect(JSON.stringify(input)).toBe(before);
    expect(proposed.actions.filter((entry) => entry.libraryQuestId === 399)).toHaveLength(6);
    for (const starterMode of ["separate", "together"] as const) {
      const forecast = forecastCampaignGuide(proposed, emptyPremadeProgress(), { starterMode });
      for (let player = 0; player < 5; player++) {
        const rewards = forecast.sections
          .flatMap((section) => section.forecast.members[player]!.rewards)
          .filter((reward) => reward.questId === 399 && (reward.xp ?? 0) > 0);
        expect(rewards).toHaveLength(1);
        expect(rewards[0]!.xp).toBe(1000);
      }
    }
    expect(offerCampaignGroundVisits(proposed, [], input.combat, input.catalog)).toBe(proposed);
  });

  it("keeps both native opportunities for the leader and same-edition member", () => {
    const proposed = offer(fixture());
    const addon = compileCampaignAddon(proposed, proposed.actions, {
      version: "0.2.0-ground-check",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      partyStarter: { race: "human", classSlug: "warrior" },
    });
    for (const role of ["leader", "party"] as const) {
      const guide = addon.guides.find((entry) => entry.role === role)!;
      expect(
        guide.actionIds.filter((id) => id.includes("compass") || id.includes("starter-ground-399")),
      ).toHaveLength(6);
    }
    expect(addon.lua).toContain(".isQuestAvailable 399");
    expect(addon.lua).toContain(".isOnQuest 399");
  });

  it("retains the later reward when the early optional opportunity is skipped", () => {
    const proposed = offer(fixture());
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        level: 14,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const forecast = forecastCampaignGuide(proposed, progress);
    for (let player = 0; player < 5; player++) {
      const steps = forecast.sections.flatMap((section) => section.forecast.members[player]!.steps);
      const reward = steps.filter(
        (step) => step.questId === 399 && step.phase === "rewarded" && step.questXp > 0,
      );
      expect(reward).toHaveLength(1);
      expect(reward[0]!.actionId).toBe("later-compass-rewarded");
    }
  });

  it("keeps the shared fallback for a member on a different personal starter", () => {
    const input = fixture();
    const other: CampaignAction = {
      ...input.plan.actions[0]!,
      id: "other-starter-boost",
      legId: "other-starter",
    };
    input.plan = {
      ...input.plan,
      starters: {
        entries: [{ action: other, activities: [] }],
        routes: [
          {
            race: "dwarf",
            classSlug: "priest",
            actionIndexes: [0],
            legs: [
              {
                id: "other-starter",
                title: "Dwarf starter",
                kind: "starter",
                from: 1,
                to: 3,
                stopId: null,
                actionIds: [other.id],
                questIds: [320010],
                unresolvedQuestIds: [],
              },
            ],
          },
        ],
      },
    };
    const proposed = offer(input);
    expect(proposed).not.toBe(input.plan);
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member, index) =>
        index === 0
          ? member
          : { ...member, raceId: "dwarf" as const, classSlug: "priest" as const },
      ),
    };
    const forecast = forecastCampaignGuide(proposed, progress);
    const memberSteps = forecast.sections.flatMap((section) => section.forecast.members[1]!.steps);
    const rewards = memberSteps.filter(
      (step) => step.questId === 399 && step.phase === "rewarded" && step.questXp > 0,
    );
    expect(rewards).toHaveLength(1);
    expect(rewards[0]!.actionId).toBe("later-compass-rewarded");
    const addon = compileCampaignAddon(proposed, proposed.actions, {
      version: "0.2.0-ground-check",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      partyStarter: { race: "dwarf", classSlug: "priest" },
    });
    const party = addon.guides.find((guide) => guide.role === "party")!;
    expect(party.actionIds).toContain("later-compass-rewarded");
    expect(party.actionIds.some((id) => id.includes("starter-ground-399"))).toBe(false);
  });

  it("leaves the original route when an earlier pickup would create a forty-first quest", () => {
    const input = fixture();
    const held = Array.from({ length: 40 }, (_, index): CampaignAction => ({
      ...action(`held-${index}`, "starter"),
      kind: "quests",
      questChanges: [
        {
          questId: 330000 + index,
          title: "Carried quest",
          state: "accepted",
          objectiveIndex: null,
        },
      ],
    }));
    const reward: CampaignQuestChange = { ...held[0]!.questChanges[0]!, state: "rewarded" };
    const handIn: CampaignAction = {
      ...action("free-one-slot", "starter"),
      kind: "quests",
      questChanges: [reward],
    };
    input.plan = {
      ...input.plan,
      actions: [
        input.plan.actions[0]!,
        ...held,
        ...input.plan.actions.slice(1, 3),
        handIn,
        ...input.plan.actions.slice(3),
      ],
      rewardFacts: [
        ...input.plan.rewardFacts!,
        {
          questId: 330000,
          fullXp: 0,
          questLevel: 14,
          minimumLevel: 1,
          xpByLevel: [],
          sourceUrl: "https://example.test/zero",
          capturedAt: "2026-11-02T00:00:00.000Z",
          status: "available",
        },
      ],
    };
    const party = guidePartyScenario(input.plan, emptyPremadeProgress(), "together");
    expect(
      auditCampaignQuestLog(party.plan, party.progress, party).every(
        (member) => member.withinCapacity,
      ),
    ).toBe(true);
    expect(offer(input)).toBe(input.plan);
  });

  it("requires the real pickup level at the earlier visit", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({ ...quest, minimumLevel: 10 })),
    };
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === 399 ? { ...fact, minimumLevel: 10 } : fact,
      ),
    };
    expect(offer(input)).toBe(input.plan);
  });

  it("rejects mismatched evidence, a wrong destination and an unsupported lifecycle", () => {
    const mismatched = fixture();
    mismatched.catalog = { ...mismatched.catalog, objectSha256: "9".repeat(64) };
    expect(offer(mismatched)).toBe(mismatched.plan);
    const destination = fixture();
    destination.plan = {
      ...destination.plan,
      actions: destination.plan.actions.map((entry) =>
        entry.id === "start-117-117-source-step-0084"
          ? { ...entry, movement: { kind: "flight", destination: "1439", terminal: false } }
          : entry,
      ),
    };
    expect(offer(destination)).toBe(destination.plan);
    const source = fixture();
    source.plan = {
      ...source.plan,
      actions: source.plan.actions.map((entry) =>
        entry.libraryQuestId === 399
          ? { ...entry, source: { chapterId: "test", version: "v1", stepId: "step-1" } }
          : entry,
      ),
    };
    expect(offer(source)).toBe(source.plan);
  });
});
