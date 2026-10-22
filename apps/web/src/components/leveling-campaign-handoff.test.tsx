import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  emptyPremadeProgress,
  forecastCampaignGuide,
  recordCampaignGuideXp,
} from "@wow-trader/leveling";
import { LevelingCampaignHandoff } from "./leveling-campaign-handoff";
import { guideTestPlan } from "./leveling-guide.test-fixture";

describe("plain-language chapter outcome", () => {
  const next = { title: "Elwynn Forest", href: "/forever/leveling/next" };

  it("shows the calculated finish and next destination without asking for XP bookkeeping", () => {
    const guide = forecastCampaignGuide(guideTestPlan(), emptyPremadeProgress()).sections[0]!;
    const html = renderToStaticMarkup(<LevelingCampaignHandoff guide={guide} next={next} />);
    expect(html).toContain("After this chapter");
    expect(html).toContain("Level 2 · 0%");
    expect(html).toContain("then head to Elwynn Forest");
    expect(html).toContain(`href="${next.href}"`);
    for (const jargon of ["Record actual", "participating players", "route references", "XP bars"])
      expect(html).not.toContain(jargon);
  });

  it("uses a saved correction rather than the uncorrected chapter forecast", () => {
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
    const html = renderToStaticMarkup(<LevelingCampaignHandoff guide={guide} next={next} />);
    expect(html).toContain("Level 5");
    expect(html).not.toContain("Level 2");
  });

  it("does not claim a numeric finish when reward data is missing", () => {
    const guide = forecastCampaignGuide(
      { ...guideTestPlan(), rewardFacts: [] },
      emptyPremadeProgress(),
    ).sections[0]!;
    const html = renderToStaticMarkup(<LevelingCampaignHandoff guide={guide} next={next} />);
    expect(html).toContain("some XP data is missing");
    expect(html).toContain("Continue to Elwynn Forest");
    expect(html).not.toContain("Expected finish:");
    expect(html).not.toContain("Record");
  });

  it("keeps the finish visible in the final chapter without a broken next link", () => {
    const guide = forecastCampaignGuide(guideTestPlan(), emptyPremadeProgress()).sections.at(-1)!;
    const html = renderToStaticMarkup(<LevelingCampaignHandoff guide={guide} next={null} />);
    expect(html).toContain("After this chapter");
    expect(html).toContain("Expected finish:");
    expect(html).not.toContain("href=");
  });
});
