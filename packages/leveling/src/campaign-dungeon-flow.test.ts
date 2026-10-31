import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { campaignHubOrder } from "./campaign-hub-order.js";
import { campaignActionReasons } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";

function phase(
  questId: number,
  state: CampaignAction["questChanges"][number]["state"],
): CampaignAction {
  return {
    id: `${questId}-${state}`,
    legId: "dungeon-blackfathom",
    title: "Quest",
    instructions: [],
    kind: "quests",
    questChanges: [
      {
        questId,
        state,
        title: "Quest",
        objectiveIndex: state === "objectives-complete" ? 1 : null,
      },
    ],
    positions: [],
    source: null,
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function route(
  actions: readonly CampaignAction[],
  stopId: CampaignPlan["legs"][number]["stopId"] = "blackfathom",
): CampaignPlan {
  return {
    release: "dungeon-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "dungeon-blackfathom",
        title: "Dungeon",
        from: 25,
        to: 27,
        kind: "dungeon",
        stopId,
        questIds: [
          ...new Set(
            actions.flatMap((entry) => entry.questChanges.map((change) => change.questId)),
          ),
        ],
        unresolvedQuestIds: [],
        actionIds: actions.map((entry) => entry.id),
      },
    ],
  };
}

describe("dungeon pickups, inside continuations and city returns", () => {
  it("permits Gershala's direct pickup without forcing the optional Stormwind breadcrumb", () => {
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 60,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignActionReasons(phase(1275, "accepted"), progress)).toEqual([]);
  });
  it("enforces the reviewed inside continuation gate when reporting completion, not just when sorting", () => {
    const pickup = phase(7046, "accepted");
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 60,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignActionReasons(pickup, progress)).not.toEqual([]);
    progress.members = progress.members.map((member) => ({
      ...member,
      questStates: { 7044: "rewarded" },
    }));
    expect(campaignActionReasons(pickup, progress)).toEqual([]);
  });
  it("finishes Thaelrid's continuation before leaving for city rewards, without losing or duplicating tasks", () => {
    const original = route([
      phase(1198, "accepted"),
      phase(1200, "accepted"),
      phase(971, "objectives-complete"),
      phase(1198, "objectives-complete"),
      phase(1275, "objectives-complete"),
      phase(1200, "objectives-complete"),
      phase(971, "rewarded"),
      phase(1198, "rewarded"),
      phase(1200, "rewarded"),
    ]);
    const before = structuredClone(original);
    const result = batchCampaignDungeonFlow(attachCampaignLocations(original, []));
    const ids = result.actions.map((entry) => entry.id);
    expect(ids.indexOf("1198-rewarded")).toBeLessThan(ids.indexOf("1200-accepted"));
    expect(ids.indexOf("1200-accepted")).toBeLessThan(ids.indexOf("1275-objectives-complete"));
    expect(ids.indexOf("1200-objectives-complete")).toBeLessThan(ids.indexOf("971-rewarded"));
    expect([...ids].sort()).toEqual(original.actions.map((entry) => entry.id).sort());
    expect(original).toEqual(before);
    expect(result.legs[0]!.actionIds).toEqual(ids);
  });

  it("returns Legends to Celebras before accepting and finishing the scepter ritual", () => {
    const original = route(
      [
        phase(7044, "accepted"),
        phase(7046, "accepted"),
        phase(7044, "objectives-complete"),
        phase(7046, "objectives-complete"),
        phase(7065, "objectives-complete"),
        phase(7065, "rewarded"),
        phase(7044, "rewarded"),
        phase(7046, "rewarded"),
      ],
      "maraudon",
    );
    const result = batchCampaignDungeonFlow(attachCampaignLocations(original, []));
    const ids = result.actions.map((entry) => entry.id);
    expect(ids.indexOf("7044-rewarded")).toBeLessThan(ids.indexOf("7046-accepted"));
    expect(ids.indexOf("7046-rewarded")).toBeLessThan(ids.indexOf("7065-objectives-complete"));
    expect(ids.indexOf("7046-rewarded")).toBeLessThan(ids.indexOf("7065-rewarded"));
    expect(
      result.actions.find((entry) => entry.id === "7044-rewarded")?.location?.insideDungeon,
    ).toBe("maraudon");
  });

  it("batches a pickup into the existing city visit after its prerequisite, retaining its ID", () => {
    const parent = { ...phase(3520, "rewarded"), legId: "prepare", location: { zone: "1446" } };
    const onward = { ...phase(2988, "accepted"), legId: "prepare", location: { zone: "1425" } };
    const pickup = { ...phase(3527, "accepted"), location: { zone: "1446" } };
    const original = route(
      [parent, onward, pickup, phase(3527, "objectives-complete")],
      "zul-farrak",
    );
    const prepared: CampaignPlan = {
      ...original,
      legs: [
        {
          ...original.legs[0]!,
          id: "prepare",
          from: 43,
          to: 44,
          kind: "preparation",
          stopId: null,
          actionIds: [parent.id, onward.id],
        },
        original.legs[0]!,
      ],
    };
    const result = batchCampaignDungeonFlow(prepared);
    expect(result.actions.find((entry) => entry.id === pickup.id)?.legId).toBe("prepare");
    expect(result.actions.map((entry) => entry.id)).toEqual([
      parent.id,
      pickup.id,
      onward.id,
      "3527-objectives-complete",
    ]);
  });
  it("starts the RFK escort after the remaining inside objectives", () => {
    const original = route(
      [
        phase(1101, "accepted"),
        phase(1144, "accepted"),
        phase(1101, "objectives-complete"),
        phase(1144, "objectives-complete"),
        phase(1144, "rewarded"),
      ],
      "razorfen-kraul",
    );
    const result = batchCampaignDungeonFlow(attachCampaignLocations(original, []));
    const ids = result.actions.map((action) => action.id);
    expect(ids.indexOf("1101-objectives-complete")).toBeLessThan(ids.indexOf("1144-accepted"));
  });

  it("includes the next destination when ordering returns, keeping Feralas before the eastern crossing", () => {
    expect(campaignHubOrder("1413", ["1445", "1444"], "1455")).toEqual(["1444", "1445"]);
    expect(campaignHubOrder("1440", ["1455", "1439", "1457"], "1453").at(-1)).toBe("1455");
  });
});
