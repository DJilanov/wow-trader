import { describe, expect, it } from "vitest";
import { campaignRewardQuestIds } from "./leveling-reward-inventory";

describe("active guide reward inventory", () => {
  it("includes executable and supported optional work without held or unsupported library warnings", () => {
    expect(
      campaignRewardQuestIds({
        actions: [{ questChanges: [{ questId: 1 }, { questId: 1 }] }],
        catchUpBatches: [
          { questId: 2, objectiveType: "shared-kills", conditional: false },
          { questId: 4, objectiveType: "shared-kills", conditional: true },
          { questId: 5, objectiveType: "collection", conditional: false },
        ],
        library: {
          choices: [
            { questId: 3, role: "held" },
            { questId: 6, role: "nearby-quest" },
            { questId: 1, role: "questing-backbone" },
          ],
        },
      }),
    ).toEqual([1, 2, 6]);
  });
  it("never conceals a real action's missing reward because its library metadata is held", () => {
    expect(
      campaignRewardQuestIds({
        actions: [{ questChanges: [{ questId: 3 }] }],
        library: { choices: [{ questId: 3, role: "held" }] },
      }),
    ).toEqual([3]);
  });
  it("loads other race/class starter rewards without duplicating shared quest IDs", () => {
    expect(
      campaignRewardQuestIds({
        actions: [{ questChanges: [{ questId: 1 }] }],
        starters: { entries: [{ action: { questChanges: [{ questId: 1 }, { questId: 7 }] } }] },
      }),
    ).toEqual([1, 7]);
  });
});
