import { describe, expect, it } from "vitest";
import fixture from "./fixtures/quest-client-rewards-70205-70450.json" with { type: "json" };
import { calculateClientQuestXp } from "./quest-client-reward.js";

describe("client-table reference arithmetic", () => {
  it("reproduces all eighteen captured turn-in comparisons without calling them controlled payouts", () => {
    const clients: Readonly<
      Record<
        string,
        {
          readonly level: number;
          readonly rewards: { readonly xpDifficulty: number; readonly xpMultiplier: number };
        }
      >
    > = fixture.snapshots[0]!.document.quests;
    const rows = new Map(
      fixture.tableSnapshots[0]!.document.questXpRows.map((row) => [row.id, row.Difficulty]),
    );
    expect(fixture.observations).toHaveLength(18);
    for (const observation of fixture.observations) {
      const client = clients[String(observation.questId)]!;
      expect(
        calculateClientQuestXp(
          {
            questLevel: client.level,
            baseXp: rows.get(client.level)![client.rewards.xpDifficulty]!,
            xpMultiplier: client.rewards.xpMultiplier,
          },
          observation.level,
        ),
      ).toBe(observation.observedXp);
    }
  });

  it.each([
    [26, 4750],
    [31, 4750],
    [32, 3800],
    [33, 2850],
    [36, 480],
    [59, 480],
    [60, 0],
  ])("reduces and rounds Techbot's explicit table reward at player level %s", (level, expected) => {
    expect(
      calculateClientQuestXp({ questLevel: 26, baseXp: 2650, xpMultiplier: 1.8 }, level!),
    ).toBe(expected);
  });

  it.each([0, 61, 25.5, NaN, Infinity])("rejects invalid player level %s", (level) => {
    expect(() =>
      calculateClientQuestXp({ questLevel: 26, baseXp: 2650, xpMultiplier: 1.8 }, level),
    ).toThrow();
  });
});
