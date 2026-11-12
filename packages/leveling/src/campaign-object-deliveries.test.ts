import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { isSharedFundingQuest } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  campaignSourceDeliveries,
  sourceDeliveryFundingCatalog,
} from "./campaign-source-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";

const point = { zone: "1437", x: 13, y: 40 };
const body = [
  "step",
  ".goto Wetlands,8,59",
  ".turnin 279",
  ".accept 281",
  ".target Karl Boran",
  "step",
  ".goto Wetlands,13,41",
  ">>Click the Damaged Crate on the ground",
  ".turnin 281",
  ".accept 284",
  ".isOnQuest 281",
  "step",
  ".goto Wetlands,14,38",
  ">>Click the Sealed Barrel on the ground",
  ".turnin 284",
  ".accept 285",
  ".isOnQuest 284",
  "step",
  ".goto Wetlands,14,35",
  ">>Click the Half-buried Barrel on the ground",
  ".turnin 285",
  ".accept 286",
  ".isOnQuest 285",
  "step",
  ".goto Wetlands,8,59",
  ".turnin 286",
  ".target Karl Boran",
  ".isOnQuest 286",
].join("\n");

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
  sources: CampaignSource[];
}

function fixture(source = body): Fixture {
  const giver = { npcId: 1242, name: "Karl Boran", friendlyToAlliance: true, positions: [point] };
  const objects = [
    { objectId: 261, name: "Damaged Crate", positions: [point] },
    { objectId: 142151, name: "Sealed Barrel", positions: [point] },
    { objectId: 259, name: "Half-buried Barrel", positions: [point] },
  ];
  const parent: QuestCatalogEntry = {
    questId: 279,
    title: "Claws from the Deep",
    minimumLevel: 20,
    questLevel: 22,
    requiredClasses: 0,
    requiredRaces: 4294967373,
    starts: [giver],
    ends: [giver],
    category: "unsupported",
    objectives: [],
    unsupportedRequirements: [],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
  };
  const quests = [281, 284, 285, 286].map((questId, index): QuestCatalogEntry => ({
    ...parent,
    questId,
    title: `Object chain ${questId}`,
    questLevel: 25,
    category: "delivery",
    starts: index === 0 ? [giver] : [],
    ends: index === 3 ? [giver] : [],
    ...(index > 0 ? { objectStarts: [objects[index - 1]!] } : {}),
    ...(index < 3 ? { objectEnds: [objects[index]!] } : {}),
    ...(index === 3 ? { providedItem: { itemId: 2625, name: "Menethil Statuette" } } : {}),
    prerequisites: { allOf: [], anyOf: [index === 0 ? 279 : [281, 284, 285][index - 1]!] },
    unsupportedRequirements:
      index === 3
        ? ["provided-item-interaction", "unresolved-objective-text"]
        : ["unresolved-objective-text"],
  }));
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic object visit fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    itemSha256: "d".repeat(64),
    objectSha256: "0".repeat(64),
    areaMapSha256: "e".repeat(64),
    sourceArchiveSha256: "f".repeat(64),
    includesAuthoredCorrections: false,
    quests: [parent, ...quests],
  };
  const combat: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic object visit fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: catalog.providerRevision,
      layer: "forever-static-with-authored",
      questSha256: catalog.questSha256,
      npcSha256: catalog.npcSha256,
      itemSha256: catalog.itemSha256!,
      objectSha256: catalog.objectSha256!,
      limitations: ["Synthetic fixture"],
    },
    quests: quests.map((quest, index) => ({
      questId: quest.questId,
      creatureIds: [],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      onlyInteractionObjectives: false,
      itemObjectives: [],
      objectiveText: [
        "Search the crates and barrels at the coastal Murloc camps.",
        "Search for the Menethil Statuette.",
        "Continue searching the Murloc hovels for the Menethil Statuette.",
        "Bring Karl Boran the Menethil Statuette.",
      ].slice(index, index + 1),
    })),
    npcs: [],
    dungeons: [],
    killXpEvidence: [],
  };
  const plan: CampaignPlan = {
    release: "object-method-fixture",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: catalog.quests.map((quest) => quest.questId),
    actions: [],
    legs: [],
    rewardFacts: quests.map((quest) => ({
      questId: quest.questId,
      fullXp: 1000,
      questLevel: 25,
      minimumLevel: 20,
      xpByLevel: [],
      status: "available",
      evidenceKind: "historical-reference",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-03T00:00:00.000Z",
    })),
  };
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 23)!;
  return {
    plan,
    catalog,
    combat,
    sources: [{ reference, guide: parseGuideChapter(source, reference.id, "f".repeat(64), 70205) }],
  };
}

function qualify(input: Fixture): ReturnType<typeof campaignSourceDeliveries> {
  return campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog);
}

function progress(): ReturnType<typeof emptyPremadeProgress> {
  const state = emptyPremadeProgress();
  return {
    ...state,
    members: state.members.map((member) => ({
      ...member,
      raceId: "human",
      level: 20,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: { "279": "rewarded" },
    })),
  };
}

function batch(input: Fixture, state = progress()): ReturnType<typeof campaignFundingBatch> {
  const deliveries = qualify(input),
    catalog = sourceDeliveryFundingCatalog(input.catalog, deliveries);
  return campaignFundingBatch(
    catalog.quests.find((quest) => quest.questId === 286)!,
    catalog,
    input.combat,
    state,
    {
      legId: "prepare",
      checkpointId: "departure",
      targetLevel: 25,
      previous: point,
      resumePosition: point,
      forbiddenQuestIds: new Set(),
      maximumQuestLevel: 20,
      leaderOnly: false,
      sourceDeliveries: deliveries,
    },
  );
}

function component(input: Fixture): CampaignPlan {
  const selected = batch(input);
  if (!selected) throw new Error("Missing complete synthetic object chain");
  return {
    ...input.plan,
    actions: selected.actions,
    legs: [
      {
        id: "prepare",
        title: "Object chain",
        kind: "preparation",
        from: 20,
        to: 25,
        stopId: null,
        questIds: selected.questIds,
        unresolvedQuestIds: [],
        actionIds: selected.actions.map((action) => action.id),
      },
    ],
  };
}

describe("source-bound object quest visits", () => {
  it.each(["check", "inspect", "investigate", "explore", "scout"])(
    "binds the named giver's %s instruction to its captured object hand-in", (verb) => {
      const input = fixture();
      input.combat.quests.find((quest) => quest.questId === 281)!.objectiveText = [
        `Karl Boran wants you to ${verb} the cove north of Menethil.`,
      ];
      const before = structuredClone(input);
      expect(qualify(input).get(281)?.quest.objectEnds?.[0]?.objectId).toBe(261);
      expect(input).toEqual(before);
    },
  );

  it.each([
    "Another NPC wants you to check the cove north of Menethil.",
    "Karl Boran wants you to check the cove and kill the guards.",
    "Karl Boran wants you to inspect the cove then use the key.",
  ])("keeps an unbound or compound scouting objective unresolved: %s", (objective) => {
    const input = fixture();
    input.combat.quests.find((quest) => quest.questId === 281)!.objectiveText = [objective];
    expect(qualify(input).has(281)).toBe(false);
  });

  it.each(["barrel", "crate", "table", "chest"])(
    "retains an exact object interaction described on top of a %s", (surface) => {
      const input = fixture(body.replace("Damaged Crate on the ground", `Damaged Crate on top of the ${surface}`));
      expect(qualify(input).get(281)?.quest.objectEnds?.[0]?.objectId).toBe(261);
    },
  );

  it.each([
    "on top of the barrel and open the chest", "on top of the barrel, use a key",
    "on top of the crate then inspect the lock",
  ])("rejects extra actions after an object's surface description: %s", (suffix) => {
    const input = fixture(body.replace("Damaged Crate on the ground", `Damaged Crate ${suffix}`));
    expect(qualify(input).has(281)).toBe(false);
  });

  it("funds the complete source chain through a scouting object and a reporting return", () => {
    const input = fixture(body.replaceAll("on the ground", "on top of the barrel"));
    input.combat.quests.find((quest) => quest.questId === 281)!.objectiveText = [
      "Karl Boran wants you to check the cove north of Menethil.",
    ];
    const last = input.catalog.quests.find((quest) => quest.questId === 286)!;
    delete last.providedItem;
    last.unsupportedRequirements = ["unresolved-objective-text"];
    input.combat.quests.find((quest) => quest.questId === 286)!.objectiveText = [
      "Report your findings to Karl Boran in the Wetlands.",
    ];
    const before = structuredClone(input), selected = batch(input);
    expect(selected?.questIds).toEqual([281, 284, 285, 286]);
    expect(selected?.requiredKills).toBe(0);
    const forecast = forecastCampaignXp(component(input), progress());
    for (const member of forecast[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards).toHaveLength(4);
      expect(member.referenceQuestXp + member.estimatedQuestXp).toBe(4000);
      expect(member.combatXp).toBe(0);
    }
    expect(input).toEqual(before);
  });

  it("qualifies an object pickup followed by a named NPC conversation without a supplied item", () => {
    const input = fixture();
    const quest = input.catalog.quests.find((entry) => entry.questId === 286)!;
    delete quest.providedItem;
    quest.unsupportedRequirements = ["unresolved-objective-text"];
    input.combat.quests.find((entry) => entry.questId === 286)!.objectiveText = [
      "Speak with Karl Boran in the Wetlands.",
    ];
    const before = structuredClone(input), delivery = qualify(input).get(286);
    expect(delivery?.quest.objectStarts?.[0]?.objectId).toBe(259);
    expect(delivery?.quest.ends[0]?.npcId).toBe(1242);
    expect(delivery?.actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted", "rewarded",
    ]);
    expect(delivery?.actions[0]?.instructions.join(" ")).not.toContain("Each player receives");
    expect(batch(input)?.questIds).toEqual([281, 284, 285, 286]);
    expect(batch(input)?.requiredKills).toBe(0);
    expect(input).toEqual(before);
  });

  it.each([
    "Speak with Another NPC in the Wetlands.",
    "Speak with Karl Boran in Darkshore.",
    "Speak with Karl Boran and protect him.",
    "Speak with Karl Boran after collecting ten keys.",
  ])("holds an object pickup with an unproved conversation: %s", (objectiveText) => {
    const input = fixture();
    const quest = input.catalog.quests.find((entry) => entry.questId === 286)!;
    delete quest.providedItem;
    quest.unsupportedRequirements = ["unresolved-objective-text"];
    input.combat.quests.find((entry) => entry.questId === 286)!.objectiveText = [objectiveText];
    expect(qualify(input).has(286)).toBe(false);
  });

  it("keeps the complete object chain when its supplied parcel uses Give and a display-name article", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => quest.questId === 286
        ? { ...quest, providedItem: { itemId: 2625, name: "A Menethil Statuette" } }
        : quest),
    };
    input.combat = {
      ...input.combat,
      quests: input.combat.quests.map((quest) => quest.questId === 286
        ? { ...quest, objectiveText: ["Give Karl Boran the Menethil Statuette."] }
        : quest),
    };
    expect([...qualify(input).keys()]).toEqual([281, 284, 285, 286]);
    expect(batch(input)?.questIds).toEqual([281, 284, 285, 286]);
    expect(batch(input)?.requiredKills).toBe(0);
  });

  it("qualifies the whole chain without changing raw flags, NPC identities or source bindings", () => {
    const input = fixture(),
      before = structuredClone(input),
      deliveries = qualify(input);
    expect([...deliveries.keys()]).toEqual([281, 284, 285, 286]);
    const selected = batch(input)!;
    expect(selected.questIds).toEqual([281, 284, 285, 286]);
    expect(selected.requiredKills).toBe(0);
    expect(selected.actions).toHaveLength(8);
    for (const [questId, delivery] of deliveries) {
      expect(delivery.actions.map((action) => action.questChanges[0]!.state)).toEqual([
        "accepted",
        "rewarded",
      ]);
      expect(
        delivery.actions.every((action) => action.questChanges[0]!.objectiveIndex === null),
      ).toBe(true);
      expect(delivery.requiresFreshStart).toBe(true);
      expect(
        selected.actions
          .filter((action) => action.libraryQuestId === questId)
          .map((action) => action.source),
      ).toEqual(delivery.actions.map((action) => action.source));
    }
    expect(deliveries.get(281)!.quest.ends).toEqual([]);
    expect(deliveries.get(284)!.quest.starts).toEqual([]);
    expect(deliveries.get(284)!.quest.ends).toEqual([]);
    expect(deliveries.get(285)!.quest.objectEnds?.[0]!.objectId).toBe(259);
    expect(deliveries.get(286)!.actions[0]!.instructions.join(" ")).toContain(
      "Each player receives Menethil Statuette",
    );
    expect(input).toEqual(before);
  });

  it("does not grant generic eligibility from object metadata or cleared flags alone", () => {
    const input = fixture(),
      deliveries = qualify(input);
    const quest = input.catalog.quests.find((entry) => entry.questId === 284)!;
    expect(isSharedFundingQuest(quest)).toBe(false);
    expect(isSharedFundingQuest(deliveries.get(284)!.quest)).toBe(false);
    const catalog = sourceDeliveryFundingCatalog(input.catalog, deliveries);
    expect(
      campaignFundingBatch(
        catalog.quests.find((entry) => entry.questId === 284)!,
        catalog,
        input.combat,
        progress(),
        {
          legId: "prepare",
          checkpointId: "gate",
          targetLevel: 25,
          previous: point,
          forbiddenQuestIds: new Set(),
          maximumQuestLevel: 99,
          leaderOnly: false,
        },
      ),
    ).toBeNull();
  });

  it("requires the real parent rather than granting future quest rewards", () => {
    const input = fixture(),
      state = progress();
    state.members = state.members.map((member) => ({ ...member, questStates: {} }));
    expect(batch(input, state)).toBeNull();
    state.members = state.members.map((member) => ({
      ...member,
      level: 19,
      questStates: { "279": "rewarded" },
    }));
    expect(batch(input, state)).toBeNull();
  });

  it("retains every funded object handoff when refreshing the shared party policy", () => {
    const input = fixture(),
      plan = component(input);
    const catalog = sourceDeliveryFundingCatalog(input.catalog, qualify(input));
    const reviewed = applyCampaignPartyQuestPolicy(plan, input.sources, input.combat, catalog);
    const funded: CampaignPlan = {
      ...plan,
      partyPolicy: reviewed.partyPolicy!,
      questFunding: {
        revision: "explicit-quest-funding-20261105-v81",
        providerRevision: catalog.providerRevision,
        addedQuestIds: [281, 284, 285, 286],
        remaining: [],
        scenarios: [],
      },
    };
    const policy = refreshFundedCampaignPartyPolicy(funded, input.sources, input.combat, catalog);
    for (const questId of [281, 284, 285, 286])
      expect(policy?.decisions.find((decision) => decision.questId === questId)).toMatchObject({
        objective: "delivery",
        included: true,
      });
    expect(funded.actions).toEqual(plan.actions);
  });

  it.each(["accepted", "objectives-complete", "rewarded"] as const)(
    "does not assume fresh parcel work when one member has %s",
    (questState) => {
      const input = fixture(),
        state = progress();
      state.members[4] = {
        ...state.members[4]!,
        questStates: { "279": "rewarded", "285": questState },
      };
      expect(batch(input, state)).toBeNull();
    },
  );

  it.each([39, 40])(
    "keeps zero-combat hand-ins and the journal limit with %i occupied slots",
    (count) => {
      const input = fixture(),
        state = progress();
      const extra = Object.fromEntries(
        Array.from({ length: count }, (_, index) => [String(10000 + index), "accepted" as const]),
      );
      state.members = state.members.map((member) => ({
        ...member,
        questStates: { ...member.questStates, ...extra },
      }));
      const forecast = forecastCampaignXp(component(input), state);
      for (const member of forecast[0]!.members) {
        expect(member.combatRows).toEqual([]);
        expect(member.questLog.peak).toBe(40);
        expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(count === 40);
        expect(member.rewards.filter((reward) => reward.xp !== null)).toHaveLength(
          count === 40 ? 0 : 4,
        );
        expect(member.blockedReason === null).toBe(count === 39);
      }
    },
  );

  it.each([
    "foreign-object-export",
    "missing-object-export",
    "wrong-object-name",
    "wrong-object-zone",
    "missing-recipient",
    "missing-giver",
    "class-quest",
    "missing-parcel",
    "extra-item",
    "extra-kills",
    "extra-completion",
    "unknown-guard",
    "additional-work",
    "wrong-parcel",
    "incomplete",
    "abandoned",
  ] as const)("holds incomplete or unsupported %s", (reason) => {
    const input = fixture(
      reason === "extra-completion"
        ? body.replace(".turnin 281", ".complete 281,1\n.turnin 281")
        : reason === "unknown-guard"
          ? body.replace(".turnin 281", ".isOnQuest 999\n.turnin 281")
          : reason === "incomplete"
            ? body.replace(".turnin 281", "")
            : reason === "abandoned"
              ? body + "\nstep\n.abandon 281"
              : body,
    );
    const quest = input.catalog.quests.find((entry) => entry.questId === 281)!;
    const reference = input.combat.quests.find((entry) => entry.questId === 281)!;
    let target = 281;
    if (reason === "foreign-object-export") input.combat.provider.objectSha256 = "1".repeat(64);
    if (reason === "missing-object-export") delete input.catalog.objectSha256;
    if (reason === "wrong-object-name") quest.objectEnds![0]!.name = "Other Crate";
    if (reason === "wrong-object-zone")
      quest.objectEnds![0]!.positions = [{ ...point, zone: "1439" }];
    if (reason === "missing-recipient") quest.objectEnds = [];
    if (reason === "missing-giver") quest.starts = [];
    if (reason === "class-quest") quest.requiredClasses = 4;
    if (reason === "extra-item")
      reference.itemObjectives = [
        { itemId: 1, quantity: 10, objectiveIndex: 1, npcIds: [], sharing: "pooled" },
      ];
    if (reason === "extra-kills") reference.creatureIds = [1];
    if (reason === "additional-work")
      reference.objectiveText = ["Search the crates and kill ten guards."];
    if (reason === "missing-parcel" || reason === "wrong-parcel") {
      target = 286;
      const parcel = input.catalog.quests.find((entry) => entry.questId === target)!;
      if (reason === "missing-parcel") delete parcel.providedItem;
      else parcel.providedItem!.name = "Other Statuette";
    }
    expect(qualify(input).has(target)).toBe(false);
  });
});
