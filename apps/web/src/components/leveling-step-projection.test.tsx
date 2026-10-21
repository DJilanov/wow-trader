import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, forecastCampaignGuide } from "@wow-trader/leveling";
import { LevelingStepProjection, LevelingCombatPlanningSettings } from "./leveling-step-projection";
import { guideTestPlan } from "./leveling-guide.test-fixture";

describe("expected progress after the current quest", () => {
  it("shows the result immediately without a basis selector or five-player ledger", () => {
    const progress = emptyPremadeProgress();
    const before = JSON.stringify(progress);
    const guide = forecastCampaignGuide(guideTestPlan(), progress).sections[0]!;
    const html = renderToStaticMarkup(
      <LevelingStepProjection guide={guide} actionId="northshire-quest" />,
    );
    expect(html).toContain("After this step");
    expect(html).toContain("Level 2 · 0%");
    expect(html).toContain('aria-label="Player 1 expected progress toward level 3"');
    expect(html).toContain("Recorded XP stays unchanged");
    expect(html).toContain("some kill XP is not available");
    expect(html).not.toContain("Projection starting point");
    expect(html).not.toContain("Player 2");
    expect(JSON.stringify(progress)).toBe(before);
  });
  it("does not call unavailable results zero XP or claim a completed level", () => {
    const guide = forecastCampaignGuide(
      { ...guideTestPlan(), rewardFacts: [] },
      emptyPremadeProgress(),
    ).sections[0]!;
    const html = renderToStaticMarkup(
      <LevelingStepProjection guide={guide} actionId="northshire-quest" />,
    );
    expect(html).toContain("Estimate needs an update");
    expect(html).not.toContain("<progress");
  });
  it("keeps the advanced kill multiplier separate from quest rewards and recorded XP", () => {
    const progress = emptyPremadeProgress();
    progress.combatPlanning = { outdoorXpMultiplier: 2.375 };
    const html = renderToStaticMarkup(
      <LevelingCombatPlanningSettings progress={progress} disabled={false} onChange={() => {}} />,
    );
    expect(html).toContain('value="2.375"');
    expect(html).toContain("does not change quest rewards");
    expect(html).toContain("Save combat planning settings");
  });
});
