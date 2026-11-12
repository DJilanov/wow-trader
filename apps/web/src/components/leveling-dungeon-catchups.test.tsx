import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, type CampaignPlan } from "@wow-trader/leveling";
import { LevelingDungeonCatchUps } from "./leveling-dungeon-catchups";

const base: Pick<CampaignPlan, "legs"> = { legs: [] };
const plan: Pick<CampaignPlan, "legs"> = {
  legs: [
    {
      id: "wailing-caverns-catchup",
      title: "Wailing Caverns: optional catch-up",
      from: 16,
      to: 18,
      kind: "xp-bridge",
      stopId: null,
      dungeonVisitId: "wailing-caverns",
      optionalQuestId: 959,
      questIds: [959, 1487, 6981],
      unresolvedQuestIds: [],
      actionIds: [],
    },
  ],
};

describe("optional dungeon catch-up controls", () => {
  it("shows the captured trip selected and explains how skipping affects the plan", () => {
    const markup = renderToStaticMarkup(
      <LevelingDungeonCatchUps
        plan={plan}
        progress={emptyPremadeProgress()}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("Wailing Caverns: optional catch-up");
    expect(markup).toContain('checked=""');
    expect(markup).toContain("saved quest history stays");
  });

  it("keeps a skipped trip visible so it can be included again", () => {
    const markup = renderToStaticMarkup(
      <LevelingDungeonCatchUps
        plan={plan}
        progress={{ ...emptyPremadeProgress(), selectedExtras: { "959": false } }}
        disabled={true}
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("Wailing Caverns");
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain('disabled=""');
  });

  it("renders nothing when the evidence does not qualify a catch-up visit", () => {
    expect(
      renderToStaticMarkup(
        <LevelingDungeonCatchUps
          plan={base}
          progress={emptyPremadeProgress()}
          disabled={false}
          onChange={() => {}}
        />,
      ),
    ).toBe("");
  });

  it("shows a required itinerary visit without a skip checkbox, including old saved opt-outs", () => {
    const required: Pick<CampaignPlan, "legs"> = {
      legs: plan.legs.map((leg) => ({
        ...leg,
        title: "Wailing Caverns",
        requiredVisit: true,
      })),
    };
    const markup = renderToStaticMarkup(
      <LevelingDungeonCatchUps
        plan={required}
        progress={{ ...emptyPremadeProgress(), selectedExtras: { "959": false } }}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("Scheduled dungeons");
    expect(markup).toContain("Required");
    expect(markup).toContain("3 quests");
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain("Optional dungeon catch-up");
  });
});
