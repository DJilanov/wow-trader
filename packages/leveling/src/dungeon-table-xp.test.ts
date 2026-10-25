import { describe, expect, it } from "vitest";
import { estimateDungeonTableXp, isUnplayedDungeonQuest } from "./dungeon-xp.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { getPremadeStop, selectedPremadeQuests, setPremadeQuestPackage } from "./premade.js";

const fact = (
  questId: number,
  base: number,
  level: number,
  multiplier: number,
): QuestRewardFact => ({
  questId,
  fullXp: Math.round((base * multiplier) / 50) * 50,
  referenceBaseXp: base,
  pageMultiplier: multiplier,
  questLevel: level,
  minimumLevel: 1,
  xpByLevel: [],
  sourceUrl: `https://www.wowhead.com/forever/quest=${questId}`,
  capturedAt: "2026-10-25T00:00:00.000Z",
  status: "available",
  evidenceKind: "published-forever",
});
describe("Forever dungeon table estimates", () => {
  it("turns the Crest's 2600 table XP into 6200 without multiplying the scaled reward again", () => {
    expect(estimateDungeonTableXp(2600, 22, 22)).toBe(6200);
    expect(resolveQuestReward(95189, 22, [fact(95189, 2600, 22, 2.375)])).toMatchObject({
      xp: 6200,
      basis: "wowhead-reference",
    });
  });
  it("retains earlier page-specific coefficients and overlevel context", () => {
    const techbot = {
      ...fact(2922, 2650, 26, 1.8),
      fullXp: 4750,
      xpByLevel: [{ level: 33, xp: 2850 }],
    };
    expect(isUnplayedDungeonQuest(2922)).toBe(false);
    expect(resolveQuestReward(2922, 33, [techbot])).toMatchObject({
      xp: 2850,
      basis: "wowhead-reference",
    });
    expect(estimateDungeonTableXp(2650, 26, 33, 1.8)).toBe(2850);
    expect(estimateDungeonTableXp(2600, 22, 60)).toBe(0);
    expect(estimateDungeonTableXp(-1, 22, 22)).toBeNull();
  });
  it("uses base table × coefficient beyond Gnomeregan rather than claiming untouched 1x values are tested", () => {
    expect(isUnplayedDungeonQuest(1050)).toBe(true);
    expect(resolveQuestReward(1050, 38, [fact(1050, 3550, 38, 2.5)])).toMatchObject({
      xp: 8450,
      basis: "base-estimate",
    });
    expect(resolveQuestReward(7041, 47, [fact(7041, 5250, 47, 1)])).toMatchObject({
      xp: 12450,
      basis: "base-estimate",
    });
    expect(
      resolveQuestReward(7041, 47, [
        { ...fact(7041, 5250, 47, 1), fullXp: 13000, evidenceKind: "observed-forever" },
      ]),
    ).toMatchObject({ xp: 13000, basis: "reported-forever" });
  });
  it("does not boost outdoor rewards, change the source facts or bypass minimum-level gates", () => {
    const original = fact(9, 1050, 15, 1);
    const before = JSON.stringify(original);
    expect(resolveQuestReward(9, 15, [original]).xp).toBe(1050);
    expect(JSON.stringify(original)).toBe(before);
    expect(
      resolveQuestReward(7041, 40, [{ ...fact(7041, 5250, 47, 1), minimumLevel: 41 }]).xp,
    ).toBeNull();
  });
  it("uses the supplemental raw baseline for Power Stones at an overleveled hand-in", () => {
    const powerStones: QuestRewardFact = {
      questId: 2418,
      fullXp: 3500,
      questLevel: 36,
      minimumLevel: 30,
      xpByLevel: [],
      status: "available",
      evidenceKind: "historical-reference",
      sourceUrl: "addon-database: QuestieDB/support/Forever/QuestXP/xpDB-classic.lua",
      capturedAt: "2026-10-17T09:09:38.634Z",
    };
    const before = JSON.stringify(powerStones);
    expect(resolveQuestReward(2418, 43, [powerStones])).toMatchObject({
      xp: 5000,
      basis: "base-estimate",
      minimumLevel: 30,
    });
    expect(resolveQuestReward(2418, 36, [powerStones]).xp).toBe(8300);
    expect(resolveQuestReward(2418, 46, [powerStones]).xp).toBe(830);
    expect(resolveQuestReward(2418, 60, [powerStones]).xp).toBe(0);
    expect(resolveQuestReward(2418, 29, [powerStones]).xp).toBeNull();
    expect(resolveQuestReward(2418, 43, [{ ...powerStones, status: "conflict" }]).xp).toBeNull();
    expect(resolveQuestReward(2418, 43, [{ ...powerStones, fullXp: 8300 }]).xp).toBeNull();
    expect(
      resolveQuestReward(2418, 43, [
        {
          ...powerStones,
          evidenceKind: "observed-forever",
          xpByLevel: [{ level: 43, xp: 5100 }],
        },
      ]),
    ).toMatchObject({ xp: 5100, basis: "reported-forever" });
    expect(JSON.stringify(powerStones)).toBe(before);
  });
});
describe("ordinary dungeon quests are included", () => {
  it("includes Gnomeregan's ordinary quests and preserves explicit opt-outs and player history", () => {
    const stop = getPremadeStop("gnomeregan")!;
    const progress = emptyPremadeProgress();
    expect(selectedPremadeQuests(stop, progress).map((choice) => choice.questId)).toEqual([
      2922, 2930, 2929, 2926, 2928, 2924, 2904, 2948,
    ]);
    const excluded = { ...progress, selectedExtras: { 2924: false } };
    expect(selectedPremadeQuests(stop, excluded).map((choice) => choice.questId)).not.toContain(
      2924,
    );
    const full = setPremadeQuestPackage(stop, excluded, true);
    expect(selectedPremadeQuests(stop, full)).toHaveLength(9);
    expect(full.members).toEqual(progress.members);
    expect(excluded.selectedExtras).toEqual({ 2924: false });
    expect(selectedPremadeQuests(stop, setPremadeQuestPackage(stop, full, false))).toHaveLength(3);
  });
});
