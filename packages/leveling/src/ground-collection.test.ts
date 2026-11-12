import { describe, expect, it } from "vitest";
import { groundPickupReferenceSchema } from "./quest-ground-pickup.js";
import { questItemObjectiveSchema } from "./quest-loot.js";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CombatQuestReference } from "./combat-model.js";
import {
  isReferencedGroundCollection,
  isMultiItemGroundCollectionSource,
} from "./campaign-ground-pickup.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { combatDatasetSchema } from "./combat-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";

const sourceBody =
  "step\n.goto 1429,47.5,62.2\n.accept 99127 >>Accept A Net Disaster\nstep\n#loop\n.goto 1429,48.5,58.3,40,0\n* Loot the Fishing Nets in the water for the Half-Eaten Fish\n.complete 99127,1 >>Half-Eaten Fish (7)\nstep\n.goto 1429,47.5,62.2\n.turnin 99127 >>Turn in A Net Disaster";

function fixture(): {
  readonly quest: CombatQuestReference;
  readonly source: {
    readonly reference: (typeof CHAPTER_REFERENCES)[number];
    readonly guide: ReturnType<typeof parseGuideChapter>;
  };
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 116)!;
  const guide = parseGuideChapter(sourceBody, reference.id, "a".repeat(64), 70205);
  const ground = {
    questId: 99127,
    itemId: 286205,
    quantity: 7,
    objectiveIndex: 1 as const,
    objectId: 694772,
    objectName: "Fishing Trap",
    positions: [{ zone: "1429", x: 48.3, y: 58.7 }],
    sourceArchiveSha256: "b".repeat(64),
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[1]!.id },
  };
  return {
    source: { reference, guide },
    quest: {
      questId: 99127,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: ["Check the fishing traps in Crystal Lake."],
      onlyCreatureObjectives: false,
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 286205,
          itemName: "Half-Eaten Fish",
          quantity: 7,
          npcIds: [],
          sharing: "unknown",
          groundPickup: ground,
        },
      ],
    },
  };
}

function policyFixture(rootId = 99127): {
  plan: CampaignPlan;
  sources: readonly ReturnType<typeof fixture>["source"][];
  data: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const original = fixture(),
    before = rootId + 1,
    after = rootId + 2;
  const guide = parseGuideChapter(
    [
      `step\n.goto 1429,47.5,62.2\n.accept ${before} >>Accept carry note\n.accept ${rootId} >>Accept fishing supplies`,
      ...Array.from(
        { length: 10 },
        () => "step\n.goto 1429,48.5,58.3\n>>Continue along the existing route",
      ),
      `step\n#loop\n.goto 1429,48.5,58.3,40,0\n>>Loot the Fishing Nets in the water for the Half-Eaten Fish\n.complete ${rootId},1 >>Half-Eaten Fish (7)`,
      `step\n.goto 1429,47.5,62.2\n.turnin ${before} >>Turn in carry note\n.turnin ${rootId} >>Turn in fishing supplies\n.accept ${after} >>Accept manifest`,
      `step\n.goto 1429,47.5,62.2\n.turnin ${after} >>Turn in manifest`,
    ].join("\n"),
    original.source.reference.id,
    "a".repeat(64),
    70205,
  );
  const source = { ...original.source, guide };
  const groundStep = guide.steps.find((step) =>
    step.directives.some((row) => row.tag === ".complete"),
  )!;
  const item = original.quest.itemObjectives![0]!;
  const ground = {
    ...original.quest,
    questId: rootId,
    requiredClasses: 0,
    itemObjectives: [
      {
        ...item,
        groundPickup: {
          ...item.groundPickup!,
          questId: rootId,
          source: { chapterId: guide.chapterId, version: guide.version, stepId: groundStep.id },
        },
      },
    ],
  };
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic source pickup policy fixture",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "b".repeat(64),
      questSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      objectSha256: "e".repeat(64),
      limitations: ["Synthetic source pickup policy fixture"],
    },
    questCatalogReference: {
      sha256: "f".repeat(64),
      providerRevision: "a".repeat(40),
      sourceArchiveSha256: "b".repeat(64),
    },
    npcs: [],
    dungeons: [],
    quests: [
      ground,
      ...[before, after].map((questId) => ({
        questId,
        requiredClasses: 0,
        creatureIds: [],
        itemCreatureIds: [],
        objectiveText: [],
        onlyCreatureObjectives: false,
        itemObjectives: [],
        prerequisites: { allOf: questId === after ? [rootId] : [], anyOf: [] },
      })),
    ],
  });
  const library = buildCampaignQuestLibrary(
    [source],
    createCampaignSourceProfile("human", "warrior"),
    [],
    new Set(),
    data.quests,
  );
  const actions = library.flatMap((quest) =>
    quest.actions.map((action) => ({ ...action, legId: "starter" })),
  );
  const plan: CampaignPlan = {
    release: "synthetic-pickup-policy",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    sourceArchiveSha256: "b".repeat(64),
    sharedQuestsOnly: true,
    actions,
    legs: [
      {
        id: "starter",
        title: "Elwynn",
        kind: "starter",
        from: 1,
        to: 6,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [rootId, before, after],
        unresolvedQuestIds: [],
      },
    ],
  };
  return { plan, sources: [source], data };
}

describe("quantity-bound ground collection", () => {
  function unlabeledCollection(): {
    quest: CombatQuestReference;
    directives: ReturnType<typeof parseGuideChapter>["steps"][number]["directives"];
  } {
    const quest: CombatQuestReference = {
      questId: 1034,
      creatureIds: [],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      objectiveText: ["Bring 5 Handfuls of Stardust to Pelturas in Astranaar."],
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 5494,
          itemName: "Handful of Stardust",
          quantity: 5,
          npcIds: [],
          objectIds: [19016],
          sharing: "pooled",
        },
      ],
    };
    const guide = parseGuideChapter(
      "step\n.goto 1440,33.3,67.79\n>>Loot the Stardust Covered Bushes for the Handful of Stardust\n>>Their spawn locations are scattered throughout the island\n.complete 1034,1",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    return { quest, directives: guide.steps[0]!.directives };
  }

  function plantCollection(itemLabel: string): ReturnType<typeof unlabeledCollection> {
    const quest: CombatQuestReference = {
      questId: 1010,
      creatureIds: [],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      objectiveText: ["Bring 5 Bathran's Hair to Orendil Broadleaf in Ashenvale."],
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 5437,
          itemName: "Bathran's Hair",
          quantity: 5,
          npcIds: [],
          objectIds: [17282],
          sharing: "pooled",
        },
      ],
    };
    const guide = parseGuideChapter(
      `step\n.goto 1440,31.3,23.8\n>>Open the Plant Bundles on the ground. Loot them for ${itemLabel}\n>>They look like small brown sacks. They can be hard to see\n.complete 1010,1\n.isOnQuest 1010`,
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    return { quest, directives: guide.steps[0]!.directives };
  }

  it.each(["Bathran's Hair", "Bathran's Hairs"])(
    "recognizes a provider-bound plant collection with loot-result label %s",
    (label) => {
      const input = plantCollection(label);
      expect(
        isMultiItemGroundCollectionSource({
          ...input,
          objectiveIndex: 1,
          objectName: "Plant Bundle",
        }),
      ).toBe(true);
    },
  );

  it.each(["wrong-item", "missing-count", "conflicting-count", "wrong-object", "encounter"])(
    "holds a plural plant collection with %s",
    (reason) => {
      const input = plantCollection(
        reason === "wrong-item" ? "Bathran's Hairbrushes" : "Bathran's Hairs",
      );
      if (reason === "missing-count")
        input.quest.objectiveText = ["Bring Bathran's Hair to Orendil."];
      if (reason === "conflicting-count")
        input.quest.objectiveText.push("Bring 6 Bathran's Hair to Orendil.");
      if (reason === "encounter") {
        const instruction = input.directives.find((row) => row.tag === "text")!;
        instruction.text += ". Kill the keeper when it spawns.";
      }
      expect(
        isMultiItemGroundCollectionSource({
          ...input,
          objectiveIndex: 1,
          objectName: reason === "wrong-object" ? "Unrelated Bundle" : "Plant Bundle",
        }),
      ).toBe(false);
    },
  );

  it("uses a matching numeric quest requirement for an unlabeled repeated pickup counter", () => {
    const input = unlabeledCollection();
    expect(
      isMultiItemGroundCollectionSource({
        ...input,
        objectiveIndex: 1,
        objectName: "Stardust Covered Bush",
      }),
    ).toBe(true);
  });

  it.each(["missing-count", "conflicting-count", "wrong-count", "encounter"])(
    "holds an unlabeled pickup with %s",
    (reason) => {
      const input = unlabeledCollection();
      if (reason === "missing-count")
        input.quest.objectiveText = ["Bring Handfuls of Stardust to Pelturas."];
      if (reason === "conflicting-count")
        input.quest.objectiveText.push("Bring 6 Handfuls of Stardust to Pelturas.");
      if (reason === "wrong-count") input.quest.itemObjectives![0]!.quantity = 6;
      if (reason === "encounter") {
        const first = input.directives[0]!;
        input.directives.push({
          ...first,
          tag: "text",
          arguments: "",
          text: "Kill the guardian that spawns.",
          position: null,
          questId: null,
        });
      }
      expect(
        isMultiItemGroundCollectionSource({
          ...input,
          objectiveIndex: 1,
          objectName: "Stardust Covered Bush",
        }),
      ).toBe(false);
    },
  );

  it("binds an item-named quest objective to the source's separately named world object", () => {
    const input = fixture();
    const quest: CombatQuestReference = {
      ...input.quest,
      objectiveText: ["Retrieve 7 Half-Eaten Fish and return to the quest giver."],
    };
    const guide = parseGuideChapter(
      sourceBody.replace("Fishing Nets", "Fishing Traps"),
      input.source.reference.id,
      "a".repeat(64),
      70205,
    );
    const check = (value = quest, objectName = "Fishing Trap"): boolean =>
      isMultiItemGroundCollectionSource({
        quest: value,
        objectiveIndex: 1,
        directives: guide.steps[1]!.directives,
        objectName,
      });
    expect(check()).toBe(true);
    expect(
      isMultiItemGroundCollectionSource({
        quest,
        objectiveIndex: 1,
        objectName: "Fishing Trap",
        directives: guide.steps[1]!.directives.map((row) =>
          row.tag === "text"
            ? { ...row, text: "Open the Fishing Traps. Loot them for the Half-Eaten Fish" }
            : row,
        ),
      }),
    ).toBe(true);
    expect(check(quest, "Unrelated Chest")).toBe(false);
    expect(check({ ...quest, objectiveText: ["Retrieve something from the lake."] })).toBe(false);
    expect(
      check({ ...quest, objectiveText: ["Kill the guards and retrieve 7 Half-Eaten Fish."] }),
    ).toBe(false);
  });
  it("retains source-proven pickup quests by default without a kill camp or measured respawn", () => {
    const input = policyFixture(),
      before = structuredClone(input);
    const selected = applyCampaignPartyQuestPolicy(input.plan, input.sources, input.data);
    expect(selected.partyPolicy?.decisions.find((row) => row.questId === 99127)?.included).toBe(
      true,
    );
    expect(
      selected.actions.some((action) =>
        action.questChanges.some(
          (change) => change.questId === 99127 && change.state === "objectives-complete",
        ),
      ),
    ).toBe(true);
    const enriched = attachCampaignCombat(selected, input.sources, input.data, "pickup-test");
    expect(enriched.itemRequirements).toContainEqual(
      expect.objectContaining({ questId: 99127, itemId: 286205, quantity: 7 }),
    );
    expect(enriched.combat?.activities).toEqual([]);
    expect(input).toEqual(before);
  });

  it("retains a courier whose pickup and hand-in share selected stops despite a long source-step span", () => {
    const input = policyFixture();
    const selected = applyCampaignPartyQuestPolicy(input.plan, input.sources, input.data);
    for (const id of [99127, 99128, 99129])
      expect(selected.partyPolicy?.decisions.find((row) => row.questId === id)?.included).toBe(
        true,
      );
    const pickup = selected.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 99127 && change.state === "accepted"),
    )!;
    expect(pickup.requiredQuestIds ?? []).not.toContain(99128);
    expect(
      selected.actions
        .filter((action) => action.questChanges.some((change) => change.questId === 99128))
        .map((action) => action.source?.stepId),
    ).toEqual(["source-step-0001", "source-step-0013"]);
  });

  it("honors explicit exclusions and missing prerequisites while retaining an independent source courier", () => {
    const excluded = policyFixture(92);
    expect(
      applyCampaignPartyQuestPolicy(
        excluded.plan,
        excluded.sources,
        excluded.data,
      ).partyPolicy?.decisions.find((row) => row.questId === 92)?.included,
    ).toBe(false);
    const input = policyFixture();
    const data = {
      ...input.data,
      quests: input.data.quests.map((quest) =>
        quest.questId === 99127
          ? { ...quest, prerequisites: { allOf: [999999], anyOf: [] } }
          : quest,
      ),
    };
    const selected = applyCampaignPartyQuestPolicy(input.plan, input.sources, data);
    for (const id of [99127, 99129])
      expect(selected.partyPolicy?.decisions.find((row) => row.questId === id)?.included).toBe(
        false,
      );
    expect(selected.partyPolicy?.decisions.find((row) => row.questId === 99128)?.included).toBe(true);
  });
  it("reproduces the ordinary shared source branch when the combat adapter receives the raw archive", () => {
    const input = fixture();
    const source = {
      ...input.source,
      guide: {
        ...input.source.guide,
        steps: input.source.guide.steps.map((step) => ({ ...step, condition: "Priest/Mage" })),
      },
    };
    const action: CampaignAction = {
      id: "collect-fish",
      legId: "collection",
      title: "Collect seven fish",
      instructions: [],
      positions: [],
      source: {
        chapterId: source.guide.chapterId,
        version: source.guide.version,
        stepId: source.guide.steps[1]!.id,
      },
      kind: "quests",
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
      questChanges: [
        {
          questId: 99127,
          state: "objectives-complete",
          objectiveIndex: 1,
          title: "A Net Disaster",
        },
      ],
    };
    const plan: CampaignPlan = {
      release: "shared-ground-adapter-test",
      race: "human",
      leaderClass: "warrior",
      sharedQuestsOnly: true,
      sharedSourceQuestIds: [99127],
      targetBuild: 70205,
      sourceArchiveSha256: "b".repeat(64),
      actions: [action],
      legs: [
        {
          id: "collection",
          title: "Collection",
          kind: "starter",
          from: 1,
          to: 6,
          stopId: null,
          actionIds: [action.id],
          questIds: [99127],
          unresolvedQuestIds: [],
        },
      ],
    };
    const data = combatDatasetSchema.parse({
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "Synthetic adapter fixture",
      provider: {
        repository: "https://example.test/data",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        objectSha256: "e".repeat(64),
        limitations: ["Synthetic adapter fixture"],
      },
      questCatalogReference: {
        sha256: "f".repeat(64),
        providerRevision: "a".repeat(40),
        sourceArchiveSha256: "b".repeat(64),
      },
      npcs: [],
      quests: [{ ...input.quest, requiredClasses: 0 }],
      dungeons: [],
    });
    const before = structuredClone({ plan, source, data });
    const result = attachCampaignCombat(plan, [source], data, "adapter-test");
    expect(result.combat!.activities).toEqual([]);
    expect(result.actions[0]!.questChanges).toEqual(action.questChanges);
    expect(result.itemRequirements).toContainEqual(
      expect.objectContaining({ questId: 99127, itemId: 286205, quantity: 7 }),
    );
    expect({ plan, source, data }).toEqual(before);
  });

  it("recognizes eight matching ground crates with an explicit Collect counter", () => {
    const body =
      "step << Priest/Mage\n#loop\n.goto 1429/0,-288.51,-9068.87\n>>Loot Milly's Harvest on the ground\n.complete 3904,1 >>Collect Milly's Harvest (x8)";
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 115)!;
    const guide = parseGuideChapter(body, reference.id, "a".repeat(64), 70205);
    const binding = {
      chapterId: guide.chapterId,
      version: guide.version,
      stepId: guide.steps[0]!.id,
    };
    const quest: CombatQuestReference = {
      questId: 3904,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: ["Bring 8 crates of Milly's Harvest to Milly Osworth at Northshire Abbey."],
      onlyCreatureObjectives: false,
      itemObjectives: [
        {
          objectiveIndex: 1,
          itemId: 11119,
          itemName: "Milly's Harvest",
          quantity: 8,
          npcIds: [],
          sharing: "pooled",
          groundPickup: {
            questId: 3904,
            itemId: 11119,
            quantity: 8,
            objectiveIndex: 1,
            objectId: 161557,
            objectName: "Milly's Harvest",
            positions: [{ zone: "1429", x: 54, y: 49 }],
            sourceArchiveSha256: "b".repeat(64),
            source: binding,
          },
        },
      ],
    };
    const check = (value: string): boolean =>
      isReferencedGroundCollection(
        quest,
        1,
        parseGuideChapter(value, reference.id, "a".repeat(64), 70205).steps[0]!.directives,
        binding,
      );
    expect(check(body)).toBe(true);
    for (const changed of [
      body.replace("(x8)", "(x7)"),
      body.replace("Loot Milly's Harvest on", "Loot Milly's Harvestmaster on"),
      body.replace("on the ground", "from Defias Thugs"),
      body.replace("on the ground", "on the ground and kill a guardian"),
      `${body}\n.mob Defias Thug`,
      `${body}\n.use 11119`,
    ])
      expect(check(changed)).toBe(false);
    const index = indexCampaignItems([
      { questId: 3904, objectiveIndex: 1, itemId: 11119, quantity: 8 },
    ]);
    const players = Array.from({ length: 5 }, () => new CampaignItemLedger(index));
    players[0]!.collect({ questId: 3904, itemId: 11119, quantity: 7, objectiveBitmask: 1 }, {});
    expect(players[0]!.readyObjectives(3904)).toEqual([]);
    players[0]!.completeObjective(3904, 1);
    expect(players[0]!.snapshot()).toEqual({ "11119": 8 });
    expect(players.slice(1).every((ledger) => Object.keys(ledger.snapshot()).length === 0)).toBe(
      true,
    );
  });

  it("accepts an explicit per-character quantity and keeps legacy one-item data unchanged", () => {
    const item = fixture().quest.itemObjectives![0]!;
    expect(questItemObjectiveSchema.parse(item)).toEqual(item);
    const legacyGround = { ...item.groundPickup! };
    delete legacyGround.quantity;
    const legacy = { ...item, quantity: 1, groundPickup: legacyGround };
    expect(questItemObjectiveSchema.parse(legacy)).toEqual(legacy);
    for (const quantity of [0, -1, 10_001, 1.5, null, "7"])
      expect(() => groundPickupReferenceSchema.parse({ ...legacyGround, quantity })).toThrow();
    for (const changed of [
      { quantity: 6 },
      { quantity: null },
      { npcIds: [735] },
      { provided: true },
      { objectiveIndex: 2 },
      { groundPickup: { ...item.groundPickup!, itemId: 1 } },
    ])
      expect(() => questItemObjectiveSchema.parse({ ...item, ...changed })).toThrow();
  });

  it("recognizes the exact source-bound collection as interaction work without changing its quota", () => {
    const input = fixture();
    const before = structuredClone(input);
    const library = buildCampaignQuestLibrary(
      [input.source],
      createCampaignSourceProfile("human", "warrior"),
      [],
      new Set([116]),
      [input.quest],
    );
    expect(library.find((entry) => entry.questId === 99127)).toMatchObject({
      objective: "interaction",
      complete: true,
      held: false,
    });
    expect(input).toEqual(before);
  });

  it("keeps each player's full quantity separate and consumes the stock once", () => {
    const index = indexCampaignItems([
      { questId: 99127, objectiveIndex: 1, itemId: 286205, quantity: 7 },
    ]);
    const ledgers = Array.from({ length: 5 }, () => new CampaignItemLedger(index));
    ledgers[0]!.collect({ questId: 99127, itemId: 286205, quantity: 6, objectiveBitmask: 1 }, {});
    expect(ledgers[0]!.readyObjectives(99127)).toEqual([]);
    ledgers[0]!.completeObjective(99127, 1);
    expect(ledgers[0]!.snapshot()).toEqual({ "286205": 7 });
    for (const ledger of ledgers.slice(1)) {
      expect(ledger.readyObjectives(99127)).toEqual([]);
      expect(ledger.snapshot()).toEqual({});
      ledger.completeObjective(99127, 1);
    }
    for (const ledger of ledgers) {
      expect(ledger.readyObjectives(99127)).toEqual([1]);
      ledger.consume(99127);
      expect(ledger.snapshot()).toEqual({});
      expect(ledger.readyObjectives(99127)).toEqual([]);
    }
  });

  it("holds an unbound source, conflicting quantity, ambiguous objective or triggered encounter", () => {
    const { quest, source } = fixture();
    const step = source.guide.steps[1]!;
    const proof = quest.itemObjectives![0]!.groundPickup!;
    const binding = proof.source;
    const check = (reference: CombatQuestReference, body: string): boolean => {
      const parsed = parseGuideChapter(body, source.guide.chapterId, "a".repeat(64), 70205);
      return isReferencedGroundCollection(reference, 1, parsed.steps[0]!.directives, binding);
    };
    const body =
      "step\n#loop\n.goto 1429,48.5,58.3\n* Loot the Fishing Nets in the water for the Half-Eaten Fish\n.complete 99127,1 >>Half-Eaten Fish (7)";
    expect(check(quest, body)).toBe(true);
    for (const changed of [
      body.replace("Fish (7)", "Fish (6)"),
      body.replace("99127,1", "99127,2"),
      `${body}\n.use 1`,
      `${body}\n.cast 1`,
      `${body}\n.mob Murloc`,
      `${body}\n.timer 20,Wait`,
      `${body}\n.isOnQuest 999`,
      `${body}\n* Defeat the guardian that spawns.`,
      `${body}\n.complete 99128,1 >>Kill Murlocs (4)`,
    ])
      expect(check(quest, changed)).toBe(false);
    for (const changed of [
      { ...quest, creatureIds: [735] },
      { ...quest, itemCreatureIds: [735] },
      { ...quest, objectiveText: ["Check the fishing trapsmith's crates."] },
      { ...quest, objectiveText: ["Check the fishing traps and defeat their guardian."] },
      {
        ...quest,
        killQuotas: [{ objectiveIndex: 1, npcId: 735, kills: 4, source: "Death count" }],
      },
      {
        ...quest,
        itemObjectives: [{ ...quest.itemObjectives![0]!, quantity: 6 }],
      },
      {
        ...quest,
        itemObjectives: [{ ...quest.itemObjectives![0]!, groundPickup: undefined }],
      },
    ])
      expect(check(changed, body)).toBe(false);
    for (const source of [
      { ...binding, chapterId: "another-chapter" },
      { ...binding, version: "another-version" },
      { ...binding, stepId: "another-step" },
    ])
      expect(isReferencedGroundCollection(quest, 1, step.directives, source)).toBe(false);
  });
});
