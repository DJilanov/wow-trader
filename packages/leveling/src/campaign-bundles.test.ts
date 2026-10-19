import { describe, expect, it } from "vitest";
import { forecastCampaignXp } from "./campaign-xp.js";
import {
  campaignActionReasons,
  updateCampaignAction,
  type CampaignAction,
  type CampaignPlan,
} from "./campaign.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { recordPremadeXp } from "./premade.js";
import { getDungeonBundle, updateDungeonBundleSlot } from "./dungeon-bundles.js";

function fixture(repeat = false): CampaignPlan {
  const shared = {
    questChanges: [],
    positions: [],
    source: null,
    leaderOnly: false,
    targetLevel: null,
    raidOnly: false,
  } as const;
  const actions: CampaignAction[] = [
    {
      ...shared,
      id: "dungeon-drowned-city-entry",
      legId: "dungeon-drowned-city",
      title: "Planning entry",
      instructions: [],
      kind: "checkpoint",
      targetStopId: "drowned-city",
    },
    {
      ...shared,
      id: "dungeon-drowned-city-rewards",
      legId: "dungeon-drowned-city",
      title: "Guaranteed bundle",
      instructions: [],
      kind: "instructions",
      targetStopId: "drowned-city",
      bundleId: "drowned-city",
    },
    {
      ...shared,
      id: "continuation",
      legId: "after",
      title: "Outdoor continuation",
      instructions: [],
      kind: "instructions",
      targetStopId: null,
    },
  ];
  if (repeat) actions.splice(2, 0, { ...actions[1]!, id: "second-visit" });
  return {
    release: "guaranteed-bundle-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "dungeon-drowned-city",
        title: "Drowned City",
        from: 37,
        to: 38,
        kind: "dungeon",
        stopId: "drowned-city",
        bundleId: "drowned-city",
      },
      {
        id: "after",
        title: "Continue outdoors",
        from: 37,
        to: 38,
        kind: "xp-bridge",
        stopId: null,
      },
    ].map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [],
      unresolvedQuestIds: [],
    })) as CampaignPlan["legs"],
  };
}

function progress(level = 37): PremadeProgress {
  let result = emptyPremadeProgress();
  for (let index = 0; index < 5; index++) result = recordPremadeXp(result, index, level, 0);
  return result;
}

describe("guaranteed bundles in the continuous campaign ledger", () => {
  it("excludes a skipped dungeon's rewards and entry gate, and can restore it without losing history", () => {
    const bundle = getDungeonBundle("drowned-city", "alliance")!;
    const current = {
      ...progress(36),
      guaranteedBundles: { "drowned-city:alliance": { ...bundle, included: false } },
    };
    current.members[0]!.questStates["92456"] = "rewarded";
    const forecast = forecastCampaignXp(fixture(), current);
    expect(forecast.some((section) => section.sectionId === "dungeon-drowned-city")).toBe(false);
    expect(
      forecast.every((section) =>
        section.members.every(
          (member) => member.bundleRewards.length === 0 && member.blockedReason === null,
        ),
      ),
    ).toBe(true);
    expect(
      getDungeonBundle("drowned-city", "alliance", current.guaranteedBundles)!.slots.every(
        (slot) => slot.selected,
      ),
    ).toBe(true);
    const restored = { ...current, guaranteedBundles: { "drowned-city:alliance": bundle } };
    expect(forecastCampaignXp(fixture(), restored)[0]!.members[0]!.blockedReason).toContain(
      "entry requires level 37",
    );
    expect(restored.members[0]!.questStates["92456"]).toBe("rewarded");
  });
  it("carries all four estimated rewards forward per player without fake IDs or saved XP changes", () => {
    const current = progress();
    const before = JSON.stringify(current);
    const forecast = forecastCampaignXp(fixture(), current);
    for (const member of forecast[0]!.members) {
      expect(member.estimatedQuestXp).toBe(40400);
      expect(member.referenceQuestXp).toBe(0);
      expect(member.bundleRewards).toHaveLength(4);
      expect(member.bundleRewards.every((row) => row.questId === null)).toBe(true);
      expect(member.rewards).toEqual([]);
      expect(member.endpoint).not.toBeNull();
      expect(member.status).toBe("incomplete");
      expect(member.blockedReason).toBeNull();
      expect(member.evidence.reward).toBe("estimated");
      expect(member.evidence.route).toBe("unverified");
      expect(member.checkpoints[0]!.planningOnly).toBe(true);
    }
    expect(forecast[1]!.members[0]!.start).toEqual(forecast[0]!.members[0]!.endpoint);
    expect(JSON.stringify(current)).toBe(before);
  });

  it("does not grant the same guaranteed slots a second time on a repeated visit", () => {
    const member = forecastCampaignXp(fixture(true), progress())[0]!.members[0]!;
    expect(member.estimatedQuestXp).toBe(40400);
    expect(
      member.bundleRewards.slice(4).every((row) => row.state === "rewarded" && row.xp === 0),
    ).toBe(true);
  });

  it("respects slot deselection and already paid real quest replacements", () => {
    const bundle = updateDungeonBundleSlot(
      updateDungeonBundleSlot(getDungeonBundle("drowned-city", "alliance")!, 1, { questId: 92456 }),
      2,
      { selected: false },
    );
    const current = { ...progress(), guaranteedBundles: { "drowned-city:alliance": bundle } };
    current.members[0]!.questStates["92456"] = "rewarded";
    const first = forecastCampaignXp(fixture(), current)[0]!.members[0]!;
    expect(first.estimatedQuestXp).toBe(20200);
    expect(first.bundleRewards.map((row) => row.state)).toEqual([
      "rewarded",
      "skipped",
      "selected",
      "selected",
    ]);
  });

  it("does not use future bundle rewards to fund an earlier departure", () => {
    const first = forecastCampaignXp(fixture(), progress(36))[0]!.members[0]!;
    expect(first.status).toBe("blocked");
    expect(first.blockedAtActionId).toBe("dungeon-drowned-city-entry");
    expect(first.estimatedQuestXp).toBe(0);
    expect(first.bundleRewards).toEqual([]);
  });

  it("keeps live completion blocked while allowing non-mutating navigation past a planning stop", () => {
    const plan = fixture();
    const current = progress();
    for (const action of plan.actions.filter((entry) => entry.legId === "dungeon-drowned-city")) {
      expect(campaignActionReasons(action, current)[0]).toContain("pending");
      expect(() => updateCampaignAction(plan, current, action.id, true)).toThrow("pending");
      const next = updateCampaignAction(plan, current, action.id, false);
      expect(next.members).toEqual(current.members);
      expect(next.campaigns[plan.release]!.completion).toEqual({});
    }
  });
});
