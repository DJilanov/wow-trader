import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDungeonBundle, updateDungeonBundleSlot } from "@wow-trader/leveling";
import { LevelingDungeonBundle } from "./leveling-dungeon-bundle";

describe("guaranteed dungeon bundle controls", () => {
  it("renders four selected pending slots, a separate include toggle and no invented quest links", () => {
    const markup = renderToStaticMarkup(
      <LevelingDungeonBundle
        bundle={getDungeonBundle("drowned-city", "alliance")!}
        dungeonName="Drowned City"
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(markup.match(/type="checkbox"/g)).toHaveLength(5);
    expect(markup.match(/checked=""/g)).toHaveLength(5);
    expect(markup.match(/ID pending/g)).toHaveLength(4);
    expect(markup).toContain("40,400 planning quest XP / player");
    expect(markup).not.toContain("quest=");
    expect(markup).toContain("Planning quest level");
  });
  it("renders a saved skipped slot without turning the bundle back on", () => {
    const bundle = updateDungeonBundleSlot(getDungeonBundle("alcaz", "horde")!, 2, {
      selected: false,
    });
    const markup = renderToStaticMarkup(
      <LevelingDungeonBundle
        bundle={bundle}
        dungeonName="Alcaz Prison"
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("3/4 selected");
    expect(markup).toContain("50,550 planning quest XP / player");
    const skipped = renderToStaticMarkup(
      <LevelingDungeonBundle
        bundle={{ ...bundle, included: false }}
        dungeonName="Alcaz Prison"
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(skipped).toContain("0/4 selected");
    expect(skipped).toContain("0 planning quest XP / player");
  });
});
