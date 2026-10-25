import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CampaignPlan } from "@wow-trader/leveling";
import { LevelingCampaign } from "./leveling-campaign";
import { guideTestPlan } from "./leveling-guide.test-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("./leveling-provider", () => ({
  useLeveling: () => ({
    session: null,
    loaded: true,
    notice: null,
    storageStatus: "saved",
    workspace: { sessions: [] },
    setDungeonPlan: vi.fn(),
    saveCharacter: vi.fn(),
  }),
}));

describe("dedicated dungeon circuit page", () => {
  it("keeps the full circuit outside the quest reader's clipped toolbar", () => {
    const base = guideTestPlan();
    const intro = {
      ...base.actions[0]!,
      id: "level-60-finish-dungeon-circuit",
      legId: "level-60-finish",
      questChanges: [],
      kind: "instructions" as const,
      dungeonFinishOnly: true,
    };
    const checkpoint = {
      ...intro,
      id: "level-60-finish-checkpoint",
      kind: "checkpoint" as const,
      targetLevel: 60,
      dungeonFinishOnly: false,
    };
    const plan: CampaignPlan = {
      ...base,
      dungeonFinish: true,
      actions: [intro, checkpoint],
      legs: [
        {
          ...base.legs[0]!,
          id: "level-60-finish",
          from: 55,
          to: 60,
          kind: "finish",
          actionIds: [intro.id, checkpoint.id],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <LevelingCampaign
        plan={plan}
        legId="finish-leveling"
        maps={{
          buildNumber: null,
          targetBuild: 70205,
          state: "unavailable",
          zones: [],
          points: [],
          unmappedPoints: 0,
        }}
      />,
    );
    expect(html).toContain('data-dungeon-circuit-page="true"');
    expect(html.match(/type="radio"/g)).toHaveLength(10);
    expect(html).not.toContain("Map width");
    expect(html).not.toContain('data-reader-action="next"');
    expect(html).toContain("Confirm all five at level 60");
    expect(html).toContain("Progress backup &amp; restore");
    expect(html).toContain("Start guide");
  });
});
