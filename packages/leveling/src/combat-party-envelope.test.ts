import { describe, expect, it } from "vitest";
import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import {
  advancePartyXpKills,
  awardPartyXp,
  createPartyXpFrontier,
  type PartyXpFrontier,
} from "./combat-party-frontier.js";
import {
  advancePartyXpEnvelopeKills,
  awardPartyXpEnvelope,
  enclosePartyXpFrontier,
  type PartyXpEnvelope,
  type PartyXpEnvelopeResult,
} from "./combat-party-envelope.js";

const npc: CombatNpc = {
  id: 1197,
  name: "Stonesplinter Shaman",
  minimumLevel: 15,
  maximumLevel: 16,
  rank: 0,
  zoneIds: [38],
  xpEligibility: "assumed",
};
const positions = [10056, 4781, 4465, 7973, 8320].map((currentXp) => ({ level: 12, currentXp }));
const batch = { npc, kills: 10, environment: "outdoor" as const, build: 70205 };

function bounded(result: PartyXpEnvelopeResult): PartyXpEnvelope {
  if (result.status === "unknown") throw new Error(result.reason);
  return result.envelope;
}

function contains(envelope: PartyXpEnvelope, exact: PartyXpFrontier): void {
  for (const state of exact.states)
    for (const [player, bar] of state.positions.entries()) {
      const bounds = envelope.members[player]!;
      expect(
        bar.level > bounds.minimumExit.level ||
          (bar.level === bounds.minimumExit.level && bar.currentXp >= bounds.minimumExit.currentXp),
      ).toBe(true);
      expect(
        bar.level < bounds.maximumExit.level ||
          (bar.level === bounds.maximumExit.level && bar.currentXp <= bounds.maximumExit.currentXp),
      ).toBe(true);
      expect(state.minimumEarnedXp[player]!).toBeGreaterThanOrEqual(bounds.minimumXp);
      expect(state.maximumEarnedXp[player]!).toBeLessThanOrEqual(bounds.maximumXp);
    }
}

describe("sound party XP enclosures", () => {
  it("contains every exact reachable party throughout the real level-boundary case", () => {
    let frontier = createPartyXpFrontier(positions);
    let envelope = enclosePartyXpFrontier(frontier);
    for (let kill = 0; kill < 10; kill++) {
      const result = advancePartyXpKills(frontier, { ...batch, kills: 1 });
      if (result.status === "unknown") throw new Error(result.reason);
      frontier = result.frontier;
      envelope = bounded(advancePartyXpEnvelopeKills(envelope, { ...batch, kills: 1 }));
      contains(envelope, frontier);
    }
    expect(envelope.domain).toBe("conservative-box");
    expect(envelope.members.map(({ minimumXp, maximumXp }) => [minimumXp, maximumXp])).toEqual([
      [248, 258],
      [232, 242],
      [232, 242],
      [232, 242],
      [232, 242],
    ]);
    expect(envelope.combatBasis).toEqual(Array(5).fill("reference-estimate"));
  });

  it.each([1, 2, 3, 4, 5])(
    "encloses a %i-player party through multiple NPCs and level-sensitive awards",
    (size) => {
      const bars = [389, 399, 390, 0, 50]
        .slice(0, size)
        .map((currentXp) => ({ level: 1, currentXp }));
      let frontier = createPartyXpFrontier(bars);
      let envelope = enclosePartyXpFrontier(frontier);
      const steps = [
        { ...batch, kills: 3, npc: { ...npc, minimumLevel: 1, maximumLevel: 3 } },
        { ...batch, kills: 3, npc: { ...npc, id: 2, minimumLevel: 1, maximumLevel: 3 } },
      ];
      for (const step of steps) {
        const result = advancePartyXpKills(frontier, step);
        if (result.status === "unknown") throw new Error(result.reason);
        frontier = result.frontier;
        envelope = bounded(advancePartyXpEnvelopeKills(envelope, step));
        contains(envelope, frontier);
        const rewards = bars.map(
          () =>
            new Map([
              [1, 100],
              [2, 10],
              [3, 0],
            ]),
        );
        const awarded = awardPartyXp(frontier, rewards);
        if (awarded.status === "unknown") throw new Error(awarded.reason);
        frontier = awarded.frontier;
        envelope = bounded(awardPartyXpEnvelope(envelope, rewards));
        contains(envelope, frontier);
      }
    },
  );

  it("keeps an observed 24–30 payout per player whole without assuming joint correlation", () => {
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
    const initial = enclosePartyXpFrontier(
      createPartyXpFrontier(Array.from({ length: 5 }, () => ({ level: 20, currentXp: 0 }))),
    );
    const saved = JSON.stringify(initial);
    const result = bounded(
      advancePartyXpEnvelopeKills(initial, {
        npc: { ...npc, rank: 1, minimumLevel: 20, maximumLevel: 20 },
        kills: 3,
        environment: "dungeon",
        evidence,
        build: 70450,
        xpMultiplier: 2.375,
        dungeonMultiplier: 0.5,
      }),
    );
    expect(result.members.map(({ minimumXp, maximumXp }) => [minimumXp, maximumXp])).toEqual(
      Array.from({ length: 5 }, () => [72, 90]),
    );
    expect(result.combatBasis).toEqual(Array(5).fill("observed"));
    expect(JSON.stringify(initial)).toBe(saved);
  });

  it("holds an unobserved dungeon context after a possible level-up", () => {
    const evidence: KillXpEvidence = {
      npcId: npc.id,
      build: 70450,
      playerLevel: 1,
      mobLevel: 1,
      partySize: 5,
      partyLevels: [1, 1, 1, 1, 1],
      environment: "dungeon",
      unrestedXpPerPlayer: 10,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic equal-level sample",
    };
    const initial = enclosePartyXpFrontier(
      createPartyXpFrontier([390, 0, 0, 0, 0].map((currentXp) => ({ level: 1, currentXp }))),
    );
    expect(
      advancePartyXpEnvelopeKills(initial, {
        npc: { ...npc, minimumLevel: 1, maximumLevel: 1 },
        kills: 2,
        environment: "dungeon",
        evidence: [evidence],
        build: 70450,
      }),
    ).toMatchObject({ status: "unknown", reason: expect.stringContaining("dungeon kill tuning") });
  });

  it("fails atomically when enumeration exceeds its budget or data is unresolved", () => {
    const initial = enclosePartyXpFrontier(createPartyXpFrontier(positions));
    const saved = JSON.stringify(initial);
    for (const result of [
      advancePartyXpEnvelopeKills(initial, batch, 1),
      advancePartyXpEnvelopeKills(initial, { ...batch, npc: { ...npc, rank: null } }),
      awardPartyXpEnvelope(initial, [new Map([[12, null]]), null, null, null, null]),
    ]) {
      expect(result.status).toBe("unknown");
      expect(result).not.toHaveProperty("envelope");
    }
    expect(JSON.stringify(initial)).toBe(saved);
  });

  it("clamps XP bars at 60 while preserving earned award bounds", () => {
    const initial = enclosePartyXpFrontier(createPartyXpFrontier([{ level: 60, currentXp: 0 }]));
    const awarded = bounded(awardPartyXpEnvelope(initial, [new Map([[60, 5]])]));
    expect(awarded.members[0]).toEqual({
      minimumXp: 5,
      maximumXp: 5,
      minimumExit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    });
    expect(bounded(advancePartyXpEnvelopeKills(awarded, batch))).toEqual(awarded);
  });

  it("checks intermediate enclosed levels instead of treating endpoints as the only possibilities", () => {
    const base = enclosePartyXpFrontier(createPartyXpFrontier([{ level: 5, currentXp: 0 }]));
    const interval = {
      ...base,
      members: [{ ...base.members[0]!, maximumXp: 6400, maximumExit: { level: 7, currentXp: 0 } }],
    };
    const result = bounded(
      awardPartyXpEnvelope(interval, [
        new Map([
          [5, 100],
          [6, 5000],
          [7, 0],
        ]),
      ]),
    );
    expect(result.members[0]).toEqual({
      minimumXp: 0,
      maximumXp: 11400,
      minimumExit: { level: 5, currentXp: 100 },
      maximumExit: { level: 8, currentXp: 499 },
    });
    expect(
      awardPartyXpEnvelope(interval, [
        new Map([
          [5, 100],
          [7, 0],
        ]),
      ]),
    ).toMatchObject({ status: "unknown" });
  });

  it("retains member order, zero-kill behavior and exact excluded-XP behavior", () => {
    const first = enclosePartyXpFrontier(createPartyXpFrontier(positions));
    const reversed = enclosePartyXpFrontier(createPartyXpFrontier([...positions].reverse()));
    expect(bounded(advancePartyXpEnvelopeKills(reversed, batch)).members).toEqual(
      [...bounded(advancePartyXpEnvelopeKills(first, batch)).members].reverse(),
    );
    expect(bounded(advancePartyXpEnvelopeKills(first, { ...batch, kills: 0 }))).toEqual(first);
    expect(
      bounded(
        advancePartyXpEnvelopeKills(first, {
          ...batch,
          npc: { ...npc, xpEligibility: "excluded" },
        }),
      ),
    ).toEqual(first);
  });

  it("validates quantities, multipliers, limits, rewards and envelope ranges", () => {
    const initial = enclosePartyXpFrontier(createPartyXpFrontier(positions));
    expect(() => advancePartyXpEnvelopeKills(initial, { ...batch, kills: -1 })).toThrow();
    expect(() =>
      advancePartyXpEnvelopeKills(initial, { ...batch, kills: 0, xpMultiplier: -1 }),
    ).toThrow();
    expect(() => advancePartyXpEnvelopeKills(initial, batch, 0)).toThrow();
    expect(() => advancePartyXpEnvelopeKills(initial, batch, 1000001)).toThrow();
    expect(() => awardPartyXpEnvelope(initial, [])).toThrow();
    expect(() =>
      awardPartyXpEnvelope(initial, [new Map([[12, -1]]), null, null, null, null]),
    ).toThrow();
    expect(() =>
      awardPartyXpEnvelope(
        {
          ...initial,
          members: initial.members.map((member) => ({ ...member, minimumXp: 2, maximumXp: 1 })),
        },
        [null, null, null, null, null],
      ),
    ).toThrow();
  });
});
