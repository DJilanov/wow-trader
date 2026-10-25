import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignPlan, currentCampaignAction, type CampaignSource } from "./campaign.js";
import { forecastCampaignGuide } from "./campaign-guide.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, premadeEntryLevel } from "./premade.js";

const orderedIds = [
  "thanes",
  "lordaeron",
  "deadmines",
  "blackfathom",
  "stockade",
  "excavation",
  "dalaran",
  "razorfen-kraul",
  "gnomeregan",
  "drowned-city",
  "scarlet-monastery",
  "razorfen-downs",
  "kroldok",
  "uldaman",
  "zul-farrak",
  "maraudon",
  "alcaz",
  "sunken-temple",
  "blackrock-depths",
  "lower-blackrock",
  "stratholme",
];

function source(id: number, body: string): CampaignSource {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === id)!;
  return { reference, guide: parseGuideChapter(body, reference.id, "a".repeat(64), 70205) };
}

function route(): ReturnType<typeof buildCampaignPlan> {
  return buildCampaignPlan(
    "human",
    "b".repeat(64),
    [
      ...[115, 116, 117, 125].map((id) => source(id, "step\n>>Train and travel")),
      source(18, "step\n.accept 261\nstep\n.complete 261,1\nstep\n.turnin 261\n.accept 1052"),
      source(21, "step\n.turnin 1052"),
      source(29, "step\n.accept 1690\nstep\n.complete 1690,1\nstep\n.turnin 1690"),
    ],
    "warrior",
    { includeLibrary: false },
  );
}

describe("level-appropriate premade dungeon progression", () => {
  it("moves the actual compiled dungeon legs, not just their rendered cards", () => {
    expect(PREMADE_STOPS.map((stop) => stop.id)).toEqual(orderedIds);
    expect(
      route()
        .legs.filter((leg) => leg.kind === "dungeon")
        .map((leg) => leg.stopId),
    ).toEqual(orderedIds);
    for (const [index, stop] of PREMADE_STOPS.entries())
      expect(stop.nextLevel).toBe(PREMADE_STOPS[index + 1]?.level ?? 60);
  });

  it.each(["at-level", "experienced-premade"] as const)(
    "has no backwards dungeon targets under %s, including selected extras",
    (difficultyPolicy) => {
      for (const raidGoals of [false, true])
        for (const extras of [false, true]) {
          const progress = {
            ...emptyPremadeProgress(),
            dungeonFinish: { ...emptyPremadeProgress().dungeonFinish, strategy: "mixed" as const },
            difficultyPolicy,
            raidGoals,
            selectedExtras: extras
              ? Object.fromEntries(
                  PREMADE_STOPS.flatMap((stop) =>
                    stop.quests.map((quest) => [String(quest.questId), true]),
                  ),
                )
              : {},
          };
          const levels = PREMADE_STOPS.map((stop) => premadeEntryLevel(stop, progress));
          expect(levels).toEqual([...levels].sort((left, right) => left - right));
          const guide = forecastCampaignGuide(route(), progress);
          const targets = guide.sections
            .filter((section) => section.chapter.kind === "dungeon")
            .map((section) => section.targetLevel);
          expect(targets).toEqual(levels);
        }
    },
  );

  it("uses the corrected conservative levels without postponing lower-level runs", () => {
    expect(PREMADE_STOPS.map((stop) => premadeEntryLevel(stop, emptyPremadeProgress()))).toEqual([
      16, 19, 20, 25, 26, 29, 31, 31, 33, 37, 38, 39, 42, 42, 44, 46, 50, 51, 55, 60, 60,
    ]);
  });

  it("keeps high-level Scarlet and Tanaris preparations out of the earlier RFK/RFD visits", () => {
    const plan = route();
    const index = (legId: string): number => plan.legs.findIndex((leg) => leg.id === legId);
    expect(index("ashenvale-crossing")).toBeLessThan(index("dungeon-blackfathom"));
    expect(index("dungeon-blackfathom")).toBeLessThan(index("wetlands-prerequisites"));
    expect(index("lonebrow-rfk-preparation")).toBeLessThan(index("dungeon-razorfen-kraul"));
    expect(index("desolace-scarlet-unlock")).toBeGreaterThan(index("dungeon-gnomeregan"));
    expect(index("desolace-scarlet-unlock")).toBeLessThan(index("dungeon-scarlet-monastery"));
    expect(index("razorfen-downs-approach")).toBeLessThan(index("dungeon-razorfen-downs"));
    expect(index("tanaris-rfd-crossing")).toBeGreaterThan(index("dungeon-uldaman"));
    expect(index("tanaris-rfd-crossing")).toBeLessThan(index("dungeon-zul-farrak"));
    expect(index("desolace-maraudon")).toBeGreaterThan(index("dungeon-zul-farrak"));
    const phases = (questId: number): string[] =>
      plan.actions.flatMap((action) =>
        action.questChanges
          .filter((change) => change.questId === questId)
          .map((change) => change.state),
      );
    expect(phases(1100)).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(phases(261)).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(phases(1052)).toEqual(["accepted", "rewarded"]);
    expect(phases(1690)).toEqual(["accepted", "objectives-complete", "rewarded"]);
  });

  it("preserves saved action identities and never rewrites a player's reported XP", () => {
    const plan = route(),
      initial = emptyPremadeProgress();
    const action = plan.actions.find((entry) => entry.id === "dungeon-blackfathom-entry")!;
    const progress = {
      ...initial,
      campaigns: {
        [plan.release]: { selectedActionId: action.id, completion: {} },
      },
    };
    const before = JSON.stringify(progress);
    expect(currentCampaignAction(plan, progress).id).toBe(action.id);
    forecastCampaignGuide(plan, progress);
    expect(JSON.stringify(progress)).toBe(before);
  });
});
