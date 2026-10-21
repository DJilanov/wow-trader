import { describe, expect, it } from "vitest";
import {
  combatDatasetSchema,
  type CombatDataset,
  type CombatNpc,
  type CombatObjective,
  type CombatActivity,
  type KillXpEvidence,
} from "./combat-model.js";
import { classicNormalKillXp, estimateCreatureKills } from "./combat-xp.js";
import { importQuestieCombatData, parseLuaDataLiteral } from "./combat-import.js";
import {
  applyCampaignCombat,
  createCampaignCombatState,
  indexCombatReferences,
  resolveCombatObjectives,
  attachCampaignCombat,
} from "./campaign-combat.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { parseGuideChapter } from "./guide-archive.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";

const npc: CombatNpc = {
  id: 114,
  name: "Harvest Watcher",
  minimumLevel: 20,
  maximumLevel: 20,
  rank: 0,
  zoneIds: [40],
  xpEligibility: "assumed",
};
const data: CombatDataset = {
  schema: "forever-combat-reference.v1",
  publication: "private-reference",
  authorizationNote: "",
  targetBuild: 70205,
  provider: {
    repository: "https://github.com/Questie/QuestieDB",
    revision: "a".repeat(40),
    layer: "forever-static-with-authored",
    npcSha256: "a".repeat(64),
    questSha256: "b".repeat(64),
    itemSha256: "c".repeat(64),
    limitations: ["Uncalibrated reference"],
  },
  npcs: [npc],
  quests: [
    {
      questId: 300001,
      creatureIds: [114],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: true,
    },
  ],
  dungeons: [],
  killXpEvidence: [],
};
const objective = (questId = 300001, kills = 10): CombatObjective => ({
  questId,
  objectiveIndex: 1,
  npcIds: [114],
  requiredKills: kills,
  credit: "shared-kills",
  source: "guide:test",
  reason: null,
});
const activity = (id: string, objectives: readonly CombatObjective[]): CombatActivity => ({
  id,
  actionId: id,
  environment: "outdoor",
  objectives,
  profile: null,
});
const evidence: KillXpEvidence = {
  npcId: 114,
  build: 70205,
  playerLevel: 20,
  mobLevel: 20,
  partySize: 5,
  partyLevels: [20, 20, 20, 20, 20],
  environment: "dungeon",
  unrestedXpPerPlayer: 39,
  sampleCount: 5,
  source: "Controlled synthetic test",
  contextVerified: true,
};

describe("combat XP calculation", () => {
  it("weights unequal party levels rather than paying each player the same fraction", () => {
    const common = {
      npc,
      kills: 1,
      environment: "outdoor" as const,
      partySize: 2,
      partyLevels: [20, 18],
    };
    expect(
      estimateCreatureKills({ ...common, position: { level: 20, currentXp: 0 }, playerIndex: 0 })
        .xp,
    ).toBe(Math.floor((145 * 20) / 38));
    expect(
      estimateCreatureKills({ ...common, position: { level: 18, currentXp: 0 }, playerIndex: 1 })
        .xp,
    ).toBe(Math.floor((148 * 18) / 38));
  });
  it("uses each member's own enemy-level adjustment rather than inheriting the higher member's penalty", () => {
    expect(
      estimateCreatureKills({
        npc: { ...npc, minimumLevel: 18, maximumLevel: 18 },
        kills: 1,
        environment: "outdoor",
        partySize: 2,
        partyLevels: [20, 18],
        playerIndex: 1,
        position: { level: 18, currentXp: 0 },
      }).xp,
    ).toBe(63);
  });
  it("applies a configured kill multiplier only to reference estimates, not measured final XP", () => {
    expect(
      estimateCreatureKills({
        npc,
        kills: 1,
        position: { level: 20, currentXp: 0 },
        partySize: 1,
        environment: "outdoor",
        xpMultiplier: 2,
      }).xp,
    ).toBe(290);
    expect(
      estimateCreatureKills({
        npc,
        kills: 1,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
        evidence: [evidence],
        build: 70205,
        partyLevels: [20, 20, 20, 20, 20],
        xpMultiplier: 2,
      }).xp,
    ).toBe(39);
  });
  it("keeps solo rewards whole and shares each kill conservatively", () => {
    const input = {
      npc,
      kills: 10,
      position: { level: 20, currentXp: 0 },
      environment: "outdoor" as const,
    };
    expect(estimateCreatureKills({ ...input, partySize: 1 }).xp).toBe(1450);
    expect(estimateCreatureKills({ ...input, partySize: 5 }).xp).toBe(290);
  });
  it("recalculates the next kill after a level-up", () => {
    expect(
      estimateCreatureKills({
        npc: { ...npc, minimumLevel: 1, maximumLevel: 1 },
        kills: 2,
        position: { level: 1, currentXp: FOREVER_XP_CURVE[1]! - 1 },
        partySize: 1,
        environment: "outdoor",
      }),
    ).toMatchObject({
      xp: 94,
      exit: { level: 2, currentXp: 93 },
      basis: "reference-estimate",
    });
  });
  it("uses a level range instead of fabricating a uniform mob distribution", () => {
    expect(
      estimateCreatureKills({
        npc: { ...npc, maximumLevel: 21 },
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "outdoor",
      }),
    ).toMatchObject({ xp: 290, maximumXp: 300 });
  });
  it("handles gray mobs, excluded creatures and the cap", () => {
    expect(classicNormalKillXp(30, 1)).toBe(0);
    for (const entry of [
      { ...npc, xpEligibility: "excluded" as const },
      { ...npc, minimumLevel: 1, maximumLevel: 1 },
    ])
      expect(
        estimateCreatureKills({
          npc: entry,
          kills: 20,
          position: { level: 30, currentXp: 0 },
          partySize: 5,
          environment: "outdoor",
        }).xp,
      ).toBe(0);
    expect(
      estimateCreatureKills({
        npc,
        kills: 20,
        position: { level: 60, currentXp: 0 },
        partySize: 5,
        environment: "outdoor",
      }).xp,
    ).toBe(0);
  });
  it("does not invent current dungeon tuning", () => {
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
      }),
    ).toMatchObject({
      xp: null,
      basis: "unknown",
    });
  });
  it("applies a supplied dungeon tuning once, without a quest coefficient or another patch bonus", () => {
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
        dungeonMultiplier: 0.5,
      }).xp,
    ).toBe(140);
  });
  it("retains mixed-level differences", () => {
    const input = { npc, kills: 10, partySize: 5, environment: "outdoor" as const };
    expect(estimateCreatureKills({ ...input, position: { level: 20, currentXp: 0 } }).xp).not.toBe(
      estimateCreatureKills({ ...input, position: { level: 21, currentXp: 0 } }).xp,
    );
  });
  it("does not divide observed party payouts or apply the patch bonus again", () => {
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
        evidence: [evidence],
        build: 70205,
      }),
    ).toMatchObject({ xp: 390, basis: "observed", observedSources: [evidence.source] });
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
        evidence: [evidence],
        build: 70291,
      }).xp,
    ).toBeNull();
  });
  it("does not transfer controlled-party calibration to a mixed-level party or a boost", () => {
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "dungeon",
        evidence: [evidence],
        build: 70205,
        partyLevels: [20, 20, 20, 20, 21],
      }).xp,
    ).toBeNull();
    expect(
      estimateCreatureKills({
        npc,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "outdoor",
        partyLevels: [20, 20, 20, 20, 60],
      }),
    ).toMatchObject({ xp: null, basis: "unknown" });
  });
  it.each([0, 6, 1.5])("rejects party size %s", (partySize) => {
    expect(() =>
      estimateCreatureKills({
        npc,
        kills: 10,
        partySize,
        position: { level: 20, currentXp: 0 },
        environment: "outdoor",
      }),
    ).toThrow();
  });
});

describe("literal-only provider import", () => {
  it("preserves sparse tuples, quoted delimiters and Lua byte escapes", () => {
    const parsed = parseLuaDataLiteral('{"a,b}c",nil,{[3]={114}},"x\\039y"}') as Map<
      number,
      unknown
    >;
    expect(parsed.get(1)).toBe("a,b}c");
    expect(parsed.get(2)).toBe(null);
    expect(parsed.get(4)).toBe("x'y");
  });
  it.each(['{os.execute("touch bad")}', "{1};return 2", "{[1]=2,[1]=3}", '{"unfinished}', "{1/2}"])(
    "rejects executable/ambiguous data %s",
    (source) => expect(() => parseLuaDataLiteral(source)).toThrow(),
  );
  it("imports typed creature and item-source references without assuming loot drop rates", () => {
    const exported = (kind: string, row: string): string =>
      `-- Base -> authored corrections.\nlocal ${kind} = {}\n${kind}[1]=${row}\nreturn ${kind}\n`;
    const imported = importQuestieCombatData({
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      provider: data.provider,
      npcExport: exported("npc", '{"Target",nil,nil,51,50,0}'),
      questExport: exported("quest", '{"Quest",nil,nil,1,5,nil,nil,nil,nil,{{{1}},nil,{{1}}}}'),
      itemExport: exported("item", '{"Head",{1}}'),
    });
    expect(imported.npcs[0]).toMatchObject({ minimumLevel: null, maximumLevel: null });
    expect(imported.quests[0]).toMatchObject({ creatureIds: [1], itemCreatureIds: [1] });
  });
  it("retains item identities without treating display labels as quantities and holds mixed ordering", () => {
    const exported = (kind: string, body: string): string =>
      `-- Base -> authored corrections.\nlocal ${kind} = {}\n${body}\nreturn ${kind}\n`;
    const imported = importQuestieCombatData({
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      provider: data.provider,
      npcExport: exported("npc", 'npc[1]={"Target",nil,nil,3,3,0}'),
      itemExport: exported("item", 'item[750]={"Meat",{1}}'),
      questExport: exported(
        "quest",
        'quest[33]={"Wolves",nil,nil,1,1,nil,nil,nil,nil,{nil,nil,{{750,"Meat"}}}}\nquest[34]={"Mixed",nil,nil,1,1,nil,nil,nil,nil,{{{1}},nil,{{750}}}}\nquest[35]={"Supplied",nil,nil,1,1,nil,nil,nil,nil,{nil,nil,{{750}}},750}',
      ),
    });
    expect(imported.quests[0]!.itemObjectives).toEqual([
      { itemId: 750, quantity: null, objectiveIndex: 1, npcIds: [1], sharing: "unknown" },
    ]);
    expect(imported.quests[1]!.itemObjectives?.[0]?.objectiveIndex).toBeNull();
    // A source-item ID alone does not establish how many objective items were supplied.
    expect(imported.quests[2]!.itemObjectives?.[0]?.provided).toBeUndefined();
  });
  it("requires explicit public authorization and rejects duplicate identities", () => {
    expect(() => combatDatasetSchema.parse({ ...data, publication: "authorized" })).toThrow(
      /authorization/,
    );
    expect(() => combatDatasetSchema.parse({ ...data, npcs: [npc, npc] })).toThrow(/Duplicate NPC/);
  });
  it("holds suspected credit proxies without treating name heuristics as verified zero XP", () => {
    const imported = importQuestieCombatData({
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      provider: data.provider,
      npcExport:
        '-- Base -> authored corrections.\nlocal npc = {}\nnpc[1]={"Training Dummy",nil,nil,20,20,0}\nreturn npc\n',
      questExport:
        '-- Base -> authored corrections.\nlocal quest = {}\nquest[1]={"Quest"}\nreturn quest\n',
      itemExport:
        '-- Base -> authored corrections.\nlocal item = {}\nitem[1]={"Item"}\nreturn item\n',
    });
    expect(imported.npcs[0]!.xpEligibility).toBe("unknown");
    expect(
      estimateCreatureKills({
        npc: imported.npcs[0]!,
        kills: 10,
        position: { level: 20, currentXp: 0 },
        partySize: 5,
        environment: "outdoor",
      }),
    ).toMatchObject({ xp: null, basis: "unknown" });
  });
});

describe("quest combat binding and overlap", () => {
  it("joins typed IDs to x-prefixed guide quotas, not item counters", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Kill Harvest Watcher (x10)\n.mob Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, indexCombatReferences(data), "test")[0],
    ).toMatchObject({
      npcIds: [114],
      requiredKills: 10,
      credit: "shared-kills",
    });
    const loot = {
      ...data,
      quests: [{ ...data.quests[0]!, creatureIds: [], itemCreatureIds: [114] }],
    };
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, indexCombatReferences(loot), "test")[0],
    ).toMatchObject({
      requiredKills: null,
      credit: "personal-loot",
    });
  });
  it("does not treat an interaction as an XP-paying kill", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Harvest Watcher (10)\n.mob Harvest Watcher\n.gossip 114",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, indexCombatReferences(data), "test")[0]!
        .requiredKills,
    ).toBeNull();
  });
  it("does not let an unrelated neighboring use-item objective erase a known kill quota", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Kill Harvest Watcher (10)\n.mob Harvest Watcher\n.complete 300002,1 --Book read (1)\n.use 123",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, indexCombatReferences(data), "test")[0],
    ).toMatchObject({ requiredKills: 10, credit: "shared-kills" });
  });
  it("binds an explicit source item counter when the provider has no quantity", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Meat (8)\n.mob Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const references = indexCombatReferences({
      ...data,
      quests: [
        {
          ...data.quests[0]!,
          creatureIds: [],
          itemCreatureIds: [114],
          onlyCreatureObjectives: false,
          itemObjectives: [
            {
              itemId: 750,
              quantity: null,
              objectiveIndex: 1,
              npcIds: [114],
              sharing: "unknown",
            },
          ],
        },
      ],
    });
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, references, "test")[0],
    ).toMatchObject({ credit: "personal-loot", loot: { itemId: 750, quantity: 8 } });
  });
  it("does not treat a provided item objective as additional kill work", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Meat (8)\n.mob Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const references = indexCombatReferences({
      ...data,
      quests: [
        {
          ...data.quests[0]!,
          creatureIds: [],
          itemCreatureIds: [114],
          onlyCreatureObjectives: false,
          itemObjectives: [
            {
              itemId: 750,
              quantity: 8,
              provided: true,
              objectiveIndex: 1,
              npcIds: [114],
              sharing: "unknown",
            },
          ],
        },
      ],
    });
    expect(
      resolveCombatObjectives(guide.steps[0]!.directives, references, "test")[0],
    ).toMatchObject({ credit: "non-combat", npcIds: [], requiredKills: null });
  });
  it("does not model vendor purchases as creature drops or invented kill XP", () => {
    const guide = parseGuideChapter(
      "step\n* Buy [Meat] from him\n.complete 300001,1 --Collect Meat (x8)\n.target Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const references = indexCombatReferences({
      ...data,
      quests: [
        {
          ...data.quests[0]!,
          creatureIds: [],
          itemCreatureIds: [114],
          onlyCreatureObjectives: false,
          itemObjectives: [
            {
              itemId: 750,
              quantity: 8,
              objectiveIndex: 1,
              npcIds: [114],
              sharing: "unknown",
              vendorEvidence: {
                npcIds: [114],
                sourceUrl: "https://example.test/item=750",
                sourceSha256: "a".repeat(64),
                capturedAt: "2026-10-21T00:00:00.000Z",
              },
            },
          ],
        },
      ],
    });
    const objectives = resolveCombatObjectives(guide.steps[0]!.directives, references, "test");
    expect(objectives[0]).toMatchObject({ credit: "non-combat", npcIds: [], requiredKills: null });
    expect(objectives[0]!.loot).toBeUndefined();
    const combat = {
      revision: "test",
      sourceRevision: "a".repeat(40),
      targetBuild: 70205,
      npcs: data.npcs,
      activities: [],
      notice: null,
    };
    expect(
      applyCampaignCombat({
        activity: activity("purchase", objectives),
        combat,
        state: createCampaignCombatState(combat, emptyPremadeProgress().members[0]!),
        questStates: { "300001": "accepted" },
        position: { level: 1, currentXp: 0 },
        partySize: 1,
      }),
    ).toEqual({ xp: 0, rows: [], issues: [] });
  });
  it("preserves a separate kill objective beside a purchase in the same quest step", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Kill Harvest Watcher (x10)\n.mob Harvest Watcher\n* Buy [Meat] from him\n.complete 300001,2 --Collect Meat (x8)\n.target Test Merchant",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const references = indexCombatReferences({
      ...data,
      npcs: [...data.npcs, { ...npc, id: 1247, name: "Test Merchant" }],
      quests: [
        {
          ...data.quests[0]!,
          onlyCreatureObjectives: false,
          itemObjectives: [
            {
              itemId: 750,
              quantity: 8,
              objectiveIndex: 2,
              npcIds: [1247],
              sharing: "unknown",
              vendorEvidence: {
                npcIds: [1247],
                sourceUrl: "https://example.test/item=750",
                sourceSha256: "a".repeat(64),
                capturedAt: "2026-10-21T00:00:00.000Z",
              },
            },
          ],
        },
      ],
    });
    const objectives = resolveCombatObjectives(guide.steps[0]!.directives, references, "test");
    expect(objectives).toMatchObject([
      { objectiveIndex: 1, credit: "shared-kills", npcIds: [114], requiredKills: 10 },
      { objectiveIndex: 2, credit: "non-combat", npcIds: [], requiredKills: null },
    ]);
  });
  it("recovers omitted guide quotas from explicit corrected objective text", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1\n.mob Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const reference = {
      ...data,
      quests: [
        { ...data.quests[0]!, objectiveText: ["Kill 20 Harvest Watchers and report back."] },
      ],
    };
    expect(
      resolveCombatObjectives(
        guide.steps[0]!.directives,
        indexCombatReferences(reference),
        "test",
      )[0],
    ).toMatchObject({
      requiredKills: 20,
      npcIds: [114],
      credit: "shared-kills",
    });
  });
  it("holds conflicting guide/quest quotas instead of choosing the larger reward", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1 --Harvest Watcher (10)\n.mob Harvest Watcher",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const reference = {
      ...data,
      quests: [{ ...data.quests[0]!, objectiveText: ["Kill 20 Harvest Watchers."] }],
    };
    expect(
      resolveCombatObjectives(
        guide.steps[0]!.directives,
        indexCombatReferences(reference),
        "test",
      )[0],
    ).toMatchObject({
      requiredKills: null,
      reason: expect.stringMatching(/disagree/),
    });
  });
  it("reconciles irregular plurals and punctuation by NPC identity", () => {
    const guide = parseGuideChapter(
      "step\n.complete 300001,1\n.mob Venture Co. Highwayman",
      "chapter-test",
      "a".repeat(64),
      70205,
    );
    const reference = {
      ...data,
      npcs: [{ ...npc, name: "Venture Co. Highwayman" }],
      quests: [{ ...data.quests[0]!, objectiveText: ["Slay 15 Venture Co. Highwaymen."] }],
    };
    expect(
      resolveCombatObjectives(
        guide.steps[0]!.directives,
        indexCombatReferences(reference),
        "test",
      )[0]!.requiredKills,
    ).toBe(15);
  });
  it("counts ten shared kills once, then five more for the longer quest", () => {
    const one = activity("one", [objective()]),
      two = activity("two", [objective(300002, 15)]);
    const combat = {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      npcs: [npc],
      activities: [one, two, activity("duplicate-source", [objective(300002, 15)])],
      notice: null,
    };
    const member = emptyPremadeProgress().members[0]!,
      state = createCampaignCombatState(combat, member);
    const questStates = { "300001": "accepted" as const, "300002": "accepted" as const };
    const first = applyCampaignCombat({
      activity: one,
      combat,
      state,
      questStates,
      position: { level: 20, currentXp: 0 },
      partySize: 5,
    });
    const second = applyCampaignCombat({
      activity: two,
      combat,
      state,
      questStates,
      position: { level: 20, currentXp: first.xp },
      partySize: 5,
    });
    expect(first.rows[0]!.kills).toBe(10);
    expect(second.rows[0]!.kills).toBe(5);
    expect(first.xp + second.xp).toBe(435);
    expect(
      applyCampaignCombat({
        activity: one,
        combat,
        state,
        questStates,
        position: { level: 20, currentXp: 435 },
        partySize: 5,
      }).xp,
    ).toBe(0);
  });
  it("does not borrow overlap from a quest accepted after the first kills", () => {
    const one = activity("one", [objective()]),
      two = activity("two", [objective(300002)]);
    const combat = {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      npcs: [npc],
      activities: [one, two],
      notice: null,
    };
    const state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const base = { combat, state, position: { level: 20, currentXp: 0 }, partySize: 5 };
    applyCampaignCombat({ ...base, activity: one, questStates: { "300001": "accepted" } });
    expect(
      applyCampaignCombat({
        ...base,
        activity: two,
        questStates: { "300001": "objectives-complete", "300002": "accepted" },
      }).rows[0]!.kills,
    ).toBe(10);
  });
  it("does not award the full kill quota again to an already-started quest", () => {
    const one = activity("one", [objective()]);
    const combat = {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      npcs: [npc],
      activities: [one],
      notice: null,
    };
    const member = {
      ...emptyPremadeProgress().members[0]!,
      questStates: { "300001": "accepted" as const },
    };
    const result = applyCampaignCombat({
      activity: one,
      combat,
      state: createCampaignCombatState(combat, member),
      questStates: member.questStates,
      position: { level: 20, currentXp: 5000 },
      partySize: 5,
    });
    expect(result.xp).toBe(0);
    expect(result.issues.join(" ")).toMatch(/already in progress/);
  });
  it("counts dungeon quest kills within a clear manifest once", () => {
    const one = {
      ...activity("one", [objective()]),
      environment: "dungeon" as const,
      pathId: "dungeon-test",
    };
    const two = {
      ...activity("two", [objective(300002, 20)]),
      environment: "dungeon" as const,
      pathId: "dungeon-test",
      profile: {
        id: "test-path",
        stopId: "test",
        title: "Test path",
        scope: "quest-path" as const,
        basis: "reference-estimate" as const,
        source: "Synthetic path",
        sourceBuild: 70205,
        packs: [{ npcId: 114, kills: 20 }],
        dungeonMultiplier: 0.5,
      },
    };
    const combat = {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      npcs: [npc],
      activities: [one, two],
      notice: null,
      killXpEvidence: [evidence],
    };
    const state = createCampaignCombatState(combat, emptyPremadeProgress().members[0]!);
    const base = {
      combat,
      state,
      questStates: { "300001": "accepted" as const, "300002": "accepted" as const },
      position: { level: 20, currentXp: 0 },
      partySize: 5,
    };
    const first = applyCampaignCombat({ ...base, activity: one }),
      second = applyCampaignCombat({ ...base, activity: two });
    expect(first.xp + second.xp).toBe(780);
    expect([...first.rows, ...second.rows].reduce((sum, row) => sum + row.kills, 0)).toBe(20);
  });
});

describe("automatic campaign combat", () => {
  function route(): CampaignPlan {
    const actions: CampaignAction[] = ["accepted", "objectives-complete", "rewarded"].map(
      (state, index) => ({
        id: `step-${index}`,
        legId: "zone",
        title: state,
        instructions: [],
        questChanges: [
          {
            questId: 300001,
            state: state as "accepted" | "objectives-complete" | "rewarded",
            title: "Quest",
            objectiveIndex: state === "objectives-complete" ? 1 : null,
          },
        ],
        positions: [],
        source: null,
        kind: "quests",
        leaderOnly: false,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
      }),
    );
    const one = activity("step-1", [objective()]);
    return {
      release: "combat-test",
      race: "human",
      leaderClass: null,
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "zone",
          title: "Zone",
          from: 20,
          to: 21,
          kind: "xp-bridge",
          actionIds: actions.map((action) => action.id),
          questIds: [300001],
          unresolvedQuestIds: [],
          stopId: null,
        },
      ],
      rewardFacts: [
        {
          questId: 300001,
          fullXp: 1000,
          questLevel: 30,
          minimumLevel: 1,
          xpByLevel: [],
          sourceUrl: "https://www.wowhead.com/forever/quest=300001",
          capturedAt: "2026-10-15T00:00:00.000Z",
          status: "available",
        },
      ],
      combat: {
        revision: "test",
        sourceRevision: "test",
        targetBuild: 70205,
        npcs: [npc],
        activities: [one],
        notice: null,
      },
    };
  }
  it.each(["dwarf", "human"] as const)(
    "resolves a version-matched XP-rate-gated source selected for %s",
    (race) => {
      const reference = CHAPTER_REFERENCES.find(
        (entry) => entry.id === "chapter-123-6-11-dun-morogh-hunter",
      )!;
      const guide = parseGuideChapter(
        "step << Hunter\n.group 5\n.complete 300001,1 --Kill Harvest Watcher (x10)\n.mob Harvest Watcher",
        reference.id,
        "a".repeat(64),
        70205,
      );
      const raw = route();
      const actions = raw.actions.map((action) =>
        action.id === "step-1"
          ? {
              ...action,
              source: {
                chapterId: reference.id,
                version: guide.version,
                stepId: guide.steps[0]!.id,
              },
            }
          : action,
      );
      const attached = attachCampaignCombat(
        { ...raw, race, leaderClass: "hunter", actions },
        [{ reference, guide }],
        data,
        "test",
      );
      expect(attached.combat!.activities[0]!.objectives).toMatchObject([
        {
          questId: 300001,
          objectiveIndex: 1,
          credit: "shared-kills",
          npcIds: [114],
          requiredKills: 10,
        },
      ]);
    },
  );
  it("does not borrow a different source version or bypass a step's race condition", () => {
    const reference = CHAPTER_REFERENCES.find(
      (entry) => entry.id === "chapter-123-6-11-dun-morogh-hunter",
    )!;
    for (const [condition, stale] of [
      ["Hunter", true],
      ["Dwarf", false],
    ] as const) {
      const guide = parseGuideChapter(
        `step << ${condition}\n.complete 300001,1 --Kill Harvest Watcher (x10)\n.mob Harvest Watcher`,
        reference.id,
        "a".repeat(64),
        70205,
      );
      const raw = route();
      const actions = raw.actions.map((action) =>
        action.id === "step-1"
          ? {
              ...action,
              source: {
                chapterId: reference.id,
                version: guide.version + (stale ? "-stale" : ""),
                stepId: guide.steps[0]!.id,
              },
            }
          : action,
      );
      const attached = attachCampaignCombat(
        { ...raw, race: "human", leaderClass: "hunter", actions },
        [{ reference, guide }],
        data,
        "test",
      );
      expect(attached.combat!.activities[0]!.objectives[0]!.credit).toBe("unknown");
      expect(attached.combat!.activities[0]!.objectives[0]!.requiredKills).toBeNull();
    }
  });
  it("includes required kills before hand-in and keeps each player's full quest reward", () => {
    const progress = emptyPremadeProgress();
    const party = {
      ...progress,
      members: progress.members.map((member) => ({
        ...member,
        level: 20,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const forecast = forecastCampaignXp(route(), party)[0]!.members[0]!;
    expect(forecast).toMatchObject({
      referenceQuestXp: 1000,
      combatXp: 290,
      outdoorCombatXp: 290,
      endpoint: { level: 20, currentXp: 1290 },
      status: "incomplete",
    });
    expect(forecast.evidenceIssues.join(" ")).toContain("historical formula");
  });
  it("treats controlled matching combat observations as exact route evidence", () => {
    const base = route();
    const plan: CampaignPlan = {
      ...base,
      rewardFacts: [{ ...base.rewardFacts![0]!, fullXp: FOREVER_XP_CURVE[20]! - 290 }],
      combat: {
        ...base.combat!,
        killXpEvidence: [
          {
            ...evidence,
            environment: "outdoor",
            unrestedXpPerPlayer: 29,
          },
        ],
      },
    };
    const progress = emptyPremadeProgress();
    const member = forecastCampaignXp(plan, {
      ...progress,
      members: progress.members.map((entry) => ({
        ...entry,
        level: 20,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    })[0]!.members[0]!;
    expect(member).toMatchObject({
      endpoint: { level: 21, currentXp: 0 },
      combatXp: 290,
      status: "shortfall",
    });
    expect(member.combatRows.every((row) => row.basis === "observed")).toBe(true);
    expect(member.evidenceIssues).toEqual([]);
  });
  it("does not use later dungeon kills to pay its entry gate", () => {
    const plan = route();
    const gate: CampaignAction = {
      ...plan.actions[0]!,
      id: "entry",
      kind: "checkpoint",
      questChanges: [],
      targetLevel: 21,
    };
    const progress = emptyPremadeProgress();
    const party = {
      ...progress,
      members: progress.members.map((member) => ({
        ...member,
        level: 20,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    const forecast = forecastCampaignXp(
      {
        ...plan,
        actions: [gate, ...plan.actions],
        legs: [{ ...plan.legs[0]!, actionIds: ["entry", ...plan.legs[0]!.actionIds] }],
      },
      party,
    )[0]!.members[0]!;
    expect(forecast).toMatchObject({
      combatXp: 0,
      referenceQuestXp: 0,
      status: "blocked",
      blockedAtActionId: "entry",
    });
  });
  it("omits unstarted optional filler when the combat-funded scenario reaches the next target", () => {
    const plan = route(),
      progress = emptyPremadeProgress();
    const extra: CampaignAction = {
      ...plan.actions[0]!,
      id: "optional-extra",
      xpOptional: true,
      xpTargetLevel: 21,
      questChanges: [{ questId: 300002, state: "accepted", objectiveIndex: null, title: "Extra" }],
    };
    const forecast = forecastCampaignXp(
      {
        ...plan,
        actions: [...plan.actions, extra],
        legs: [{ ...plan.legs[0]!, actionIds: [...plan.legs[0]!.actionIds, extra.id] }],
        rewardFacts: [{ ...plan.rewardFacts![0]!, fullXp: FOREVER_XP_CURVE[20]! - 290 }],
      },
      {
        ...progress,
        members: progress.members.map((member) => ({
          ...member,
          level: 20,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      },
    )[0]!;
    expect(forecast.members[0]!.endpoint).toMatchObject({ level: 21, currentXp: 0 });
    expect(forecast.skippedOptionalActionIds).toContain("optional-extra");
  });
  it("accounts for every typed kill objective in a generic whole-quest action", () => {
    const reference = {
      ...data,
      npcs: [npc, { ...npc, id: 115, name: "Defias Trapper" }],
      quests: [
        {
          ...data.quests[0]!,
          creatureIds: [114, 115],
          objectiveText: ["Kill 10 Harvest Watchers and 5 Defias Trappers."],
        },
      ],
    };
    const plan = attachCampaignCombat(route(), [], reference, "test");
    expect(
      plan.combat!.activities[0]!.objectives.map((objective) => objective.requiredKills),
    ).toEqual([10, 5]);
    const progress = emptyPremadeProgress();
    const forecast = forecastCampaignXp(plan, {
      ...progress,
      members: progress.members.map((member) => ({
        ...member,
        level: 20,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    })[0]!.members[0]!;
    expect(forecast).toMatchObject({
      referenceQuestXp: 1000,
      combatXp: 435,
      endpoint: { level: 20, currentXp: 1435 },
    });
  });
  it("does not credit a misplaced dungeon objective or its hand-in before a visit", () => {
    const plan = route();
    const progress = emptyPremadeProgress();
    const forecast = forecastCampaignXp(
      {
        ...plan,
        combat: {
          ...plan.combat!,
          activities: plan.combat!.activities.map((activity) => ({
            ...activity,
            environment: "dungeon",
          })),
        },
      },
      {
        ...progress,
        members: progress.members.map((member) => ({
          ...member,
          level: 20,
          currentXp: 0,
          xpNeedsUpdate: false,
        })),
      },
    )[0]!.members[0]!;
    expect(forecast.combatXp).toBe(0);
    expect(forecast.referenceQuestXp).toBe(0);
    expect(forecast.blockedReason).toMatch(/before its dungeon visit/);
  });
});
