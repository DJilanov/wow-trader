import { describe, expect, it } from "vitest";
import { campaignMoneyRequirement } from "./campaign-addon-money.js";
import type { CampaignAction } from "./campaign.js";

const action: CampaignAction = {
  id: "fee", legId: "return", title: "Paid hand-in", instructions: [], source: null,
  positions: [], kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
  questChanges: [{ questId: 2948, state: "rewarded", title: "Gnome Improvement", objectiveIndex: null }],
};

describe("native cash prerequisites", () => {
  it("leaves hand-ins without a cash requirement unchanged", () => {
    expect(campaignMoneyRequirement(action)).toBeNull();
  });
  it.each([[300, "0.03", "3 silver"], [3000, "0.3", "30 silver"], [10101, "1.0101", "1 gold 1 silver 1 copper"], [1, "0.0001", "1 copper"]] as const)(
    "formats %i copper exactly in the addon's gold units", (copper, gold, text) => {
      expect(campaignMoneyRequirement({ ...action, minimumMoneyCopper: copper })).toEqual({
        questId: 2948, gold, description: `Have at least ${text} available for this hand-in. Each player pays their own fee.`,
      });
    },
  );
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid fee %s", (minimumMoneyCopper) => {
    expect(() => campaignMoneyRequirement({ ...action, minimumMoneyCopper })).toThrow("Invalid hand-in money requirement");
  });
  it("rejects ambiguous and non-hand-in cash gates", () => {
    expect(() => campaignMoneyRequirement({ ...action, minimumMoneyCopper: 3000, questChanges: [] })).toThrow();
    expect(() => campaignMoneyRequirement({ ...action, minimumMoneyCopper: 3000, questChanges: [action.questChanges[0]!, action.questChanges[0]!] })).toThrow();
    expect(() => campaignMoneyRequirement({ ...action, minimumMoneyCopper: 3000, questChanges: [{ ...action.questChanges[0]!, state: "accepted" }] })).toThrow();
  });
});
