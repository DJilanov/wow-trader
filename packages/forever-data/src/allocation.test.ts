import { describe, expect, it } from "vitest";

import {
  canRemoveTalentRank,
  createTalentKey,
  getAddBlockReason,
  getTalentRankText,
  isAllocationValid,
  summarizeAllocation,
} from "./allocation.js";
import type { TalentClass } from "./schemas.js";

const classData: TalentClass = {
  icon: "class_warrior",
  source: "fixture",
  trees: [
    {
      name: "Arms",
      bg: 1,
      icon: "ability_parry",
      removed: [],
      talents: [
        {
          name: "Foundation",
          max: 5,
          row: 1,
          col: 1,
          passive: true,
          icon: "ability_parry",
          desc: ["One", "Two", "Three", "Four", "Five"],
          complete: true,
          classic: { status: "same" },
        },
        {
          name: "Dependent",
          max: 1,
          row: 2,
          col: 1,
          passive: false,
          icon: "ability_charge",
          desc: ["Ready"],
          complete: true,
          req: "Foundation",
          classic: { status: "new" },
        },
      ],
    },
  ],
};

describe("talent allocation", () => {
  it("enforces points, tiers, and prerequisites", () => {
    const foundation = createTalentKey("Warrior", "Arms", "Foundation");
    const dependent = classData.trees[0]?.talents[1];
    expect(dependent).toBeDefined();
    if (!dependent) return;

    expect(getAddBlockReason(classData, "Warrior", 0, dependent, 60, {})).toContain(
      "Requires 5 points",
    );
    expect(
      getAddBlockReason(classData, "Warrior", 0, dependent, 60, { [foundation]: 5 }),
    ).toBeNull();
  });

  it("prevents removing a required rank", () => {
    const foundation = createTalentKey("Warrior", "Arms", "Foundation");
    const dependentKey = createTalentKey("Warrior", "Arms", "Dependent");
    const foundationTalent = classData.trees[0]?.talents[0];
    expect(foundationTalent).toBeDefined();
    if (!foundationTalent) return;

    const allocation = { [foundation]: 5, [dependentKey]: 1 };
    expect(isAllocationValid(classData, "Warrior", 60, allocation)).toBe(true);
    expect(canRemoveTalentRank(classData, "Warrior", 0, foundationTalent, 60, allocation)).toBe(
      false,
    );
  });

  it("summarizes the build without exceeding level points", () => {
    const foundation = createTalentKey("Warrior", "Arms", "Foundation");
    expect(summarizeAllocation(classData, "Warrior", 14, { [foundation]: 5 })).toEqual({
      available: 5,
      spent: 5,
      remaining: 0,
      requiredLevel: 14,
      treePoints: [5],
    });
  });

  it("does not let an estimate override confirmed demo text", () => {
    const talent = classData.trees[0]?.talents[0];
    expect(talent).toBeDefined();
    if (!talent) return;
    expect(getTalentRankText({ ...talent, confirmed: [1], est: { "1": "Estimate" } }, 1)).toEqual({
      text: "One",
      evidence: "demo_transcribed",
    });
    expect(getTalentRankText({ ...talent, est: { "2": "Estimate" } }, 2)).toEqual({
      text: "Estimate",
      evidence: "derived_estimate",
    });
  });
});
