import { describe, expect, it } from "vitest";
import {
  dungeonKillXpReferenceSchema,
  OWNER_DUNGEON_KILL_XP_REFERENCE as reference,
} from "./combat-dungeon-reference.js";
import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import { estimateCreatureKills, foreverNormalKillXp } from "./combat-xp.js";
import { estimateBoundedPartyKills } from "./campaign-xp-bounds.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const npc: CombatNpc = {
  id: 1,
  name: "Synthetic dungeon elite",
  minimumLevel: 20,
  maximumLevel: 20,
  rank: 1,
  zoneIds: [],
  xpEligibility: "assumed",
};
const input = {
  npc,
  kills: 1,
  position: { level: 20, currentXp: 0 },
  partySize: 5,
  partyLevels: [20, 20, 20, 20, 20],
  environment: "dungeon" as const,
  dungeonKillXpReference: reference,
};

describe("owner-supplied five-player dungeon elite reference", () => {
  it("keeps the24–30per-player anchor whole without another division or bonus", () => {
    expect(estimateCreatureKills(input)).toMatchObject({
      xp: 24,
      maximumXp: 30,
      basis: "reference-estimate",
      exit: { level: 20, currentXp: 24 },
    });
    expect(estimateCreatureKills({ ...input, kills: 10 })).toMatchObject({
      xp: 240,
      maximumXp: 300,
      basis: "reference-estimate",
    });
  });

  it.each([10, 16, 30, 40, 50])("labels level%i as a solo-base extrapolation", (level) => {
    const result = estimateCreatureKills({
      ...input,
      npc: { ...npc, minimumLevel: level, maximumLevel: level },
      position: { level, currentXp: 0 },
      partyLevels: Array(5).fill(level),
    });
    expect(result).toMatchObject({
      xp: Math.floor((foreverNormalKillXp(level, level) * 24) / 145),
      maximumXp: Math.floor((foreverNormalKillXp(level, level) * 30) / 145),
      basis: "reference-estimate",
    });
  });

  it("adjusts each member by its own level and the joint party share once", () => {
    const levels = [20, 18, 19, 20, 21];
    for (const [playerIndex, level] of levels.entries())
      expect(
        estimateCreatureKills({
          ...input,
          position: { level, currentXp: 0 },
          partyLevels: levels,
          playerIndex,
        }),
      ).toMatchObject({
        xp: Math.floor((foreverNormalKillXp(level, 20) * 24 * 5 * level) / (145 * 98)),
        maximumXp: Math.floor((foreverNormalKillXp(level, 20) * 30 * 5 * level) / (145 * 98)),
        basis: "reference-estimate",
      });
  });

  it.each([1, 2, 3, 4])("does not extrapolate the anchor to a%i-player dungeon", (partySize) => {
    expect(
      estimateCreatureKills({ ...input, partySize, partyLevels: Array(partySize).fill(20) }),
    ).toMatchObject({ xp: null, maximumXp: null, basis: "unknown" });
  });

  it("requires known elite identity, levels and the actual party levels", () => {
    const { partyLevels: _partyLevels, ...missingParty } = input;
    for (const entry of [
      { ...input, npc: { ...npc, rank: 0 } },
      { ...input, npc: { ...npc, rank: null } },
      { ...input, npc: { ...npc, minimumLevel: null } },
      { ...input, npc: { ...npc, maximumLevel: null } },
      { ...input, npc: { ...npc, xpEligibility: "unknown" as const } },
      missingParty,
      { ...input, partyLevels: [20, 20, null, 20, 20] },
    ])
      expect(estimateCreatureKills(entry)).toMatchObject({
        xp: null,
        maximumXp: null,
        basis: "unknown",
      });
  });

  it("keeps the strict unknown result when no reference or tuning is selected", () => {
    const { dungeonKillXpReference: _reference, ...strict } = input;
    expect(estimateCreatureKills(strict)).toMatchObject({ xp: null, basis: "unknown" });
  });

  it("does not alter outdoor rewards or pay excluded, gray or capped kills", () => {
    expect(estimateCreatureKills({ ...input, environment: "outdoor" })).toMatchObject({
      xp: 58,
      maximumXp: 58,
    });
    for (const entry of [
      { ...input, kills: 0 },
      { ...input, npc: { ...npc, xpEligibility: "excluded" as const } },
      { ...input, npc: { ...npc, minimumLevel: 1, maximumLevel: 1 } },
      { ...input, position: { level: 60, currentXp: 0 }, partyLevels: Array(5).fill(60) },
    ])
      expect(estimateCreatureKills(entry)).toMatchObject({ xp: 0, maximumXp: 0 });
  });

  it("prefers exact observed final payouts without reference scaling or extra multipliers", () => {
    const evidence: KillXpEvidence = {
      npcId: 1,
      build: 70450,
      playerLevel: 20,
      mobLevel: 20,
      partySize: 5,
      partyLevels: input.partyLevels,
      environment: "dungeon",
      unrestedXpPerPlayer: 39,
      sampleCount: 3,
      source: "Synthetic observation priority test",
      contextVerified: true,
    };
    expect(
      estimateCreatureKills({ ...input, evidence: [evidence], build: 70450, xpMultiplier: 2 }),
    ).toMatchObject({ xp: 39, maximumXp: 39, basis: "observed" });
    expect(estimateCreatureKills({ ...input, evidence: [evidence], build: 70451 })).toMatchObject({
      xp: 24,
      maximumXp: 30,
      basis: "reference-estimate",
    });
  });

  it("prefers an explicit dungeon profile including an explicit zero multiplier", () => {
    expect(estimateCreatureKills({ ...input, dungeonMultiplier: 0.5 })).toMatchObject({
      xp: 36,
      maximumXp: 36,
    });
    expect(estimateCreatureKills({ ...input, dungeonMultiplier: 0 })).toMatchObject({
      xp: 0,
      maximumXp: 0,
    });
    expect(estimateCreatureKills({ ...input, xpMultiplier: 2 })).toMatchObject({
      xp: 48,
      maximumXp: 60,
    });
  });

  it("encloses independently enumerated payouts through a party level crossing", () => {
    const start = FOREVER_XP_CURVE[20]! - 25;
    const positions = Array.from({ length: 5 }, () => ({ level: 20, currentXp: start }));
    const result = estimateBoundedPartyKills({
      npc,
      kills: 2,
      positions: positions.map((position) => ({ minimum: position, maximum: position })),
      environment: "dungeon",
      dungeonKillXpReference: reference,
    });
    // Independent synchronized subdomain: every integer first/second payout, including
    // different solo bases after crossing21. The box also permits unequal-party paths.
    const exact: number[] = [];
    for (let first = 24; first <= 30; first++) {
      const level = start + first >= FOREVER_XP_CURVE[20]! ? 21 : 20;
      const low = Math.floor((foreverNormalKillXp(level, 20) * 24) / 145);
      const high = Math.floor((foreverNormalKillXp(level, 20) * 30) / 145);
      for (let second = low; second <= high; second++) exact.push(first + second);
    }
    for (const member of result) {
      expect(member.basis).toBe("reference-estimate");
      expect(member.xp).not.toBeNull();
      expect(member.maximumExit).not.toBeNull();
      expect(member.xp!).toBeLessThanOrEqual(Math.min(...exact));
      expect(member.maximumXp!).toBeGreaterThanOrEqual(Math.max(...exact));
      expect(member.exit.level).toBe(21);
    }
  });

  it("validates range, party size and provenance separately from observations", () => {
    for (const value of [
      { ...reference, partySize: 4 },
      { ...reference, minimumXpPerPlayer: 31 },
      { ...reference, maximumXpPerPlayer: 0 },
      { ...reference, source: "" },
      { ...reference, basis: "observed" },
      { ...reference, referenceLevel: 60 },
    ])
      expect(dungeonKillXpReferenceSchema.safeParse(value).success).toBe(false);
  });
});
