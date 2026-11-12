import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { providedDeliveryFundingCatalog } from "./campaign-funding-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";

const position = { zone: "1429", x: 50, y: 50 };
const origin = {
  npcId: 234,
  name: "Town Messenger",
  friendlyToAlliance: true,
  positions: [position],
};
const recipient = {
  npcId: 235,
  name: "Archivist",
  friendlyToAlliance: true,
  positions: [{ ...position, x: 52 }],
};

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const parcel: QuestCatalogEntry = {
    questId: 310002,
    title: "Deliver the town records",
    minimumLevel: 1,
    questLevel: 3,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    providedItem: { itemId: 957, name: "A Sealed Parcel" },
    starts: [origin],
    ends: [
      { ...origin, npcId: 236, name: "Merchant", positions: [{ ...position, x: 50.1 }] },
      recipient,
    ],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"],
  };
  const base: CampaignAction = {
    id: "first-message",
    legId: "prepare",
    title: "First message",
    instructions: [],
    source: null,
    positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }],
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: (["accepted", "rewarded"] as const).map((state) => ({
      questId: 310001,
      title: "First message",
      state,
      objectiveIndex: null,
    })),
  };
  const gate: CampaignAction = {
    ...base,
    id: "gate",
    kind: "xp-check",
    targetLevel: 3,
    questChanges: [],
  };
  const entry: CampaignAction = { ...gate, id: "entry", legId: "dungeon", kind: "checkpoint" };
  return {
    plan: {
      release: "provided-delivery-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [base, gate, entry],
      legs: [
        {
          id: "prepare",
          title: "Town preparation",
          from: 1,
          to: 3,
          kind: "preparation",
          stopId: null,
          actionIds: [base.id, gate.id],
          questIds: [310001],
          unresolvedQuestIds: [],
        },
        {
          id: "dungeon",
          title: "Dungeon",
          from: 3,
          to: 4,
          kind: "dungeon",
          stopId: null,
          actionIds: [entry.id],
          questIds: [],
          unresolvedQuestIds: [],
        },
      ],
      rewardFacts: [400, 1000].map((fullXp, index) => ({
        questId: 310001 + index,
        fullXp,
        questLevel: 3,
        minimumLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-01T00:00:00.000Z",
      })),
    },
    catalog: {
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
      quests: [parcel],
    },
    combat: {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic regression fixture",
      provider: {
        repository: "https://example.test/data",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        questSha256: "b".repeat(64),
        npcSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic regression fixture"],
      },
      npcs: [],
      quests: [
        {
          questId: 310002,
          creatureIds: [],
          itemCreatureIds: [],
          onlyCreatureObjectives: false,
          objectiveText: ["Bring A Sealed Parcel to Archivist in Goldshire."],
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    },
  };
}

function resolve(input: ReturnType<typeof fixture>): QuestCatalog {
  return providedDeliveryFundingCatalog(input.catalog, input.combat, new Set());
}

describe("provided-item courier funding", () => {
  it.each(["Fizzle Brassbolts' Letter", "Fizzle Brassbolts’s Letter", "Fizzle Brassbolts's Letter"])(
    "binds a short owner name to the supplied %s", (name) => {
      const input = fixture();
      input.catalog.quests[0]!.starts = [{ ...origin, name: "Fizzle Brassbolts" }];
      input.catalog.quests[0]!.providedItem = { itemId: 957, name };
      input.combat.quests[0]!.objectiveText = ["Bring Fizzle's Letter to Archivist in Goldshire."];
      const before = structuredClone(input), result = resolve(input);
      expect(result.quests[0]!.ends).toEqual([recipient]);
      expect(result.quests[0]!.providedItem).toBe(input.catalog.quests[0]!.providedItem);
      expect(result.quests[0]!.unsupportedRequirements).toEqual([]);
      expect(input).toEqual(before);
    },
  );
  it.each([
    ["Other Brassbolts' Letter", "Bring Fizzle's Letter to Archivist."],
    ["Fizzle Brassbolts' Key", "Bring Fizzle's Letter to Archivist."],
    ["Fizzle Brassbolts' Letter", "Bring Fizz's Letter to Archivist."],
    ["Fizzle Brassbolts' Letter", "Bring Fizzle' Letter to Archivist."],
    ["Fizzle Brassbolts' Letter", "Bring Fizzle's Letter to Unknown."],
    ["Fizzle Brassbolts' Letter", "Bring Fizzle's Letter to Archivist in Stormwind."],
    ["Fizzle Brassbolts' Letter", "Bring Fizzle's Letter to Archivist and open a chest."],
  ])("rejects an unbound short-owner courier: %s / %s", (name, objective) => {
    const input = fixture();
    input.catalog.quests[0]!.starts = [{ ...origin, name: "Fizzle Brassbolts" }];
    input.catalog.quests[0]!.providedItem = { itemId: 957, name };
    input.combat.quests[0]!.objectiveText = [objective];
    expect(resolve(input)).toBe(input.catalog);
  });
  it("rejects a short owner name shared by two potential givers", () => {
    const input = fixture();
    input.catalog.quests[0]!.starts = [
      { ...origin, name: "Fizzle Brassbolts" }, { ...origin, npcId: 237, name: "Fizzle Gearbolt" },
    ];
    input.catalog.quests[0]!.providedItem = { itemId: 957, name: "Fizzle Brassbolts' Letter" };
    input.combat.quests[0]!.objectiveText = ["Bring Fizzle's Letter to Archivist."];
    expect(resolve(input)).toBe(input.catalog);
  });
  it.each(["on Goldshire", "on the Shimmering Flats"])("binds an on-location recipient: %s", (place) => {
    const input = fixture(), destination = place.includes("Shimmering")
      ? { ...recipient, positions: [{ zone: "1441", x: 50, y: 50 }] } : recipient;
    input.catalog.quests[0]!.ends = [destination];
    input.combat.quests[0]!.objectiveText = [`Return the Sealed Parcel to Archivist ${place}.`];
    expect(resolve(input).quests[0]!.ends).toEqual([destination]);
    expect(resolve(input).quests[0]!.unsupportedRequirements).toEqual([]);
  });
  it.each(["on Stormwind", "on Goldshire and Northshire", "on Goldshire and use the key", "on Goldshire, then report back"])(
    "rejects a wrong or compound on-location recipient: %s", (place) => {
      const input = fixture();
      input.combat.quests[0]!.objectiveText = [`Return the Sealed Parcel to Archivist ${place}.`];
      expect(resolve(input)).toBe(input.catalog);
    },
  );

  it.each(["Letter", "Note", "Plea", "Response"])(
    "binds the giver's named %s to the objective's note without changing item identity",
    (kind) => {
      const input = fixture();
      input.catalog.quests[0]!.providedItem = { itemId: 957, name: `Town Messenger's ${kind}` };
      input.combat.quests[0]!.objectiveText = [
        "Take Town Messenger's note to Archivist of Goldshire.",
      ];
      const result = resolve(input);
      expect(result.quests[0]!.ends).toEqual([recipient]);
      expect(result.quests[0]!.providedItem).toBe(input.catalog.quests[0]!.providedItem);
      expect(result.quests[0]!.unsupportedRequirements).toEqual([]);
    },
  );

  it.each([
    ["Unknown's Plea", "Take Town Messenger's note to Archivist of Goldshire."],
    ["Town Messenger's Key", "Take Town Messenger's note to Archivist of Goldshire."],
    ["Town Messenger's Plea", "Take Unknown's note to Archivist of Goldshire."],
    ["Town Messenger's Plea", "Take Town Messenger's note to Unknown of Goldshire."],
    ["Town Messenger's Plea", "Take Town Messenger's note to Archivist of Stormwind."],
    ["Town Messenger's Plea", "Take Town Messenger's note to Archivist and open the lock."],
  ])("does not infer an unbound or compound letter handoff for %s", (name, objective) => {
    const input = fixture();
    input.catalog.quests[0]!.providedItem = { itemId: 957, name };
    input.combat.quests[0]!.objectiveText = [objective];
    expect(resolve(input)).toBe(input.catalog);
  });

  it.each([
    "Give A Sealed Parcel to Archivist.",
    "Give the Sealed Parcel to Archivist in Goldshire.",
    "Give Archivist the Sealed Parcel.",
    "Bring Archivist a Sealed Parcel.",
    "Take the Sealed Parcel to Archivist.",
    "Deliver a Sealed Parcel to Archivist.",
  ])("qualifies the exact supplied item and recipient in %s", (text) => {
    const input = fixture();
    input.combat = {
      ...input.combat,
      quests: [{ ...input.combat.quests[0]!, objectiveText: [text] }],
    };
    const resolved = providedDeliveryFundingCatalog(input.catalog, input.combat, new Set());
    expect(resolved.quests[0]!.ends).toEqual([recipient]);
    expect(resolved.quests[0]!.unsupportedRequirements).toEqual([]);
    expect(input.catalog.quests[0]!.unsupportedRequirements).toHaveLength(2);
  });

  it.each([
    "Give Archivist the Other Parcel.",
    "Give Unknown the Sealed Parcel.",
    "Give Archivist the Sealed Parcel and return to Town Messenger.",
    "Give the Sealed Parcel to Archivist after killing the guards.",
    "Give the Sealed Parcel to Archivist in Goldshire and buy a key.",
  ])("keeps non-exact or compound Give work unresolved: %s", (text) => {
    const input = fixture();
    input.combat = {
      ...input.combat,
      quests: [{ ...input.combat.quests[0]!, objectiveText: [text] }],
    };
    expect(providedDeliveryFundingCatalog(input.catalog, input.combat, new Set())).toBe(
      input.catalog,
    );
  });

  it("never re-adds an explicitly deferred shared-party quest through a qualified fallback", () => {
    const input = fixture();
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === 310002 ? { ...fact, questId: 92 } : fact,
      ),
    };
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({ ...quest, questId: 92 })),
    };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({ ...quest, questId: 92 })),
    };
    expect(
      fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
  });
  it("moves an eligible selected object pickup before a funding gate without replacing its source program", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      objectSha256: "e".repeat(64),
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        starts: [],
        objectStarts: [{ objectId: 175227, name: "Beached Creature", positions: [position] }],
      })),
    };
    input.combat = {
      ...input.combat,
      provider: { ...input.combat.provider, objectSha256: "e".repeat(64) },
    };
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
    const guide = parseGuideChapter(
      "step\n.goto 1429,50,50\n>>Click the Beached Creature\n.accept 310002\nstep\n.goto 1429,52,50\n.target Archivist\n.turnin 310002",
      reference.id,
      "f".repeat(64),
      70205,
    );
    const later = (["accepted", "rewarded"] as const).map((state, index): CampaignAction => ({
      ...input.plan.actions[0]!,
      id: `shore-${state}`,
      legId: "shore",
      libraryBackbone: true,
      xpOptional: false,
      source: campaignActionSource(guide, guide.steps[index]!, guide.steps[index]!.directives),
      questChanges: [
        { questId: 310002, title: "Deliver the town records", state, objectiveIndex: null },
      ],
    }));
    input.plan = {
      ...input.plan,
      sharedQuestsOnly: true,
      actions: [...input.plan.actions, ...later],
      legs: [
        ...input.plan.legs,
        {
          id: "shore",
          title: "Later shore visit",
          kind: "preparation",
          from: 3,
          to: 4,
          stopId: null,
          actionIds: later.map((action) => action.id),
          questIds: [310002],
          unresolvedQuestIds: [],
        },
      ],
    };
    const before = structuredClone(input);
    const resolved = providedDeliveryFundingCatalog(input.catalog, input.combat, new Set([310002]));
    expect(resolved.quests[0]!.unsupportedRequirements).toEqual([]);
    const funded = fundCampaignQuestGaps(
      input.plan,
      [{ reference, guide }],
      input.combat,
      input.catalog,
    );
    expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
    const tasks = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 310002),
    );
    expect(tasks.map((action) => action.questChanges[0]!.state)).toEqual(["accepted", "rewarded"]);
    expect(tasks.map((action) => action.source)).toEqual(later.map((action) => action.source));
    expect(
      tasks.every(
        (action) =>
          funded.actions.indexOf(action) < funded.actions.findIndex((entry) => entry.id === "gate"),
      ),
    ).toBe(true);
    expect(later.every((action) => funded.bookmarkAliases?.[action.id] !== undefined)).toBe(true);
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint?.level).toBe(3);
      expect(member.rewards.filter((reward) => reward.questId === 310002)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
    }
    for (const reason of ["minimum", "prerequisite", "source-guard"] as const) {
      const guarded = parseGuideChapter(
        "step\n.isOnQuest 310099\n.goto 1429,50,50\n>>Click the Beached Creature\n.accept 310002\nstep\n.goto 1429,52,50\n.target Archivist\n.turnin 310002",
        reference.id,
        "f".repeat(64),
        70205,
      );
      const plan = {
        ...input.plan,
        actions: input.plan.actions.map((action) =>
          action.id !== "shore-accepted"
            ? action
            : {
                ...action,
                ...(reason === "prerequisite" ? { requiredQuestIds: [310099] } : {}),
                ...(reason === "source-guard"
                  ? {
                      source: campaignActionSource(
                        guarded,
                        guarded.steps[0]!,
                        guarded.steps[0]!.directives,
                      ),
                    }
                  : {}),
              },
        ),
      };
      const catalog =
        reason === "minimum"
          ? {
              ...input.catalog,
              quests: input.catalog.quests.map((quest) => ({ ...quest, minimumLevel: 10 })),
            }
          : input.catalog;
      const blocked = fundCampaignQuestGaps(
        plan,
        [{ reference, guide: reason === "source-guard" ? guarded : guide }],
        input.combat,
        catalog,
      );
      expect(blocked.questFunding?.addedQuestIds, reason).toEqual([]);
    }
    expect(input).toEqual(before);
  });
  it("funds a quest accepted from an object with one supplied parcel and hand-in per player", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      objectSha256: "e".repeat(64),
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        questLevel: 19,
        starts: [],
        objectStarts: [{ objectId: 175227, name: "Beached Creature", positions: [position] }],
      })),
    };
    input.combat = {
      ...input.combat,
      provider: { ...input.combat.provider, objectSha256: "e".repeat(64) },
    };
    input.plan = {
      ...input.plan,
      rewardFacts: input.plan.rewardFacts!.map((fact) =>
        fact.questId === 310002 ? { ...fact, questLevel: 19 } : fact,
      ),
    };
    const before = structuredClone(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
    const tasks = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 310002),
    );
    expect(tasks.map((action) => action.questChanges[0]!.state)).toEqual(["accepted", "rewarded"]);
    expect(tasks[0]!.instructions[0]).toMatch(/^Interact with Beached Creature/);
    expect(tasks[0]!.instructions[1]).toContain("Every player");
    const guide = forecastCampaignGuide(funded, emptyPremadeProgress());
    for (const member of guide.sections[0]!.forecast.members) {
      expect(member.rewards.filter((reward) => reward.questId === 310002)).toHaveLength(1);
      expect(member.combatXp).toBe(0);
      expect(member.endpoint?.level).toBe(3);
    }
    expect(input).toEqual(before);
    const incompatible = {
      ...input.combat,
      provider: { ...input.combat.provider, objectSha256: "f".repeat(64) },
    };
    expect(providedDeliveryFundingCatalog(input.catalog, incompatible, new Set())).toBe(
      input.catalog,
    );
    expect(() => fundCampaignQuestGaps(input.plan, [], incompatible, input.catalog)).toThrow(
      /object export/,
    );
  });
  it("resolves only the proven item requirements and exact recipient without mutating the source catalog", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const view = resolve(input);
    expect(view).not.toBe(input.catalog);
    expect(view.quests[0]!.unsupportedRequirements).toEqual([]);
    expect(view.quests[0]!.ends).toEqual([recipient]);
    expect(input.catalog.quests[0]!.ends[0]!.name).toBe("Merchant");
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([undefined, "f".repeat(64)])(
    "refuses object-recipient metadata without matching export provenance (%s)",
    (objectSha256) => {
      const input = fixture();
      input.catalog = {
        ...input.catalog,
        objectSha256,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          objectEnds: [{ objectId: 261, name: "Damaged Crate", positions: [position] }],
        })),
      };
      input.combat = {
        ...input.combat,
        provider: { ...input.combat.provider, objectSha256: "e".repeat(64) },
      };
      expect(providedDeliveryFundingCatalog(input.catalog, input.combat, new Set())).toBe(
        input.catalog,
      );
      expect(() => fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog)).toThrow(
        /object export/,
      );
    },
  );

  it("distinguishes a conjunction inside the provided item's name from a second task", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        providedItem: { itemId: 735, name: "Rolf and Malakai's Medallions" },
      })),
    };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({
        ...quest,
        objectiveText: [
          "Deliver Rolf and Malakai's Medallions to Archivist at the eastern Elwynn bridge.",
        ],
      })),
    };
    expect(resolve(input).quests[0]!.ends).toEqual([recipient]);
    expect(resolve(input).quests[0]!.unsupportedRequirements).toEqual([]);
  });

  it.each(["him", "her", "them"])(
    "recognizes a return to the named recipient followed by giving %s the exact provided parcel",
    (pronoun) => {
      const input = fixture();
      input.combat = {
        ...input.combat,
        quests: input.combat.quests.map((quest) => ({
          ...quest,
          objectiveText: [`Return to Archivist in Goldshire. Give ${pronoun} A Sealed Parcel.`],
        })),
      };
      const view = resolve(input);
      expect(view.quests[0]!.ends).toEqual([recipient]);
      expect(view.quests[0]!.unsupportedRequirements).toEqual([]);
      expect(view.quests[0]!.providedItem).toBe(input.catalog.quests[0]!.providedItem);
      const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
      expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
      expect(
        funded.actions
          .filter((action) => action.questChanges.some((change) => change.questId === 310002))
          .map((action) => action.questChanges[0]!.state),
      ).toEqual(["accepted", "rewarded"]);
    },
  );

  it.each([
    "Return to Unknown in Goldshire. Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire. Give him another parcel.",
    "Return to Archivist in Goldshire. Give him A Sealed Parcel. Return to Town Messenger.",
    "Return to Archivist in Goldshire and Town Messenger. Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire.",
    "Give him A Sealed Parcel.",
    "Return to Archivist in Goldshire. Give him A Sealed Parcel after killing the guards.",
  ])("holds incomplete or additional work in a return-and-give objective: %s", (text) => {
    const input = fixture();
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => ({ ...quest, objectiveText: [text] })),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it("funds every player with one parcel hand-in, no collection quota or kill XP, and compiles the real phases", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([310002]);
    const actions = funded.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 310002),
    );
    expect(actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "rewarded",
    ]);
    expect(actions[1]!.positions[0]!.position).toMatchObject({ zone: "1429", x: 52, y: 50 });
    expect(actions[1]!.instructions).toContain(
      "Deliver A Sealed Parcel, supplied when you accepted the quest, to Archivist.",
    );
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((reward) => reward.questId === 310002)).toHaveLength(1);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.delivery",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(addon.lua).toContain(".accept 310002");
    expect(addon.lua).toContain(".turnin 310002");
    expect(addon.lua).not.toContain(".complete 310002");
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    "targetBuild",
    "providerRevision",
    "questSha256",
    "npcSha256",
    "itemSha256",
    "missing-item-provenance",
  ] as const)("holds a delivery with incompatible provenance: %s", (field) => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      ...(field === "targetBuild"
        ? { targetBuild: 70450 }
        : field === "providerRevision"
          ? { providerRevision: "e".repeat(40) }
          : field === "missing-item-provenance"
            ? { itemSha256: undefined }
            : { [field]: "e".repeat(64) }),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it.each([
    "source-held-pickup",
    "source-completion-objective",
    "unresolved-source-prerequisite",
    "repeatable",
    "requiredSkill",
    "exploration-trigger",
  ])("preserves unresolved requirement: %s", (requirement) => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        unsupportedRequirements: [...quest.unsupportedRequirements, requirement],
      })),
    };
    expect(resolve(input)).toBe(input.catalog);
  });

  it("holds class/race restrictions, missing item identity, incomplete objectives and hostile recipients", () => {
    for (const reason of [
      "class",
      "race",
      "item",
      "text",
      "combat",
      "hostile",
      "extra-task",
    ] as const) {
      const input = fixture();
      input.catalog = {
        ...input.catalog,
        quests: input.catalog.quests.map((quest) => ({
          ...quest,
          ...(reason === "class" ? { requiredClasses: 1 } : {}),
          ...(reason === "race" ? { requiredRaces: 1 } : {}),
          ...(reason === "item" ? { providedItem: undefined } : {}),
          ...(reason === "hostile"
            ? { ends: quest.ends.map((npc) => ({ ...npc, friendlyToAlliance: false })) }
            : {}),
        })),
      };
      input.combat = {
        ...input.combat,
        quests: input.combat.quests.map((quest) => ({
          ...quest,
          ...(reason === "extra-task"
            ? {
                objectiveText: [
                  "Bring A Sealed Parcel to Archivist in Goldshire and return to Town Messenger.",
                ],
              }
            : {}),
          ...(reason === "text"
            ? { objectiveText: ["Use A Sealed Parcel to summon the Archivist."] }
            : {}),
          ...(reason === "combat" ? { creatureIds: [114] } : {}),
        })),
      };
      expect(resolve(input), reason).toBe(input.catalog);
    }
  });

  it("leaves already-selected source visits under the existing sequencing policy", () => {
    const input = fixture();
    expect(providedDeliveryFundingCatalog(input.catalog, input.combat, new Set([310002]))).toBe(
      input.catalog,
    );
  });

  it("offers a proven selected parcel only by opt-in and never restarts a party member's active quest", () => {
    const input = fixture();
    const catalog = providedDeliveryFundingCatalog(input.catalog, input.combat, new Set([310002]), true);
    expect(catalog.quests[0]!.unsupportedRequirements).toEqual([]);
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({ ...member, level: 2, currentXp: 0, xpNeedsUpdate: false }));
    const options = { legId: "prepare", checkpointId: "gate", targetLevel: 3,
      previous: position, forbiddenQuestIds: new Set<number>(), maximumQuestLevel: 5,
      leaderOnly: false, freshQuestIds: new Set([310002]) };
    expect(campaignFundingBatch(catalog.quests[0]!, catalog, input.combat, progress, options)?.questIds).toEqual([310002]);
    for (const state of ["accepted", "objectives-complete", "rewarded"] as const) {
      const active = { ...progress, members: progress.members.map((member, index) => index === 0
        ? { ...member, questStates: { ...member.questStates, "310002": state } } : member) };
      expect(campaignFundingBatch(catalog.quests[0]!, catalog, input.combat, active, options), state).toBeNull();
    }
    expect(input.catalog.quests[0]!.unsupportedRequirements).toContain("provided-item-interaction");
  });

  it("counts the public trip back to the original position and enforces the actual pickup minimum", () => {
    const input = fixture(),
      view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 3,
      previous: position,
      resumePosition: position,
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    };
    const batch = campaignFundingBatch(view.quests[0]!, view, input.combat, progress, options);
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.travelCost).toBeCloseTo(0.04);
    expect(batch?.returnTravelCost).toBeCloseTo(0.02);
    const unavailable = { ...view.quests[0]!, minimumLevel: 3 };
    expect(
      campaignFundingBatch(
        unavailable,
        { ...view, quests: [unavailable] },
        input.combat,
        progress,
        options,
      ),
    ).toBeNull();
  });

  it("never invents XP for a missing courier reward", () => {
    const input = fixture();
    input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(0, 1) };
    const result = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(result.questFunding?.addedQuestIds).toEqual([]);
  });

  it("uses the actual pickup minimum for a proven parcel above the nominal quest-level limit", () => {
    const input = fixture();
    input.catalog.quests[0]!.questLevel = 30;
    const catalog = resolve(input), quest = catalog.quests[0]!;
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member, level: 2, currentXp: 0, xpNeedsUpdate: false,
    }));
    const options = {
      legId: "prepare", checkpointId: "gate", targetLevel: 3,
      previous: position, resumePosition: position,
      forbiddenQuestIds: new Set<number>(), maximumQuestLevel: 5, leaderOnly: false,
    };
    expect(campaignFundingBatch(quest, catalog, input.combat, progress, options)).toBeNull();
    const batch = campaignFundingBatch(quest, catalog, input.combat, progress, {
      ...options, includeNpcDeliveries: true,
    });
    expect(batch?.questIds).toEqual([310002]);
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.returnTravelCost).toBeCloseTo(0.02);
    expect(batch?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted", "rewarded",
    ]);
    expect(batch?.actions.at(-1)?.instructions).toContain(
      "Deliver A Sealed Parcel, supplied when you accepted the quest, to Archivist.",
    );
    for (const reason of ["pickup-minimum", "missing-prerequisite", "extra-combat", "wrong-recipient"] as const) {
      const blocked = structuredClone(catalog), reference = structuredClone(input.combat);
      if (reason === "pickup-minimum") blocked.quests[0]!.minimumLevel = 3;
      if (reason === "missing-prerequisite") blocked.quests[0]!.prerequisites.allOf = [310099];
      if (reason === "extra-combat") reference.quests[0]!.creatureIds = [114];
      if (reason === "wrong-recipient") reference.quests[0]!.objectiveText = ["Deliver A Sealed Parcel to Unknown."];
      expect(campaignFundingBatch(blocked.quests[0]!, blocked, reference, progress, {
        ...options, includeNpcDeliveries: true,
      }), reason).toBeNull();
    }
  });

  it("retains a courier prerequisite before an otherwise eligible shared-kill quest", () => {
    const input = fixture();
    const patrol: QuestCatalogEntry = {
      ...input.catalog.quests[0]!,
      questId: 310003,
      title: "Protect the archive",
      providedItem: undefined,
      starts: [recipient],
      ends: [recipient],
      category: "shared-kills",
      unsupportedRequirements: [],
      prerequisites: { allOf: [310002], anyOf: [] },
      objectives: [{ index: 1, npcId: 114, count: 4, positions: [position] }],
    };
    input.catalog = { ...input.catalog, quests: [...input.catalog.quests, patrol] };
    input.combat = {
      ...input.combat,
      npcs: [
        {
          id: 114,
          name: "Forest Spider",
          minimumLevel: 2,
          maximumLevel: 2,
          rank: 0,
          zoneIds: [12],
          xpEligibility: "assumed",
        },
      ],
      quests: [
        ...input.combat.quests,
        {
          questId: 310003,
          creatureIds: [114],
          itemCreatureIds: [],
          objectiveText: ["Kill 4 Forest Spiders."],
          onlyCreatureObjectives: true,
        },
      ],
    };
    const view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const batch = campaignFundingBatch(view.quests[1]!, view, input.combat, progress, {
      legId: "prepare",
      checkpointId: "gate",
      targetLevel: 4,
      previous: position,
      forbiddenQuestIds: new Set(),
      maximumQuestLevel: 5,
      leaderOnly: false,
    });
    expect(batch?.questIds).toEqual([310002, 310003]);
    expect(batch?.requiredKills).toBe(4);
    expect(batch?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "rewarded",
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(batch?.actions[2]?.requiredQuestIds).toEqual([310002]);
  });

  it("does not convert an unfinished collection prerequisite into a ready parcel", () => {
    const input = fixture();
    const parcel = { ...input.catalog.quests[0]!, prerequisites: { allOf: [310003], anyOf: [] } };
    const collection: QuestCatalogEntry = {
      ...parcel,
      questId: 310003,
      title: "Gather supplies",
      category: "unsupported",
      providedItem: undefined,
      unsupportedRequirements: [],
      prerequisites: { allOf: [], anyOf: [] },
    };
    input.catalog = { ...input.catalog, quests: [parcel, collection] };
    const view = resolve(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignFundingBatch(view.quests[0]!, view, input.combat, progress, {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
      }),
    ).toBeNull();
  });
});
