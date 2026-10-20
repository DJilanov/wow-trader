import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, type CampaignPlan } from "@wow-trader/leveling";
import { LevelingStepProjection, LevelingCombatPlanningSettings } from "./leveling-step-projection";

describe("theoretical step XP presentation", () => {
  it("labels missing combat and never claims to update actual progress", () => {
    const plan: CampaignPlan = {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions: [],
      legs: [],
    };
    const html = renderToStaticMarkup(
      <LevelingStepProjection
        plan={plan}
        progress={emptyPremadeProgress()}
        actionId="test"
        currentActionId="test"
      />,
    );
    expect(html).toContain("Theoretical XP after this step");
    expect(html).toContain("Saved bars are unchanged");
    expect(html).toContain("Kill XP is missing, not zero");
    expect(html).toContain("Route start · level 1, no bonus XP");
  });
  it("exposes a persisted planning multiplier independently of quest XP", () => {
    const progress = emptyPremadeProgress();
    progress.combatPlanning = { outdoorXpMultiplier: 2.375 };
    const html = renderToStaticMarkup(
      <LevelingCombatPlanningSettings progress={progress} disabled={false} onChange={() => {}} />,
    );
    expect(html).toContain('value="2.375"');
    expect(html).toContain("not the quest-reward multiplier");
    expect(html).toContain("Save combat planning settings");
  });
});
