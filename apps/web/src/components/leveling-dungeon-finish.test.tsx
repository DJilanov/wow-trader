import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, recordPremadeXp } from "@wow-trader/leveling";
import { DungeonFinishStrategy, LevelingDungeonFinish } from "./leveling-dungeon-finish";
import { DungeonClearForm, DungeonGearForm } from "./leveling-dungeon-finish-forms";
import { guideTestPlan } from "./leveling-guide.test-fixture";

const noop = (): void => {};
describe("dungeon finish presentation", () => {
  it("offers ten run options without presenting unrecorded bars as a measured forecast", () => {
    const html = renderToStaticMarkup(
      <LevelingDungeonFinish
        plan={guideTestPlan()}
        progress={emptyPremadeProgress()}
        disabled
        onChange={noop}
      />,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(10);
    expect(html).toContain("Party XP not recorded");
    expect(html).toContain("No calibrated estimate");
    expect(html).toContain("Timing not measured");
    expect(html).toContain("Blackmaw Hold");
    expect(html).toContain("Shaper&#x27;s Terrace");
    expect(html).not.toContain("975,800 XP");
    expect(html).toContain('role="tablist"');
  });
  it("stops leveling when all five actually reach 60", () => {
    let progress = emptyPremadeProgress();
    for (let player = 0; player < 5; player++) progress = recordPremadeXp(progress, player, 60, 0);
    const html = renderToStaticMarkup(
      <LevelingDungeonFinish
        plan={guideTestPlan()}
        progress={progress}
        disabled={false}
        onChange={noop}
      />,
    );
    expect(html).toContain("Your pre-raid gear circuit");
    expect(html).toContain("Leveling complete");
    expect(html).toContain("no mandatory leveling zones");
  });
  it("retains an explicit mixed-route option", () => {
    const html = renderToStaticMarkup(
      <DungeonFinishStrategy progress={emptyPremadeProgress()} onChange={noop} />,
    );
    expect(html).toContain('aria-pressed="true">Dungeon finish');
    expect(html).toContain("Mixed quest route");
  });
  it("requires a measurement choice and all five before/after bars without guessing defaults", () => {
    const html = renderToStaticMarkup(
      <DungeonClearForm
        plan={guideTestPlan()}
        progress={emptyPremadeProgress()}
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(html.match(/<fieldset/g)).toHaveLength(5);
    expect(html).toContain("Choose measurement");
    expect(html).toContain("Includes quest rewards");
    expect(html).not.toContain('value="55"');
  });
  it("labels wishlist assignments as personal rather than verified drops or BiS", () => {
    const html = renderToStaticMarkup(
      <DungeonGearForm
        plan={guideTestPlan()}
        progress={emptyPremadeProgress()}
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Item ID or Wowhead Forever link");
    expect(html).toContain("not a verified drop or guaranteed best-in-slot");
  });
});
