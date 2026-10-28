import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, type QuestRewardFact } from "@wow-trader/leveling";
import { LevelingDungeonQuestPackage } from "./leveling-dungeon-quest-package";

function reward(questId: number, base: number, multiplier: number): QuestRewardFact {
  return {
    questId,
    questLevel: 38,
    minimumLevel: 30,
    fullXp: 5000,
    referenceBaseXp: base,
    pageMultiplier: multiplier,
    xpByLevel: [],
    status: "available",
    evidenceKind: "published-forever",
    sourceUrl: `https://www.wowhead.com/forever/quest=${questId}`,
    capturedAt: "2026-10-19T00:00:00.000Z",
  };
}

describe("dungeon quest reward breakdown", () => {
  it("shows a later dungeon's captured coefficient alongside its unchanged page reward", () => {
    const markup = renderToStaticMarkup(
      <LevelingDungeonQuestPackage
        stopId="uldaman"
        progress={emptyPremadeProgress()}
        rewardFacts={[reward(704, 2850, 1.75)]}
        disabled={false}
        onChange={(): void => {}}
      />,
    );
    expect(markup).toContain("2,850 table XP × 1.75");
    expect(markup).toContain("5,000 XP");
    expect(markup).not.toContain("2,850 table XP × 2.375");
  });
});
