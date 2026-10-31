import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { attachCampaignFlightPaths } from "./campaign-travel.js";

function fixture(): { plan: CampaignPlan; sources: readonly CampaignSource[] } {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 125)!;
  const guide = parseGuideChapter(
    "step\n.goto 1436,56.6,52.6\n.fp Sentinel Hill >> Learn the Sentinel Hill flight path\nstep\n.complete 12,1 >> Defias Trapper slain (15)",
    reference.id,
    "a".repeat(64),
    70205,
  );
  const action: CampaignAction = {
    id: "kills",
    legId: "route",
    title: "Defias kills",
    instructions: [],
    questChanges: [
      {
        questId: 12,
        title: "The People's Militia",
        state: "objectives-complete",
        objectiveIndex: 1,
      },
    ],
    positions: [],
    source: { chapterId: guide.chapterId, version: guide.version, stepId: guide.steps[1]!.id },
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  return {
    sources: [{ reference, guide }],
    plan: {
      release: "fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [action],
      legs: [
        {
          id: "route",
          title: "Westfall",
          from: 10,
          to: 15,
          kind: "xp-bridge",
          stopId: null,
          actionIds: [action.id],
          questIds: [12],
          unresolvedQuestIds: [],
        },
      ],
    },
  };
}

describe("fresh-server flight-path investment", () => {
  it("does not add a far-away flight master merely because a coastal task shares its zone", () => {
    const { plan, sources } = fixture();
    const coastal = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        positions: [
          {
            sourceLine: 1,
            position: { zone: "1436", floor: null, space: "map-percent" as const, x: 10, y: 10 },
          },
        ],
      })),
    };
    expect(attachCampaignFlightPaths(coastal, sources).flightPaths).toEqual([]);
  });

  it("does not turn an XP-only source reminder into a real zone or flight-master visit", () => {
    const { plan, sources } = fixture();
    const reminders = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        kind: "xp-check" as const,
        questChanges: [],
      })),
    };
    expect(attachCampaignFlightPaths(reminders, sources).flightPaths).toEqual([]);
  });
  it("adds the source flight-master visit before the on-route quest without inventing XP or a remote unlock", () => {
    const { plan, sources } = fixture();
    const selected = attachCampaignFlightPaths(plan, sources);
    expect(selected.actions.map((action) => action.title)).toEqual([
      "Learn the Sentinel Hill flight path",
      "Defias kills",
    ]);
    expect(selected.actions[0]!.questChanges).toEqual([]);
    expect(selected.actions[0]!.source?.stepId).toBe(sources[0]!.guide.steps[0]!.id);
    expect(selected.actions[0]!.positions).not.toEqual([]);
    expect(selected.flightPaths).toHaveLength(1);
    expect(attachCampaignFlightPaths(selected, sources)).toEqual(selected);
  });
  it("does not pretend the party learned a flight path just because the leader did earlier", () => {
    const { plan, sources } = fixture();
    const personal = { ...plan.actions[0]!, id: "personal-kills", leaderOnly: true };
    const selected = attachCampaignFlightPaths(
      { ...plan, actions: [personal, ...plan.actions] },
      sources,
    );
    expect(selected.flightPaths?.map((node) => node.key)).toEqual([
      "leader:Sentinel Hill",
      "party:Sentinel Hill",
    ]);
    expect(selected.actions.filter((action) => action.id.startsWith("flight-"))).toHaveLength(2);
    expect(new Set(selected.actions.map((action) => action.id)).size).toBe(selected.actions.length);
  });
  it("does not add flight masters from zones the route does not visit", () => {
    const { plan, sources } = fixture();
    const unrelated = {
      ...sources[0]!,
      guide: { ...sources[0]!.guide, chapterId: "unvisited-zone" },
    };
    expect(attachCampaignFlightPaths(plan, [unrelated]).actions).toEqual(plan.actions);
  });
  it("does not treat a whole multi-zone source chapter as a visit to every flight master", () => {
    const { plan, sources } = fixture();
    const selected = attachCampaignFlightPaths(
      {
        ...plan,
        actions: plan.actions.map((action) => ({
          ...action,
          positions: [
            {
              sourceLine: 1,
              position: { zone: "1433", floor: 0, space: "map-percent" as const, x: 50, y: 50 },
            },
          ],
        })),
      },
      sources,
    );
    expect(selected.flightPaths).toEqual([]);
  });
  it("does not add a flight-path detour gated by a dungeon outside the selected circuit", () => {
    const { plan, sources } = fixture();
    const original = sources[0]!;
    const guide = parseGuideChapter(
      "step\n.dungeon WC\n.goto 1436,56.6,52.6\n.fp Ratchet >> Learn Ratchet\nstep\n.complete 12,1 >> Defias Trapper slain (15)",
      original.guide.chapterId,
      "a".repeat(64),
      70205,
    );
    expect(attachCampaignFlightPaths(plan, [{ ...original, guide }]).flightPaths).toEqual([]);
  });
  it("keeps ordinary party unlocks when the earlier visit belongs to an optional raid branch", () => {
    const { plan, sources } = fixture();
    const selected = attachCampaignFlightPaths(
      {
        ...plan,
        actions: [{ ...plan.actions[0]!, id: "raid-kills", raidOnly: true }, ...plan.actions],
      },
      sources,
    );
    expect(selected.flightPaths?.map((node) => node.key)).toEqual([
      "party-raid:Sentinel Hill",
      "party:Sentinel Hill",
    ]);
    expect(
      selected.actions
        .filter((action) => action.id.startsWith("flight-"))
        .map((action) => action.raidOnly),
    ).toEqual([true, false]);
    expect(attachCampaignFlightPaths(selected, sources)).toEqual(selected);
  });
});
