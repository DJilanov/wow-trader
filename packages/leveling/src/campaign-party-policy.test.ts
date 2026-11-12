import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import { selectSharedCampaignQuests } from "./campaign-shared-quests.js";
import {
  combatDatasetSchema,
  type CombatDataset,
  type CombatQuestReference,
} from "./combat-model.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { isProvidedItemDelivery } from "./quest-catalog-delivery.js";

function providedDeliveryFixture(
  objective = "",
  pickupDirective = "",
): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
  catalog: QuestCatalog;
} {
  const original = fixture();
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 119)!;
  const sources = [
    {
      reference: chapter,
      guide: parseGuideChapter(
        [
          "step\n.goto 1426,30,45\n.collect 2686,1,311\n>>Buy a [Thunder Ale] from Innkeeper Belm\n.target Innkeeper Belm",
          "step\n.goto 1426,30,45\n.accept 310 >>Accept Bitter Rivals",
          `step\n.goto 1426,30,45\n.turnin 310 >>Turn in Bitter Rivals\n.accept 311 >>Accept Return to Marleth\n${pickupDirective}`,
          objective,
          "step\n.goto 1426,30,45\n.turnin 311 >>Turn in Return to Marleth",
        ].join("\n"),
        chapter.id,
        "a".repeat(64),
        70205,
      ),
    },
  ];
  const data: CombatDataset = {
    ...original.data,
    quests: [310, 311].map((questId) => ({
      questId,
      creatureIds: [],
      itemCreatureIds: [],
      itemObjectives: [],
      onlyCreatureObjectives: false,
      objectiveText:
        questId === 311
          ? ["Bring the barrel of Thunder Ale to Marleth Barleybrew at the Brewnall Village."]
          : ["Talk to the barrel."],
      prerequisites: { allOf: [], anyOf: questId === 311 ? [310] : [] },
    })),
  };
  const actions = buildCampaignQuestLibrary(
    sources,
    createCampaignSourceProfile("dwarf", "warrior"),
    [],
    new Set(),
    data.quests,
  ).flatMap((quest) =>
    quest.actions.map((action) => ({ ...action, legId: "starter", leaderOnly: true })),
  );
  const plan: CampaignPlan = {
    ...original.plan,
    race: "dwarf",
    sourceArchiveSha256: "d".repeat(64),
    actions,
    legs: [
      {
        ...original.plan.legs[0]!,
        id: "starter",
        kind: "starter",
        from: 1,
        to: 11,
        questIds: [310, 311],
        actionIds: actions.map((action) => action.id),
      },
    ],
  };
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic provided-delivery regression",
    providerRevision: data.provider.revision,
    questSha256: data.provider.questSha256,
    npcSha256: data.provider.npcSha256,
    itemSha256: data.provider.itemSha256,
    areaMapSha256: "a".repeat(64),
    includesAuthoredCorrections: false,
    sourceArchiveSha256: plan.sourceArchiveSha256,
    quests: [
      {
        questId: 311,
        title: "Return to Marleth",
        minimumLevel: 2,
        questLevel: 7,
        requiredClasses: 0,
        requiredRaces: 0,
        providedItem: { itemId: 2666, name: "Barrel of Thunder Ale" },
        starts: [],
        ends: [
          {
            npcId: 1375,
            name: "Marleth Barleybrew",
            friendlyToAlliance: true,
            positions: [{ zone: "1426", x: 30, y: 45 }],
          },
        ],
        prerequisites: { allOf: [], anyOf: [310] },
        exclusiveWith: [],
        category: "delivery",
        objectives: [],
        unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"],
      },
    ],
  });
  return { plan, sources, data, catalog };
}

const body =
  "step\n.accept 102 >> Accept Patrolling Westfall\n.accept 12 >> Accept The People's Militia\nstep\n.complete 102,1 >> Gnoll Paw (8)\n.mob Riverpaw Gnoll\n>>Kill gnolls and loot their paws\nstep\n.complete 12,1 >> Defias Trapper slain (15)\n.mob Defias Trapper\nstep\n.turnin 102 >> Turn in Patrolling Westfall\n.accept 13 >> Accept The People's Militia\nstep\n.complete 13,1 >> Defias Looter slain (15)\n.mob Defias Looter\nstep\n.turnin 12 >> Turn in The People's Militia\nstep\n.turnin 13 >> Turn in The People's Militia";

function reference(questId: number, collection = false): CombatQuestReference {
  return {
    questId,
    creatureIds: collection ? [] : [504],
    itemCreatureIds: collection ? [117] : [],
    objectiveText: [],
    onlyCreatureObjectives: !collection,
    requiredClasses: 0,
    prerequisites: { allOf: [], anyOf: [] },
    itemObjectives: collection
      ? [{ itemId: 725, objectiveIndex: 1, quantity: 8, npcIds: [117], sharing: "unknown" }]
      : [],
  };
}

function fixture(collectionQuestId: number = 102): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
} {
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 125)!;
  const sources = [
    {
      reference: chapter,
      guide: parseGuideChapter(
        body.replaceAll("102", String(collectionQuestId)),
        chapter.id,
        "a".repeat(64),
        70205,
      ),
    },
  ];
  const library = buildCampaignQuestLibrary(
    sources,
    createCampaignSourceProfile("human", "warrior"),
    [],
  );
  const actions = library.flatMap((quest) =>
    quest.actions.map((action) => ({ ...action, legId: "route" })),
  );
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/questie",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Reference fixture"],
    },
    npcs: [],
    quests: [reference(collectionQuestId, true), reference(12), reference(13)],
    dungeons: [],
  });
  return {
    plan: {
      release: "fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "route",
          title: "Westfall",
          from: 10,
          to: 15,
          kind: "xp-bridge",
          stopId: null,
          actionIds: actions.map((action) => action.id),
          questIds: [collectionQuestId, 12, 13],
          unresolvedQuestIds: [],
        },
      ],
    },
    sources,
    data,
  };
}

describe("global five-player route policy", () => {
  it("retains a complete common-source courier without requiring a nearby kill batch", () => {
    const original = fixture();
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
    const sources: readonly CampaignSource[] = [{ reference, guide: parseGuideChapter(
      "step\n.goto 1429,48,42\n.accept 900001 >>Accept The Report\nstep\n.goto 1453,55,60\n.turnin 900001 >>Turn in The Report", reference.id, "a".repeat(64), 70205,
    ) }];
    const program = buildCampaignQuestLibrary(sources, createCampaignSourceProfile("human", null), [])[0]!;
    const plan: CampaignPlan = { ...original.plan, sharedQuestsOnly: true,
      sharedSourceQuestIds: [900001],
      actions: program.actions.map((action) => ({ ...action, legId: "route" })),
    };
    const data: CombatDataset = { ...original.data, quests: [{
      questId: 900001, requiredClasses: 0, creatureIds: [], itemCreatureIds: [],
      onlyCreatureObjectives: false, objectiveText: ["Speak with the quartermaster."],
    }] };
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(selected.partyPolicy?.decisions.find((decision) => decision.questId === 900001)?.included).toBe(true);
    expect(selected.actions.flatMap((action) => action.questChanges).map((change) => change.state)).toEqual(["accepted", "rewarded"]);
    expect(selected.actions.map((action) => action.source)).toEqual(plan.actions.map((action) => action.source));
    const personal: CombatDataset = { ...data, quests: data.quests.map((quest) => ({ ...quest, requiredClasses: 8 })) };
    const catalog = providedDeliveryFixture().catalog;
    const common = selectSharedCampaignQuests({ ...plan, sourceArchiveSha256: catalog.sourceArchiveSha256 }, {
      ...catalog, quests: [{ ...catalog.quests[0]!, questId: 900001, requiredClasses: 8,
        prerequisites: { allOf: [], anyOf: [] } }],
    });
    expect(applyCampaignPartyQuestPolicy(common, sources, personal).actions).toHaveLength(0);
  });

  it("does not fund required XP with the random Southshore event or its dependent bounty", () => {
    const original = fixture();
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 14)!;
    const sources: readonly CampaignSource[] = [
      {
        reference: chapter,
        guide: parseGuideChapter(
          [
            "step\n#completewith LeaveSS\n>>The Shadowy Assassin attack on Southshore is a random event\n>>Skip this step if you don't see the event\n.collect 3668,1,522\n.use 3668\n.accept 522 >>Accept Assassin's Contract",
            "step\n.isOnQuest 522\n.turnin 522 >>Turn in Assassin's Contract",
            "step\n.accept 523 >>Accept Baron's Demise",
            "step\n.complete 523,1 >>Head of Baron Vardus (1)\n.mob Baron Vardus",
            "step\n.turnin 523 >>Turn in Baron's Demise",
            "step\n.accept 12 >>Accept The People's Militia",
            "step\n.complete 12,1 >>Defias Trapper slain (15)\n.mob Defias Trapper",
            "step\n.turnin 12 >>Turn in The People's Militia",
          ].join("\n"),
          chapter.id,
          "a".repeat(64),
          70205,
        ),
      },
    ];
    const quests: readonly CombatQuestReference[] = [
      {
        questId: 522,
        creatureIds: [],
        itemCreatureIds: [],
        itemObjectives: [],
        objectiveText: ["Bring the Assassin's Contract to Magistrate Maleb in Southshore."],
        onlyCreatureObjectives: false,
        requiredClasses: 0,
        prerequisites: { allOf: [], anyOf: [] },
        startItem: { itemId: 3668, name: "Assassin's Contract" },
      },
      {
        questId: 523,
        creatureIds: [],
        itemCreatureIds: [2306],
        objectiveText: ["Bring the Head of Baron Vardus to Magistrate Maleb in Southshore."],
        onlyCreatureObjectives: false,
        requiredClasses: 0,
        prerequisites: { allOf: [], anyOf: [522] },
        itemObjectives: [
          {
            objectiveIndex: 1,
            itemId: 3626,
            itemName: "Head of Baron Vardus",
            quantity: 1,
            npcIds: [2306],
            sharing: "shared-roll",
          },
        ],
      },
      reference(12),
    ];
    const actions = buildCampaignQuestLibrary(
      sources,
      createCampaignSourceProfile("human", "warrior"),
      [],
      new Set(),
      quests,
    ).flatMap((quest) => quest.actions.map((action) => ({ ...action, legId: "route" })));
    const plan: CampaignPlan = {
      ...original.plan,
      sharedQuestsOnly: true,
      actions,
      legs: original.plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.map((action) => action.id),
        questIds: [522, 523, 12],
      })),
    };
    const data: CombatDataset = { ...original.data, quests: [...quests] };
    const before = structuredClone({ plan, sources, data });
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(
      new Set(
        selected.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
      ),
    ).toEqual(new Set([12]));
    for (const questId of [522, 523])
      expect(
        selected.partyPolicy?.decisions.find((decision) => decision.questId === questId),
      ).toMatchObject({ included: false });
    expect({ plan, sources, data }).toEqual(before);
    expect(applyCampaignPartyQuestPolicy(selected, sources, data)).toEqual(selected);
  });

  it("retains source-backed object-starter pickups with no separate collection counter", () => {
    const original = providedDeliveryFixture();
    const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
    const sources = original.sources.map((source) => ({
      ...source,
      reference: chapter,
      guide: { ...source.guide, chapterId: chapter.id },
    }));
    const plan: CampaignPlan = {
      ...original.plan,
      sharedQuestsOnly: true,
      actions: original.plan.actions
        .filter((action) => action.questChanges.some((change) => change.questId === 311))
        .map((action) => ({
          ...action,
          leaderOnly: false,
          requiredQuestIds: [],
          source: action.source ? { ...action.source, chapterId: chapter.id } : null,
          questChanges: action.questChanges.filter((change) => change.questId === 311),
        })),
    };
    const data: CombatDataset = {
      ...original.data,
      provider: { ...original.data.provider, objectSha256: "f".repeat(64) },
      quests: original.data.quests.map((quest) => ({
        ...quest,
        prerequisites: { allOf: [], anyOf: [] },
      })),
    };
    const catalog: QuestCatalog = {
      ...original.catalog,
      objectSha256: "f".repeat(64),
      quests: original.catalog.quests.map((quest) => ({
        ...quest,
        prerequisites: { allOf: [], anyOf: [] },
        objectStarts: [
          { objectId: 123, name: "Barrel", positions: [{ zone: "1426", x: 30, y: 45 }] },
        ],
      })),
    };
    const before = structuredClone({ plan, data, catalog });
    expect(
      isProvidedItemDelivery(
        catalog.quests[0]!,
        data.quests.find((quest) => quest.questId === 311),
      ),
    ).toBe(true);
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data, catalog);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 311),
    ).toMatchObject({ included: true, worldObjectPickup: true });
    expect(
      selected.actions.flatMap((action) => action.questChanges).map((change) => change.state),
    ).toEqual(["accepted", "rewarded"]);
    const foreign = { ...catalog, objectSha256: "e".repeat(64) };
    expect(
      applyCampaignPartyQuestPolicy(plan, sources, data, foreign).partyPolicy?.decisions.find(
        (decision) => decision.questId === 311,
      )?.included,
    ).toBe(false);
    expect({ plan, data, catalog }).toEqual(before);
  });
  it("keeps a corroborated provided delivery despite an auxiliary pre-pickup purchase counter", () => {
    const { plan, sources, data, catalog } = providedDeliveryFixture();
    const before = structuredClone({ plan, sources, data, catalog });
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data, catalog);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 311),
    ).toMatchObject({
      objective: "delivery",
      included: true,
      lootCost: null,
    });
    expect(
      selected.actions
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === 311),
    ).toEqual(
      plan.actions
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === 311),
    );
    expect({ plan, sources, data, catalog }).toEqual(before);
    expect(applyCampaignPartyQuestPolicy(selected, sources, data, catalog)).toEqual(selected);
  });

  it("requires compatible item, provider and archive evidence before reclassifying a delivery", () => {
    const { plan, sources, data, catalog } = providedDeliveryFixture();
    const missingItemProof = { ...catalog };
    delete missingItemProof.itemSha256;
    for (const incompatible of [
      undefined,
      missingItemProof,
      { ...catalog, targetBuild: 99999 },
      { ...catalog, sourceArchiveSha256: "e".repeat(64) },
      { ...catalog, providerRevision: "e".repeat(40) },
      { ...catalog, questSha256: "e".repeat(64) },
      { ...catalog, npcSha256: "e".repeat(64) },
      { ...catalog, itemSha256: "e".repeat(64) },
    ]) {
      expect(
        applyCampaignPartyQuestPolicy(
          plan,
          sources,
          data,
          incompatible,
        ).partyPolicy?.decisions.find((decision) => decision.questId === 311),
      ).toMatchObject({ objective: "collection", included: false });
    }
    const foreignSources = sources.map((source) => ({
      ...source,
      guide: { ...source.guide, targetBuild: 99999 },
    }));
    expect(
      applyCampaignPartyQuestPolicy(
        plan,
        foreignSources,
        data,
        catalog,
      ).partyPolicy?.decisions.find((decision) => decision.questId === 311)?.objective,
    ).toBe("collection");
  });

  it("does not reinterpret an actual objective, a start item or a mismatched parcel as free delivery", () => {
    const { plan, sources, data, catalog } = providedDeliveryFixture();
    const wrongParcel: QuestCatalog = {
      ...catalog,
      quests: catalog.quests.map((quest) => ({
        ...quest,
        providedItem: { itemId: 1, name: "A different parcel" },
      })),
    };
    expect(
      applyCampaignPartyQuestPolicy(plan, sources, data, wrongParcel).partyPolicy?.decisions.find(
        (decision) => decision.questId === 311,
      )?.objective,
    ).toBe("collection");
    const startedByItem: CombatDataset = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 311
          ? { ...quest, startItem: { itemId: 1, name: "Quest starter" } }
          : quest,
      ),
    };
    expect(
      applyCampaignPartyQuestPolicy(
        plan,
        sources,
        startedByItem,
        catalog,
      ).partyPolicy?.decisions.find((decision) => decision.questId === 311)?.objective,
    ).toBe("collection");
    const withObjective = providedDeliveryFixture(
      "step\n.goto 1426,30,45\n.complete 311,1 >>Collect Barrel of Thunder Ale (1)",
    );
    expect(
      applyCampaignPartyQuestPolicy(
        withObjective.plan,
        withObjective.sources,
        withObjective.data,
        withObjective.catalog,
      ).partyPolicy?.decisions.find((decision) => decision.questId === 311)?.objective,
    ).toBe("collection");
    const withInteraction = providedDeliveryFixture("", ".use 2666");
    expect(
      applyCampaignPartyQuestPolicy(
        withInteraction.plan,
        withInteraction.sources,
        withInteraction.data,
        withInteraction.catalog,
      ).partyPolicy?.decisions.find((decision) => decision.questId === 311)?.objective,
    ).toBe("collection");
  });
  it("does not restore Redridge's condor-meat farm through an AH alternative", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        actions: plan.actions.map((action) => ({
          ...action,
          questChanges: action.questChanges.map((change) =>
            change.questId === 102 ? { ...change, questId: 92 } : change,
          ),
        })),
      },
      sources,
      { ...data, quests: [...data.quests, reference(92)] },
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 92),
    ).toMatchObject({ included: false, reason: expect.stringContaining("condor-meat") });
    expect(
      selected.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 92),
    ).toBe(false);
  });
  it("keeps per-step prerequisites when a reference dataset is unavailable", () => {
    const { plan, sources } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "starter", from: 1, to: 6 })),
        actions: plan.actions.map((action) => ({
          ...action,
          leaderOnly: true,
          requiredQuestIds: [],
        })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, title: "1-6 Northshire" },
      })),
    );
    const pickup = selected.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
    );
    expect(pickup).toBeDefined();
    expect(pickup?.requiredQuestIds).toEqual([]);
  });

  it("holds a known repeat-visit dungeon chain even without an applicable archived lifecycle", () => {
    const { plan, sources } = fixture();
    const manual = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        questChanges: action.questChanges.map((change) =>
          change.questId === 13 ? { ...change, questId: 1139 } : change,
        ),
      })),
    };
    const selected = applyCampaignPartyQuestPolicy(manual, sources);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 1139)?.included,
    ).toBe(false);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 1139)?.reason,
    ).toContain("earlier Uldaman visit");
  });
  it("removes every phase of the paw farm and keeps true kill quests", () => {
    const { plan, sources, data } = fixture();
    const before = structuredClone(plan);
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(
      selected.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 102),
    ).toBe(false);
    expect(selected.legs[0]!.questIds).toEqual([12, 13]);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
    expect(plan).toEqual(before);
    expect(applyCampaignPartyQuestPolicy(selected, sources, data)).toEqual(selected);
  });
  it("uses factual prerequisites instead of treating an adjacent unrelated hand-in as an unlock", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(
      selected.actions.find((action) =>
        action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
      )?.requiredQuestIds,
    ).toEqual([]);
  });
  it("holds an optional chain whose real prerequisite is an expensive collection", () => {
    const { plan, sources, data } = fixture();
    const linked = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [102], anyOf: [] } } : quest,
      ),
    };
    const selected = applyCampaignPartyQuestPolicy(plan, sources, linked);
    expect(
      selected.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).not.toContain(13);
  });
  it("holds a dungeon extra whose catalog prerequisite was omitted, even without an archived objective", () => {
    const { plan, sources } = fixture();
    const extra = {
      ...plan.actions[0]!,
      id: "highland-hides",
      source: null,
      questChanges: [
        {
          questId: 98815,
          state: "accepted" as const,
          title: "Highland Hides",
          objectiveIndex: null,
        },
      ],
      optionalForQuestIds: [98815],
    };
    const selected = applyCampaignPartyQuestPolicy(
      { ...plan, actions: [...plan.actions, extra] },
      sources,
    );
    expect(selected.actions.some((action) => action.id === extra.id)).toBe(false);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 98815)?.reason,
    ).toContain("484");
  });
  it("retains a required dungeon unlock's complete prerequisite chain", () => {
    const { plan, sources, data } = fixture(900102);
    const linked = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [900102], anyOf: [] } } : quest,
      ),
    };
    const required = {
      ...plan,
      actions: [
        ...plan.actions,
        {
          ...plan.actions[0]!,
          id: "dungeon-entry",
          kind: "checkpoint" as const,
          questChanges: [],
          requiredQuestIds: [13],
        },
      ],
    };
    const selected = applyCampaignPartyQuestPolicy(required, sources, linked);
    expect(
      selected.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).toContain(900102);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 900102)?.requiredFor,
    ).toContain(13);
  });
  it("orders a newly verified prerequisite hand-in before its follow-up pickup in the same leg", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [12], anyOf: [] } } : quest,
      ),
    });
    const phase = (id: number, state: "accepted" | "rewarded"): number =>
      selected.actions.findIndex((action) =>
        action.questChanges.some((change) => change.questId === id && change.state === state),
      );
    expect(phase(12, "rewarded")).toBeLessThan(phase(13, "accepted"));
  });
  it("brings an archived outdoor prerequisite onto its earlier selected visit instead of blocking the route", () => {
    const { plan, sources, data } = fixture();
    const route = {
      ...plan,
      legs: [...plan.legs, { ...plan.legs[0]!, id: "later-visit" }],
      actions: plan.actions.map((action) =>
        action.questChanges.some((change) => change.questId === 12)
          ? { ...action, legId: "later-visit" }
          : action,
      ),
    };
    const selected = applyCampaignPartyQuestPolicy(route, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [12], anyOf: [] } } : quest,
      ),
    });
    expect(
      selected.actions
        .filter((action) => action.questChanges.some((change) => change.questId === 12))
        .every((action) => action.legId === "route"),
    ).toBe(true);
    expect(selected.legs.find((leg) => leg.id === "later-visit")?.questIds).not.toContain(12);
  });
  it("keeps class unlocks and rejects a foreign-build reference", () => {
    const { plan, sources, data } = fixture(900102);
    const classData = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 900102 ? { ...quest, requiredClasses: 1 } : quest,
      ),
    };
    expect(
      applyCampaignPartyQuestPolicy(plan, sources, classData).partyPolicy?.decisions.find(
        (decision) => decision.questId === 900102,
      )?.included,
    ).toBe(true);
    expect(() =>
      applyCampaignPartyQuestPolicy(plan, sources, { ...data, targetBuild: 99999 }),
    ).toThrow(/different build/);
  });
  it("does not protect an ordinary farm because a solo source uses class conditions or a preparation container", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "preparation" as const })),
        actions: plan.actions.map((action) => ({ ...action, libraryRequired: true })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, condition: "Alliance Warrior" },
      })),
      data,
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
  });
  it("applies the same rule to manual quest actions absent from the archive library", () => {
    const { plan, sources, data } = fixture();
    const unrelated = sources.map((source) => ({
      ...source,
      guide: parseGuideChapter(
        body.replaceAll("102", "900001"),
        source.guide.chapterId,
        "a".repeat(64),
        70205,
      ),
    }));
    const selected = applyCampaignPartyQuestPolicy(plan, unrelated, data);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
    expect(
      selected.actions.some((action) =>
        action.questChanges.some((change) => change.questId === 102),
      ),
    ).toBe(false);
  });
  it("holds an optional kill quest when its factual prerequisite has no route actions", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [99999], anyOf: [] } } : quest,
      ),
    });
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 13)?.included,
    ).toBe(false);
  });
  it("reports a missing required prerequisite instead of inventing a completed chain", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        actions: [
          ...plan.actions,
          {
            ...plan.actions[0]!,
            id: "required-entry",
            kind: "checkpoint",
            questChanges: [],
            requiredQuestIds: [13],
          },
        ],
      },
      sources,
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 13 ? { ...quest, prerequisites: { allOf: [99999], anyOf: [] } } : quest,
        ),
      },
    );
    expect(selected.partyPolicy?.unresolvedPrerequisiteIds).toEqual([99999]);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 13)?.included,
    ).toBe(true);
  });
  it("allows a prerequisite hand-in before a follow-up pickup in the same source step", () => {
    const { plan, sources, data } = fixture(900102);
    const turnin = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 900102 && change.state === "rewarded",
      ),
    )!;
    const pickup = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
    )!;
    const combined = {
      ...turnin,
      id: "handin-and-accept",
      questChanges: [...turnin.questChanges, ...pickup.questChanges],
    };
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        actions: [
          ...plan.actions.filter((action) => action !== turnin && action !== pickup),
          combined,
        ],
      },
      sources,
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 900102
            ? { ...quest, requiredClasses: 1 }
            : quest.questId === 13
              ? { ...quest, prerequisites: { allOf: [900102], anyOf: [] } }
              : quest,
        ),
      },
    );
    expect(selected.actions.find((action) => action.id === combined.id)?.requiredQuestIds).toEqual(
      [],
    );
  });
  it("does not protect an unsupported farm or its follow-up merely because it is in a personal starter", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "starter" as const, from: 1, to: 6 })),
        actions: plan.actions.map((action) => ({ ...action, leaderOnly: true })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, title: "1-6 Northshire" },
      })),
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 13 ? { ...quest, prerequisites: { allOf: [102], anyOf: [] } } : quest,
        ),
      },
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 13)?.included,
    ).toBe(false);
    expect(
      selected.actions.some((action) =>
        action.questChanges.some((change) => change.questId === 12),
      ),
    ).toBe(true);
  });
  it("keeps a starter collection when a required class unlock depends on it", () => {
    const { plan, sources, data } = fixture(900102);
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "starter" as const, from: 1, to: 6 })),
        actions: plan.actions.map((action) => ({ ...action, leaderOnly: true })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, title: "1-6 Northshire" },
      })),
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 13
            ? { ...quest, requiredClasses: 1, prerequisites: { allOf: [900102], anyOf: [] } }
            : quest,
        ),
      },
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 900102),
    ).toMatchObject({ included: true, requiredFor: [13] });
  });
});
