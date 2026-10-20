import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  auditCampaignSections,
  emptyPremadeProgress,
  forecastCampaignXp,
  type CampaignPlan,
} from "@wow-trader/leveling";
import { LevelingChapterBudget } from "./leveling-xp-budget";

describe("starter zone XP presentation", () => {
  it("shows an actual-XP handoff instead of a mandatory chapter-range target", () => {
    const plan: CampaignPlan = {
      release: "actual-xp-ui-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: ["northshire", "elwynn"].map((legId) => ({
        id: `${legId}-work`,
        legId,
        title: "Continue from actual XP",
        instructions: [],
        questChanges: [],
        positions: [],
        source: null,
        kind: "instructions",
        leaderOnly: true,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
      })),
      legs: [
        { id: "northshire", title: "Northshire", from: 1, to: 6 },
        { id: "elwynn", title: "Elwynn Forest", from: 6, to: 11 },
      ].map((leg) => ({
        ...leg,
        kind: "starter",
        stopId: null,
        actionIds: [`${leg.id}-work`],
        questIds: [],
        unresolvedQuestIds: [],
      })),
    };
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        level: 5,
        currentXp: 123,
        xpNeedsUpdate: false,
      })),
    };
    const markup = renderToStaticMarkup(
      <LevelingChapterBudget
        audit={auditCampaignSections(plan, progress)[0]!}
        forecast={forecastCampaignXp(plan, progress)[0]!}
      />,
    );
    expect(markup).toContain("Zone handoff");
    expect(markup).toContain("Continue from actual XP");
    expect(markup).toContain("the chapter range is not a grind target");
    expect(markup).not.toContain("Level 6");
  });
});
