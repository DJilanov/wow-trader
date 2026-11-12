import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CampaignPlan } from "@wow-trader/leveling";
import { LevelingCampaign } from "./leveling-campaign";
import { guideTestPlan } from "./leveling-guide.test-fixture";
import { emptyLevelingMaps } from "../lib/leveling-map-data";

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
  it("offers stock confirmation only on a qualified, currently selected supply task", () => {
    const base = guideTestPlan();
    const supply = {
      questId: 300001,
      itemId: 769,
      name: "Chunk of Boar Meat",
      quantityPerPlayer: 4,
      tradeReference: {
        repository: "https://github.com/cmangos/classic-db",
        revision: "603ece109099ce44a5447a1b1cffd65c7272d71c",
        file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
        sha256: "4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0",
      },
    } as const;
    for (const leaderOnly of [true, false]) {
      const plan: CampaignPlan = {
        ...base,
        itemRequirements: [{ questId: 300001, objectiveIndex: 1, itemId: 769, quantity: 4 }],
        legs: base.legs.map((leg, index) =>
          index
            ? leg
            : {
                ...leg,
                actionIds: [leg.actionIds[0]!, "meat-consumer"],
              },
        ),
        actions: base.actions.flatMap((action, index) =>
          index
            ? [action]
            : [
                {
                  ...action,
                  kind: "instructions",
                  leaderOnly,
                  questChanges: [],
                  auctionSupplies: [supply],
                  itemCollections: [
                    {
                      questId: 300001,
                      itemId: 769,
                      quantity: 4,
                      objectiveBitmask: 1,
                      confirmationKey: "campaign-item-86-769",
                    },
                  ],
                },
                { ...action, id: "meat-consumer" },
              ],
        ),
      };
      const html = renderToStaticMarkup(
        <LevelingCampaign plan={plan} maps={emptyLevelingMaps(70205)} />,
      );
      expect(html).toContain(leaderOnly ? "I have these supplies" : "Everyone has these supplies");
    }
    const ordinary = renderToStaticMarkup(
      <LevelingCampaign plan={base} maps={emptyLevelingMaps(70205)} />,
    );
    expect(ordinary).not.toContain("I have these supplies");
    expect(ordinary).not.toContain("Everyone has these supplies");
  });
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
