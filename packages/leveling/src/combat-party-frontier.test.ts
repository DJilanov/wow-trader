import { describe, expect, it } from "vitest";
import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import {
  advancePartyXpKills,
  awardPartyXp,
  createPartyXpFrontier,
  partyXpFrontierBounds,
  type PartyCreatureBatch,
  type PartyXpFrontier,
  type PartyXpFrontierResult,
} from "./combat-party-frontier.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatXpPosition,
} from "./combat-xp.js";

const npc: CombatNpc = {
  id: 1197,
  name: "Stonesplinter Shaman",
  minimumLevel: 15,
  maximumLevel: 16,
  rank: 0,
  zoneIds: [38],
  xpEligibility: "assumed",
};
const positions: readonly CombatXpPosition[] = [10056, 4781, 4465, 7973, 8320].map((currentXp) => ({
  level: 12,
  currentXp,
}));
const batch: PartyCreatureBatch = {
  npc,
  kills: 10,
  environment: "outdoor",
  build: 70205,
  xpMultiplier: 1,
};

function bounded(result: PartyXpFrontierResult): PartyXpFrontier {
  if (result.status === "unknown") throw new Error(result.reason);
  return result.frontier;
}

function stateBars(frontier: PartyXpFrontier): readonly string[] {
  return frontier.states.map((state) => JSON.stringify(state.positions)).sort();
}

/** Independent exhaustive sequences using the scalar one-kill formula and common pre-kill levels. */
function exactSequences(
  start: readonly CombatXpPosition[],
  batches: readonly PartyCreatureBatch[],
): PartyXpFrontier {
  let paths = [{ positions: start, xp: start.map(() => 0) }];
  for (const step of batches)
    for (let kill = 0; kill < step.kills; kill++)
      paths = paths.flatMap((path) =>
        Array.from(
          { length: step.npc.maximumLevel! - step.npc.minimumLevel! + 1 },
          (_unused, offset) => {
            const level = step.npc.minimumLevel! + offset;
            const payouts = path.positions.map((position, playerIndex) =>
              estimateCreatureKills({
                ...step,
                npc: { ...step.npc, minimumLevel: level, maximumLevel: level },
                kills: 1,
                position,
                partySize: path.positions.length,
                partyLevels: path.positions.map((bar) => bar.level),
                playerIndex,
              }),
            );
            if (payouts.some((payout) => payout.xp === null || payout.xp !== payout.maximumXp))
              throw new Error("Oracle requires exact per-kill payouts.");
            return {
              positions: path.positions.map((position, player) =>
                advanceCombatPosition(position, payouts[player]!.xp!),
              ),
              xp: path.xp.map((xp, player) => xp + payouts[player]!.xp!),
            };
          },
        ),
      );
  return {
    ...createPartyXpFrontier(start),
    states: paths.map((path) => ({
      positions: path.positions,
      minimumEarnedXp: path.xp,
      maximumEarnedXp: path.xp,
    })),
  };
}

describe("joint-party XP frontiers", () => {
  it("matches every one of the 1,024 creature-level sequences at the real mixed-party boundary", () => {
    const before = JSON.stringify({ positions, batch });
    const result = bounded(advancePartyXpKills(createPartyXpFrontier(positions), batch));
    const oracle = exactSequences(positions, [batch]);
    expect(oracle.states).toHaveLength(1024);
    expect(result.states).toHaveLength(11);
    expect(stateBars(result)).toEqual([...new Set(stateBars(oracle))]);
    expect(partyXpFrontierBounds(result)).toEqual(partyXpFrontierBounds(oracle));
    expect(
      partyXpFrontierBounds(result).map(({ minimumXp, maximumXp }) => [minimumXp, maximumXp]),
    ).toEqual([
      [248, 258],
      [232, 242],
      [232, 242],
      [232, 242],
      [232, 242],
    ]);
    expect(result.combatBasis).toEqual(Array(5).fill("reference-estimate"));
    expect(JSON.stringify({ positions, batch })).toBe(before);
  });

  it("preserves exactly the same frontier when a physical kill stream is split", () => {
    const initial = createPartyXpFrontier(positions);
    const one = bounded(advancePartyXpKills(initial, batch));
    const first = bounded(advancePartyXpKills(initial, { ...batch, kills: 4 }));
    const split = bounded(advancePartyXpKills(first, { ...batch, kills: 6 }));
    expect(split).toEqual(one);
  });

  it("carries correlation across different NPC targets", () => {
    const first = { ...batch, kills: 4 };
    const second = { ...batch, kills: 4, npc: { ...npc, id: 2, name: "Second target" } };
    const a = bounded(advancePartyXpKills(createPartyXpFrontier(positions), first));
    const result = bounded(advancePartyXpKills(a, second));
    const oracle = exactSequences(positions, [first, second]);
    expect(oracle.states).toHaveLength(256);
    expect(stateBars(result)).toEqual([...new Set(stateBars(oracle))]);
    expect(partyXpFrontierBounds(result)).toEqual(partyXpFrontierBounds(oracle));
  });

  it("keeps member order irrelevant to simultaneous payouts", () => {
    const original = bounded(advancePartyXpKills(createPartyXpFrontier(positions), batch));
    const reversed = bounded(
      advancePartyXpKills(createPartyXpFrontier([...positions].reverse()), batch),
    );
    expect(partyXpFrontierBounds(reversed)).toEqual([...partyXpFrontierBounds(original)].reverse());
    expect(stateBars(reversed)).toEqual(
      original.states.map((state) => JSON.stringify([...state.positions].reverse())).sort(),
    );
  });

  it.each([1, 2, 3, 4, 5])("supports %i participating players", (size) => {
    const bars = [
      { level: 1, currentXp: 390 },
      ...Array.from({ length: size - 1 }, () => ({ level: 1, currentXp: 0 })),
    ];
    const step = { ...batch, kills: 3, npc: { ...npc, minimumLevel: 1, maximumLevel: 2 } };
    const result = bounded(advancePartyXpKills(createPartyXpFrontier(bars), step));
    expect(partyXpFrontierBounds(result)).toEqual(
      partyXpFrontierBounds(exactSequences(bars, [step])),
    );
  });

  it("does not turn marginal minimum bars into a fictional joint party after a level-sensitive hand-in", () => {
    const bars = [389, 0, 0, 0, 0].map((currentXp) => ({ level: 1, currentXp }));
    const step = { ...batch, kills: 1, npc: { ...npc, minimumLevel: 1, maximumLevel: 3 } };
    const first = bounded(advancePartyXpKills(createPartyXpFrontier(bars), step));
    expect(first.states[0]!.positions[0]!.level).toBe(1);
    expect(first.states[1]!.positions[0]!.level).toBe(2);
    const awarded = bounded(
      awardPartyXp(first, [
        new Map([
          [1, 100],
          [2, 10],
        ]),
        null,
        null,
        null,
        null,
      ]),
    );
    const minima = partyXpFrontierBounds(awarded).map((bound) => bound.minimumExit);
    expect(
      awarded.states.some((state) => JSON.stringify(state.positions) === JSON.stringify(minima)),
    ).toBe(false);
    expect(awarded.states.map((state) => state.positions[0])).toEqual([
      { level: 2, currentXp: 99 },
      { level: 2, currentXp: 10 },
    ]);
    const after = bounded(advancePartyXpKills(awarded, step));
    const expected = awarded.states.flatMap((state) =>
      exactSequences(state.positions, [step]).states.map((next) => ({
        positions: next.positions,
        minimumEarnedXp: next.minimumEarnedXp.map(
          (xp, player) => xp + state.minimumEarnedXp[player]!,
        ),
        maximumEarnedXp: next.maximumEarnedXp.map(
          (xp, player) => xp + state.maximumEarnedXp[player]!,
        ),
      })),
    );
    expect(stateBars(after)).toEqual(
      [...new Set(expected.map((state) => JSON.stringify(state.positions)))].sort(),
    );
    expect(partyXpFrontierBounds(after)).toEqual(
      partyXpFrontierBounds({ ...awarded, states: expected }),
    );
  });

  it("retains different earned payouts when paths merge at level 60", () => {
    const initial = createPartyXpFrontier([{ level: 60, currentXp: 0 }]);
    const paths = {
      ...initial,
      states: [
        { positions: initial.states[0]!.positions, minimumEarnedXp: [10], maximumEarnedXp: [10] },
        { positions: initial.states[0]!.positions, minimumEarnedXp: [20], maximumEarnedXp: [20] },
      ],
    };
    const merged = bounded(awardPartyXp(paths, [new Map([[60, 5]])]));
    expect(merged.states).toHaveLength(1);
    expect(partyXpFrontierBounds(merged)[0]).toEqual({
      minimumXp: 15,
      maximumXp: 25,
      minimumExit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    });
  });

  it.each([{ maximumStates: 1 }, { maximumTransitions: 1 }])(
    "fails atomically at a work limit (%j)",
    (limits) => {
      const initial = createPartyXpFrontier(positions),
        saved = JSON.stringify(initial);
      const result = advancePartyXpKills(initial, batch, limits);
      expect(result.status).toBe("unknown");
      expect(result).not.toHaveProperty("frontier");
      expect(JSON.stringify(initial)).toBe(saved);
      expect(bounded(advancePartyXpKills(initial, batch)).states).toHaveLength(11);
    },
  );

  it("does not extrapolate an equal-level dungeon observation after the party diverges", () => {
    const evidence: KillXpEvidence = {
      npcId: npc.id,
      build: 70205,
      playerLevel: 1,
      mobLevel: 1,
      partySize: 5,
      partyLevels: [1, 1, 1, 1, 1],
      environment: "dungeon",
      unrestedXpPerPlayer: 10,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic controlled observation",
    };
    const initial = createPartyXpFrontier(
      [390, 0, 0, 0, 0].map((currentXp) => ({ level: 1, currentXp })),
    );
    const result = advancePartyXpKills(initial, {
      npc: { ...npc, minimumLevel: 1, maximumLevel: 1 },
      kills: 2,
      environment: "dungeon",
      evidence: [evidence],
      build: 70205,
    });
    expect(result).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("dungeon kill tuning"),
    });
    expect(result).not.toHaveProperty("frontier");
  });

  it("does not invent joint correlation for a 24–30 per-player observation range", () => {
    const elite = { ...npc, rank: 1, minimumLevel: 20, maximumLevel: 20 };
    const evidence = [24, 30].map((unrestedXpPerPlayer): KillXpEvidence => ({
      npcId: npc.id,
      build: 70450,
      playerLevel: 20,
      mobLevel: 20,
      partySize: 5,
      partyLevels: [20, 20, 20, 20, 20],
      environment: "dungeon",
      unrestedXpPerPlayer,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic marginal range",
    }));
    const initial = createPartyXpFrontier(
      Array.from({ length: 5 }, () => ({ level: 20, currentXp: 0 })),
    );
    const result = advancePartyXpKills(initial, {
      npc: elite,
      kills: 1,
      environment: "dungeon",
      evidence,
      build: 70450,
      dungeonMultiplier: 0.5,
      xpMultiplier: 2.375,
    });
    expect(result).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("joint payout correlation"),
    });
  });

  it("keeps an exact observed per-player payout whole and records its sources", () => {
    const evidence: KillXpEvidence = {
      npcId: npc.id,
      build: 70450,
      playerLevel: 20,
      mobLevel: 20,
      partySize: 5,
      partyLevels: [20, 20, 20, 20, 20],
      environment: "dungeon",
      unrestedXpPerPlayer: 24,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic exact observation",
    };
    const initial = createPartyXpFrontier(
      Array.from({ length: 5 }, () => ({ level: 20, currentXp: 0 })),
    );
    const result = bounded(
      advancePartyXpKills(initial, {
        npc: { ...npc, rank: 1, minimumLevel: 20, maximumLevel: 20 },
        kills: 3,
        environment: "dungeon",
        evidence: [evidence],
        build: 70450,
        dungeonMultiplier: 0.5,
        xpMultiplier: 2.375,
      }),
    );
    expect(
      partyXpFrontierBounds(result).map((bound) => [bound.minimumXp, bound.maximumXp]),
    ).toEqual(Array.from({ length: 5 }, () => [72, 72]));
    expect(result.combatBasis).toEqual(Array(5).fill("observed"));
    expect(result.observedSources).toEqual(Array.from({ length: 5 }, () => [evidence.source]));
  });

  it("holds unresolved data and unknown level-sensitive rewards without partial results", () => {
    const initial = createPartyXpFrontier(positions),
      saved = JSON.stringify(initial);
    expect(advancePartyXpKills(initial, { ...batch, npc: { ...npc, rank: null } })).toMatchObject({
      status: "unknown",
    });
    expect(awardPartyXp(initial, [new Map([[12, null]]), null, null, null, null])).toMatchObject({
      status: "unknown",
    });
    expect(awardPartyXp(initial, [new Map([[13, 100]]), null, null, null, null])).toMatchObject({
      status: "unknown",
    });
    expect(JSON.stringify(initial)).toBe(saved);
  });

  it("allows zero kills and explicitly excluded creatures without inventing payouts", () => {
    const initial = createPartyXpFrontier(positions);
    expect(bounded(advancePartyXpKills(initial, { ...batch, kills: 0 }))).toEqual(initial);
    expect(
      bounded(
        advancePartyXpKills(initial, {
          ...batch,
          npc: { ...npc, xpEligibility: "excluded", rank: null },
        }),
      ),
    ).toEqual(initial);
  });

  it("validates party sizes, bars, quantities, multipliers and budgets", () => {
    const initial = createPartyXpFrontier(positions);
    expect(() => createPartyXpFrontier([])).toThrow();
    expect(() => createPartyXpFrontier(Array(6).fill(positions[0]))).toThrow();
    expect(() => createPartyXpFrontier([{ level: 1, currentXp: 400 }])).toThrow();
    for (const kills of [-1, 0.5, 10001])
      expect(() => advancePartyXpKills(initial, { ...batch, kills })).toThrow();
    expect(() => advancePartyXpKills(initial, { ...batch, kills: 0, xpMultiplier: -1 })).toThrow();
    expect(() => advancePartyXpKills(initial, batch, { maximumStates: 0 })).toThrow();
    expect(() => advancePartyXpKills(initial, batch, { maximumTransitions: 1000001 })).toThrow();
    expect(() => awardPartyXp(initial, [])).toThrow();
    expect(() => awardPartyXp(initial, [new Map([[12, -1]]), null, null, null, null])).toThrow();
    expect(() => awardPartyXp(initial, [new Map([[61, 100]]), null, null, null, null])).toThrow();
  });
});
