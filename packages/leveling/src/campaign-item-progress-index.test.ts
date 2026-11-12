import { describe, expect, it } from "vitest";
import { indexCampaignItems, CampaignItemLedger } from "./campaign-item-ledger.js";
import { campaignItemProgressEvent } from "./campaign-item-progress.js";
import type { CampaignAction } from "./campaign.js";
import type { CampaignItemRequirement } from "./campaign-items.js";
import type { CampaignItemXpEvent } from "./campaign-xp-event.js";
import type { PremadeMember } from "./premade-model.js";

const action: CampaignAction = { id: "inventory-event", legId: "inventory", title: "Inventory transition", instructions: [], positions: [], source: null, kind: "quests", questChanges: [], leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null };
const position = { level: 33, currentXp: 19877 };

function makeEvent(
  requirements: readonly CampaignItemRequirement[],
  states: PremadeMember["questStates"],
  confirmations: Readonly<Record<string, boolean>>,
  minimums: Readonly<Record<string, number>> = {},
): CampaignItemXpEvent {
  const before = JSON.stringify({ requirements, states, confirmations, minimums });
  const index = indexCampaignItems(requirements);
  const event = campaignItemProgressEvent(action, position, index, new CampaignItemLedger(index, states, minimums), states, confirmations);
  expect(JSON.stringify({ requirements, states, confirmations, minimums })).toBe(before);
  return event;
}

describe("inventory confirmation index equivalence", () => {
  it("preserves the complete zero-XP event and filters only unrelated progress", () => {
    const event = makeEvent([{ questId: 1, objectiveIndex: 1, itemId: 1001, quantity: 2 }], { "1": "accepted", "2": "rewarded" }, { "campaign-objective-1-1": false, "campaign-objective-2-1": true, "campaign-item-stock-1": true, "unrelated-kill": true }, { "1001": 1, "2000": 3 });
    expect(event.itemState).toEqual({ minimums: { "1001": 1, "2000": 3 }, questStates: { "1": "accepted" }, confirmations: { "campaign-objective-1-1": false, "campaign-item-stock-1": true } });
    expect(event.questXp).toBe(0);
    expect(event.combatXp).toBe(0);
    expect(event.before).toBe(position);
    expect(event.after).toBe(position);
  });

  it("keeps objective identities exact without accepting alternate numeric spellings", () => {
    const event = makeEvent([{ questId: 1, objectiveIndex: 1, itemId: 1001, quantity: 1 }], {}, { "campaign-objective-1-1": true, "campaign-objective-01-1": true, "campaign-objective-1-01": true, "campaign-objective-1-1-extra": true, "campaign-objective--1-1": true });
    expect(event.itemState.confirmations).toEqual({ "campaign-objective-1-1": true });
  });

  it("preserves duplicate counter rows, conflicting quantities and unknown quantities", () => {
    const requirements: CampaignItemRequirement[] = [
      { questId: 1, objectiveIndex: 1, itemId: 1001, quantity: 2 },
      { questId: 1, objectiveIndex: 1, itemId: 1002, quantity: 1 },
      { questId: 1, objectiveIndex: 2, itemId: 1003, quantity: null },
      { questId: 2, objectiveIndex: 1, itemId: 1004, quantity: 3, conflict: true },
    ];
    const index = indexCampaignItems(requirements);
    expect(index.byQuest.get(1)).toHaveLength(3);
    expect([...index.objectiveConfirmationKeys]).toEqual(["campaign-objective-1-1", "campaign-objective-1-2", "campaign-objective-2-1"]);
    makeEvent(requirements, { "1": "accepted", "2": "accepted" }, { "campaign-objective-1-1": false, "campaign-objective-1-2": false, "campaign-objective-2-1": false });
  });

  it("does not reuse another forecast's index", () => {
    const first = indexCampaignItems([{ questId: 1, objectiveIndex: 1, itemId: 1001, quantity: 1 }]);
    const second = indexCampaignItems([{ questId: 2, objectiveIndex: 1, itemId: 1002, quantity: 1 }]);
    expect(first.objectiveConfirmationKeys.has("campaign-objective-2-1")).toBe(false);
    expect(second.objectiveConfirmationKeys.has("campaign-objective-1-1")).toBe(false);
    makeEvent([], { "1": "accepted" }, { "campaign-objective-1-1": true, "campaign-item-custom": false });
  });

});
