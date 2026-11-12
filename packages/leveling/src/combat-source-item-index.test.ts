import { describe, expect, it } from "vitest";
import type { CampaignSource } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { capturedMixedItemCounter } from "./combat-source-item-index.js";

const body = [
  "step",
  ".goto Wetlands,10,50",
  ".accept 279",
  ".target Karl Boran",
  "step",
  "#sticky",
  "#label Gobbler",
  "#completewith GobblerMurlocs",
  "#loop",
  ".goto Wetlands,14,42",
  ">>Kill Gobbler. Loot him for his Head",
  ">>He patrols and has 3 different spawnpoints around Bluegill Marsh",
  ".complete 279,2",
  ".unitscan Gobbler",
  "step",
  "#label GobblerMurlocs",
  ".goto Wetlands,18,40",
  ">>Kill Bluegill Murlocs",
  ".complete 279,1",
  ".mob Bluegill Murloc",
  ".unitscan Gobbler",
  "step",
  ".goto Wetlands,10,50",
  ".turnin 279",
  ".target Karl Boran",
].join("\n");

interface Fixture {
  quest: CombatQuestReference;
  program: CampaignLibraryQuest;
  sources: CampaignSource[];
  npcs: Map<number, CombatNpc>;
}

function fixture(source = body): Fixture {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.sourceId === 23)!;
  const guide = parseGuideChapter(source, reference.id, "a".repeat(64), 70205);
  const quest: CombatQuestReference = {
    questId: 279,
    creatureIds: [1024],
    itemCreatureIds: [1259],
    requiredClasses: 0,
    objectiveText: [
      "Kill 12 Bluegill Murlocs.",
      "Slay Gobbler and take his head.",
      "Bring Gobbler's Head to Karl Boran in Menethil Harbor.",
    ],
    onlyCreatureObjectives: false,
    itemObjectives: [
      {
        objectiveIndex: null,
        itemId: 3618,
        itemName: "Gobbler's Head",
        quantity: 1,
        npcIds: [1259],
        sharing: "shared-roll",
      },
    ],
  };
  const sources = [{ reference, guide }];
  const program = buildCampaignQuestLibrary(
    sources,
    createCampaignSourceProfile("human", null),
    [],
    new Set(),
    [quest],
    { ordinaryQuestIds: new Set([279]) },
  ).find((program) => program.questId === 279);
  if (!program) throw new Error("Missing synthetic mixed source program");
  const npc: CombatNpc = {
    id: 1024,
    name: "Bluegill Murloc",
    minimumLevel: 20,
    maximumLevel: 21,
    rank: 0,
    zoneIds: [11],
    xpEligibility: "assumed",
  };
  const npcs = new Map([
    [1024, npc],
    [1259, { ...npc, id: 1259, name: "Gobbler", minimumLevel: 22, maximumLevel: 22 }],
  ]);
  return { quest, program, sources, npcs };
}

function resolve(input: Fixture): ReturnType<typeof capturedMixedItemCounter> {
  return capturedMixedItemCounter(
    input.quest,
    input.program,
    input.sources,
    input.npcs,
    createCampaignSourceProfile("human", null),
    70205,
  );
}

describe("captured mixed trophy counters", () => {
  it("binds a Head of creature item from separate kill and return objectives", () => {
    const input = fixture(body.replaceAll(".unitscan Gobbler", ".mob Gobbler"));
    input.quest = { ...input.quest,
      objectiveText: ["Kill 12 Bluegill Murlocs.", "Bring the Head of Gobbler to Karl Boran in Menethil Harbor."],
      itemObjectives: input.quest.itemObjectives!.map((item) => ({ ...item, itemName: "Head of Gobbler" })),
    };
    expect(resolve(input)).toMatchObject({ itemId: 3618, objectiveIndex: 2,
      killCounters: [{ objectiveIndex: 1, npcId: 1024, kills: 12 }] });
  });

  it("retains a unique item counter that source resolution already identifies as personal loot", () => {
    expect(resolve(fixture(body.replaceAll(".unitscan Gobbler", ".mob Gobbler"))))
      .toMatchObject({ itemId: 3618, objectiveIndex: 2 });
  });

  it("retains own active-quest guards in each counter's source witness", () => {
    const input = fixture(body.replace(".complete 279,2", ".complete 279,2\n.isOnQuest 279")
      .replace(".complete 279,1", ".complete 279,1\n.isOnQuest 279"));
    const before = structuredClone(input), result = resolve(input);
    expect(result?.objectiveIndex).toBe(2);
    expect(result?.source.conditions?.checks).toEqual([
      expect.objectContaining({ tag: ".isOnQuest", arguments: "279" }),
    ]);
    expect(result?.killCounters[0]?.source.conditions?.checks).toEqual([
      expect.objectContaining({ tag: ".isOnQuest", arguments: "279" }),
    ]);
    expect(input).toEqual(before);
  });

  it.each([
    "Bring the Head of Someone Else to Karl Boran.",
    "Bring the Head of Gobbler to Karl Boran and use the key.",
    "Bring the Head of Gobbler to Karl Boran, then inspect the chest.",
    "Bring the Head of Gobbler to Karl Boran before killing the guards.",
  ])("holds unbound or compound return clauses: %s", (objective) => {
    const input = fixture();
    input.quest = { ...input.quest, objectiveText: ["Kill 12 Bluegill Murlocs.", objective],
      itemObjectives: input.quest.itemObjectives!.map((item) => ({ ...item, itemName: "Head of Gobbler" })),
    };
    expect(resolve(input)).toBeNull();
  });

  it.each([".isOnQuest 279,999", ".isQuestComplete 279", ".isOnQuest 279 << Priest"])(
    "holds unsupported counter guard semantics: %s", (guard) => {
      expect(resolve(fixture(body.replace(".complete 279,2", `.complete 279,2\n${guard}`)))).toBeNull();
    },
  );

  it("binds the missing item counter while preserving the separately proven twelve-kill counter", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = resolve(input);
    expect(result).toMatchObject({
      questId: 279,
      itemId: 3618,
      objectiveIndex: 2,
      source: input.program.actions[1]!.source,
      killCounters: [
        { objectiveIndex: 1, npcId: 1024, kills: 12, source: input.program.actions[2]!.source },
      ],
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(input.quest.itemObjectives![0]!.objectiveIndex).toBeNull();
  });

  it("accepts an explicit matching item counter and curly apostrophe spelling", () => {
    const input = fixture(body.replace(".complete 279,2", ".complete 279,2 >>Gobbler’s Head (1)"));
    expect(resolve(input)?.objectiveIndex).toBe(2);
  });

  it("retains matching prior kill-quota evidence without mutating it", () => {
    const input = fixture();
    const quota = {
      objectiveIndex: 1,
      npcId: 1024,
      kills: 12,
      source: "Earlier explicit captured counter",
    };
    input.quest = { ...input.quest, killQuotas: [quota] };
    expect(resolve(input)?.killCounters).toMatchObject([
      { objectiveIndex: 1, npcId: 1024, kills: 12 },
    ]);
    expect(input.quest.killQuotas).toEqual([quota]);
    input.quest = { ...input.quest, killQuotas: [{ ...quota, objectiveIndex: 3 }] };
    expect(resolve(input)).toBeNull();
  });

  it.each([
    [".unitscan Gobbler", ".unitscan Someone Else"],
    [".unitscan Gobbler", ".unitscan Gobbler\n.target Someone Else"],
    [">>Kill Gobbler. Loot him for his Head", ">>Kill Gobbler"],
    [">>Kill Gobbler. Loot him for his Head", ">>Loot a Head from nearby creatures"],
    [".complete 279,2", ".complete 279,2 >>Gobbler's Head (2)"],
    [".complete 279,2", ".complete 279,2 >>Another Head (1)"],
    [".complete 279,2", ".complete 279,2,skip"],
    [".complete 279,2", ".complete 279,99"],
    [".complete 279,2", ".complete 279,0"],
    [".complete 279,2", ".complete 279,2\n.use 3618"],
    [".complete 279,2", ".complete 279,2\n.isOnQuest 999"],
    [".complete 279,2", ".complete 279,2 << Priest"],
    [".complete 279,2", ".complete 279,1"],
    [".complete 279,1", ".complete 279,1 >>Bluegill Murloc slain (13)"],
  ])("holds contradictory or unsupported source context: %s → %s", (from, to) => {
    expect(resolve(fixture(body.replace(from, to)))).toBeNull();
  });

  it.each([
    "held",
    "abandoned",
    "incomplete",
    "partial",
    "foreign-version",
    "personal",
    "wrong-build",
  ] as const)("holds %s programs", (reason) => {
    const input = fixture();
    if (reason === "held") input.program = { ...input.program, held: true };
    if (reason === "abandoned") input.program = { ...input.program, abandoned: true };
    if (reason === "incomplete") input.program = { ...input.program, complete: false };
    if (reason === "partial")
      input.program = { ...input.program, actions: input.program.actions.slice(0, -1) };
    if (reason === "foreign-version" || reason === "personal")
      input.program = {
        ...input.program,
        actions: input.program.actions.map((action, index) =>
          index !== 1
            ? action
            : {
                ...action,
                ...(reason === "personal"
                  ? { leaderOnly: true }
                  : { source: { ...action.source!, version: "other-version" } }),
              },
        ),
      };
    if (reason === "wrong-build")
      input.sources = input.sources.map((source) => ({
        ...source,
        guide: { ...source.guide, targetBuild: 70450 },
      }));
    expect(resolve(input)).toBeNull();
  });

  it.each([
    "quantity",
    "known-index",
    "two-items",
    "shared-target",
    "unknown-item-source",
    "class-quest",
    "kill-conflict",
    "wrong-item-name",
    "wrong-prose",
  ] as const)("holds ambiguous or incompatible %s references", (reason) => {
    const input = fixture(),
      item = input.quest.itemObjectives![0]!;
    if (reason === "quantity")
      input.quest = { ...input.quest, itemObjectives: [{ ...item, quantity: 2 }] };
    if (reason === "known-index")
      input.quest = { ...input.quest, itemObjectives: [{ ...item, objectiveIndex: 1 }] };
    if (reason === "two-items")
      input.quest = { ...input.quest, itemObjectives: [item, { ...item, itemId: 3619 }] };
    if (reason === "shared-target") input.quest = { ...input.quest, creatureIds: [1024, 1259] };
    if (reason === "unknown-item-source") input.quest = { ...input.quest, itemCreatureIds: [1260] };
    if (reason === "class-quest") input.quest = { ...input.quest, requiredClasses: 1 };
    if (reason === "kill-conflict") input.quest = { ...input.quest, killQuotaConflicts: [1] };
    if (reason === "wrong-item-name")
      input.quest = { ...input.quest, itemObjectives: [{ ...item, itemName: "Bluegill's Head" }] };
    if (reason === "wrong-prose")
      input.quest = { ...input.quest, objectiveText: ["Capture Gobbler alive."] };
    expect(resolve(input)).toBeNull();
  });
});
