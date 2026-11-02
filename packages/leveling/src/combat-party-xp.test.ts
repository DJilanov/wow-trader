import { describe, expect, it } from "vitest";
import { estimatePartyCreatureKills } from "./combat-party-xp.js";
import type { CombatNpc, KillXpEvidence, CombatActivity } from "./combat-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";

const npc: CombatNpc = {
  id: 1,
  name: "Young Wolf",
  minimumLevel: 1,
  maximumLevel: 1,
  rank: 0,
  zoneIds: [12],
  xpEligibility: "assumed",
};
const positions = [390, 0, 0, 0, 0].map((currentXp) => ({ level: 1, currentXp }));
const input = { npc, kills: 5, positions, environment: "outdoor" as const };

describe("joint party kill XP", () => {
  it.each([1, 10, 100])(
    "keeps an already-shared 24–30 XP range whole for every player over %i kills",
    (kills: number) => {
      const elite: CombatNpc = {
        ...npc,
        name: "Synthetic level-20 elite",
        minimumLevel: 20,
        maximumLevel: 20,
        rank: 1,
      };
      const evidence = [24, 30].map((unrestedXpPerPlayer): KillXpEvidence => ({
        npcId: elite.id,
        build: 70450,
        playerLevel: 20,
        mobLevel: 20,
        partySize: 5,
        partyLevels: [20, 20, 20, 20, 20],
        environment: "dungeon",
        unrestedXpPerPlayer,
        sampleCount: 3,
        source: "Synthetic per-player range boundary; not a server measurement",
        contextVerified: true,
      }));
      const result = estimatePartyCreatureKills({
        npc: elite,
        kills,
        positions: Array.from({ length: 5 }, () => ({ level: 20, currentXp: 0 })),
        environment: "dungeon",
        dungeonMultiplier: 0.5,
        xpMultiplier: 2.375,
        build: 70450,
        evidence,
      });
      expect(result).toHaveLength(5);
      for (const member of result)
        expect(member).toMatchObject({
          xp: kills * 24,
          maximumXp: kills * 30,
          exit: { level: 20, currentXp: kills * 24 },
          basis: "observed",
        });
    },
  );

  it("changes every member's next share when only one player levels", () => {
    const before = JSON.stringify(input);
    const result = estimatePartyCreatureKills(input);
    // First kill: 50/5=10 each. Then sum(levels)=6: floor(40*2/6)=13,
    // floor(50*1/6)=8. The lower members must not keep receiving 10.
    expect(result.map((member) => member.xp)).toEqual([62, 42, 42, 42, 42]);
    expect(result.map((member) => member.exit)).toEqual([
      { level: 2, currentXp: 52 },
      ...Array.from({ length: 4 }, () => ({ level: 1, currentXp: 42 })),
    ]);
    expect(result.every((member) => member.basis === "reference-estimate")).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("uses the same pre-kill levels regardless of member iteration order", () => {
    expect(
      estimatePartyCreatureKills({ ...input, positions: [...positions].reverse() }).map(
        (member) => member.xp,
      ),
    ).toEqual([42, 42, 42, 42, 62]);
    expect(
      estimatePartyCreatureKills({ ...input, kills: 3, positions: positions.slice(0, 2) }).map(
        (member) => member.xp,
      ),
    ).toEqual([77, 57]);
  });
  it.each([
    [2, 129, 89],
    [3, 96, 64],
    [4, 76, 52],
    [5, 62, 42],
  ])("advances a %i-player party with unequal bars", (size, first, others) => {
    const result = estimatePartyCreatureKills({ ...input, positions: positions.slice(0, size) });
    expect(result.map((member) => member.xp)).toEqual([
      first,
      ...Array.from({ length: size - 1 }, () => others),
    ]);
  });
  it("retains the equal-bar simultaneous-level-up result", () => {
    expect(
      estimatePartyCreatureKills({
        ...input,
        positions: positions.map(() => ({ level: 1, currentXp: 390 })),
      }).map((member) => member.xp),
    ).toEqual([42, 42, 42, 42, 42]);
  });
  it("accepts a creature-level interval only while peer levels provably remain fixed", () => {
    const result = estimatePartyCreatureKills({
      ...input,
      kills: 10,
      npc: { ...npc, minimumLevel: 20, maximumLevel: 21 },
      positions: [
        { level: 20, currentXp: 0 },
        { level: 18, currentXp: 0 },
      ],
    });
    expect(result.map(({ xp, maximumXp }) => ({ xp, maximumXp }))).toEqual([
      { xp: 760, maximumXp: 800 },
      { xp: 700, maximumXp: 730 },
    ]);
    const unknown = estimatePartyCreatureKills({ ...input, npc: { ...npc, maximumLevel: 2 } });
    expect(unknown.every((member) => member.xp === null && member.basis === "unknown")).toBe(true);
    expect(unknown[0]?.reason).toContain("exact creature level");
  });
  it("does not reuse an equal-level observation after party levels diverge", () => {
    const evidence: KillXpEvidence = {
      npcId: 1,
      build: 70205,
      playerLevel: 1,
      mobLevel: 1,
      partySize: 5,
      partyLevels: [1, 1, 1, 1, 1],
      environment: "dungeon",
      unrestedXpPerPlayer: 10,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic controlled sample",
    };
    const result = estimatePartyCreatureKills({
      ...input,
      environment: "dungeon",
      build: 70205,
      evidence: [evidence],
    });
    expect(result.every((member) => member.xp === null)).toBe(true);
    expect(result.map((member) => member.exit)).toEqual(positions);
    expect(result[0]?.reason).toContain("dungeon kill tuning");
  });
  it("keeps missing creature data unknown without partially paying earlier kills", () => {
    expect(
      estimatePartyCreatureKills({ ...input, npc: { ...npc, rank: null } }).every(
        (member) => member.xp === null,
      ),
    ).toBe(true);
    expect(
      estimatePartyCreatureKills({ ...input, kills: 0 }).every((member) => member.xp === 0),
    ).toBe(true);
    expect(() => estimatePartyCreatureKills({ ...input, positions: [] })).toThrow(
      /party combat inputs/,
    );
    expect(() => estimatePartyCreatureKills({ ...input, kills: 1.5 })).toThrow(
      /party combat inputs/,
    );
    expect(() => estimatePartyCreatureKills({ ...input, xpMultiplier: -1 })).toThrow(
      /combat inputs/,
    );
  });
});

function planForPhases(split: boolean): CampaignPlan {
  const changes: CampaignAction["questChanges"] = [1, 2].map((objectiveIndex) => ({
    questId: 300001,
    title: "Two wolf packs",
    state: "objectives-complete",
    objectiveIndex,
  }));
  const base: CampaignAction = {
    id: "pickup",
    legId: "route",
    title: "Accept Two wolf packs",
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    questChanges: [
      { questId: 300001, title: "Two wolf packs", state: "accepted", objectiveIndex: null },
    ],
  };
  const actions: CampaignAction[] = [
    base,
    ...(split
      ? changes.map((change, index) => ({ ...base, id: `hunt-${index}`, questChanges: [change] }))
      : [{ ...base, id: "hunt", questChanges: changes }]),
  ];
  const activities: CombatActivity[] = actions.slice(1).map((action) => ({
    id: `combat-${action.id}`,
    actionId: action.id,
    environment: "outdoor",
    pathId: "route",
    profile: null,
    objectives: action.questChanges.map((change) => ({
      questId: change.questId,
      objectiveIndex: change.objectiveIndex!,
      npcIds: [change.objectiveIndex!],
      requiredKills: change.objectiveIndex === 1 ? 1 : 4,
      credit: "shared-kills",
      source: "Synthetic quest quota",
      reason: null,
    })),
  }));
  return {
    release: "joint-party-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "route",
        title: "Two packs",
        kind: "preparation",
        from: 1,
        to: 3,
        stopId: null,
        actionIds: actions.map((action) => action.id),
        questIds: [300001],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 300001,
        fullXp: 0,
        minimumLevel: 1,
        questLevel: 1,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-10-31T00:00:00Z",
      },
    ],
    combat: {
      revision: "synthetic",
      sourceRevision: "synthetic",
      targetBuild: 70205,
      notice: null,
      npcs: [npc, { ...npc, id: 2 }],
      activities,
    },
  };
}

describe("joint-party campaign phases", () => {
  it.each([false, true])(
    "threads peer bars across objective phases (split actions: %s)",
    (split) => {
      const plan = planForPhases(split);
      const base = emptyPremadeProgress();
      const progress = {
        ...base,
        members: base.members.map((member, index) => ({
          ...member,
          ...positions[index]!,
          xpNeedsUpdate: false,
          raceId: index % 2 ? ("dwarf" as const) : ("human" as const),
          classSlug: index % 2 ? ("mage" as const) : ("warrior" as const),
        })),
      };
      const before = JSON.stringify({ plan, progress });
      const rows = forecastCampaignXp(plan, progress)[0]!.members;
      expect(rows.map((row) => row.combatXp)).toEqual([62, 42, 42, 42, 42]);
      expect(rows.every((row) => row.estimatedCombatXp === 0 && row.blockedReason === null)).toBe(
        true,
      );
      expect(rows[0]?.knownEndpoint).toEqual({ level: 2, currentXp: 52 });
      expect(rows[1]?.knownEndpoint).toEqual({ level: 1, currentXp: 42 });
      expect(JSON.stringify({ plan, progress })).toBe(before);
    },
  );
  it("keeps mixed classes synchronized when their starting bars match", () => {
    const plan = planForPhases(false);
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member, index) => ({
        ...member,
        level: 1,
        currentXp: 390,
        xpNeedsUpdate: false,
        classSlug: index ? ("mage" as const) : ("warrior" as const),
      })),
    };
    const rows = forecastCampaignXp(plan, progress)[0]!.members;
    expect(rows.map((row) => row.combatXp)).toEqual([42, 42, 42, 42, 42]);
  });
  it("holds combat after unmodeled peer hand-in timing rather than freezing their bars", () => {
    const original = planForPhases(false);
    const pickup = original.actions[0]!;
    const actions = [
      pickup,
      {
        ...pickup,
        id: "delivery-pickup",
        questChanges: [{ ...pickup.questChanges[0]!, questId: 300002 }],
      },
      {
        ...original.actions[1]!,
        questChanges: [
          { ...pickup.questChanges[0]!, questId: 300002, state: "rewarded" as const },
          ...original.actions[1]!.questChanges,
        ],
      },
    ];
    const plan = {
      ...original,
      actions,
      legs: original.legs.map((leg) => ({ ...leg, actionIds: actions.map((action) => action.id) })),
      rewardFacts: [
        ...original.rewardFacts!,
        { ...original.rewardFacts![0]!, questId: 300002, fullXp: 500 },
      ],
    };
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member, index) => ({
        ...member,
        ...positions[index]!,
        xpNeedsUpdate: false,
      })),
    };
    const rows = forecastCampaignXp(plan, progress)[0]!.members;
    expect(rows.every((row) => row.referenceQuestXp === 500 && row.combatXp === 0)).toBe(true);
    expect(rows.every((row) => row.combatRows.every((row) => row.xp === null))).toBe(true);
    expect(rows[0]?.issues.some((issue) => issue.message.includes("peer XP bars"))).toBe(true);
  });
});
