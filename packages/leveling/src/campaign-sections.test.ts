import { describe, expect, it } from "vitest";
import {
  campaignSections,
  campaignSectionFor,
  campaignSectionXpGap,
  campaignSectionPreparationChecks,
} from "./campaign-sections.js";
import {
  campaignQuestTargets,
  nextCampaignAction,
  updateCampaignAction,
  campaignOptionalXpReady,
  skipCampaignXpBlock,
  type CampaignAction,
  type CampaignLeg,
  type CampaignPlan,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { recordPremadeXp } from "./premade.js";

function action(
  id: string,
  legId: string,
  questId: number | null = null,
  state: "accepted" | "rewarded" = "accepted",
): CampaignAction {
  return {
    id,
    legId,
    title: id,
    instructions: [],
    positions: [],
    source: null,
    kind: questId ? "quests" : "instructions",
    leaderOnly: false,
    questChanges: questId ? [{ questId, state, title: String(questId), objectiveIndex: null }] : [],
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
function plan(): CampaignPlan {
  const definitions: readonly [string, number, number, CampaignLeg["kind"]][] = [
    ["northshire", 1, 6, "starter"],
    ["elwynn", 6, 13, "starter"],
    ["westfall", 13, 15, "starter"],
    ["map", 13, 16, "preparation"],
    ["extra", 13, 16, "xp-bridge"],
    ["dungeon-thanes", 16, 18, "dungeon"],
  ];
  const actions = definitions.map(([id]) => action(`${id}-brief`, id));
  actions.splice(
    4,
    0,
    action("map-accept", "map", 96391),
    action("map-hand-in", "map", 96391, "rewarded"),
  );
  return {
    release: "campaign-test",
    race: "human",
    leaderClass: null,
    targetBuild: 70205,
    actions,
    legs: definitions.map(([id, from, to, kind]) => ({
      id,
      title: id,
      from,
      to,
      kind,
      stopId: kind === "dungeon" ? "thanes" : null,
      actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id),
      questIds: [],
      unresolvedQuestIds: [],
    })),
  };
}

describe("public campaign chapters and conditional progress", () => {
  it("makes locations the chapter identity and groups adjacent work in the same area without new level brackets", () => {
    const original = plan();
    const ids: Readonly<Record<string, string>> = {
      map: "ironforge-rendezvous",
      extra: "early-party-kills",
    };
    const route = {
      ...original,
      legs: original.legs.map((leg) => ({
        ...leg,
        id: ids[leg.id] ?? leg.id,
        title: leg.id === "westfall" ? "Westfall" : leg.title,
      })),
      actions: original.actions.map((action) => ({
        ...action,
        legId: ids[action.legId] ?? action.legId,
      })),
    };
    const section = campaignSectionFor(route, "ironforge-rendezvous")!;
    expect(section).toMatchObject({
      id: "prepare-thanes",
      title: "Westfall → Dun Morogh",
      kind: "zone",
      from: 13,
      to: 16,
    });
    expect(section.areas.map((area) => area.title)).toEqual(["Westfall", "Dun Morogh"]);
    expect(section.areas[1]?.legIds).toEqual(["ironforge-rendezvous", "early-party-kills"]);
    expect(section.areas.flatMap((area) => area.legIds)).toEqual(section.legIds);
    expect(section.actionIds).toEqual(
      original.actions
        .filter((action) => ["westfall", "map", "extra"].includes(action.legId))
        .map((action) => action.id),
    );
    expect(route.release).toBe(original.release);
  });
  it("shows preparation as actual prerequisite checks with individual reports, never assumed progress", () => {
    const route = plan(),
      section = campaignSectionFor(route, "map")!,
      progress = emptyPremadeProgress();
    progress.members[0]!.questStates["96391"] = "rewarded";
    progress.members[1]!.questStates["96391"] = "objectives-complete";
    const before = JSON.stringify(progress);
    expect(campaignSectionPreparationChecks(route, section, progress)).toEqual([
      {
        questId: 96391,
        title: "96391",
        stage: "rewarded",
        actionId: "map-hand-in",
        legId: "map",
        reportedPlayers: 1,
        requiredPlayers: 5,
      },
    ]);
    expect(JSON.stringify(progress)).toBe(before);
    expect(
      campaignSectionPreparationChecks(
        route,
        campaignSectionFor(route, "dungeon-thanes")!,
        progress,
      ),
    ).toEqual([]);
  });
  it("does not invent prerequisite tasks that are not in the selected section", () => {
    const original = plan();
    const route = {
      ...original,
      actions: original.actions.filter((action) => action.id !== "map-hand-in"),
    };
    expect(
      campaignSectionPreparationChecks(
        route,
        campaignSectionFor(route, "map")!,
        emptyPremadeProgress(),
      ),
    ).toEqual([]);
  });
  it("consolidates the overlapping personal/XP/preparation phases without duplicating step identity", () => {
    const route = plan(),
      sections = campaignSections(route);
    expect(sections.map((entry) => entry.id)).toEqual([
      "northshire",
      "elwynn",
      "prepare-thanes",
      "dungeon-thanes",
    ]);
    expect(sections.filter((entry) => entry.from === 13)).toHaveLength(1);
    expect(sections[2]?.legIds).toEqual(["westfall", "map", "extra"]);
    expect(sections.flatMap((entry) => entry.actionIds)).toEqual(
      route.actions.map((entry) => entry.id),
    );
    expect(campaignSectionFor(route, "map")?.id).toBe("prepare-thanes");
    expect(sections[3]?.to).toBe(16);
  });
  it("computes one actual per-player deficit, never sums five players or credits a bracket as rewards", () => {
    const section = campaignSectionFor(plan(), "map")!;
    expect(campaignSectionXpGap(section, emptyPremadeProgress())?.remainingXp).toBeNull();
    let progress = emptyPremadeProgress();
    for (let index = 0; index < 5; index++) progress = recordPremadeXp(progress, index, 16, 0);
    expect(campaignSectionXpGap(section, progress)?.remainingXp).toBe(0);
    progress = recordPremadeXp(progress, 2, 15, 100);
    const gap = campaignSectionXpGap(section, progress)!;
    expect(gap.remainingXp).toBe(gap.members[2]?.remainingXp);
    expect(gap.remainingXp).toBeGreaterThan(0);
    expect(
      campaignSectionXpGap(campaignSectionFor(plan(), "dungeon-thanes")!, progress),
    ).toBeNull();
  });
  it("does not reset accepted/completed stages or transfer the leader's completed quest to the party", () => {
    const route = plan(),
      accept = route.actions.find((entry) => entry.id === "map-accept")!;
    let progress = emptyPremadeProgress();
    for (let index = 0; index < 5; index++) progress = recordPremadeXp(progress, index, 16, 0);
    progress = {
      ...progress,
      members: progress.members.map((member, index) => ({
        ...member,
        questStates:
          index === 0 ? { 96391: "rewarded" } : index === 1 ? { 96391: "objectives-complete" } : {},
      })),
    };
    expect(campaignQuestTargets(accept, progress)).toEqual([2, 3, 4]);
    const updated = updateCampaignAction(route, progress, accept.id, true);
    expect(updated.members[0]?.questStates[96391]).toBe("rewarded");
    expect(updated.members[1]?.questStates[96391]).toBe("objectives-complete");
    expect(updated.members[2]?.questStates[96391]).toBe("accepted");
  });
  it("skips fulfilled quest work and unnecessary filler on Next without marking preparation done", () => {
    const route = plan();
    let progress = emptyPremadeProgress();
    for (let index = 0; index < 5; index++) progress = recordPremadeXp(progress, index, 16, 0);
    const extra = route.actions.find((entry) => entry.legId === "extra")!;
    expect(campaignOptionalXpReady(route, progress, extra)).toBe(true);
    const result = updateCampaignAction(route, progress, "map-hand-in", false);
    expect(result.campaigns[route.release]?.selectedActionId).toBe("dungeon-thanes-brief");
    expect(result.campaigns[route.release]?.completion).toEqual({});
    expect(result.members).toEqual(progress.members);
    progress = {
      ...progress,
      members: progress.members.map((member) => ({ ...member, xpNeedsUpdate: true })),
    };
    expect(campaignOptionalXpReady(route, progress, extra)).toBe(false);
    expect(nextCampaignAction(route, progress, "map-hand-in").id).toBe("extra-brief");
  });
  it("retains a mandatory dungeon pickup embedded in a mixed XP phase on automatic and explicit skips", () => {
    const base = plan();
    const pickup = action("extra-stockade-pickup", "extra", 377);
    const route = {
      ...base,
      actions: [...base.actions.slice(0, -1), pickup, base.actions.at(-1)!],
    };
    let progress = emptyPremadeProgress();
    for (let index = 0; index < 5; index++) progress = recordPremadeXp(progress, index, 26, 0);
    expect(campaignOptionalXpReady(route, progress, pickup)).toBe(false);
    expect(nextCampaignAction(route, progress, "map-hand-in").id).toBe(pickup.id);
    const skipped = skipCampaignXpBlock(route, progress, "extra");
    expect(skipped.campaigns[route.release]?.selectedActionId).toBe(pickup.id);
    expect(skipped.campaigns[route.release]?.completion[pickup.id]).toBeUndefined();
    expect(skipped.members).toEqual(progress.members);
  });
});
