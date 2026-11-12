import { describe, expect, it } from "vitest";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import { indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";
import { nonKillCollectionMethod } from "./combat-nonkill.js";
import { objectiveDirectiveContext } from "./combat-objective-context.js";
import { parseGuideChapter, type ImportedDirective } from "./guide-archive.js";
import { questRewardItemEvidenceSchema, type QuestRewardItemEvidence } from "./quest-loot.js";

const provenance = {
  sourceUrl: "https://example.test/item=750",
  sourceSha256: "a".repeat(64),
  capturedAt: "2026-10-21T00:00:00.000Z",
};
const rewardEvidence: QuestRewardItemEvidence = {
  ...provenance,
  quests: [{ ...provenance, sourceUrl: "https://example.test/quest=4041", questId: 4041 }],
};
const npc: CombatNpc = {
  id: 6909,
  name: "Sethir the Ancient",
  minimumLevel: 12,
  maximumLevel: 12,
  rank: 0,
  zoneIds: [141],
  xpEligibility: "assumed",
};
const npcs = new Map([[npc.id, npc]]);
const pickpocket =
  "* Cast [Pick Pocket] on Sethir the Ancient\n* Avoid fighting Sethir the Ancient. Stay behind him";

function source(body: string): readonly ImportedDirective[] {
  return parseGuideChapter(`step\n${body}`, "chapter-test", "b".repeat(64), 70205).steps[0]!
    .directives;
}
function method(
  body: string,
  overrides: Partial<Parameters<typeof nonKillCollectionMethod>[0]> = {},
): ReturnType<typeof nonKillCollectionMethod> {
  const directives = source(body);
  return nonKillCollectionMethod({
    directives,
    offset: directives.findIndex((entry) => entry.tag === ".complete"),
    questId: 2242,
    item: { quantity: 1, npcIds: [6909] },
    sourceQuantity: null,
    npcs,
    ...overrides,
  });
}

describe("local acquisition evidence", () => {
  it("keeps the shard's captured Ratchet gossip separate from killing its credited NPC", () => {
    const speaker: CombatNpc = { ...npc, id: 3442, name: "Sputtervalve" };
    const quest: CombatQuestReference = {
      questId: 6981,
      creatureIds: [speaker.id],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      startItem: { itemId: 10441, name: "Glowing Shard" },
      objectiveText: [
        "Travel to Ratchet to find someone that can tell you more about the glowing shard.",
        "",
        "Then, deliver the shard as you are directed.",
      ],
    };
    const body = "Talk to Sputtervalve\n.complete 6981,1\n.skipgossip 1\n.target Sputtervalve";
    const resolve = (
      text: string,
      reference: CombatQuestReference = quest,
    ): ReturnType<typeof resolveCombatObjectives> =>
      resolveCombatObjectives(
        source(text),
        indexCombatReferences({ npcs: [speaker], quests: [reference] }),
        "shard-dialogue-source",
      );
    const before = structuredClone({ speaker, quest });
    expect(resolve(body)).toMatchObject([
      { questId: 6981, objectiveIndex: 1, npcIds: [], credit: "non-combat", requiredKills: null },
    ]);
    expect(
      resolve(
        body.replace(
          ".complete 6981,1",
          ".complete 6981,1 >>Speak with someone in Ratchet about the Glowing Shard",
        ),
      ),
    ).toMatchObject([{ credit: "non-combat" }]);
    for (const changed of [
      body.replace(".skipgossip 1", ".skipgossip"),
      body.replace("Talk to Sputtervalve", "Talk to Sputtervalve."),
    ])
      expect(resolve(changed)[0]?.credit).toBe("non-combat");
    for (const changed of [
      body.replace(".target Sputtervalve", ".target Someone Else"),
      body.replace("Talk to Sputtervalve", "Talk to Someone Else"),
      body.replace(".skipgossip 1", ""),
      body.replace(".skipgossip 1", ".skipgossip invalid"),
      body.replace("6981,1", "6981,2"),
      body.replace("6981,1", "6981,1 >>Speak with someone in Stormwind about the Glowing Shard"),
      body.replace("6981,1", "6981,1 >>Sputtervalve slain (1)"),
      body + "\n.mob Sputtervalve",
      body + "\n.use 10441",
      body + "\n>>Kill Sputtervalve",
    ])
      expect(resolve(changed)[0]?.credit).not.toBe("non-combat");
    for (const reference of [
      { ...quest, startItem: { itemId: 10441, name: "A Different Shard" } },
      { ...quest, creatureIds: [3442, 8418] },
      { ...quest, killQuotaConflicts: [1] },
      {
        ...quest,
        killQuotas: [{ objectiveIndex: 1, npcId: speaker.id, kills: 1, source: "Death counter" }],
      },
      { ...quest, objectiveText: ["Kill Sputtervalve and recover the Glowing Shard."] },
    ])
      expect(resolve(body, reference)[0]?.credit).not.toBe("non-combat");
    expect({ speaker, quest }).toEqual(before);
  });

  it("keeps a living-creature trap objective separate from creature deaths", () => {
    const bear: CombatNpc = { ...npc, id: 2164, name: "Rabid Thistle Bear" };
    const quest: CombatQuestReference = {
      questId: 2118,
      creatureIds: [bear.id],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: ["Capture a living Rabid Thistle Bear and bring it back to Tharnariun."],
    };
    const body =
      "* Use [Tharnariun's Hope] on a Rabid Thistle Bear. It can be used from any range\n.complete 2118,1 >>Rabid Thistle Bear Captured (1)\n.unitscan Rabid Thistle Bear\n.use 7586";
    const resolve = (text: string, value = quest): ReturnType<typeof resolveCombatObjectives> =>
      resolveCombatObjectives(
        source(text),
        indexCombatReferences({ npcs: [bear], quests: [value] }),
        "capture-source",
      );
    const before = structuredClone({ bear, quest });
    expect(resolve(body)).toMatchObject([
      { questId: 2118, objectiveIndex: 1, npcIds: [], requiredKills: null, credit: "non-combat" },
    ]);
    expect(resolve(body.replace("Bear. It", "Bear  .It"))).toMatchObject([
      { credit: "non-combat" },
    ]);
    for (const changed of [
      body.replace(".use 7586", ""),
      body.replace(".use 7586", ".use invalid"),
      body.replace(".use 7586", ".cast 7586"),
      body.replace(".unitscan Rabid Thistle Bear", ".unitscan Different Bear"),
      body.replace("on a Rabid Thistle Bear.", "on a Rabid Thistle Bear Double."),
      body.replace("Captured (1)", "slain (1)"),
      body.replace("Captured (1)", "Captured (2)"),
      body.replace("2118,1", "2118,2"),
      `${body}\n.mob Rabid Thistle Bear`,
      `${body}\n* Kill the bear`,
    ])
      expect(resolve(changed)[0]?.credit).not.toBe("non-combat");
    for (const changed of [
      { objectiveText: ["Kill a Rabid Thistle Bear and return to Tharnariun."] },
      {
        objectiveText: [
          "Capture a living Rabid Thistle Bear Double and bring it back to Tharnariun.",
        ],
      },
      {
        killQuotas: [
          { objectiveIndex: 1, npcId: bear.id, kills: 1, source: "Captured kill counter" },
        ],
      },
      { killQuotaConflicts: [1] },
    ])
      expect(resolve(body, { ...quest, ...changed })[0]?.credit).not.toBe("non-combat");
    expect({ bear, quest }).toEqual(before);
  });
  it("recognizes the source's borrowed farsight dialogue without treating its speaker as a kill", () => {
    const speaker: CombatNpc = { ...npc, id: 264936, name: "Earthseer Farsen" };
    const quest: CombatQuestReference = {
      questId: 96392,
      creatureIds: [speaker.id],
      itemCreatureIds: [],
      onlyCreatureObjectives: false,
      objectiveText: [
        "Speak with Earthseer Farsen's and ask him to lend you his farsight to observe the Dark Iron threat.",
      ],
    };
    const body =
      "* Talk to Earthseer Farsen\n* You can cancel the Farsight once the objective completes\n.complete 96392,1 >>Use Farsen's Farsight\n.skipgossip\n.target Earthseer Farsen";
    const resolve = (
      text: string,
      reference: CombatQuestReference = quest,
    ): ReturnType<typeof resolveCombatObjectives> =>
      resolveCombatObjectives(
        source(text),
        indexCombatReferences({ npcs: [speaker], quests: [reference] }),
        "farsight-dialogue-source",
      );
    expect(resolve(body)).toMatchObject([
      { questId: 96392, objectiveIndex: 1, credit: "non-combat", npcIds: [], requiredKills: null },
    ]);
    for (const changed of [
      body.replace(".skipgossip\n", ""),
      body.replace(".skipgossip", ".skipgossip invalid"),
      body.replace(".target Earthseer Farsen", ".target Somebody Else"),
      body.replace("Use Farsen's Farsight", "Use Somebody's Farsight"),
      body.replace("96392,1", "96392,2"),
      `${body}\n.use 1234`,
      `${body}\n.mob Earthseer Farsen`,
      `${body}\n* Kill nearby spies`,
    ])
      expect(resolve(changed)[0]?.credit).not.toBe("non-combat");
    for (const changed of [
      {
        objectiveText: [
          "Speak with Earthseer Farsen's double and borrow his farsight to observe the camp.",
        ],
      },
      { objectiveText: ["Speak with Earthseer Farsen to kill the Dark Iron threat."] },
      { killQuotas: [{ objectiveIndex: 1, npcId: speaker.id, kills: 1, source: "Death counter" }] },
      { killQuotaConflicts: [1] },
    ])
      expect(resolve(body, { ...quest, ...changed })[0]?.credit).not.toBe("non-combat");
  });
  it("recognizes a source-backed viewing dialogue without inventing a kill or changing its references", () => {
    const speaker = {
      ...npc,
      id: 257554,
      name: "Halaan Hawk-Eye",
      minimumLevel: 10,
      maximumLevel: 10,
    };
    const quest: CombatQuestReference = {
      questId: 94414,
      creatureIds: [speaker.id],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: [
        "Speak with Halaan Hawk-Eye and borrow his gift to view the anchor pylon in the distance.",
      ],
    };
    const body =
      "* Talk to Halaan Hawk-Eye.\n.complete 94414,1 >>View the Anchor Pylon\n.skipgossipid 137720,1\n.target Halaan Hawk-Eye";
    const references = indexCombatReferences({ npcs: [speaker], quests: [quest] });
    const original = structuredClone({ speaker, quest });
    const resolve = (
      text: string,
      reference: CombatQuestReference = quest,
    ): ReturnType<typeof resolveCombatObjectives> =>
      resolveCombatObjectives(
        source(text),
        indexCombatReferences({ npcs: [speaker], quests: [reference] }),
        "viewing-dialogue-source",
      );
    expect(resolve(body)).toMatchObject([
      { questId: 94414, objectiveIndex: 1, credit: "non-combat", npcIds: [], requiredKills: null },
    ]);
    expect(resolveCombatObjectives(source(body), references, "viewing-dialogue-source")).toEqual(
      resolve(body),
    );
    for (const changed of [
      body.replace(".skipgossipid 137720,1\n", ""),
      body.replace("137720,1", "137720,unknown"),
      body.replace(".target Halaan Hawk-Eye", ".target Somebody Else"),
      body.replace(".target Halaan Hawk-Eye", ""),
      body.replace("Talk to Halaan Hawk-Eye.", "Talk to Halaan Hawk-Eye's double."),
      body.replace("View the Anchor Pylon", "View the Anchor Pylon Replica"),
      body.replace("View the Anchor Pylon", "Kill Halaan Hawk-Eye (x1)"),
      body.replace("94414,1", "94414,2"),
      `${body}\n.mob Halaan Hawk-Eye`,
      `${body}\n.use 1234`,
      `${body}\n.cast 1234`,
      `${body}\n* Attack the nearby guard.`,
      body.replace(".complete", ".complete 12345,1 >>Other task\n.complete"),
    ])
      expect(resolve(changed).find((row) => row.questId === quest.questId)?.credit).not.toBe(
        "non-combat",
      );
    for (const changed of [
      { creatureIds: [speaker.id, 1] },
      { itemCreatureIds: [1] },
      { objectiveText: ["Speak with Halaan Hawk-Eye's double to view the anchor pylon."] },
      {
        objectiveText: ["Speak with Halaan Hawk-Eye, then kill a guard and view the anchor pylon."],
      },
      { objectiveText: ["Speak with Halaan Hawk-Eye and view the anchor pylons."] },
      { killQuotas: [{ objectiveIndex: 1, npcId: speaker.id, kills: 1, source: "Death counter" }] },
      { killQuotaConflicts: [1] },
      {
        itemObjectives: [
          {
            itemId: 750,
            itemName: "Item",
            quantity: 1,
            objectiveIndex: 1,
            npcIds: [speaker.id],
            sharing: "unknown" as const,
          },
        ],
      },
    ])
      expect(resolve(body, { ...quest, ...changed })[0]?.credit).not.toBe("non-combat");
    expect({ speaker, quest }).toEqual(original);
  });

  it("keeps a corroborated exploration objective separate from the same quest's captured kills", () => {
    const creature = { ...npc, id: 1123, name: "Frostmane Headhunter" };
    const quest: CombatQuestReference = {
      questId: 287,
      creatureIds: [1123],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: [
        "Explore Frostmane Hold, and kill 5 Frostmane Headhunters for Senir Whitebeard.",
      ],
      killQuotas: [{ objectiveIndex: 1, npcId: 1123, kills: 5, source: "Captured death counter" }],
    };
    const references = indexCombatReferences({ npcs: [creature], quests: [quest] });
    const before = JSON.stringify(quest);
    const kills = resolveCombatObjectives(
      source(".complete 287,1 >>Kill Frostmane Headhunter (x5)\n.mob Frostmane Headhunter"),
      references,
      "kill-source",
    );
    const exploration = resolveCombatObjectives(
      source(
        ".goto 1426/0,676.23,-5589.67\n* Drop down into the small dead-end room of the cave\n.complete 287,2 >>Fully explore Frostmane Hold",
      ),
      references,
      "exploration-source",
    );
    expect(kills).toMatchObject([
      { objectiveIndex: 1, credit: "shared-kills", npcIds: [1123], requiredKills: 5 },
    ]);
    expect(exploration).toMatchObject([
      {
        objectiveIndex: 2,
        credit: "non-combat",
        npcIds: [],
        requiredKills: null,
        source: "exploration-source",
      },
    ]);
    expect(JSON.stringify(quest)).toBe(before);
    for (const overrides of [
      { objectiveText: ["Explore Frostmane Holdout and kill 5 Frostmane Headhunters."] },
      { objectiveText: ["Kill 5 Frostmane Headhunters."] },
      { killQuotas: [] },
      { killQuotas: [{ objectiveIndex: 2, npcId: 1123, kills: 5, source: "Captured counter" }] },
      { killQuotaConflicts: [2] },
      {
        itemObjectives: [
          {
            itemId: 1,
            objectiveIndex: 2,
            quantity: 1,
            npcIds: [1123],
            sharing: "unknown" as const,
          },
        ],
      },
    ]) {
      const held = resolveCombatObjectives(
        source(".complete 287,2 >>Fully explore Frostmane Hold"),
        indexCombatReferences({ npcs: [creature], quests: [{ ...quest, ...overrides }] }),
        "unsupported-source",
      );
      expect(held[0]!.credit).not.toBe("non-combat");
    }
    for (const body of [
      ".complete 287,2 >>Fully explore Frostmane Hold\n.mob Frostmane Headhunter",
      "* Kill the guards\n.complete 287,2 >>Fully explore Frostmane Hold",
      ".complete 287,2 >>Fully explore Frostmane Hold\n.use 1",
      ".complete 287,2 >>Do not explore Frostmane Hold",
      ".complete 287,2 >>Fully explore Frostmane Hold and kill the guards",
      ".complete 999,1 >>Fully explore Frostmane Hold\n.complete 287,2",
    ]) {
      const held = resolveCombatObjectives(source(body), references, "ambiguous-source");
      expect(held.find((objective) => objective.questId === 287)!.credit).not.toBe("non-combat");
    }
  });
  it("recognizes corroborated friendly healing credit without treating a creature objective as a death", () => {
    const friendly = { ...npc, id: 12427, name: "Mountaineer Dolf" };
    const quest = {
      questId: 5625,
      creatureIds: [12427],
      itemCreatureIds: [],
      onlyCreatureObjectives: true,
      objectiveText: [
        "Find Mountaineer Dolf and heal his wounds using Lesser Heal (Rank 2). Afterwards grant Power Word: Fortitude and return to Maxan Anvol.",
      ],
    };
    const text =
      "Cast [Lesser Heal] (Rank 2) and then [Power Word: Fortitude] on Mountaineer Dolf outside";
    const result = resolveCombatObjectives(
      source(
        `* ${text}\n.complete 5625,1 >>Heal and fortify Mountaineer Dolf\n.target Mountaineer Dolf`,
      ),
      indexCombatReferences({ npcs: [friendly], quests: [quest] }),
      "friendly-source",
    );
    expect(result).toMatchObject([{ credit: "non-combat", npcIds: [], requiredKills: null }]);
    expect(quest.onlyCreatureObjectives).toBe(true);
    for (const unsafe of [
      text + ". Attack him afterwards",
      "Cast [Smite] on Mountaineer Dolf",
      text.replace("Mountaineer Dolf", "Mountaineer Dolfson"),
      "Do not heal Mountaineer Dolf with Lesser Heal or Power Word: Fortitude",
    ]) {
      const held = resolveCombatObjectives(
        source(`* ${unsafe}\n.complete 5625,1`),
        indexCombatReferences({ npcs: [friendly], quests: [quest] }),
        "unsafe-source",
      );
      expect(held[0]!.credit).toBe("unknown");
    }
    const contradicted = resolveCombatObjectives(
      source(`* ${text}\n.complete 5625,1`),
      indexCombatReferences({
        npcs: [friendly],
        quests: [
          { ...quest, objectiveText: [quest.objectiveText[0]! + " Kill 1 Mountaineer Dolf."] },
        ],
      }),
      "contradictory-source",
    );
    expect(contradicted[0]!.credit).not.toBe("non-combat");
  });
  it("validates item and corroborating quest provenance without duplicate reward identities", () => {
    expect(questRewardItemEvidenceSchema.parse(rewardEvidence)).toEqual(rewardEvidence);
    for (const invalid of [
      { ...rewardEvidence, sourceSha256: "unknown" },
      { ...rewardEvidence, quests: [] },
      { ...rewardEvidence, quests: [...rewardEvidence.quests, ...rewardEvidence.quests] },
      { ...rewardEvidence, quests: [{ ...rewardEvidence.quests[0]!, capturedAt: "unknown" }] },
      { ...rewardEvidence, quests: [{ ...rewardEvidence.quests[0]!, questId: 0 }] },
    ])
      expect(questRewardItemEvidenceSchema.safeParse(invalid).success).toBe(false);
  });
  it("only extracts an actual complete marker's local context", () => {
    const directives = source(".turnin 4041\n.complete 3909,1\n.target Gregan\n.complete 999,1");
    expect(objectiveDirectiveContext(directives, -1)).toBeNull();
    expect(objectiveDirectiveContext(directives, directives.length)).toBeNull();
    expect(objectiveDirectiveContext(directives, 0)).toBeNull();
    const offset = directives.findIndex((entry) => entry.tag === ".complete");
    expect(objectiveDirectiveContext(directives, offset)?.before.map((entry) => entry.tag)).toEqual(
      [".turnin"],
    );
    expect(objectiveDirectiveContext(directives, offset)?.all.map((entry) => entry.tag)).toEqual([
      ".turnin",
      ".complete",
      ".target",
    ]);
  });
  it("recognizes one prescribed successful pickpocket with explicit combat avoidance", () => {
    const body = `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`;
    expect(method(body)).toBe("pickpocket");
    expect(method(body, { sourceQuantity: 1 })).toBe("pickpocket");
    expect(method(body, { item: { quantity: null, npcIds: [6909] } })).toBeNull();
    expect(method(body, { item: { quantity: 2, npcIds: [6909] } })).toBeNull();
    expect(method(body, { sourceQuantity: 2 })).toBeNull();
    expect(method(body, { npcs: new Map() })).toBeNull();
    expect(method(body, { item: { quantity: 1, npcIds: [123] } })).toBeNull();
  });
  it.each([
    "* Cast [Pick Pocket] on Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    `${pickpocket}\n.complete 2242,1\n.mob Other NPC`,
    `${pickpocket}\n* Kill him if needed\n.complete 2242,1\n.mob Sethir the Ancient`,
    `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient\n.use 1`,
    `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient\n.cast 1`,
    "* Cast [Pick Pocket] on Sethir the Ancient's Guard\n* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* If safe, cast [Pick Pocket] on Sethir the Ancient\n* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* Cast [Pick Pocket] on Sethir the Ancient\n* Do not avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
  ])("holds ambiguous or combat-bearing pickpocket instructions: %s", (body) => {
    expect(method(body)).toBeNull();
  });
  it("does not borrow a pickpocket instruction from an earlier objective", () => {
    const directives = source(
      `${pickpocket}\n.complete 999,1\n.complete 2242,1\n.mob Sethir the Ancient`,
    );
    expect(
      method("", { directives, offset: directives.findIndex((entry) => entry.questId === 2242) }),
    ).toBeNull();
  });
  it("recognizes a corroborated different quest's earlier hand-in without erasing its own combat", () => {
    expect(
      method(
        "* This will no longer kill you\n.accept 4041\n.turnin 4041\n.complete 3909,1\n.target Gregan",
        {
          questId: 3909,
          item: { quantity: 1, npcIds: [7775], rewardEvidence },
        },
      ),
    ).toBe("quest-reward");
  });
  it.each([
    ".accept 4041\n.complete 3909,1",
    ".complete 3909,1\n.turnin 4041",
    ".turnin 999\n.complete 3909,1",
    ".turnin 4041\n.complete 999,1\n.complete 3909,1",
    ".turnin 4041\n.complete 3909,1\n.mob Gregan",
    ".turnin 4041\n.complete 3909,1\n.use 1",
    ".turnin 4041\n.complete 3909,1\n.cast 1",
    "* Kill Gregan\n.turnin 4041\n.complete 3909,1",
  ])("does not assume a reward from missing, later or unrelated hand-ins: %s", (body) => {
    const directives = source(body);
    expect(
      method(body, {
        directives,
        offset: directives.findIndex((entry) => entry.questId === 3909),
        questId: 3909,
        item: { quantity: 1, npcIds: [7775], rewardEvidence },
      }),
    ).toBeNull();
  });
  it("holds self-reward cycles and unknown or multi-item quotas", () => {
    const body = ".turnin 4041\n.complete 3909,1";
    expect(
      method(body, { questId: 4041, item: { quantity: 1, npcIds: [], rewardEvidence } }),
    ).toBeNull();
    for (const quantity of [null, 2])
      expect(
        method(body, { questId: 3909, item: { quantity, npcIds: [], rewardEvidence } }),
      ).toBeNull();
    expect(method(body, { questId: 3909, item: { quantity: 1, npcIds: [] } })).toBeNull();
  });
  it("binds empty source counters without attaching invented loot work", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 2242,
          creatureIds: [],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: ["Find Sethir's Journal"],
          itemObjectives: [
            { itemId: 7737, quantity: 1, objectiveIndex: 1, npcIds: [6909], sharing: "unknown" },
          ],
        },
      ],
    });
    const result = resolveCombatObjectives(
      source(`${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`),
      references,
      "test-source",
    );
    expect(result).toMatchObject([
      { credit: "non-combat", npcIds: [], requiredKills: null, source: "test-source" },
    ]);
    expect(result[0]!.loot).toBeUndefined();
    expect(result[0]!.reason).toContain("successful pickpocket");
  });
  it("keeps conflicting provider kill requirements unresolved instead of assuming a free item", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 2242,
          creatureIds: [],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: ["Kill Sethir the Ancient"],
          itemObjectives: [
            { itemId: 7737, quantity: 1, objectiveIndex: 1, npcIds: [6909], sharing: "unknown" },
          ],
        },
      ],
    });
    expect(
      resolveCombatObjectives(
        source(`${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`),
        references,
        "test",
      )[0],
    ).toMatchObject({ credit: "personal-loot", loot: { quantity: 1 } });
  });
  it("binds a guaranteed hand-in item but never overrides an explicit numeric kill objective", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 3909,
          creatureIds: [6909],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: [],
          itemObjectives: [
            {
              itemId: 11243,
              quantity: 1,
              objectiveIndex: 1,
              npcIds: [6909],
              sharing: "unknown",
              rewardEvidence,
            },
          ],
        },
      ],
    });
    const reward = resolveCombatObjectives(
      source(".turnin 4041\n.complete 3909,1\n.target Gregan"),
      references,
      "test",
    )[0]!;
    expect(reward).toMatchObject({ credit: "non-combat", npcIds: [], requiredKills: null });
    expect(reward.loot).toBeUndefined();
    const kills = resolveCombatObjectives(
      source(
        ".turnin 4041\n.complete 3909,1 --Kill Sethir the Ancient (10)\n.mob Sethir the Ancient",
      ),
      references,
      "test",
    )[0]!;
    expect(kills).toMatchObject({ credit: "shared-kills", npcIds: [6909], requiredKills: 10 });
  });
});
