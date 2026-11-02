import { describe, expect, it } from "vitest";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import { parseGuideChapter } from "./guide-archive.js";
import { evaluateCampaignSourceChecks } from "./campaign-source-condition-state.js";
import { refreshCampaignItemReadiness } from "./campaign-item-reports.js";
import type { CampaignItemRequirement } from "./campaign-items.js";

const requirements: readonly CampaignItemRequirement[] = [
  { questId: 86, objectiveIndex: 1, itemId: 769, quantity: 4 },
  { questId: 87, objectiveIndex: 1, itemId: 769, quantity: 4 },
];
const target = { questId: 86, itemId: 769, quantity: 4, objectiveBitmask: 1 };

describe("carried item minimums", () => {
  it("treats repeated collect targets as minimums, never additive loot", () => {
    const ledger = new CampaignItemLedger(indexCampaignItems(requirements));
    expect(ledger.collect(target, {})).toBe(true);
    ledger.collect(target, {});
    expect(ledger.snapshot()).toEqual({ "769": 4 });
    expect(ledger.readyObjectives(86)).toEqual([1]);
  });

  it.each(["rewarded", "objectives-complete"] as const)(
    "does not derive physical holdings from stock auto-completion for %s",
    (state) => {
      const ledger = new CampaignItemLedger(indexCampaignItems(requirements));
      expect(ledger.collect(target, { "86": state })).toBe(false);
      expect(ledger.snapshot()).toEqual({});
    },
  );

  it("honors zero-mask auto-completion on an accepted quest", () => {
    const ledger = new CampaignItemLedger(indexCampaignItems(requirements));
    expect(ledger.collect({ ...target, objectiveBitmask: 0 }, { "86": "accepted" })).toBe(false);
    expect(ledger.collect({ ...target, objectiveBitmask: 0 }, {})).toBe(true);
  });

  it("consumes a shared stack once and invalidates another quest's item readiness", () => {
    const index = indexCampaignItems(requirements);
    const ledger = new CampaignItemLedger(index);
    ledger.collect(target, {});
    const states = { "86": "accepted", "87": "accepted" } as Record<
      string,
      "accepted" | "objectives-complete" | "rewarded"
    >;
    const confirmations: Record<string, boolean> = {};
    const objectives = new Map([
      [86, new Set([1])],
      [87, new Set([1, 2])],
    ]);
    confirmations["campaign-objective-87-2"] = true;
    refreshCampaignItemReadiness(index, ledger, states, confirmations, objectives);
    expect(states).toEqual({ "86": "objectives-complete", "87": "objectives-complete" });
    states["86"] = "rewarded";
    const spent = ledger.consume(86);
    refreshCampaignItemReadiness(index, ledger, states, confirmations, objectives, spent);
    expect(states["87"]).toBe("accepted");
    expect(confirmations["campaign-objective-87-1"]).toBe(false);
    expect(confirmations["campaign-objective-87-2"]).toBe(true);
    expect(ledger.snapshot()).toEqual({});
  });

  it("requires the sum when multiple objectives consume the same item", () => {
    const ledger = new CampaignItemLedger(
      indexCampaignItems([
        ...requirements,
        { questId: 86, objectiveIndex: 2, itemId: 769, quantity: 2 },
      ]),
    );
    ledger.collect(target, {});
    expect(ledger.readyObjectives(86)).toEqual([]);
    ledger.collect({ ...target, quantity: 6 }, {});
    expect(ledger.readyObjectives(86)).toEqual([1, 2]);
    ledger.consume(86);
    expect(ledger.snapshot()).toEqual({});
  });

  it("does not invent a quantity and clears overlapping minimums after an unknown consumption", () => {
    const ledger = new CampaignItemLedger(
      indexCampaignItems([{ questId: 86, objectiveIndex: 1, itemId: 769, quantity: null }]),
    );
    ledger.collect(target, {});
    expect(ledger.readyObjectives(86)).toEqual([]);
    ledger.consume(86);
    expect(ledger.snapshot()).toEqual({});
  });

  it("does not turn a provided-item classification into proof of current holdings", () => {
    const ledger = new CampaignItemLedger(
      indexCampaignItems([{ ...requirements[0]!, sourceProvided: true }]),
      { "86": "accepted" },
    );
    expect(ledger.snapshot()).toEqual({});
  });

  it("seeds current whole-quest completion without summing duplicate stacks across quests", () => {
    const ledger = new CampaignItemLedger(indexCampaignItems(requirements), {
      "86": "objectives-complete",
      "87": "objectives-complete",
    });
    expect(ledger.snapshot()).toEqual({ "769": 4 });
  });
});

describe("source item predicates from minimum holdings", () => {
  it.each([
    ["4", "execute"],
    [">3", "execute"],
    [">=4", "execute"],
    ["5", "unknown"],
    [">4", "unknown"],
    ["=4", "unknown"],
    ["=3", "skip"],
    ["<4", "skip"],
    ["<=3", "skip"],
    ["<5", "unknown"],
    ["<=4", "unknown"],
    ["0", "execute"],
  ] as const)("evaluates %s without claiming an exact count", (operator, expected) => {
    const check = parseGuideChapter(
      `step\n.itemcount 769,${operator}`,
      "minimum-control",
      "a".repeat(64),
      70205,
    ).steps[0]!.directives[0]!;
    expect(
      evaluateCampaignSourceChecks([check], {
        questStates: {},
        itemLowerBounds: new Map([[769, 4]]),
      }),
    ).toBe(expected);
  });
});
