import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { isProvidedItemDelivery } from "./quest-catalog-delivery.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { promoteReadyCampaignVisit } from "./campaign-ready-visits.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { activeCampaignActions } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { attachCampaignMovements } from "./campaign-flow.js";

function fixture(
  extra = "",
  visitZone = "1429",
  npcTimer: string | null = null,
): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  combat: CombatDataset;
  catalog: QuestCatalog;
} {
  const guide = parseGuideChapter(
    `step\n.goto 1429,42,65\n.accept 400001\n.complete 400001,1\n.turnin 400001\nstep\n.goto 1429,43,66\n.accept 400002\n.complete 400002,1\n.accept 400003\nstep\n#requires OldRune\n.goto ${visitZone},42,65\n.target Apothecary\n.turnin 400002\n${npcTimer ?? ""}\n.accept 400004\n.turnin 400003\n${extra}\nstep\n.goto 1429,44,67\n.train 355`,
    "visits-test",
    "a".repeat(64),
    70205,
  );
  const actions: CampaignAction[] = guide.steps.map((step, index) => ({
    id: `visit-${index}`,
    legId: "starter",
    title: `Visit ${index}`,
    instructions: [`Visit ${index}`],
    questChanges: step.directives.flatMap((directive) => {
      if (
        directive.questId === null ||
        ![".accept", ".complete", ".turnin"].includes(directive.tag)
      )
        return [];
      return [
        {
          questId: directive.questId,
          title: `Quest ${directive.questId}`,
          state:
            directive.tag === ".accept"
              ? ("accepted" as const)
              : directive.tag === ".turnin"
                ? ("rewarded" as const)
                : ("objectives-complete" as const),
          objectiveIndex: directive.tag === ".complete" ? 1 : null,
        },
      ];
    }),
    positions: step.directives.flatMap((directive) =>
      directive.position
        ? [{ sourceLine: directive.sourceLine, position: directive.position }]
        : [],
    ),
    source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
    kind: "quests",
    leaderOnly: true,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  }));
  const gate: CampaignAction = {
    ...actions[0]!,
    id: "gate",
    kind: "xp-check",
    targetLevel: 2,
    questChanges: [],
    source: null,
  };
  actions.splice(2, 0, gate);
  const giver = {
    npcId: 234,
    name: "Apothecary",
    friendlyToAlliance: true,
    positions: [{ zone: visitZone, x: 42, y: 65 }],
  };
  const quests: QuestCatalogEntry[] = [400001, 400002, 400003, 400004].map((questId) => ({
    questId,
    title: `Quest ${questId}`,
    minimumLevel: 1,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [giver],
    ends: [giver],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "unsupported",
    objectives: [],
    unsupportedRequirements: [],
    ...(questId === 400003
      ? {
          category: "delivery" as const,
          providedItem: { itemId: 957, name: "William's Shipment" },
          unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"],
        }
      : {}),
  }));
  return {
    plan: {
      release: "ready-visits-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "starter",
          title: "Elwynn Forest",
          kind: "starter",
          from: 1,
          to: 3,
          actionIds: actions.map((action) => action.id),
          questIds: quests.map((quest) => quest.questId),
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      rewardFacts: quests.map((quest, index) => ({
        questId: quest.questId,
        fullXp: index === 0 ? 300 : 100,
        questLevel: 3,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-01T00:00:00.000Z",
      })),
    },
    sources: [{ reference: { ...CHAPTER_REFERENCES[0]!, condition: "" }, guide }],
    catalog: questCatalogSchema.parse({
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic regression fixture",
      providerRevision: "a".repeat(40),
      questSha256: "b".repeat(64),
      npcSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      areaMapSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
      includesAuthoredCorrections: false,
      quests,
    }),
    combat: {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic regression fixture",
      provider: {
        repository: "https://example.test/data",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "c".repeat(64),
        questSha256: "b".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic regression fixture"],
      },
      npcs: [],
      quests: [
        {
          questId: 400003,
          creatureIds: [],
          itemCreatureIds: [],
          objectiveText: ["Bring William's Shipment to Apothecary in the Trade District."],
          onlyCreatureObjectives: false,
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    },
  };
}

function promote(
  input: ReturnType<typeof fixture>,
  includeNpcDeliveries = false,
): CampaignPlan | null {
  const states = campaignFundingStates(input.plan);
  return promoteReadyCampaignVisit(
    input.plan,
    input.sources,
    input.combat,
    input.catalog,
    states,
    states[0]!,
    input.plan.actions[2]!,
    true,
    includeNpcDeliveries,
  );
}

describe("ready source NPC visits", () => {
  it("counts quest phases independently of zero-XP inventory transitions", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      itemRequirements: [{ questId: 400002, objectiveIndex: 1, itemId: 769, quantity: 1 }],
    };
    const result = promote(input);
    expect(result).not.toBeNull();
    expect(result!.actions.map((action) => action.id)).toEqual([
      "visit-0", "visit-1", "visit-2", "gate", "visit-3",
    ]);
    const player = campaignFundingStates(result!)[0]!.forecast[0]!.members[0]!;
    expect(player.endpoint).toEqual({ level: 2, currentXp: 100 });
    expect(player.rewards.filter((row) => row.questId === 400002)).toHaveLength(1);
  });

  it("moves a verified conversation only when enabled, retaining its source, training and one reward", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => {
        if (quest.questId !== 400003) return quest;
        const { providedItem: _providedItem, ...conversation } = quest;
        return { ...conversation, unsupportedRequirements: ["unresolved-objective-text"] };
      }),
    };
    input.combat.quests[0]!.objectiveText = ["Speak with Apothecary in the Trade District."];
    const before = JSON.stringify(input);
    expect(promote(input)).toBeNull();
    const result = promote(input, true)!;
    expect(result).not.toBeNull();
    expect(result.actions.map((action) => action.id)).toEqual([
      "visit-0",
      "visit-1",
      "visit-2",
      "gate",
      "visit-3",
    ]);
    expect(result.actions[2]).toEqual(input.plan.actions[3]);
    expect(result.actions.at(-1)).toEqual(input.plan.actions.at(-1));
    const forecast = campaignFundingStates(result)[0]!.forecast[0]!.members[0]!;
    expect(forecast.endpoint).toEqual({ level: 2, currentXp: 100 });
    expect(forecast.rewards.filter((reward) => reward.questId === 400003)).toHaveLength(1);
    expect(
      campaignNativeInstructions(
        result,
        input.sources,
      )(result.actions[2]!)?.directives.map((directive) => directive.tag),
    ).toEqual([".goto", ".target", ".turnin", ".accept", ".turnin"]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the full quest visit in place when the conversation names a different recipient", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => {
        if (quest.questId !== 400003) return quest;
        const { providedItem: _providedItem, ...conversation } = quest;
        return {
          ...conversation,
          ends: [...quest.ends, { ...quest.ends[0]!, npcId: 235, name: "Archivist" }],
          unsupportedRequirements: ["unresolved-objective-text"],
        };
      }),
    };
    input.combat.quests[0]!.objectiveText = ["Speak with Archivist in the Trade District."];
    expect(promote(input, true)).toBeNull();
  });

  it("does not return a provided parcel at a different NPC from the one named by its objective", () => {
    const input = fixture();
    const wrong = input.catalog.quests[2]!.ends[0]!;
    const actual = { ...wrong, npcId: 235, name: "Archivist" };
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) =>
        quest.questId === 400003 ? { ...quest, ends: [wrong, actual] } : quest,
      ),
    };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        objectiveText: ["Bring William's Shipment to Archivist in the Trade District."],
      })),
    };
    expect(promote(input)).toBeNull();
  });

  it("retains a short, plain NPC dialogue timer between its hand-in and follow-up pickup", () => {
    const input = fixture("", "1429", ".timer 9,Collecting Kelp RP");
    const result = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(result.actions.findIndex((action) => action.id === "visit-2")).toBeLessThan(
      result.actions.findIndex((action) => action.id === "gate"),
    );
    const native = campaignNativeInstructions(
      result,
      input.sources,
    )(result.actions.find((action) => action.id === "visit-2")!);
    expect(native?.directives.map((directive) => directive.tag)).toEqual([
      ".goto",
      ".target",
      ".turnin",
      ".timer",
      ".accept",
      ".turnin",
    ]);
    expect(native?.directives.find((directive) => directive.tag === ".timer")?.arguments).toBe(
      "9,Collecting Kelp RP",
    );
    expect(campaignFundingStates(result)[0]!.forecast[0]!.members[0]!.endpoint).toEqual({
      level: 2,
      currentXp: 100,
    });
  });

  it("keeps NPC dialogue waits out of the plain-visit pass", () => {
    const input = fixture("", "1429", ".timer 9,Collecting Kelp RP");
    const states = campaignFundingStates(input.plan);
    expect(
      promoteReadyCampaignVisit(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
        states,
        states[0]!,
        input.plan.actions[2]!,
        false,
      ),
    ).toBeNull();
    expect(promote(input)).not.toBeNull();
  });

  it.each([
    "0,RP",
    "-1,RP",
    "Infinity,RP",
    "61,RP",
    "9,RP,callback",
    "9,RP,callback,EVENT",
    "9",
    "invalid,RP",
  ])("holds unsupported NPC timer form: %s", (argumentsText) => {
    expect(promote(fixture("", "1429", `.timer ${argumentsText}`))).toBeNull();
  });

  it("holds a timer that is not between a hand-in and its next pickup", () => {
    expect(promote(fixture(".timer 9,Orphan timer"))).toBeNull();
  });

  it("rechecks pickup timing after a ready return unlocks independent work before class training", () => {
    const input = fixture();
    function task(
      id: string,
      questId: number,
      states: readonly ("accepted" | "objectives-complete" | "rewarded")[],
    ): CampaignAction {
      return {
        ...input.plan.actions[0]!,
        id,
        source: null,
        title: id,
        instructions: [id],
        questChanges: states.map((state) => ({
          questId,
          title: `Quest ${questId}`,
          state,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        })),
      };
    }
    const actions: readonly CampaignAction[] = [
      input.plan.actions[0]!,
      input.plan.actions[1]!,
      { ...input.plan.actions[2]!, targetLevel: 3, pickupQuestId: 400005 },
      task("class-pickup", 400005, ["accepted"]),
      input.plan.actions[3]!,
      task("independent", 400006, ["accepted", "objectives-complete", "rewarded"]),
      task("class-objective", 400005, ["objectives-complete"]),
      task("class-return", 400005, ["rewarded"]),
      input.plan.actions[4]!,
    ];
    input.plan = {
      ...input.plan,
      actions,
      legs: input.plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.map((action) => action.id),
        questIds: [...leg.questIds, 400005, 400006],
      })),
      rewardFacts: [
        ...input.plan.rewardFacts!,
        { ...input.plan.rewardFacts![0]!, questId: 400005, fullXp: 0, minimumLevel: 3 },
        { ...input.plan.rewardFacts![0]!, questId: 400006, fullXp: 900 },
      ],
    };
    const before = JSON.stringify(input);
    const result = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(result.actions.map((action) => action.id)).toEqual([
      "visit-0",
      "visit-1",
      "visit-2",
      "independent",
      "class-pickup",
      "class-objective",
      "class-return",
      "visit-3",
    ]);
    expect(result.bookmarkAliases?.gate).toBe("class-pickup");
    const member = campaignFundingStates(result)[0]!.forecast[0]!.members[0]!;
    expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
    expect(member.blockedReason).toBeNull();
    expect(member.rewards.filter((reward) => reward.questId === 400006)).toHaveLength(1);
    expect(result.actions.at(-1)).toEqual(input.plan.actions.at(-1));
    expect(JSON.stringify(input)).toBe(before);
  });

  it("collects completed work and a pickup-provided parcel before a level gate, preserving training and IDs", () => {
    const input = fixture(".link https://example.test/quest-help");
    const before = JSON.stringify(input);
    const result = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog);
    expect(result.actions.map((action) => action.id)).toEqual([
      "visit-0",
      "visit-1",
      "visit-2",
      "gate",
      "visit-3",
    ]);
    expect(result.actions.find((action) => action.id === "visit-2")).toEqual(input.plan.actions[3]);
    expect(result.actions.at(-1)).toEqual(input.plan.actions.at(-1));
    const forecast = campaignFundingStates(result)[0]!.forecast[0]!.members[0]!;
    expect(forecast.endpoint).toEqual({ level: 2, currentXp: 100 });
    expect(forecast.rewards.map((reward) => reward.questId)).toEqual([400001, 400002, 400003]);
    expect(forecast.checkpoints[0]?.ready).toBe(true);
    expect(result.questFunding?.addedQuestIds).toEqual([]);
    expect(
      campaignNativeInstructions(
        result,
        input.sources,
      )(result.actions[2]!)?.directives.map((directive) => directive.tag),
    ).toEqual([".goto", ".target", ".turnin", ".accept", ".turnin", ".link"]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([".train 355", ".use 957", ".isOnQuest 400002", ".hs", ".collect 957,1"])(
    "retains a visit with an unmodeled side effect or gate: %s",
    (command) => {
      expect(promote(fixture(command))).toBeNull();
    },
  );

  it("projects both the public road to a city delivery and the return to the original class training", () => {
    const input = fixture("", "1453");
    const promoted = promote(input)!;
    expect(promoted).not.toBeNull();
    const routed = attachCampaignMovements(
      attachCampaignLocations(promoted, input.sources),
      input.sources,
    );
    const actions = activeCampaignActions(routed, emptyPremadeProgress());
    expect(actions.find((action) => action.id === "visit-2")?.travelInstructions).toContain(
      "Follow the Goldshire road northwest through Stormwind's main gate.",
    );
    expect(actions.find((action) => action.id === "visit-3")?.travelInstructions).toContain(
      "Leave Stormwind through the main gate into Elwynn Forest.",
    );
    expect(
      campaignNativeInstructions(
        routed,
        input.sources,
      )(actions.find((action) => action.id === "visit-3")!)?.directives.some(
        (directive) => directive.tag === ".train",
      ),
    ).toBe(true);
  });

  it("cannot borrow an uncompleted collection, missing parcel identity or restricted follow-up", () => {
    for (const reason of [
      "incomplete",
      "unknown-item",
      "minimum",
      "prerequisite",
      "exclusive",
      "restricted",
      "recipient",
      "cross-leg",
      "unselected",
    ] as const) {
      const input = fixture();
      if (reason === "incomplete")
        input.plan = {
          ...input.plan,
          actions: input.plan.actions.map((action) =>
            action.id !== "visit-1"
              ? action
              : {
                  ...action,
                  questChanges: action.questChanges.filter(
                    (change) => change.state !== "objectives-complete",
                  ),
                },
          ),
        };
      if (reason === "cross-leg")
        input.plan = {
          ...input.plan,
          actions: input.plan.actions.map((action) =>
            action.id !== "visit-2" ? action : { ...action, legId: "other" },
          ),
        };
      if (reason === "unselected")
        input.plan = {
          ...input.plan,
          actions: input.plan.actions.map((action) =>
            action.id === "visit-2" ? { ...action, optionalForQuestIds: [400099] } : action,
          ),
        };
      input.catalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => {
          if (reason === "unknown-item" && quest.questId === 400003)
            return { ...quest, providedItem: undefined };
          if (reason === "recipient" && quest.questId === 400003)
            return {
              ...quest,
              ends: quest.ends.map((giver) => ({ ...giver, npcId: 235, name: "Another NPC" })),
            };
          if (quest.questId !== 400004) return quest;
          if (reason === "minimum") return { ...quest, minimumLevel: 3 };
          if (reason === "prerequisite")
            return { ...quest, prerequisites: { allOf: [400099], anyOf: [] } };
          if (reason === "exclusive") return { ...quest, exclusiveWith: [400001] };
          if (reason === "restricted") return { ...quest, requiredClasses: 1 };
          return quest;
        }),
      };
      expect(promote(input), reason).toBeNull();
    }
  });

  it("rejects provided-item references from another item export", () => {
    const input = fixture();
    expect(() =>
      fundCampaignQuestGaps(input.plan, input.sources, input.combat, {
        ...input.catalog,
        itemSha256: "a".repeat(64),
      }),
    ).toThrow("different item export");
  });

  it("does not move a follow-up earlier when another reachable party configuration cannot accept it", () => {
    const input = fixture();
    const otherStates = campaignFundingStates({
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === 400001 ? { ...fact, fullXp: 250 } : fact,
      ),
    });
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === 400001 ? { ...fact, fullXp: 500 } : fact,
      ),
    };
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) =>
        quest.questId === 400004 ? { ...quest, minimumLevel: 2 } : quest,
      ),
    };
    const states = campaignFundingStates(input.plan);
    const gate = input.plan.actions[2]!;
    expect(
      promoteReadyCampaignVisit(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
        states,
        states[0]!,
        gate,
      ),
    ).not.toBeNull();
    expect(
      promoteReadyCampaignVisit(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
        [...states, ...otherStates],
        states[0]!,
        gate,
      ),
    ).toBeNull();
  });

  it("uses XP earned earlier in the same NPC visit when checking a follow-up's minimum level", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) =>
        quest.questId === 400004 ? { ...quest, minimumLevel: 2 } : quest,
      ),
    };
    const result = promote(input);
    expect(result).not.toBeNull();
    const member = campaignFundingStates(result!)[0]!.forecast[0]!.members[0]!;
    const pickup = member.steps.find(
      (step) => step.questId === 400004 && step.phase === "accepted",
    );
    expect(pickup).toMatchObject({ before: { level: 2, currentXp: 0 }, status: "projected" });
    expect(result!.actions.map((action) => action.id)).toEqual([
      "visit-0", "visit-1", "visit-2", "gate", "visit-3",
    ]);
  });

  it("requires a literal single-parcel delivery objective rather than a key, item use, loot or exploration", () => {
    const input = fixture();
    const quest = input.catalog.quests[2]!;
    const reference = input.combat.quests[0]!;
    expect(isProvidedItemDelivery(quest, reference)).toBe(true);
    for (const objectiveText of [
      ["Use William's Shipment to summon Apothecary."],
      ["Bring Stolen Supplies to Apothecary."],
      ["Bring William's Shipment to Another NPC."],
      ["Bring William's Shipment to Apothecary in the Trade District and kill 5 spiders."],
      ["Bring William's Shipment to Apothecary.", "Kill 5 spiders."],
    ]) {
      expect(isProvidedItemDelivery(quest, { ...reference, objectiveText })).toBe(false);
    }
    expect(isProvidedItemDelivery(quest, { ...reference, creatureIds: [114] })).toBe(false);
    expect(
      isProvidedItemDelivery(
        { ...quest, unsupportedRequirements: ["exploration-trigger"] },
        reference,
      ),
    ).toBe(false);
  });
});
