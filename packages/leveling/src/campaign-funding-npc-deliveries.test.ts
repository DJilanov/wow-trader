import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { npcDeliveryRecipients, providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";
import { npcDeliveryFundingCatalog } from "./campaign-funding-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { fundCampaignQuestGaps } from "./campaign-quest-funding.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  campaignSourceDeliveries,
  sourceDeliveryFundingCatalog,
} from "./campaign-source-deliveries.js";

const position = { zone: "1429", x: 50, y: 50 };
const recipient = {
  npcId: 235,
  name: "Archivist",
  friendlyToAlliance: true,
  positions: [{ ...position, x: 52 }],
};

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; combat: CombatDataset } {
  const quest: QuestCatalogEntry = {
    questId: 320002,
    title: "Report to the archive",
    minimumLevel: 1,
    questLevel: 30,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [{ ...recipient, npcId: 234, name: "Messenger", positions: [position] }],
    ends: [
      { ...recipient, npcId: 236, name: "Merchant", positions: [{ ...position, x: 50.1 }] },
      recipient,
    ],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "delivery",
    objectives: [],
    unsupportedRequirements: ["unresolved-objective-text"],
  };
  const first: CampaignAction = {
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
      questId: 320001,
      title: "First message",
      state,
      objectiveIndex: null,
    })),
  };
  const gate: CampaignAction = {
    ...first,
    id: "gate",
    kind: "xp-check",
    targetLevel: 3,
    questChanges: [],
  };
  return {
    plan: {
      release: "npc-delivery-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [first, gate],
      legs: [
        {
          id: "prepare",
          title: "Elwynn Forest",
          kind: "preparation",
          from: 1,
          to: 3,
          stopId: null,
          actionIds: [first.id, gate.id],
          questIds: [320001],
          unresolvedQuestIds: [],
        },
      ],
      rewardFacts: [400, 1000].map((fullXp, index) => ({
        questId: 320001 + index,
        fullXp,
        questLevel: index === 0 ? 3 : 30,
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
      quests: [quest],
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
      quests: [
        {
          questId: 320002,
          creatureIds: [],
          itemCreatureIds: [],
          onlyCreatureObjectives: false,
          objectiveText: ["Report to Archivist in Goldshire."],
        },
      ],
      npcs: [],
      dungeons: [],
      killXpEvidence: [],
    },
  };
}
function view(input: ReturnType<typeof fixture>): QuestCatalog {
  return npcDeliveryFundingCatalog(input.catalog, input.combat, new Set());
}

const handoffSource =
  "step\n.goto 1429,50,50\n.target Messenger\n.accept 320002 >>Accept Report to the archive\n.isNotOnQuest 320002\nstep\n.goto 1429,52,50\n.target Archivist\n.turnin 320002 >>Turn in Report to the archive\n.isOnQuest 320002";

function capturedFixture(
  body: string = handoffSource,
): ReturnType<typeof fixture> & { sources: CampaignSource[] } {
  const input = fixture();
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 116)!;
  const guide = parseGuideChapter(body, reference.id, "f".repeat(64), 70205);
  input.plan = {
    ...input.plan,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: [320002],
    sourceArchiveSha256: "f".repeat(64),
  };
  input.combat.quests[0]!.objectiveText = ["Find Archivist near the Goldshire road."];
  return { ...input, sources: [{ reference, guide }] };
}

function fundCaptured(input: ReturnType<typeof capturedFixture>): CampaignPlan {
  return fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog, {
    includeSourceDeliveries: true,
  });
}

function capturedLetterFixture(): ReturnType<typeof capturedFixture> {
  const input = capturedFixture();
  input.catalog.quests[0]!.providedItem = { itemId: 957, name: "Letter to Archivist" };
  input.catalog.quests[0]!.unsupportedRequirements.push("provided-item-interaction");
  input.combat.quests[0]!.objectiveText = ["Deliver Messenger's letter to Archivist in Goldshire."];
  return input;
}

describe("complete named-NPC delivery objectives", () => {
  it.each([
    "Go to Goldshire, and speak with Archivist.",
    "Go to Goldshire and speak to Archivist.",
    "Travel to Goldshire and speak with Archivist.",
    "Travel to Archivist in Goldshire.",
    "Travel to Archivist on the border of Goldshire and Northshire.",
    "Messenger wants you to speak with Archivist.",
    "Report your findings to Archivist in Goldshire.",
    "Report your progress to Archivist.",
    "Report the planned attack to Archivist in Goldshire.",
  ])("binds the full recipient and destination in %s", (objective) => {
    const input = fixture();
    input.combat.quests[0]!.objectiveText = [objective];
    const before = structuredClone(input);
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([
      recipient,
    ]);
    expect(view(input).quests[0]!.unsupportedRequirements).toEqual([]);
    expect(input).toEqual(before);
  });

  it.each([
    "Go to Stormwind and speak with Archivist.",
    "Go to Goldshire and speak with Unknown.",
    "Go to Goldshire and collect a key and speak with Archivist.",
    "Go to Goldshire and speak with Archivist and open a chest.",
    "Go to Goldshire and speak with Archivist. Use a key.",
    "Travel to Archivist in Goldshire using a key.",
    "Travel to Archivist on the border of Stormwind and Ironforge.",
    "Travel to Archivist on the border of Goldshire and Northshire and Stormwind.",
    "Unknown wants you to speak with Archivist.",
    "Messenger wants you to speak with Archivist after killing a guard.",
    "Report your findings to Unknown in Goldshire.",
    "Report your findings to Archivist in Stormwind.",
    "Report your findings and open a chest to Archivist.",
    "Report your findings to the guard and open a chest to Archivist.",
    "Report the attack to Archivist and use a key.",
  ])("holds contradictory or additional work in %s", (objective) => {
    const input = fixture();
    input.combat.quests[0]!.objectiveText = [objective];
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([]);
    expect(view(input)).toBe(input.catalog);
  });

  it("retains a captured travel program and its prerequisite checks when its wording also qualifies generically", () => {
    const input = capturedFixture();
    input.combat.quests[0]!.objectiveText = ["Go to Goldshire and speak with Archivist."];
    const result = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog);
    expect(result.get(320002)?.actions.every((action) => action.source !== null)).toBe(true);
    expect(result.get(320002)?.actions.map((action) => action.source?.stepId)).toEqual([
      "source-step-0001",
      "source-step-0002",
    ]);
  });
});

describe("source-qualified NPC travel objectives", () => {
  it("keeps a captured handoff with a bound wait for its dependent NPC quest", () => {
    const childId = 320003;
    const input = capturedFixture(handoffSource.replace(
      ".turnin 320002 >>Turn in Report to the archive",
      `.turnin 320002 >>Turn in Report to the archive\n.timer 6,Archive RP\n.accept ${childId}`,
    ));
    input.plan = { ...input.plan, sharedSourceQuestIds: [320002, childId] };
    input.catalog.quests.push({ ...input.catalog.quests[0]!, questId: childId,
      title: "The next report", starts: [recipient], ends: [recipient],
      prerequisites: { allOf: [320002], anyOf: [] },
    });
    const before = structuredClone(input);
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002)).toBe(true);
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toContain(320002);
    const native = compileCampaignAddon(funded, funded.actions, { version: "0.2.0-review.npc-handoff",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: input.sources });
    expect(native.lua).toContain(".turnin 320002");
    expect(native.lua).not.toContain(`.accept ${childId}`);
    expect(input).toEqual(before);
  });

  it.each(["0", "1", "som", "0 << UnknownCondition", "2 << UnknownCondition"])(
    "preserves the season gate %s",
    (season) => {
      const input = capturedFixture(
        handoffSource.replaceAll("step\n", `step\n#season ${season}\n`),
      );
      input.combat.quests[0]!.objectiveText = ["Travel south and check on Archivist."];
      expect(
        campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(
          320002,
        ),
      ).toBe(season.startsWith("0"));
    },
  );

  it.each([
    "Travel to Archivist in Goldshire.",
    ...["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"].map(
      (direction) => `Travel ${direction} and check on Archivist.`,
    ),
  ])("retains both source phases for %s", (objective) => {
    const input = capturedFixture();
    input.combat.quests[0]!.objectiveText = [objective];
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.actions.map((action) => action.questChanges[0]?.state)).toEqual([
      "accepted",
      "rewarded",
    ]);
    expect(fundCaptured(input).questFunding?.addedQuestIds).toContain(320002);
  });

  it.each([
    "Travel to the monument in Goldshire.",
    "Travel south and check on Merchant.",
    "Travel south and collect a key before checking on Archivist.",
    "Travel south and check on Archivist and collect a key.",
    "Travel south and check on Archivist. Obtain a key.",
    "Travel to Archivist in Goldshire and open a chest.",
    "Travel to Archivist in Goldshire using a key.",
    "Travel to Archivist in Goldshire loot a chest.",
    "Travel to Archivist in Goldshire acquire a key.",
    "Travel to Archivist in Goldshire buy a potion.",
    "Travel to Archivist in Goldshire inspect a monument.",
    "Travel to Archivist in Goldshire where you must summon a guard.",
    "Travel south and check on Archivist after killing a guard.",
  ])("holds extra work or an unbound destination: %s", (objective) => {
    const input = capturedFixture();
    input.combat.quests[0]!.objectiveText = [objective];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002),
    ).toBe(false);
    expect(fundCaptured(input).questFunding?.addedQuestIds).not.toContain(320002);
  });
});

describe("source-qualified parent item handoffs", () => {
  function parentItemFixture(): ReturnType<typeof capturedFixture> {
    const input = capturedFixture();
    const child = input.catalog.quests[0]!;
    child.providedItem = { itemId: 957, name: "Glowing Gem" };
    child.unsupportedRequirements.push("provided-item-interaction");
    child.prerequisites = { allOf: [], anyOf: [320001] };
    input.catalog.quests.push({
      ...child,
      questId: 320001,
      title: "First message",
      questLevel: 3,
      providedItem: undefined,
      ends: child.starts,
      category: "unsupported",
      prerequisites: { allOf: [], anyOf: [] },
      unsupportedRequirements: [],
    });
    input.combat.quests.push({
      questId: 320001,
      creatureIds: [],
      itemCreatureIds: [114],
      onlyCreatureObjectives: false,
      objectiveText: ["Bring a Glowing Gem to Messenger."],
      itemObjectives: [
        {
          itemId: 957,
          itemName: "Glowing Gem",
          quantity: 1,
          objectiveIndex: 1,
          npcIds: [114],
          sharing: "shared-roll",
        },
      ],
    });
    input.combat.npcs = [
      {
        id: 114,
        name: "Forest Spider",
        minimumLevel: 1,
        maximumLevel: 1,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ];
    input.combat.lootDrops = [
      {
        itemId: 957,
        npcId: 114,
        probability: 1,
        probabilityBasis: "sample-ratio",
        minimumQuantity: 1,
        maximumQuantity: 1,
        sampleSize: 10,
        targetBuild: 70205,
        sourceBuild: null,
        sourceUrl: "https://example.test/item",
        capturedAt: "2026-11-01T00:00:00.000Z",
        sourceSha256: "e".repeat(64),
        probabilityReference: {
          kind: "classic-1.12-reference",
          repository: "https://github.com/cmangos/classic-db",
          revision: "0".repeat(40),
          file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
          sha256: "0".repeat(64),
          sourceBuild: 5875,
          referencedAt: "2026-11-01T00:00:00.000Z",
          itemId: 957,
          npcId: 114,
          lootEntry: 114,
          probability: 1,
          questOnly: true,
          rateMultiplier: 1,
        },
      },
    ];
    input.plan = {
      ...input.plan,
      sharedSourceQuestIds: [320001, 320002],
      actions: input.plan.actions.map((action, index): CampaignAction =>
        index === 0
          ? {
              ...action,
              questChanges: [
                action.questChanges[0]!,
                {
                  questId: 320001,
                  title: "First message",
                  state: "objectives-complete",
                  objectiveIndex: 1,
                },
                action.questChanges[1]!,
              ],
            }
          : action,
      ),
    };
    return input;
  }

  it("binds a supplied handoff item to the acquired item and recipient of its required parent", () => {
    const input = parentItemFixture(),
      before = structuredClone(input);
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.quest.providedItem).toEqual({ itemId: 957, name: "Glowing Gem" });
    expect(delivery?.quest.prerequisites).toEqual({ allOf: [], anyOf: [320001] });
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const control = structuredClone(input);
    delete control.catalog.quests[0]!.providedItem;
    control.catalog.quests[0]!.unsupportedRequirements = ["unresolved-objective-text"];
    const controlMembers = forecastCampaignGuide(fundCaptured(control), emptyPremadeProgress())
      .sections[0]!.forecast.members;
    let index = 0;
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual(controlMembers[index]!.endpoint);
      expect(member.combatXp).toBe(controlMembers[index++]!.combatXp);
      expect(member.combatRows.reduce((total, row) => total + row.kills, 0)).toBe(1);
      expect(member.rewards.filter((row) => row.questId === 320002)).toHaveLength(1);
    }
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.parent-item",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).toContain("Glowing Gem");
    expect(artifact.lua).toContain(".turnin 320002");
    expect(artifact.lua).not.toContain(".collect 957");
    expect(artifact.lua).not.toContain(".use 957");
    expect(input).toEqual(before);
  });

  it("preserves alternative prerequisites when every branch establishes the same item continuity", () => {
    const input = parentItemFixture();
    input.catalog.quests[0]!.prerequisites.anyOf.push(320003);
    input.catalog.quests.push({ ...input.catalog.quests[1]!, questId: 320003 });
    input.combat.quests.push({ ...input.combat.quests[1]!, questId: 320003 });
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(320002)
        ?.quest.prerequisites,
    ).toEqual({ allOf: [], anyOf: [320001, 320003] });
  });

  it.each([
    "no-parent",
    "missing-parent",
    "missing-reference",
    "wrong-item",
    "wrong-name",
    "unknown-quantity",
    "missing-item-name",
    "parent-provided",
    "parent-class",
    "ambiguous-parent-npc",
    "parent-provided-item",
    "wrong-npc",
    "unproven-alternative",
    "use",
    "extra-work",
  ] as const)("holds an unproven parent-item handoff: %s", (reason) => {
    const input = parentItemFixture();
    if (reason === "no-parent") input.catalog.quests[0]!.prerequisites.anyOf = [];
    if (reason === "missing-parent") input.catalog.quests.pop();
    if (reason === "missing-reference") input.combat.quests.pop();
    if (reason === "wrong-item") input.combat.quests[1]!.itemObjectives![0]!.itemId = 958;
    if (reason === "wrong-name") input.combat.quests[1]!.itemObjectives![0]!.itemName = "Other Gem";
    if (reason === "unknown-quantity") input.combat.quests[1]!.itemObjectives![0]!.quantity = null;
    if (reason === "missing-item-name") delete input.combat.quests[1]!.itemObjectives![0]!.itemName;
    if (reason === "parent-provided") input.combat.quests[1]!.itemObjectives![0]!.provided = true;
    if (reason === "parent-class") input.catalog.quests[1]!.requiredClasses = 8;
    if (reason === "ambiguous-parent-npc")
      input.catalog.quests[1]!.ends = [...input.catalog.quests[1]!.ends, recipient];
    if (reason === "parent-provided-item")
      input.catalog.quests[1]!.providedItem = { itemId: 957, name: "Glowing Gem" };
    if (reason === "wrong-npc") input.catalog.quests[1]!.ends = [recipient];
    if (reason === "unproven-alternative")
      input.catalog.quests[0]!.prerequisites.anyOf.push(999999);
    if (reason === "use") input.sources = capturedFixture(handoffSource + "\n.use 957").sources;
    if (reason === "extra-work")
      input.combat.quests[0]!.objectiveText = ["Find Archivist in Goldshire open a chest."];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002),
    ).toBe(false);
  });
});

describe("source-qualified pickup letters", () => {
  it("binds the item's addressee and objective's sender to the actual source NPCs", () => {
    const input = capturedLetterFixture(),
      before = structuredClone(input),
      quest = input.catalog.quests[0]!;
    expect(providedItemDeliveryRecipients(quest, input.combat.quests[0])).toEqual([]);
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.get(320002)?.quest.providedItem).toEqual(quest.providedItem);
    expect(deliveries.get(320002)?.quest.unsupportedRequirements).toEqual([]);
    expect(deliveries.get(320002)?.actions.map((action) => action.source?.stepId)).toEqual(
      input.sources[0]!.guide.steps.map((step) => step.id),
    );
    expect(
      fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((reward) => reward.questId === 320002)).toHaveLength(1);
    }
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.source-letter",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).toContain(".accept 320002");
    expect(artifact.lua).toContain(".turnin 320002");
    expect(artifact.lua).not.toContain(".collect 957");
    expect(artifact.lua).not.toContain(".complete 320002");
    expect(input).toEqual(before);
  });

  it("binds a response to its full sender even when the item uses the sender's title", () => {
    const input = capturedLetterFixture();
    input.sources = capturedFixture(
      handoffSource.replace(".target Messenger", ".target General Marcus Jonathan"),
    ).sources;
    input.catalog.quests[0]!.starts[0]!.name = "General Marcus Jonathan";
    input.catalog.quests[0]!.providedItem!.name = "The General's Response";
    input.combat.quests[0]!.objectiveText = [
      "Take General Marcus Jonathan's letter of response to Archivist in Goldshire.",
    ];
    expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([320002]);
  });

  it.each([
    ["Balthule", "Delgren"],
    ["Balthule Shadowstrike", "Delgren"],
    ["Balthule", "Delgren the Purifier"],
    ["Balthule Shadowstrike", "Delgren the Purifier"],
  ])("uses source-bound full names for the letter from %s to %s", (sender, addressee) => {
    const input = capturedLetterFixture();
    input.sources = capturedFixture(
      handoffSource
        .replace(".target Messenger", ".target Balthule Shadowstrike")
        .replace(".target Archivist", ".target Delgren the Purifier"),
    ).sources;
    input.catalog.quests[0]!.starts[0]!.name = "Balthule Shadowstrike";
    input.catalog.quests[0]!.ends = [{ ...recipient, name: "Delgren the Purifier" }];
    input.catalog.quests[0]!.providedItem!.name = `Letter to ${addressee}`;
    input.combat.quests[0]!.objectiveText = [
      `Deliver ${sender}'s letter to Delgren the Purifier in Ashenvale Forest.`,
    ];
    expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([320002]);
  });

  it.each([
    "wrong-addressee",
    "wrong-sender",
    "unrelated-item",
    "find-objective",
    "extra-work",
    "use",
    "collect",
    "missing-provided-item",
    "item-objective",
    "start-item",
    "item-provenance",
    "missing-target",
    "class-access",
    "required-source-item",
  ] as const)("holds a letter without complete parcel evidence: %s", (reason) => {
    const input = capturedLetterFixture(),
      quest = input.catalog.quests[0]!;
    let body = handoffSource;
    if (reason === "wrong-addressee") quest.providedItem!.name = "Letter to Another Archivist";
    if (reason === "wrong-sender")
      input.combat.quests[0]!.objectiveText = [
        "Deliver Someone's letter to Archivist in Goldshire.",
      ];
    if (reason === "unrelated-item") quest.providedItem!.name = "Key to Archivist";
    if (reason === "find-objective")
      input.combat.quests[0]!.objectiveText = ["Find Archivist in Goldshire."];
    if (reason === "extra-work")
      input.combat.quests[0]!.objectiveText = [
        "Deliver Messenger's letter to Archivist in Goldshire and collect three records.",
      ];
    if (reason === "use") body += "\n.use 957";
    if (reason === "collect")
      body = body.replace(
        "step\n.goto 1429,52",
        "step\n.collect 957,1,320002,1\nstep\n.goto 1429,52",
      );
    if (reason === "missing-provided-item") delete quest.providedItem;
    if (reason === "item-objective")
      input.combat.quests[0]!.itemObjectives = [
        {
          itemId: 957,
          itemName: "Letter",
          quantity: 1,
          objectiveIndex: 1,
          npcIds: [],
          sharing: "pooled",
        },
      ];
    if (reason === "start-item")
      input.combat.quests[0]!.startItem = { itemId: 957, name: "Letter" };
    if (reason === "item-provenance") input.catalog.itemSha256 = "0".repeat(64);
    if (reason === "missing-target") body = body.replace(".target Archivist\n", "");
    if (reason === "class-access") quest.requiredClasses = 8;
    if (reason === "required-source-item")
      quest.unsupportedRequirements.push("requiredSourceItems");
    input.sources = capturedFixture(body).sources;
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).size,
    ).toBe(0);
    if (reason === "item-provenance")
      expect(() => fundCaptured(input)).toThrow("different item export");
    else expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([]);
  });
});

describe("source-bound adjacent NPC visits", () => {
  function adjacentFixture(): ReturnType<typeof capturedFixture> {
    const input = capturedFixture(
      "step\n.goto 1429,50,50\n.target Messenger\n.turnin 320001\n.isQuestComplete 320001\n" +
        handoffSource
          .replace(".goto 1429,50,50\n", "")
          .replace(".isNotOnQuest 320002", ".isQuestTurnedIn 320001"),
    );
    const quest = input.catalog.quests[0]!;
    quest.prerequisites.anyOf = [320001];
    input.catalog.quests.push({
      ...quest,
      questId: 320001,
      title: "First message",
      questLevel: 3,
      prerequisites: { allOf: [], anyOf: [] },
      ends: [{ ...quest.starts[0]! }],
      unsupportedRequirements: [],
    });
    input.plan = { ...input.plan, sharedSourceQuestIds: [320001, 320002] };
    return input;
  }

  it("adds a separate captured approach while preserving the map-less pickup and its guards", () => {
    const input = adjacentFixture(),
      before = structuredClone(input);
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.actions[0]!.positions).toEqual([]);
    const funded = fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog, {
      includeSourceDeliveries: true,
      includeCatalogApproaches: true,
    });
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const pickupIndex = funded.actions.findIndex(
      (action) => action.libraryQuestId === 320002 && action.questChanges[0]?.state === "accepted",
    );
    const pickup = funded.actions[pickupIndex]!;
    expect(pickup.positions).toEqual([]);
    expect(pickup.source?.stepId).toBe(input.sources[0]!.guide.steps[1]!.id);
    const approach = funded.actions[pickupIndex - 1]!;
    expect(approach.source).toBeNull();
    expect(approach.questChanges).toEqual([]);
    expect(approach.positions).toEqual(
      input.sources[0]!.guide.steps[0]!.directives.flatMap((row) =>
        row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
      ),
    );
    expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([]);
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.adjacent-npc",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).toContain(".goto 1429,50,50");
    expect(artifact.lua).toContain(".isQuestTurnedIn 320001");
    const document = artifact.documents.find(
      (row) => row.role === "party" && row.actionIds.includes(approach.id),
    );
    const body = document?.content.split(`#label kfc-${approach.id}\n`)[1]?.split(/\nstep/)[0];
    expect(body).toContain(".goto 1429,50,50");
    expect(body).not.toContain(".turnin 320001");
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
    }
    expect(input).toEqual(before);
  });

  it.each([
    "other-npc",
    "no-parent-return",
    "wrong-return",
    "other-zone",
    "bad-coordinate",
    "second-position",
    "extra-work",
    "foreign-guard",
    "intervening-travel",
    "unknown-parent",
  ] as const)("does not inherit an unproven previous NPC location: %s", (reason) => {
    const input = adjacentFixture(),
      guide = input.sources[0]!.guide;
    const previous = guide.steps[0]!;
    if (reason === "other-npc")
      previous.directives.find((row) => row.tag === ".target")!.arguments = "Someone Else";
    if (reason === "no-parent-return")
      previous.directives = previous.directives.filter((row) => row.tag !== ".turnin");
    if (reason === "wrong-return")
      previous.directives.find((row) => row.tag === ".turnin")!.questId = 999999;
    if (reason === "other-zone")
      previous.directives.find((row) => row.position)!.position!.zone = "1433";
    if (reason === "bad-coordinate")
      previous.directives.find((row) => row.position)!.position!.x = 101;
    if (reason === "second-position")
      previous.directives.push({ ...previous.directives.find((row) => row.position)! });
    if (reason === "extra-work")
      previous.directives.push({
        tag: ".use",
        arguments: "957",
        sourceLine: 1,
        text: "",
        condition: "",
        questId: null,
        position: null,
      });
    if (reason === "foreign-guard")
      previous.directives.find((row) => row.tag === ".isQuestComplete")!.arguments = "999999";
    if (reason === "intervening-travel")
      guide.steps.splice(1, 0, {
        ...previous,
        id: "intervening-step",
        directives: previous.directives.filter((row) => row.position),
      });
    if (reason === "unknown-parent")
      input.catalog.quests = input.catalog.quests.filter((quest) => quest.questId !== 320001);
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).size,
    ).toBe(0);
    expect(
      fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog, {
        includeSourceDeliveries: true,
        includeCatalogApproaches: true,
      }).questFunding?.addedQuestIds,
    ).toEqual([]);
  });
});

describe("verified zero-item NPC deliveries", () => {
  it.each([
    ["the Greenwarden", true],
    ["Greenwarden", false],
    ["the Keeper", false],
    ["the Greenwarden and retrieve a journal", false],
  ])(
    "binds the literal NPC title in Find %s only to its full captured recipient",
    (title, accepted) => {
      const input = capturedFixture(
        handoffSource.replace(".target Archivist", ".target Rethiel the Greenwarden"),
      );
      input.catalog.quests[0]!.ends = [{ ...recipient, name: "Rethiel the Greenwarden" }];
      input.combat.quests[0]!.objectiveText = [`Find ${title}.`];
      const deliveries = campaignSourceDeliveries(
        input.plan,
        input.sources,
        input.combat,
        input.catalog,
      );
      expect(deliveries.has(320002)).toBe(accepted);
      expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([]);
    },
  );

  it("funds a captured Find-NPC handoff while retaining its source guards and positions", () => {
    const input = capturedFixture();
    const before = structuredClone(input);
    expect(view(input)).toBe(input.catalog);
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.get(320002)?.actions).toHaveLength(2);
    const sourceCatalog = sourceDeliveryFundingCatalog(input.catalog, deliveries);
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignFundingBatch(sourceCatalog.quests[0]!, sourceCatalog, input.combat, progress, {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
        sourceDeliveries: deliveries,
      })?.questIds,
    ).toEqual([320002]);
    expect(
      fundCampaignQuestGaps(input.plan, input.sources, input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const actions = funded.actions.filter((action) => action.libraryQuestId === 320002);
    expect(actions.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "rewarded",
    ]);
    expect(actions.map((action) => action.source?.stepId)).toEqual(
      input.sources[0]!.guide.steps.map((step) => step.id),
    );
    expect(actions[1]!.positions[0]!.position).toMatchObject({ zone: "1429", x: 52, y: 50 });
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.source-handoff",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(addon.lua).toContain(".isOnQuest 320002");
    expect(addon.lua).toContain(".isNotOnQuest 320002");
    expect(addon.lua).not.toContain(".complete 320002");
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((reward) => reward.questId === 320002)).toHaveLength(1);
    }
    expect(input).toEqual(before);
  });

  it.each([
    ["Seek out Archivist.", true],
    ["Seek out the Archivist in Goldshire.", true],
    ["Find the Archivist in Goldshire.", true],
    ["Seek out Merchant in Goldshire.", false],
    ["Seek out the Archivist in Goldshire and collect records.", false],
    ["Seek out the Archivist after killing the guardian.", false],
    ["Seek out the Archivist. Open the chest.", false],
    ["Seek out the Archivist in Goldshire before returning.", false],
  ] as const)("requires the captured recipient and no extra work in %s", (text, expected) => {
    const input = capturedFixture();
    input.combat.quests[0]!.objectiveText = [text];
    const before = structuredClone(input);
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.has(320002)).toBe(expected);
    if (expected) {
      expect(deliveries.get(320002)?.quest.ends).toEqual([recipient]);
      expect(deliveries.get(320002)?.actions).toHaveLength(2);
      expect(deliveries.get(320002)?.actions.every((action) => action.source)).toBe(true);
    }
    expect(input).toEqual(before);
  });

  it("uses a short objective name only when the source binds the full recipient", () => {
    const input = capturedFixture(
      handoffSource.replace(".target Archivist", ".target Gaxim Rustfizzle"),
    );
    input.catalog.quests[0]!.ends = [{ ...recipient, name: "Gaxim Rustfizzle" }];
    input.combat.quests[0]!.objectiveText = ["Speak to Gaxim."];
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.get(320002)?.quest.ends).toEqual(input.catalog.quests[0]!.ends);
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([]);
  });

  it.each([
    ["Talk to Catelyn in Booty Bay.", true],
    ["Speak to Catelyn at the inn.", true],
    ["Find Catelyn near the harbor.", true],
    ["Talk to Cate in Booty Bay.", false],
    ["Talk to Catelyn in Booty Bay and collect a key.", false],
    ["Talk to Catelyn in Booty Bay before killing the guard.", false],
    ["Talk to Catelyn in Booty Bay. Open the chest.", false],
  ] as const)("binds a short name and place to the full captured recipient: %s", (text, expected) => {
    const input = capturedFixture(handoffSource.replace(".target Archivist", ".target Catelyn the Blade"));
    input.catalog.quests[0]!.ends = [{ ...recipient, name: "Catelyn the Blade" }];
    input.combat.quests[0]!.objectiveText = [text];
    const before = structuredClone(input);
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002))
      .toBe(expected);
    expect(input).toEqual(before);
    input.sources = capturedFixture(handoffSource).sources;
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002))
      .toBe(false);
  });

  it.each([["!SM", false], ["SM", true]] as const)(
    "requires the source dungeon branch to have already matched: %s", (marker, expected) => {
      const input = capturedFixture(handoffSource.replaceAll("step\n", `step\n.dungeon ${marker}\n`));
      const before = structuredClone(input);
      expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002))
        .toBe(expected);
      expect(input).toEqual(before);
    },
  );

  it("exports the same resolved dungeon branch that qualified the courier", () => {
    const input = capturedFixture(handoffSource.replaceAll("step\n", "step\n.dungeon SM\n"));
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.courier-branch", runtimeBuild: 70450,
      interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: input.sources,
    });
    for (const role of ["leader", "party"] as const) {
      const text = addon.documents.filter((document) => document.role === role)
        .map((document) => document.content).join("\n");
      expect(text).toContain(".accept 320002");
      expect(text).toContain(".turnin 320002");
      expect(text).not.toContain(".dungeon SM");
    }
  });

  it.each([
    ["Check on the old man in the shack near Raven Hill cemetery.", true],
    ["Check on the elderly woman in the house in Goldshire.", true],
    ["Check on the old man.", false],
    ["Check on the old man in the shack near Goldshire and collect supplies.", false],
    ["Check on the old man in the shack near Goldshire open the chest.", false],
    ["Check on the old man in the shack near Goldshire return with his key.", false],
  ] as const)("requires a bounded person visit and one captured NPC for %s", (text, expected) => {
    const input = capturedFixture();
    input.catalog.quests[0]!.ends = [recipient];
    input.combat.quests[0]!.objectiveText = [text];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002),
    ).toBe(expected);
    const ambiguous = {
      ...input.catalog,
      quests: input.catalog.quests.map((quest) => ({
        ...quest,
        ends: [recipient, { ...recipient, npcId: 999, name: "Another NPC" }],
      })),
    };
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, ambiguous).has(320002),
    ).toBe(false);
  });

  it("ignores a pre-pickup reset only for a fresh complete NPC program, never emitting abandonment", () => {
    const input = capturedFixture("step\n.abandon 320002\n" + handoffSource);
    const before = structuredClone(input);
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.get(320002)?.requiresFreshStart).toBe(true);
    const catalog = sourceDeliveryFundingCatalog(input.catalog, deliveries);
    const progress = emptyPremadeProgress();
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
      forbiddenQuestIds: new Set<number>(),
      maximumQuestLevel: 5,
      leaderOnly: false,
      sourceDeliveries: deliveries,
    };
    const batch = campaignFundingBatch(
      catalog.quests[0]!,
      catalog,
      input.combat,
      progress,
      options,
    );
    expect(batch?.actions).toHaveLength(2);
    for (const state of ["accepted", "objectives-complete"] as const) {
      const started = {
        ...progress,
        members: progress.members.map((member, index) =>
          index === 0
            ? { ...member, questStates: { ...member.questStates, "320002": state } }
            : member,
        ),
      };
      expect(
        campaignFundingBatch(catalog.quests[0]!, catalog, input.combat, started, options),
      ).toBeNull();
    }
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toContain(320002);
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-reset-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).not.toContain(".abandon 320002");
    expect(input).toEqual(before);
  });

  it.each([
    handoffSource + "\nstep\n.abandon 320002",
    handoffSource.replace(
      "step\n.goto 1429,52,50",
      "step\n.abandon 320002\nstep\n.goto 1429,52,50",
    ),
    "step\n.abandon 320002\n.isQuestComplete 999999\n" + handoffSource,
    "step\n.abandon 320002\n.use 123\n" + handoffSource,
    "step\n.abandon 320002\n.abandon 320003\n" + handoffSource,
    "step\n.abandon 320002,1\n" + handoffSource,
  ])("retains the hold for ambiguous or intervening resets: %s", (content) => {
    const input = capturedFixture(content);
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002),
    ).toBe(false);
  });

  it("does not dismiss a reset from another source chapter", () => {
    const input = capturedFixture();
    const reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 115)!;
    const other: CampaignSource = {
      reference,
      guide: parseGuideChapter("step\n.abandon 320002", reference.id, "f".repeat(64), 70205),
    };
    expect(
      campaignSourceDeliveries(
        input.plan,
        [...input.sources, other],
        input.combat,
        input.catalog,
      ).has(320002),
    ).toBe(false);
  });

  it.each([
    ["Bring the Ghost Hair Thread to Archivist, in his shack north of Goldshire.", true],
    ["Bring the Ghost Hair Thread to Archivist at Goldshire.", true],
    ["Return the Ghost Hair Thread to Archivist in Goldshire.", true],
    ["Bring the Ghost Hair Thread to Merchant, in Goldshire.", false],
    ["Bring the Ghost Hair Thread to Archivist, in Goldshire open the chest.", false],
    ["Bring the Ghost Hair Thread to Archivist, in Goldshire, ask for the key.", false],
    ["Bring the Ghost Hair Thread to Archivist, in Goldshire then use it.", false],
  ] as const)(
    "binds a parcel's comma-separated address without extra work: %s",
    (text, expected) => {
      const input = capturedLetterFixture();
      input.catalog.quests[0]!.ends = [recipient];
      input.catalog.quests[0]!.providedItem = { itemId: 957, name: "Ghost Hair Thread" };
      input.combat.quests[0]!.objectiveText = [text];
      expect(
        providedItemDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0]).map(
          (npc) => npc.npcId,
        ),
      ).toEqual(expected ? [recipient.npcId] : []);
    },
  );

  it.each([
    ["Teronis' Corpse", "Teronis"],
    ["Archivist's Corpse", "Archivist"],
    ["Teronis’ Corpse", "Teronis"],
  ])("binds Find %s to its actual captured corpse NPC", (npcName, objectiveName) => {
    const input = capturedFixture(
      handoffSource
        .replace(".target Archivist", `.target ${npcName}`)
        .replace(
          ".turnin 320002 >>Turn in Report to the archive",
          ".turnin 320002 >>Turn in Report to the archive\n.accept 320003",
        ),
    );
    input.catalog.quests[0]!.ends = [{ ...recipient, name: npcName }];
    input.combat.quests[0]!.objectiveText = [`Find ${objectiveName} in Goldshire.`];
    const before = structuredClone(input);
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([]);
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.quest.ends[0]?.name).toBe(npcName);
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((row) => row.questId === 320002)).toHaveLength(1);
    }
    const artifact = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.corpse-npc",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    expect(artifact.lua).toContain(npcName);
    expect(artifact.lua).toContain(".turnin 320002");
    expect(artifact.lua).not.toContain(".complete 320002");
    const reward = funded.actions.find(
      (action) => action.libraryQuestId === 320002 && action.questChanges[0]?.state === "rewarded",
    )!;
    const document = artifact.documents.find(
      (row) => row.role === "party" && row.actionIds.includes(reward.id),
    );
    const body = document?.content.split(`#label kfc-${reward.id}\n`)[1]?.split(/\nstep/)[0];
    expect(body).toContain(".turnin 320002");
    expect(body).not.toContain(".accept 320003");
    expect(input).toEqual(before);
  });

  it.each([
    ["Teronis' Satchel", "Find Teronis in Goldshire."],
    ["Teronis' Shrine", "Find Teronis in Goldshire."],
    ["Corpse of Teronis", "Find Teronis in Goldshire."],
    ["Teronis' Corpse", "Find Teron in Goldshire."],
    ["Teronis' Corpse", "Find Teronis in Goldshire and retrieve his journal."],
    ["Teronis' Corpse", "Find Teronis. Kill the guardian."],
    ["Teronis' Corpse", "Find Teronis after killing the guardian."],
  ])("holds an unproven corpse/name relationship: %s / %s", (npcName, text) => {
    const input = capturedFixture(handoffSource.replace(".target Archivist", `.target ${npcName}`));
    input.catalog.quests[0]!.ends = [{ ...recipient, name: npcName }];
    input.combat.quests[0]!.objectiveText = [text];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).size,
    ).toBe(0);
    expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([]);
  });

  it("leaves already-qualified ordinary deliveries under the existing funding policy", () => {
    const input = capturedFixture();
    input.catalog.quests[0]!.unsupportedRequirements = [];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).size,
    ).toBe(0);
  });

  it("retains an ordinary handoff recommended to another class when actual quest access is unrestricted", () => {
    const input = capturedFixture(
      handoffSource.replace(
        ".turnin 320002 >>Turn in Report to the archive",
        ".turnin 320002 >>Turn in Report to the archive << Mage",
      ),
    );
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002),
    ).toBe(true);
  });

  it("retains a source hand-in prerequisite and normalizes the following pickup guard", () => {
    const input = capturedFixture(
      handoffSource
        .replace(".accept 320002", ".turnin 320001 >>Turn in First message\n.accept 320002")
        .replace(".isNotOnQuest 320002", ".isQuestComplete 320001"),
    );
    const child = input.catalog.quests[0]!;
    child.unsupportedRequirements.push("unresolved-source-prerequisite");
    input.catalog.quests.push({
      ...child,
      questId: 320001,
      title: "First message",
      questLevel: 3,
      starts: child.starts,
      ends: child.starts,
      unsupportedRequirements: [],
    });
    input.combat.quests.push({
      questId: 320001,
      creatureIds: [],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      objectiveText: ["Report to Messenger in Goldshire."],
    });
    const before = structuredClone(input);
    const deliveries = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    );
    expect(deliveries.get(320002)?.quest.prerequisites).toEqual({ allOf: [320001], anyOf: [] });
    expect(deliveries.get(320002)?.actions[0]!.requiredQuestIds).toEqual([320001]);
    const funded = fundCaptured(input);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const pickup = funded.actions.find((action) => action.libraryQuestId === 320002)!;
    expect(pickup.requiredQuestIds).toEqual([320001]);
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.source-parent",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: input.sources,
    });
    const body = addon.lua.split("#label kfc-" + pickup.id + "\n")[1]!.split("\nstep")[0]!;
    expect(body).toContain(".isQuestTurnedIn 320001");
    expect(body).not.toContain(".turnin 320001");
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members)
      expect(member.rewards.filter((reward) => reward.questId === 320001)).toHaveLength(1);
    expect(input).toEqual(before);
  });

  it("does not turn an unrelated same-NPC hand-in into a new prerequisite", () => {
    const input = capturedFixture(
      handoffSource.replace(".accept 320002", ".turnin 999999\n.accept 320002"),
    );
    input.combat.quests[0]!.prerequisites = { allOf: [], anyOf: [] };
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.quest.prerequisites).toEqual({ allOf: [], anyOf: [] });
    expect(delivery?.actions[0]!.requiredQuestIds).toEqual([]);
  });

  it("preserves alternative prerequisites without forcing the library's preferred branch", () => {
    const input = capturedFixture();
    input.catalog.quests[0]!.prerequisites = { allOf: [], anyOf: [320001, 320003] };
    input.combat.quests[0]!.prerequisites = { allOf: [], anyOf: [320001, 320003] };
    const delivery = campaignSourceDeliveries(
      input.plan,
      input.sources,
      input.combat,
      input.catalog,
    ).get(320002);
    expect(delivery?.quest.prerequisites).toEqual({ allOf: [], anyOf: [320001, 320003] });
    expect(delivery?.actions[0]!.requiredQuestIds).toEqual([]);
  });

  it.each([
    "missing-return",
    "no-target",
    "wrong-npc",
    "foreign-guard",
    "use",
    "completion-guard",
    "class-access",
    "skill",
    "unresolved-parent",
    "unknown-parent",
    "archive",
    "provider",
    "unlocated",
    "foreign-zone",
    "hostile",
    "item",
    "kill",
    "duplicate-npc",
    "extra-task",
  ] as const)("holds an unproven source NPC handoff: %s", (reason) => {
    let body = handoffSource;
    if (reason === "missing-return")
      body = body.replace(".turnin 320002 >>Turn in Report to the archive", "");
    if (reason === "no-target") body = body.replace(".target Archivist\n", "");
    if (reason === "wrong-npc") body = body.replace(".target Archivist", ".target Unknown");
    if (reason === "foreign-guard") body += "\n.isOnQuest 999999";
    if (reason === "use") body += "\n.use 957";
    if (reason === "completion-guard")
      body = body.replace(".isOnQuest 320002", ".isQuestComplete 320002");
    if (reason === "unknown-parent")
      body = body.replace(".accept 320002", ".turnin 999999\n.accept 320002");
    const input = capturedFixture(body),
      quest = input.catalog.quests[0]!;
    if (reason === "skill") quest.unsupportedRequirements.push("requiredSkill");
    if (reason === "class-access") quest.requiredClasses = 8;
    if (reason === "unresolved-parent")
      quest.unsupportedRequirements.push("unresolved-source-prerequisite");
    if (reason === "unknown-parent")
      quest.unsupportedRequirements.push("unresolved-source-prerequisite");
    if (reason === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "0".repeat(64) };
    if (reason === "provider") input.catalog.providerRevision = "0".repeat(40);
    if (reason === "unlocated") quest.ends = quest.ends.map((npc) => ({ ...npc, positions: [] }));
    if (reason === "foreign-zone")
      quest.ends = quest.ends.map((npc) => ({
        ...npc,
        positions: [{ ...position, zone: "1433" }],
      }));
    if (reason === "hostile")
      quest.ends = quest.ends.map((npc) => ({ ...npc, friendlyToAlliance: false }));
    if (reason === "item") quest.providedItem = { itemId: 957, name: "Parcel" };
    if (reason === "kill") input.combat.quests[0]!.creatureIds = [114];
    if (reason === "duplicate-npc") quest.ends.push({ ...recipient, npcId: 237 });
    if (reason === "extra-task")
      input.combat.quests[0]!.objectiveText = [
        "Find Archivist in Goldshire and collect 3 records.",
      ];
    expect(
      campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).size,
    ).toBe(0);
    expect(fundCaptured(input).questFunding?.addedQuestIds).toEqual([]);
  });

  it.each(["Speak with", "Speak to", "Talk to", "Return to", "Report to"])(
    "accepts the exact single %s objective and its actual recipient",
    (prefix) => {
      const input = fixture();
      input.combat.quests[0]!.objectiveText = [`${prefix} Archivist at the eastern Elwynn bridge.`];
      const before = JSON.stringify(input);
      const resolved = view(input);
      expect(resolved.quests[0]!.ends).toEqual([recipient]);
      expect(resolved.quests[0]!.unsupportedRequirements).toEqual([]);
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it("counts every player's hand-in once without inventing an item or treating the reward level as combat difficulty", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const funded = fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog);
    expect(funded.questFunding?.addedQuestIds).toEqual([320002]);
    const actions = funded.actions.filter((a) => a.libraryQuestId === 320002);
    expect(actions.map((a) => a.questChanges[0]!.state)).toEqual(["accepted", "rewarded"]);
    expect(actions[1]!.instructions).toContain(
      "Talk to Archivist in Elwynn Forest. Turn in Report to the archive.",
    );
    expect(actions[1]!.positions[0]!.position).toMatchObject({ x: 52, y: 50 });
    for (const member of forecastCampaignGuide(funded, emptyPremadeProgress()).sections[0]!.forecast
      .members) {
      expect(member.endpoint).toEqual({ level: 3, currentXp: 100 });
      expect(member.combatXp).toBe(0);
      expect(member.rewards.filter((r) => r.questId === 320002)).toHaveLength(1);
    }
    const addon = compileCampaignAddon(funded, funded.actions, {
      version: "0.2.0-review.npc",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
    });
    expect(addon.lua).toContain(".accept 320002");
    expect(addon.lua).toContain(".turnin 320002");
    expect(addon.lua).not.toContain(".complete 320002");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the difficulty exemption opt-in, checks the real pickup minimum and counts the return", () => {
    const input = fixture(),
      catalog = view(input),
      quest = catalog.quests[0]!,
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((m) => ({
      ...m,
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
    expect(campaignFundingBatch(quest, catalog, input.combat, progress, options)).toBeNull();
    const batch = campaignFundingBatch(quest, catalog, input.combat, progress, {
      ...options,
      includeNpcDeliveries: true,
    });
    expect(batch?.requiredKills).toBe(0);
    expect(batch?.travelCost).toBeCloseTo(0.04);
    const higher = { ...quest, minimumLevel: 3 };
    expect(
      campaignFundingBatch(higher, { ...catalog, quests: [higher] }, input.combat, progress, {
        ...options,
        includeNpcDeliveries: true,
      }),
    ).toBeNull();
  });

  it.each([
    "Speak with Unknown in Goldshire.",
    "Speak with Archivist in Goldshire and return to Messenger.",
    "Speak with Archivist in Goldshire, then use the key.",
    "Speak with Archivist after killing the guardian.",
    "Find Archivist in Goldshire.",
    "Speak with Archivist. Collect 3 records.",
  ])("holds extra work, unknown recipients or incomplete objectives: %s", (text) => {
    const input = fixture();
    input.combat.quests[0]!.objectiveText = [text];
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "quantity",
    "provided",
    "creatures",
    "item-creatures",
    "conflict",
    "missing-text",
    "second-objective",
    "quest-identity",
  ] as const)("holds incompatible objective evidence: %s", (reason) => {
    const input = fixture();
    const q = input.combat.quests[0]!;
    input.combat = {
      ...input.combat,
      quests: [
        {
          ...q,
          ...(reason === "quantity"
            ? {
                itemObjectives: [
                  {
                    itemId: 10,
                    itemName: "Records",
                    quantity: 1,
                    objectiveIndex: 1,
                    npcIds: [],
                    sharing: "pooled" as const,
                  },
                ],
              }
            : {}),
          ...(reason === "creatures" ? { creatureIds: [10] } : {}),
          ...(reason === "item-creatures" ? { itemCreatureIds: [10] } : {}),
          ...(reason === "conflict" ? { killQuotaConflicts: [1] } : {}),
          ...(reason === "missing-text" ? { objectiveText: [] } : {}),
          ...(reason === "second-objective"
            ? { objectiveText: [...q.objectiveText, "Return to Messenger."] }
            : {}),
          ...(reason === "quest-identity" ? { questId: 320003 } : {}),
        },
      ],
    };
    if (reason === "provided")
      input.catalog.quests[0]!.providedItem = { itemId: 10, name: "Records" };
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "provided-item-interaction",
    "source-completion-objective",
    "requiredMinRep",
    "requiredSkill",
    "repeatable",
    "exploration-trigger",
  ])("does not clear another held requirement: %s", (requirement) => {
    const input = fixture();
    input.catalog.quests[0]!.unsupportedRequirements.push(requirement);
    expect(view(input)).toBe(input.catalog);
  });

  it.each([
    "class",
    "race",
    "reward",
    "prerequisite",
    "exclusive",
    "hostile",
    "unlocated",
  ] as const)("does not fund an ineligible conversation: %s", (reason) => {
    const input = fixture(),
      q = input.catalog.quests[0]!;
    if (reason === "class") q.requiredClasses = 8;
    if (reason === "race") q.requiredRaces = 2;
    if (reason === "prerequisite") q.prerequisites = { allOf: [999], anyOf: [] };
    if (reason === "exclusive") {
      q.exclusiveWith = [320001];
    }
    if (reason === "hostile") q.ends = q.ends.map((g) => ({ ...g, friendlyToAlliance: false }));
    if (reason === "unlocated") q.ends = q.ends.map((g) => ({ ...g, positions: [] }));
    if (reason === "reward")
      input.plan = { ...input.plan, rewardFacts: input.plan.rewardFacts!.slice(0, 1) };
    expect(
      fundCampaignQuestGaps(input.plan, [], input.combat, input.catalog).questFunding
        ?.addedQuestIds,
    ).toEqual([]);
  });

  it("preserves selected source visits and rejects mismatched input provenance", () => {
    const input = fixture();
    expect(npcDeliveryFundingCatalog(input.catalog, input.combat, new Set([320002]))).toBe(
      input.catalog,
    );
    for (const field of [
      "targetBuild",
      "providerRevision",
      "questSha256",
      "npcSha256",
      "itemSha256",
    ] as const) {
      const catalog = {
        ...input.catalog,
        ...(field === "targetBuild"
          ? { targetBuild: 70450 }
          : { [field]: field === "providerRevision" ? "0".repeat(40) : "0".repeat(64) }),
      };
      expect(npcDeliveryFundingCatalog(catalog, input.combat, new Set())).toBe(catalog);
    }
  });

  it("moves one complete unstarted shared-source courier before its XP gate without replacing the source program", () => {
    const input = capturedFixture();
    const delivery = campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).get(320002)!;
    expect(delivery).toBeDefined();
    input.plan = { ...input.plan, actions: [...input.plan.actions, ...delivery.actions.map((action) => ({ ...action, legId: "prepare" }))] };
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog).has(320002)).toBe(false);
    expect(campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog, { includeSelected: true }).get(320002)?.requiresFreshStart).toBe(true);
    const before = structuredClone(input);
    const result = fundCaptured(input);
    const changes = result.actions.flatMap((action) => action.questChanges.filter((change) => change.questId === 320002));
    expect(changes.map((change) => change.state)).toEqual(["accepted", "rewarded"]);
    const gate = result.actions.findIndex((action) => action.id === "gate");
    const phases = result.actions.filter((action) => action.questChanges.some((change) => change.questId === 320002));
    expect(phases).toHaveLength(2);
    expect(phases.every((action) => result.actions.indexOf(action) < gate)).toBe(true);
    expect(phases.map((action) => action.source)).toEqual(delivery.actions.map((action) => action.source));
    for (const section of forecastCampaignGuide(result, emptyPremadeProgress()).sections)
      for (const member of section.forecast.members) expect(member.blockedAtActionId).toBeNull();
    expect(input).toEqual(before);
  });

  it("does not exempt a combat prerequisite from its actual difficulty limit", () => {
    const input = fixture();
    input.catalog.quests[0]!.prerequisites = { allOf: [320003], anyOf: [] };
    const patrol: QuestCatalogEntry = {
      ...input.catalog.quests[0]!,
      questId: 320003,
      groundPickup: undefined,
      category: "shared-kills",
      unsupportedRequirements: [],
      prerequisites: { allOf: [], anyOf: [] },
      objectives: [{ index: 1, npcId: 10, count: 5, positions: [position] }],
    };
    input.catalog.quests.push(patrol);
    input.combat.npcs.push({
      id: 10,
      name: "Guardian",
      minimumLevel: 30,
      maximumLevel: 30,
      rank: 0,
      zoneIds: [12],
      xpEligibility: "assumed",
    });
    input.combat.quests.push({
      questId: 320003,
      creatureIds: [10],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: ["Kill 5 Guardians."],
    });
    const catalog = view(input),
      progress = emptyPremadeProgress();
    progress.members = progress.members.map((m) => ({
      ...m,
      level: 2,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(
      campaignFundingBatch(catalog.quests[0]!, catalog, input.combat, progress, {
        legId: "prepare",
        checkpointId: "gate",
        targetLevel: 3,
        previous: position,
        forbiddenQuestIds: new Set(),
        maximumQuestLevel: 5,
        leaderOnly: false,
        includeNpcDeliveries: true,
      }),
    ).toBeNull();
  });

  it("binds the literal recipient name even when it contains regular-expression characters", () => {
    const input = fixture();
    const name = "Archivist (Senior)";
    input.catalog.quests[0]!.ends = [{ ...recipient, name }];
    input.combat.quests[0]!.objectiveText = [`Speak with ${name} in Goldshire.`];
    expect(npcDeliveryRecipients(input.catalog.quests[0]!, input.combat.quests[0])).toEqual([
      { ...recipient, name },
    ]);
  });
});
