import { describe, expect, it } from "vitest";
import {
  capturedKillInputSchema,
  capturedKillQuestSchema,
  capturedCreatureKillQuotas,
} from "./combat-captured-quotas.js";
import { questCatalogEntrySchema } from "./quest-catalog.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import {
  resolveCombatObjectives,
  indexCombatReferences,
  attachCampaignCombat,
} from "./campaign-combat.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { CampaignPlan } from "./campaign.js";

const quest = questCatalogEntrySchema.parse({
  questId: 300001,
  title: "Special Forces",
  minimumLevel: 1,
  questLevel: 1,
  requiredClasses: 0,
  requiredRaces: 0,
  starts: [],
  ends: [],
  prerequisites: { allOf: [], anyOf: [] },
  exclusiveWith: [],
  category: "shared-kills",
  unsupportedRequirements: [],
  objectives: [
    { index: 1, npcId: 1, count: null, positions: [] },
    { index: 2, npcId: 2, count: null, positions: [] },
  ],
});
const names = new Map([
  [1, { name: "Kurzen Commando" }],
  [2, { name: "Kurzen Headshrinker" }],
]);
const capture = capturedKillQuestSchema.parse({
  game: "forever",
  kind: "quest",
  id: 300001,
  name: "Special Forces",
  sourceUrl: "https://www.wowhead.com/forever/quest=300001/special-forces",
  sourceSha256: "a".repeat(64),
  capturedAt: "2026-10-14T00:00:00Z",
  objectives: ["Kill the enemies. Kurzen Commando slain (10) Kurzen Headshrinker slain (6)"],
});

describe("captured creature death quotas", () => {
  it("recovers exact named counters and retains page provenance", () => {
    const before = JSON.stringify({ quest, capture });
    const result = capturedCreatureKillQuotas(quest, capture, names);
    expect(
      result.quotas.map(({ objectiveIndex, npcId, kills }) => ({ objectiveIndex, npcId, kills })),
    ).toEqual([
      { objectiveIndex: 1, npcId: 1, kills: 10 },
      { objectiveIndex: 2, npcId: 2, kills: 6 },
    ]);
    expect(result.quotas[0]?.source).toContain(capture.sourceUrl);
    expect(result.quotas[0]?.source).toContain(capture.sourceSha256);
    expect(result.quotas[0]?.source).toContain(capture.capturedAt);
    expect(result.held).toEqual([]);
    expect(JSON.stringify({ quest, capture })).toBe(before);
  });
  it("does not infer lethal kills from defeat, interaction, item counters or prose", () => {
    for (const text of [
      "Kurzen Commando defeated (10)",
      "Kurzen Commando spoken to (10)",
      "Kurzen Commando (10)",
      "Kill 10 Kurzen Commandos.",
      "Elite Kurzen Commando slain (10)",
    ])
      expect(
        capturedCreatureKillQuotas(quest, { ...capture, objectives: [text] }, names).quotas,
      ).toEqual([]);
    expect(
      capturedCreatureKillQuotas({ ...quest, category: "unsupported" }, capture, names).quotas,
    ).toEqual([]);
  });
  it("keeps conflicting counts separate for reconciliation instead of choosing one", () => {
    const result = capturedCreatureKillQuotas(
      quest,
      { ...capture, objectives: ["Kurzen Commando slain (8)", "Kurzen Commando slain (10)"] },
      names,
    );
    expect(result.quotas.map((q) => q.kills)).toEqual([8, 10]);
  });
  it("holds ambiguous objective names, invalid quantities and incompatible titles", () => {
    const repeated = {
      ...quest,
      objectives: quest.objectives.map((objective) => ({ ...objective, npcId: 1 })),
    };
    expect(
      capturedCreatureKillQuotas(repeated, capture, names).held.map((h) => h.objectiveIndex),
    ).toEqual([1, 2]);
    expect(
      capturedCreatureKillQuotas(
        quest,
        { ...capture, objectives: ["Kurzen Commando slain (0)"] },
        names,
      ).held,
    ).toHaveLength(1);
    expect(
      capturedCreatureKillQuotas(quest, { ...capture, name: "Different quest" }, names),
    ).toMatchObject({ quotas: [], held: [{ objectiveIndex: 1 }, { objectiveIndex: 2 }] });
    expect(() => capturedCreatureKillQuotas(quest, { ...capture, id: 1 }, names)).toThrow(
      /identity differs/,
    );
  });
  it("handles punctuation and matches full creature names", () => {
    const one = { ...quest, objectives: [quest.objectives[0]!] };
    const labels = new Map([[1, { name: "Tapoke [A]+" }]]);
    expect(
      capturedCreatureKillQuotas(
        one,
        { ...capture, objectives: ["Enemy down. Tapoke [A]+ killed (1)"] },
        labels,
      ).quotas[0]?.kills,
    ).toBe(1);
  });
  it("checks record identity and strips unrelated staged fields", () => {
    for (const override of [
      { game: "tbc" },
      { sourceUrl: "https://www.wowhead.com/tbc/quest=300001" },
      { sourceUrl: "https://www.wowhead.com/forever/quest=1" },
      { sourceSha256: "bad" },
      { sourceUrl: "not a URL" },
      { sourceUrl: "https://user:password@www.wowhead.com/forever/quest=300001" },
    ])
      expect(capturedKillQuestSchema.safeParse({ ...capture, ...override }).success).toBe(false);
    const parsed = capturedKillInputSchema.parse({
      schema: "local-quest-kill-capture-inputs.v1",
      checkedAt: "2026-11-01T00:00:00Z",
      catalogSha256: "b".repeat(64),
      missing: [],
      records: [
        {
          ...capture,
          permissionRef: "private metadata",
          description: ["irrelevant text"],
          playerRecording: {},
        },
      ],
    });
    expect(Object.keys(parsed.records[0]!)).not.toContain("permissionRef");
    expect(Object.keys(parsed.records[0]!)).not.toContain("description");
    expect(Object.keys(parsed.records[0]!)).not.toContain("playerRecording");
  });
});

function reference(held: boolean): CombatDataset {
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    publication: "private-reference",
    authorizationNote: "",
    targetBuild: 70205,
    provider: {
      repository: "https://example.test/reference",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic test"],
    },
    npcs: [
      {
        id: 1,
        name: "Kurzen Commando",
        minimumLevel: 1,
        maximumLevel: 1,
        rank: 0,
        zoneIds: [12],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 300001,
        creatureIds: [1],
        itemCreatureIds: [],
        objectiveText: ["Kill Kurzen Commando."],
        onlyCreatureObjectives: true,
        killQuotas: [{ objectiveIndex: 1, npcId: 1, kills: 10, source: "Captured counter source" }],
        ...(held ? { killQuotaConflicts: [1] } : {}),
      },
    ],
    dungeons: [],
    killXpEvidence: [],
  });
}
function directive(text: string): ImportedDirective {
  return {
    tag: ".complete",
    arguments: "300001,1",
    condition: "",
    text,
    sourceLine: 1,
    questId: 300001,
    position: null,
  };
}
describe("captured quotas in executable combat references", () => {
  it("uses an explicit captured quota when a source step has no numeric label", () => {
    const result = resolveCombatObjectives(
      [directive("")],
      indexCombatReferences(reference(false)),
      "fixture",
    )[0];
    expect(result).toMatchObject({
      npcIds: [1],
      requiredKills: 10,
      credit: "shared-kills",
      source: "Captured counter source",
    });
  });
  it("does not let a numeric source step bypass a held quota", () => {
    const held = resolveCombatObjectives(
      [directive("Kurzen Commando slain (5)")],
      indexCombatReferences(reference(true)),
      "fixture",
    )[0];
    expect(held).toMatchObject({ requiredKills: null, credit: "unknown" });
    const conflicting = resolveCombatObjectives(
      [directive("Kurzen Commando slain (5)")],
      indexCombatReferences(reference(false)),
      "fixture",
    )[0];
    expect(conflicting).toMatchObject({ requiredKills: null, credit: "unknown" });
  });
  it("also holds generated actions that have no source step", () => {
    const action = {
      id: "objective",
      legId: "route",
      title: "Kill",
      instructions: [],
      positions: [],
      source: null,
      kind: "quests" as const,
      leaderOnly: false,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
      questChanges: [
        {
          questId: 300001,
          title: "Special Forces",
          state: "objectives-complete" as const,
          objectiveIndex: 1,
        },
      ],
    };
    const plan: CampaignPlan = {
      release: "captured-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [
        {
          id: "route",
          title: "Route",
          from: 1,
          to: 2,
          kind: "preparation",
          stopId: null,
          actionIds: [action.id],
          questIds: [300001],
          unresolvedQuestIds: [],
        },
      ],
    };
    expect(
      attachCampaignCombat(plan, [], reference(true), "synthetic").combat?.activities[0]
        ?.objectives[0],
    ).toMatchObject({ requiredKills: null, credit: "unknown" });
  });
});
