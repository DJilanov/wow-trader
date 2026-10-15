import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  buildCampaignPlan,
  campaignActionReasons,
  updateCampaignAction,
  activeCampaignActions,
  skipCampaignXpBlock,
  currentCampaignAction,
  type CampaignSource,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { recordPremadeXp } from "./premade.js";

function source(id: number, body: string): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
  return { reference, guide: parseGuideChapter(body, reference.id, "a".repeat(64), 70205) };
}
function plan(): ReturnType<typeof buildCampaignPlan> {
  return buildCampaignPlan("human", "b".repeat(64), [
    source(
      115,
      "step\n.accept 783 >> Accept A Threat Within\nstep\n.turnin 783 >> Turn in A Threat Within",
    ),
    source(
      116,
      "step\n.accept 52 >> Accept Protect the Frontier\nstep\n.complete 52,1\n.mob Young Forest Bear\nstep\n.complete 52,2\n.mob Prowler\nstep\n.turnin 52 >> Turn in Protect the Frontier",
    ),
    source(117, "step\n.accept 224 >> Accept In Defense of the King's Lands"),
    source(125, "step\n.accept 65 >> Accept The Defias Brotherhood"),
    source(
      18,
      "step\n.accept 261 >> Accept Down the Scarlet Path\nstep\n.complete 261,1\nstep\n.turnin 261 >> Turn in Down the Scarlet Path\n.accept 1052 >> Accept Down the Scarlet Path",
    ),
    source(21, "step\n.turnin 1052 >> Turn in Down the Scarlet Path"),
    source(
      47,
      "step\n.accept 4241 >> Accept Marshal Windsor\nstep\n.turnin 4241 >> Turn in Marshal Windsor\n.accept 4242 >> Accept Abandoned Hope\nstep\n.turnin 4242 >> Turn in Abandoned Hope\nstep\n.accept 4264 >> Accept A Crumpled Up Note\nstep\n.turnin 4264 >> Turn in A Crumpled Up Note\n.accept 4282 >> Accept A Shred of Hope\nstep\n.complete 4282,1\n.complete 4282,2\nstep\n.turnin 4282 >> Turn in A Shred of Hope\n.accept 4322 >> Accept Jail Break!",
    ),
  ]);
}

describe("continuous 1–60 premade campaign", () => {
  it("starts at level 1, ends at 60, includes every dungeon and owns every action", () => {
    const route = plan();
    expect(route.legs[0]?.from).toBe(1);
    expect(route.legs.at(-1)?.to).toBe(60);
    expect(route.legs.filter((leg) => leg.kind === "dungeon")).toHaveLength(21);
    expect(route.legs.some((leg) => leg.id === "duskwood-watch")).toBe(true);
    for (const action of route.actions)
      expect(route.legs.find((leg) => leg.id === action.legId)?.actionIds).toContain(action.id);
    expect(new Set(route.actions.map((action) => action.id)).size).toBe(route.actions.length);
    expect(route.actions.filter((action) => action.kind === "unverified")).toHaveLength(3);
    expect(
      route.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 5848),
    ).toBe(false);
  });
  it("places Scarlet's delivery after RFK and retains the actual BRD return sequence", () => {
    const route = plan();
    const handIn = route.actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 1052 && change.state === "rewarded"),
    );
    expect(handIn).toBeGreaterThan(
      route.actions.findIndex((action) => action.id === "dungeon-razorfen-kraul-entry"),
    );
    const position = (id: number, state: "accepted" | "rewarded"): number =>
      route.actions.findIndex((action) =>
        action.questChanges.some((change) => change.questId === id && change.state === state),
      );
    expect(position(4242, "rewarded")).toBeLessThan(position(4264, "accepted"));
    expect(position(4264, "rewarded")).toBeLessThan(position(4282, "rewarded"));
    expect(position(4282, "rewarded")).toBeLessThanOrEqual(position(4322, "accepted"));
  });
  it("does not complete work on Next and records the exact next step on Done", () => {
    const route = plan(),
      progress = emptyPremadeProgress(),
      action = route.actions[0]!;
    const next = updateCampaignAction(route, progress, action.id, false);
    expect(next.campaigns[route.release]?.completion).toEqual({});
    expect(next.members).toEqual(progress.members);
    const done = updateCampaignAction(route, progress, action.id, true);
    expect(done.campaigns[route.release]?.completion[action.id]).toBe("done");
    expect(done.campaigns[route.release]?.selectedActionId).toBe(route.actions[1]?.id);
  });
  it("records only the leader's starting branch and never marks a multi-objective quest complete early", () => {
    const route = plan();
    let progress = emptyPremadeProgress();
    const objectives = route.actions.filter((action) =>
      action.questChanges.some(
        (change) => change.questId === 52 && change.state === "objectives-complete",
      ),
    );
    progress = updateCampaignAction(route, progress, objectives[0]!.id, true);
    expect(progress.members[0]?.questStates[52]).toBe("accepted");
    expect(progress.members[1]?.questStates[52]).toBeUndefined();
    progress = updateCampaignAction(route, progress, objectives[1]!.id, true);
    expect(progress.members[0]?.questStates[52]).toBe("objectives-complete");
  });
  it("invalidates actual XP after hand-ins but cannot count an already rewarded quest twice", () => {
    const route = plan(),
      handIn = route.actions.find((action) =>
        action.questChanges.some((change) => change.questId === 783 && change.state === "rewarded"),
      )!;
    let progress = recordPremadeXp(emptyPremadeProgress(), 0, 2, 10);
    progress = updateCampaignAction(route, progress, handIn.id, true);
    expect(progress.members[0]?.xpNeedsUpdate).toBe(true);
    progress = recordPremadeXp(progress, 0, 2, 50);
    progress = updateCampaignAction(route, progress, handIn.id, true);
    expect(progress.members[0]?.currentXp).toBe(50);
    expect(progress.members[0]?.xpNeedsUpdate).toBe(false);
  });
  it("guards actual entries and required unlocks, never inferred or missing quest XP", () => {
    const route = plan(),
      entry = route.actions.find((action) => action.id === "dungeon-thanes-entry")!;
    let progress = emptyPremadeProgress();
    expect(() => updateCampaignAction(route, progress, entry.id, true)).toThrow("fresh actual");
    for (let i = 0; i < 5; i++) progress = recordPremadeXp(progress, i, 20, 0);
    expect(campaignActionReasons(entry, progress)[0]).toContain("preparation hand-ins");
    const unverified = route.actions.find((action) => action.kind === "unverified")!;
    expect(() => updateCampaignAction(route, progress, unverified.id, true)).toThrow("no verified");
    expect(
      updateCampaignAction(route, progress, unverified.id, false).campaigns[route.release]
        ?.completion[unverified.id],
    ).toBeUndefined();
  });
  it("keeps optional raid goals off and finishes without looping back to level 1", () => {
    const route = plan();
    let progress = { ...emptyPremadeProgress(), raidGoals: false };
    expect(
      activeCampaignActions(route, progress).some((action) =>
        action.questChanges.some((change) => change.questId === 4241),
      ),
    ).toBe(false);
    for (let i = 0; i < 5; i++) progress = recordPremadeXp(progress, i, 60, 0);
    const last = route.actions.at(-1)!;
    progress = updateCampaignAction(route, progress, last.id, true);
    expect(progress.campaigns[route.release]?.selectedActionId).toBe(last.id);
  });
  it("keeps Temple objectives in the Temple, and orders required Wetlands parents before their children", () => {
    const route = plan();
    for (const id of [3446, 3447])
      expect(
        route.actions
          .filter((action) => action.legId === "searing-temple-prep")
          .flatMap((action) => action.questChanges)
          .some((change) => change.questId === id && change.state !== "accepted"),
      ).toBe(false);
    const position = (id: number, state: "accepted" | "rewarded"): number =>
      route.actions.findIndex(
        (action) =>
          action.legId === "wetlands-prerequisites" &&
          action.questChanges.some((change) => change.questId === id && change.state === state),
      );
    expect(position(463, "rewarded")).toBeLessThan(position(276, "accepted"));
    expect(position(276, "rewarded")).toBeLessThan(position(277, "accepted"));
    expect(position(277, "rewarded")).toBeLessThanOrEqual(position(275, "accepted"));
  });
  it("skips only XP work using the current entry policy without rewarding quests or skipping unlocks", () => {
    const route = plan();
    let progress = emptyPremadeProgress();
    expect(() => skipCampaignXpBlock(route, progress, "defias-unlock")).toThrow("preparation");
    for (let i = 0; i < 5; i++) progress = recordPremadeXp(progress, i, 18, 0);
    expect(() => skipCampaignXpBlock(route, progress, "northern-approach")).toThrow("level 19");
    progress = { ...progress, difficultyPolicy: "experienced-premade" };
    const skipped = skipCampaignXpBlock(route, progress, "northern-approach");
    expect(skipped.members).toEqual(progress.members);
    expect(skipped.campaigns[route.release]?.selectedActionId).toBe("dungeon-lordaeron-brief");
    expect(
      Object.values(skipped.campaigns[route.release]!.completion).every(
        (state) => state === "skipped",
      ),
    ).toBe(true);
  });
  it("does not reset to level 1 when the currently selected optional raid task becomes hidden", () => {
    const route = plan();
    const raid = route.actions.find((action) => action.raidOnly)!;
    const progress = {
      ...emptyPremadeProgress(),
      raidGoals: false,
      campaigns: { [route.release]: { selectedActionId: raid.id, completion: {} } },
    };
    expect(currentCampaignAction(route, progress).id).not.toBe(route.actions[0]!.id);
    expect(currentCampaignAction(route, progress).raidOnly).toBe(false);
  });
});
