import { describe, expect, it } from "vitest";
import {
  campaignItemStateSignature,
  mergeCampaignItemRequirements,
  parseCampaignItemTarget,
} from "./campaign-items.js";
import { parseGuideChapter } from "./guide-archive.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import { campaignItemReport, campaignItemsForMember } from "./campaign-item-reports.js";

function parse(args: string): ReturnType<typeof parseCampaignItemTarget> {
  const row = parseGuideChapter(`step\n.collect ${args}`, "item-control", "a".repeat(64), 70205)
    .steps[0]!.directives[0]!;
  return parseCampaignItemTarget(row);
}

describe("plain source collection targets", () => {
  it("retains the fourth argument as a bitmask, not a provider objective index", () => {
    expect(parse("3173,3,418,1")).toEqual({
      itemId: 3173,
      quantity: 3,
      questId: 418,
      objectiveBitmask: 1,
    });
    expect(parse("3173,3,418,3,0")?.objectiveBitmask).toBe(3);
    expect(parse("3173,3,418,0")?.objectiveBitmask).toBe(0);
  });

  it("accepts the checkbox-only flag without changing the physical quantity or objective mask", () => {
    expect(parse("2589,10,1644,1,1")).toEqual({
      itemId: 2589,
      quantity: 10,
      questId: 1644,
      objectiveBitmask: 1,
    });
  });

  it.each([
    "769,10,86,1,0x20,cooking",
    "769,4,86,1,2",
    "769,4,86,1,-5",
    "769,4",
    "769,4,0,1",
    "769,4,86,256",
    "769,0,86,1",
    "769/770,4,86,1",
  ])("holds unsupported target %s", (args) => expect(parse(args)).toBeNull());

  it("merges supported quantities while retaining real conflicts", () => {
    const row = { questId: 86, objectiveIndex: 1, itemId: 769, quantity: null };
    const merged = mergeCampaignItemRequirements([[row], [{ ...row, quantity: 4 }]]);
    expect(merged[0]!.quantity).toBe(4);
    const conflict = mergeCampaignItemRequirements([merged, [{ ...row, quantity: 3 }]]);
    expect(conflict[0]).toMatchObject({ quantity: null, conflict: true });
    expect(mergeCampaignItemRequirements([conflict, merged])[0]).toMatchObject({
      quantity: null,
      conflict: true,
    });
  });
});

describe("saved item holdings", () => {
  it("persists minimums and invalidates them permanently on a conflicting report", () => {
    const progress = emptyPremadeProgress();
    const ledger = new CampaignItemLedger(indexCampaignItems([]));
    ledger.collect({ questId: 86, itemId: 769, quantity: 4, objectiveBitmask: 1 }, {});
    progress.members[0]!.itemHoldings = campaignItemReport(ledger, progress.members[0]!, 70205);
    expect(premadeProgressSchema.parse(progress).members[0]!.itemHoldings?.minimums).toEqual({
      "769": 4,
    });
    progress.members[0]!.questStates["86"] = "rewarded";
    const corrected = premadeProgressSchema.parse(progress);
    expect(corrected.members[0]!.itemHoldings).toBeUndefined();
    delete corrected.members[0]!.questStates["86"];
    expect(premadeProgressSchema.parse(corrected).members[0]!.itemHoldings).toBeUndefined();
  });

  it("keeps pure XP edits and rejects incompatible build or character ownership", () => {
    const progress = emptyPremadeProgress();
    const index = indexCampaignItems([]),
      ledger = new CampaignItemLedger(index);
    ledger.collect({ questId: 86, itemId: 769, quantity: 4, objectiveBitmask: 1 }, {});
    const member = progress.members[0]!;
    member.itemHoldings = campaignItemReport(ledger, member, 70205);
    member.level = 10;
    member.currentXp = 0;
    expect(campaignItemsForMember(index, member, 70205).snapshot()).toEqual({ "769": 4 });
    expect(campaignItemsForMember(index, member, 70450).snapshot()).toEqual({});
    member.classSlug = "priest";
    expect(premadeProgressSchema.parse(progress).members[0]!.itemHoldings).toBeUndefined();
  });

  it("uses deterministic report signatures including item confirmations", () => {
    expect(campaignItemStateSignature({ "2": "accepted", "1": "rewarded" }, {})).toBe(
      campaignItemStateSignature({ "1": "rewarded", "2": "accepted" }, {}),
    );
    expect(campaignItemStateSignature({}, { "campaign-item-1": true })).not.toBe(
      campaignItemStateSignature({}, {}),
    );
  });
});
