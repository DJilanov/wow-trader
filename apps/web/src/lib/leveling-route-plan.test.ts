import { describe, expect, it } from "vitest";
import {
  createCharacterProfile,
  emptyPremadeProgress,
  premadeProgressSchema,
  type CampaignPlan,
} from "@wow-trader/leveling";
import {
  campaignChapterAction,
  campaignChapterPath,
  campaignLeaderClass,
  levelingPlanDashboardPath,
  levelingRouteMode,
} from "./leveling-route-plan";

const plan: CampaignPlan = {
  release: "campaign-test-human-general",
  race: "human",
  leaderClass: null,
  targetBuild: 70205,
  legs: ["first", "second"].map((id) => ({
    id,
    title: id,
    from: 1,
    to: 2,
    kind: "dungeon",
    actionIds: [`${id}-brief`],
    questIds: [],
    unresolvedQuestIds: [],
    stopId: id === "first" ? "thanes" : "deadmines",
  })),
  actions: ["first", "second"].map((id) => ({
    id: `${id}-brief`,
    legId: id,
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  })),
};

describe("integrated quest route editions", () => {
  const solo = createCharacterProfile();
  const group = { ...solo, party: { ...solo.party, size: 5 } };
  it("shows the revised path on the exact Alliance URL and retains explicit solo and Horde editions", () => {
    expect(levelingRouteMode(undefined, "alliance")).toBe("premade");
    expect(levelingRouteMode("questing", "alliance")).toBe("questing");
    expect(levelingRouteMode("premade", "alliance")).toBe("premade");
    expect(levelingRouteMode("premade", "horde")).toBe("questing");
    expect(levelingRouteMode("bad", "alliance")).toBe("premade");
  });
  it("setup navigation selects the appropriate edition on the existing race URL", () => {
    expect(levelingPlanDashboardPath(solo)).toBe(
      "/forever/leveling/routes/alliance-human?plan=questing",
    );
    expect(levelingPlanDashboardPath({ ...group, classSlug: "warrior" })).toBe(
      "/forever/leveling/routes/alliance-human?plan=premade&class=warrior",
    );
    expect(levelingPlanDashboardPath(createCharacterProfile("horde"), "premade")).toContain(
      "?plan=questing",
    );
  });
  it("validates class selection and chapter/step ownership", () => {
    expect(campaignLeaderClass(solo, "warrior")).toBe("warrior");
    expect(campaignLeaderClass(solo, "druid")).toBeNull();
    expect(campaignLeaderClass(solo, ["warrior"])).toBeNull();
    expect(campaignChapterPath(plan, "second", "second-brief")).toBe(
      "/forever/leveling/routes/alliance-human/chapters/premade-second?plan=premade#campaign-second-brief",
    );
    expect(() => campaignChapterPath(plan, "../foreign")).toThrow("Unknown route chapter");
    expect(() => campaignChapterPath(plan, "second", "first-brief")).toThrow(
      "Step does not belong",
    );
  });
  it("opening another chapter never follows a saved step back to the beginning", () => {
    const progress = emptyPremadeProgress();
    expect(campaignChapterAction(plan, progress, "second")?.id).toBe("second-brief");
    expect(campaignChapterAction(plan, progress, "second", "first-brief")?.id).toBe("second-brief");
    expect(campaignChapterAction(plan, progress, "invalid")).toBeNull();
    const saved = {
      ...progress,
      campaigns: { [plan.release]: { selectedActionId: "second-brief", completion: {} } },
    };
    expect(campaignChapterAction(plan, saved, "first")?.id).toBe("first-brief");
    expect(campaignChapterAction(plan, saved, "second")?.id).toBe("second-brief");
  });
  it("keeps selected catch-up steps addressable after reload and rejects the wrong source region", () => {
    const legId = "redridge-kill-batch";
    const batchAction = { ...plan.actions[0]!, id: "quest-300001-0", legId: "unassigned" };
    const edition: CampaignPlan = {
      ...plan,
      legs: [
        {
          ...plan.legs[0]!,
          id: legId,
          kind: "xp-bridge",
          from: 20,
          to: 23,
          stopId: null,
          actionIds: [`${legId}-brief`],
        },
        plan.legs[1]!,
      ],
      actions: [{ ...plan.actions[0]!, id: `${legId}-brief`, legId }, plan.actions[1]!],
      catchUpBatches: [
        {
          id: "quest-300001",
          questId: 300001,
          title: "Patrol",
          zone: "Redridge Mountains",
          referenceLevel: 20,
          sourceIds: [128],
          objectiveType: "shared-kills",
          conditional: false,
          actions: [batchAction],
        },
      ],
    };
    const actionId = `${legId}-${batchAction.id}`;
    const saved = premadeProgressSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...emptyPremadeProgress(),
          selectedBatches: { [legId]: ["quest-300001"] },
          campaigns: { [edition.release]: { selectedActionId: actionId, completion: {} } },
        }),
      ),
    );
    expect(campaignChapterPath(edition, legId, actionId)).toContain(`#campaign-${actionId}`);
    expect(campaignChapterAction(edition, saved, legId)?.id).toBe(actionId);
    expect(() =>
      campaignChapterPath(
        {
          ...edition,
          catchUpBatches: edition.catchUpBatches!.map((batch) => ({
            ...batch,
            sourceIds: [999999],
          })),
        },
        legId,
        actionId,
      ),
    ).toThrow("Step does not belong");
  });
});
