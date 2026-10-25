import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  buildCampaignPlan,
  campaignActionReasons,
  campaignQuestTargets,
  campaignQuestAlreadyReported,
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
      "step\n.accept 783 >> Accept A Threat Within\nstep\n.turnin 783 >> Turn in A Threat Within\nstep\n.xp 6 >> Reach level 6",
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
  it("includes ordinary collection lifecycles by default and removes all three phases on explicit opt-out", () => {
    const route = plan();
    const initial = emptyPremadeProgress();
    const phases = (questId: number, progress = initial): readonly string[] =>
      activeCampaignActions(route, progress)
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === questId)
        .map((change) => change.state);
    expect(phases(2924)).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(phases(2928)).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(phases(2924, { ...initial, selectedExtras: { 2924: false } })).toEqual([]);
    expect(phases(2928, { ...initial, selectedExtras: { 2924: false } })).toHaveLength(3);
    expect(phases(2962)).toEqual([]);
    expect(phases(2962, { ...initial, selectedExtras: { 2962: true } })).toHaveLength(3);
  });
  it.each(["warrior", "hunter"] as const)(
    "merges both Ormer kill stages into the existing Wetlands visit for %s",
    (classSlug) => {
      const route = buildCampaignPlan(
        "human",
        "b".repeat(64),
        [
          ...[115, 116, 117, 125, 126].map((id) => source(id, "step\n>>Train and travel")),
          source(
            7,
            "step <<Hunter\n.accept 294 >> Accept Ormer's Revenge\nstep <<Hunter\n.complete 294,1 >> Kill Mottled Raptors\n.complete 294,2 >> Kill Mottled Screechers\nstep\n.turnin 294 >> Turn in Ormer's Revenge\n.accept 295 >> Accept Ormer's Revenge\nstep\n.complete 295,1 >> Kill Mottled Scytheclaws\n.complete 295,2 >> Kill Mottled Razormaws\nstep\n.turnin 295 >> Turn in Ormer's Revenge",
          ),
          source(
            11,
            "step <<!Hunter\n.accept 294 >> Accept Ormer's Revenge\nstep <<!Hunter\n.complete 294,1 >> Kill Mottled Raptors\n.complete 294,2 >> Kill Mottled Screechers\nstep <<!Hunter\n.turnin 294 >> Turn in Ormer's Revenge\n.accept 295 >> Accept Ormer's Revenge\nstep <<!Hunter\n.complete 295,1 >> Kill Mottled Scytheclaws\n.complete 295,2 >> Kill Mottled Razormaws\nstep <<!Hunter\n.turnin 295 >> Turn in Ormer's Revenge",
          ),
        ],
        classSlug,
        { includeLibrary: false },
      );
      const actions = route.actions.filter((action) => action.legId === "wetlands-early-kills");
      for (const questId of [294, 295])
        expect(
          actions
            .flatMap((action) => action.questChanges)
            .filter((change) => change.questId === questId)
            .map((change) => change.state),
        ).toEqual(["accepted", "objectives-complete", "objectives-complete", "rewarded"]);
      const stages = actions.flatMap((action) => action.questChanges);
      expect(
        stages.findIndex((change) => change.questId === 294 && change.state === "rewarded"),
      ).toBeLessThan(
        stages.findIndex((change) => change.questId === 295 && change.state === "accepted"),
      );
      expect(actions.every((action) => !action.leaderOnly)).toBe(true);
      const ids = route.legs.map((leg) => leg.id);
      expect(ids.indexOf("wetlands-early-kills")).toBeGreaterThan(ids.indexOf("duskwood-watch"));
      expect(ids.indexOf("wetlands-early-kills")).toBeLessThan(
        ids.indexOf("wetlands-prerequisites"),
      );
    },
  );
  it("starts at level 1, ends at 60, distinguishes sourced and planning dungeons and owns every action", () => {
    const route = plan();
    expect(route.legs[0]?.from).toBe(1);
    expect(route.legs.at(-1)?.to).toBe(60);
    expect(route.legs.filter((leg) => leg.kind === "dungeon" && !leg.bundleId)).toHaveLength(18);
    expect(route.legs.filter((leg) => leg.bundleId)).toHaveLength(3);
    expect(route.legs.some((leg) => leg.id === "duskwood-watch")).toBe(true);
    for (const action of route.actions)
      expect(route.legs.find((leg) => leg.id === action.legId)?.actionIds).toContain(action.id);
    expect(new Set(route.actions.map((action) => action.id)).size).toBe(route.actions.length);
    expect(route.actions.filter((action) => action.kind === "unverified")).toHaveLength(0);
    const starterGate = route.actions.find(
      (action) => action.id === "library-level-gate-115-source-step-0003-0",
    );
    expect(starterGate).toMatchObject({
      legId: "start-115",
      leaderOnly: true,
      kind: "xp-check",
      targetLevel: 6,
    });
    expect(route.actions.indexOf(starterGate!)).toBeLessThan(
      route.actions.findIndex((action) => action.legId === "start-116"),
    );
    for (const leg of route.legs.filter((leg) => leg.bundleId)) {
      const entries = route.actions.filter((action) => action.legId === leg.id);
      expect(
        entries.every(
          (action) => action.questChanges.length === 0 && action.positions.length === 0,
        ),
      ).toBe(true);
      expect(entries.some((action) => action.bundleId === leg.bundleId)).toBe(true);
    }
    expect(
      route.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 5848),
    ).toBe(false);
    const active = new Set<number>();
    for (const action of route.actions)
      for (const change of action.questChanges) {
        if (change.state === "accepted") active.add(change.questId);
        else {
          expect(active.has(change.questId)).toBe(true);
          if (change.state === "rewarded") active.delete(change.questId);
        }
      }
    expect(active).toEqual(new Set());
  });
  it("excludes conditional source phases whose pickup is not in the compiled route", () => {
    const route = buildCampaignPlan("human", "b".repeat(64), [
      source(
        115,
        "step <<Hunter\n.accept 100 >> Accept Conditional Work\nstep\n.complete 100,1\nstep\n.turnin 100 >> Turn in Conditional Work",
      ),
      source(116, "step\n.accept 52 >> Accept Protect the Frontier"),
      source(117, "step\n.accept 224 >> Accept In Defense of the King's Lands"),
      source(125, "step\n.accept 65 >> Accept The Defias Brotherhood"),
    ]);
    expect(
      route.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 100),
    ).toBe(false);
    expect(route.lifecycleExclusions).toEqual([
      {
        actionId: "start-115-115-source-step-0002",
        questId: 100,
        state: "objectives-complete",
        reason: "missing-prior-pickup",
      },
      {
        actionId: "start-115-115-source-step-0003",
        questId: 100,
        state: "rewarded",
        reason: "missing-prior-pickup",
      },
      {
        actionId: "start-116-116-source-step-0001",
        questId: 52,
        state: "accepted",
        reason: "incomplete-lifecycle",
      },
      {
        actionId: "start-117-117-source-step-0001",
        questId: 224,
        state: "accepted",
        reason: "incomplete-lifecycle",
      },
    ]);
  });
  it("places Scarlet's delivery after RFK and retains only complete BRD lifecycles", () => {
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
    expect(position(4322, "accepted")).toBe(-1);
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
    progress.members[0]!.questStates[52] = "accepted";
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
    progress.members[0]!.questStates[783] = "objectives-complete";
    progress = updateCampaignAction(route, progress, handIn.id, true);
    expect(progress.members[0]?.xpNeedsUpdate).toBe(true);
    progress = recordPremadeXp(progress, 0, 2, 50);
    progress = updateCampaignAction(route, progress, handIn.id, true);
    expect(progress.members[0]?.currentXp).toBe(50);
    expect(progress.members[0]?.xpNeedsUpdate).toBe(false);
  });
  it("guards actual entries and required unlocks without executable research-only stops", () => {
    const route = plan(),
      entry = route.actions.find((action) => action.id === "dungeon-thanes-entry")!;
    let progress = emptyPremadeProgress();
    expect(() => updateCampaignAction(route, progress, entry.id, true)).toThrow("confirm everyone");
    for (let i = 0; i < 5; i++) progress = recordPremadeXp(progress, i, 20, 0);
    expect(campaignActionReasons(entry, progress)[0]).toContain("preparation hand-ins");
    expect(route.actions.some((action) => action.kind === "unverified")).toBe(false);
  });
  it("includes all four Dalaran lifecycles and keeps navigation separate from completion", () => {
    const route = plan();
    const actions = route.actions.filter((action) => action.legId === "dungeon-dalaran");
    for (const questId of [92456, 92489, 92457, 92458]) {
      expect(
        actions
          .flatMap((action) => action.questChanges)
          .filter((change) => change.questId === questId)
          .map((change) => change.state),
      ).toEqual(["accepted", "objectives-complete", "rewarded"]);
    }
    const accept = actions.find((action) =>
      action.questChanges.some((change) => change.questId === 92457 && change.state === "accepted"),
    )!;
    const progress = recordPremadeXp(emptyPremadeProgress(), 0, 33, 0);
    const next = updateCampaignAction(route, progress, accept.id, false);
    expect(next.campaigns[route.release]!.selectedActionId).not.toBe(accept.id);
    expect(next.campaigns[route.release]!.completion).toEqual({});
    expect(next.members).toEqual(progress.members);
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
  it("does not offer an objective or hand-in when its optional pickup was never accepted", () => {
    const route = plan();
    const objective = route.actions.find((action) =>
      action.questChanges.some((change) => change.state === "objectives-complete"),
    )!;
    const reward = route.actions.find((action) =>
      action.questChanges.some(
        (change) =>
          change.state === "rewarded" &&
          objective.questChanges.some((entry) => entry.questId === change.questId),
      ),
    )!;
    expect(campaignQuestTargets(objective, emptyPremadeProgress())).toEqual([]);
    expect(campaignQuestTargets(reward, emptyPremadeProgress())).toEqual([]);
    expect(campaignQuestAlreadyReported(objective, emptyPremadeProgress())).toBe(false);
    expect(campaignQuestAlreadyReported(reward, emptyPremadeProgress())).toBe(false);
    const progress = emptyPremadeProgress();
    for (const member of progress.members)
      for (const change of objective.questChanges)
        member.questStates[String(change.questId)] = "objectives-complete";
    expect(campaignQuestAlreadyReported(objective, progress)).toBe(true);
    expect(campaignQuestAlreadyReported(reward, progress)).toBe(false);
    for (const member of progress.members)
      for (const change of reward.questChanges)
        member.questStates[String(change.questId)] = "rewarded";
    expect(campaignQuestAlreadyReported(reward, progress)).toBe(true);
    for (const change of reward.questChanges)
      delete progress.members[1]!.questStates[String(change.questId)];
    expect(campaignQuestAlreadyReported({ ...reward, leaderOnly: false }, progress)).toBe(false);
    expect(campaignQuestAlreadyReported({ ...reward, leaderOnly: true }, progress)).toBe(true);
  });
});
