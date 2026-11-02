import { describe, expect, it } from "vitest";
import reference from "./combat-calculator-reference.json" with { type: "json" };
import { estimateCreatureKills, foreverNormalKillXp } from "./combat-xp.js";
import type { CombatNpc } from "./combat-model.js";

describe("published Forever solo kill reference", () => {
  it("preserves float32 rounding and ties to even instead of applying floor or Math.round", () => {
    expect(foreverNormalKillXp(10, 11)).toBe(100);
    expect(foreverNormalKillXp(10, 12)).toBe(104);
    expect(foreverNormalKillXp(8, 10)).toBe(94);
    expect(foreverNormalKillXp(13, 14)).toBe(115);
  });

  it("excludes gray kills and the cap and rejects invalid levels", () => {
    expect(foreverNormalKillXp(20, 13)).toBe(0);
    expect(foreverNormalKillXp(60, 60)).toBe(0);
    for (const [player, mob] of [
      [0, 1],
      [61, 60],
      [1.5, 2],
      [10, 0],
      [10, 101],
      [10, 1.5],
    ])
      expect(() => foreverNormalKillXp(player!, mob!)).toThrow(/Invalid combat level/);
  });

  it.each([
    [2, 26],
    [3, 17],
    [4, 13],
    [5, 10],
  ])(
    "shares the solo base once in a conservative %i-player reference",
    (partySize: number, expected: number) => {
      const npc: CombatNpc = {
        id: 1,
        name: "Published level-14 reference",
        minimumLevel: 14,
        maximumLevel: 14,
        rank: 0,
        zoneIds: [],
        xpEligibility: "assumed",
      };
      expect(
        estimateCreatureKills({
          npc,
          kills: 1,
          position: { level: 20, currentXp: 0 },
          partySize,
          partyLevels: Array.from({ length: partySize }, () => 20),
          environment: "outdoor",
        }).xp,
      ).toBe(expected);
    },
  );

  it.each(reference.cases)(
    "matches the captured normal and elite tables at player level $playerLevel",
    ({ playerLevel, rows }) => {
      for (const row of rows) {
        const npc: CombatNpc = {
          id: 1,
          name: "Published generic solo reference",
          minimumLevel: row.mobLevel,
          maximumLevel: row.mobLevel,
          rank: 0,
          zoneIds: [],
          xpEligibility: "assumed",
        };
        const input = {
          npc,
          kills: 1,
          position: { level: playerLevel, currentXp: 0 },
          partySize: 1,
          environment: "outdoor" as const,
        };
        expect(estimateCreatureKills(input), `normal ${playerLevel}:${row.mobLevel}`).toMatchObject(
          {
            xp: row.normalXp,
            maximumXp: row.normalXp,
            basis: "reference-estimate",
          },
        );
        expect(
          estimateCreatureKills({ ...input, npc: { ...npc, rank: 1 } }),
          `elite ${playerLevel}:${row.mobLevel}`,
        ).toMatchObject({ xp: row.eliteXp, maximumXp: row.eliteXp, basis: "reference-estimate" });
      }
    },
  );
});
