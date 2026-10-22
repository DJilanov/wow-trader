import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  emptyPremadeProgress,
  forecastCampaignGuide,
  recordCampaignGuideXp,
} from "@wow-trader/leveling";
import { LevelingChapterBudget, LevelingXpBudget } from "./leveling-xp-budget";
import { guideTestPlan } from "./leveling-guide.test-fixture";

describe("player-facing chapter plan", () => {
  it("shows a shared chapter's projected party entry, not the defaults of unrecorded teammates", () => {
    const base = guideTestPlan();
    const plan = {
      ...base,
      actions: [
        ...base.actions,
        { ...base.actions[0]!, id: "join", legId: "join", leaderOnly: false, questChanges: [] },
      ],
      legs: [
        ...base.legs,
        {
          ...base.legs[0]!,
          id: "join",
          title: "Dun Morogh",
          kind: "preparation" as const,
          actionIds: ["join"],
        },
      ],
    };
    const progress = emptyPremadeProgress();
    const guide = forecastCampaignGuide(plan, progress).sections.at(-1)!;
    const html = renderToStaticMarkup(<LevelingChapterBudget guide={guide} />);
    expect(html).toContain("Expected entry");
    expect(html).toContain("Level 3 · 0%");
    expect(html).not.toContain("Levels 1–");
    expect(progress.members.every((member) => member.level === null)).toBe(true);
  });
  it("shows a useful default start, calculated finish and numeric target, not an actual-XP audit", () => {
    const guide = forecastCampaignGuide(guideTestPlan(), emptyPremadeProgress()).sections[0]!;
    const html = renderToStaticMarkup(<LevelingChapterBudget guide={guide} />);
    expect(html).toContain('aria-label="Chapter plan"');
    expect(html).toContain("Level 1 · 0%");
    expect(html).toContain("Level 2 · 0%");
    expect(html).toContain("Target level");
    for (const text of [
      "Unknown",
      "Actual XP",
      "Independent",
      "Unfunded",
      "Player 2",
      "Not estimated",
    ])
      expect(html).not.toContain(text);
    expect(html).toContain("Complete the tasks in order");
  });
  it("uses the same anchored forecast as the reader without changing the baseline target", () => {
    const plan = guideTestPlan();
    const progress = recordCampaignGuideXp(
      plan,
      emptyPremadeProgress(),
      0,
      5,
      100,
      "northshire-quest",
    );
    const guide = forecastCampaignGuide(plan, progress).sections[0]!;
    expect(guide.targetLevel).toBe(2);
    const html = renderToStaticMarkup(<LevelingChapterBudget guide={guide} />);
    expect(html).toContain("From your update");
    expect(html).toContain("Level 5");
  });
  it("keeps explanations optional and does not render five empty diagnostic rows", () => {
    const guide = forecastCampaignGuide(guideTestPlan(), emptyPremadeProgress()).sections[0]!;
    const html = renderToStaticMarkup(<LevelingXpBudget guide={guide} />);
    expect(html).toContain("XP breakdown &amp; assumptions");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Player 2");
    expect(html).not.toContain("Entry bar");
    expect(html).not.toContain("Gap to target");
  });
  it("gives one actionable message for missing data rather than five unknown rows", () => {
    const plan = { ...guideTestPlan(), rewardFacts: [] };
    const guide = forecastCampaignGuide(plan, emptyPremadeProgress()).sections[0]!;
    const html = renderToStaticMarkup(<LevelingChapterBudget guide={guide} />);
    expect(html).toContain("Some XP is missing");
    expect(html).toContain("before deciding to grind");
    expect(html).not.toContain("Unknown");
    expect(html).not.toContain("Progression blocked");
  });
});
