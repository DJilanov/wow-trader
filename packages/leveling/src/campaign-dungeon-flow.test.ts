import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { campaignHubOrder } from "./campaign-hub-order.js";
import { campaignActionReasons } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";

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

  it("returns selected couriers before their destination pickups and the instanced clear", () => {
    const ids = [2925, 2931, 2924, 2930, 2929];
    const input = route(ids.flatMap((id) => (["accepted", "objectives-complete", "rewarded"] as const).map((state) => ({
      ...phase(id, state), ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
    }))), "gnomeregan");
    const result = batchCampaignDungeonFlow(attachCampaignLocations(input, []));
    const order = result.actions.map((action) => action.id);
    expect(order).not.toContain("2925-objectives-complete");
    expect(order).not.toContain("2931-objectives-complete");
    for (const [parent, child] of [[2925, 2924], [2931, 2930]]) {
      expect(order.indexOf(`${parent}-rewarded`)).toBeLessThan(order.indexOf(`${child}-accepted`));
      expect(order.indexOf(`${child}-accepted`)).toBeLessThan(order.indexOf(`${child}-objectives-complete`));
    }
    expect(order.indexOf("2931-rewarded")).toBeLessThan(order.indexOf("2929-objectives-complete"));
    expect(batchCampaignDungeonFlow(result)).toEqual(result);
  });

  it("finishes Young Crocolisk Skins before accepting and collecting Highland Hides", () => {
    const input = route([484,98815,95646].flatMap((id) => (["accepted", "objectives-complete", "rewarded"] as const).map((state) => phase(id,state))), "excavation");
    const result = batchCampaignDungeonFlow(attachCampaignLocations(input, []));
    const order = result.actions.map((action) => action.id);
    expect(order.indexOf("484-rewarded")).toBeLessThan(order.indexOf("98815-accepted"));
    expect(order.indexOf("98815-accepted")).toBeLessThan(order.indexOf("98815-objectives-complete"));
    expect(order.indexOf("484-rewarded")).toBeLessThan(order.indexOf("95646-objectives-complete"));
  });

  it("finishes nearby Wetlands returns before outside follow-ups pull the party toward cities", () => {
    const ids = [95647,95809,95772,95795,95810,98824,95646];
    const input = route(ids.flatMap((id) => (["accepted","objectives-complete","rewarded"] as const).map((state) => ({
      ...phase(id,state), ...(state === "objectives-complete" ? {wholeQuestObjectives: true as const} : {}),
    }))), "excavation");
    const result = batchCampaignDungeonFlow(attachCampaignLocations(input, []));
    const order = result.actions.map((action) => action.id);
    for (const local of ["95646-rewarded","95809-rewarded","95810-rewarded","98824-accepted"])
      for (const remote of ["98824-objectives-complete","98824-rewarded","95795-rewarded"])
        expect(order.indexOf(local)).toBeLessThan(order.indexOf(remote));
    expect(result.actions.find((action) => action.id === "95647-objectives-complete")!.location).toEqual({
      zone:"1437",insideDungeon:"excavation",
    });
    expect(result.actions.find((action) => action.id === "98824-objectives-complete")!.location).toEqual({zone:"1455"});
    expect(batchCampaignDungeonFlow(result)).toEqual(result);
  });

  it("does not label an unrelated dungeon's objective as an Excavation prerequisite", () => {
    const plan = route([phase(971,"objectives-complete")],"excavation");
    expect(attachCampaignLocations(plan,[]).actions[0]!.location?.insideDungeon).toBeUndefined();
  });
  it("follows the Thanes rooms before collecting the final tablet and returning to the entrance", () => {
    const ids = [96403, 96394, 96393, 96395, 98423];
    const original = route(
      [
        ...ids.map((id) => phase(id, "accepted")),
        ...ids.map((id) => phase(id, "objectives-complete")),
        ...ids.map((id) => phase(id, "rewarded")),
      ],
      "thanes",
    );
    const before = structuredClone(original);
    const result = batchCampaignDungeonFlow(attachCampaignLocations(original, []));
    const order = result.actions.map((action) => action.id);
    const inside = [
      "96395-accepted",
      "96394-objectives-complete",
      "96395-objectives-complete",
      "96393-objectives-complete",
      "96403-objectives-complete",
      "98423-accepted",
      "96395-rewarded",
    ];
    for (let index = 1; index < inside.length; index++)
      expect(order.indexOf(inside[index - 1]!)).toBeLessThan(order.indexOf(inside[index]!));
    for (const id of [
      "98423-objectives-complete",
      "96403-rewarded",
      "96394-rewarded",
      "96393-rewarded",
      "98423-rewarded",
    ])
      expect(order.indexOf("96395-rewarded")).toBeLessThan(order.indexOf(id));
    expect(result.actions.find((action) => action.id === "96403-rewarded")?.location).toEqual({
      zone: "1455",
    });
    expect(
      result.actions.find((action) => action.id === "98423-objectives-complete")?.location,
    ).toEqual({ zone: "1455" });
    expect([...order].sort()).toEqual(original.actions.map((action) => action.id).sort());
    expect(result.legs[0]!.actionIds).toEqual(order);
    expect(original).toEqual(before);
    expect(batchCampaignDungeonFlow(result)).toEqual(result);
  });

  it("does not invent missing optional Thanes phases or turn physical order into prerequisites", () => {
    const original = route(
      [
        phase(98423, "accepted"),
        phase(98423, "objectives-complete"),
        phase(98423, "rewarded"),
        phase(96395, "accepted"),
        phase(96395, "objectives-complete"),
        phase(96395, "rewarded"),
      ],
      "thanes",
    );
    const result = batchCampaignDungeonFlow(attachCampaignLocations(original, []));
    expect(result.actions.map((action) => action.id)).toEqual([
      "96395-accepted",
      "96395-objectives-complete",
      "98423-accepted",
      "96395-rewarded",
      "98423-objectives-complete",
      "98423-rewarded",
    ]);
    expect(result.actions.every((action) => action.requiredQuestIds === undefined)).toBe(true);
    expect(campaignDungeonQuest(98423)?.gate).toEqual({ kind: "all", gates: [] });
  });

  it("keeps the Deadmines letter and Wailing Caverns shard lifecycles on their own quest IDs", () => {
    const letter = campaignDungeonQuest(373),
      shard = campaignDungeonQuest(6981);
    expect(letter?.title).toBe("The Unsent Letter");
    expect(letter?.pickup).toContain("Edwin VanCleef");
    expect(letter?.objectiveStage).toBe("before");
    expect(shard?.title).toBe("The Glowing Shard");
    expect(shard?.pickup).toContain("Mutanus");
    expect(shard?.turnin).not.toContain("Baros Alexston");
    expect(shard?.objective).not.toContain("Unsent Letter");
  });
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
