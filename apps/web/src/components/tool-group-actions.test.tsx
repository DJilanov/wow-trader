import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolGroupActions } from "./tool-group-actions";
import { encodeToolGroupDraft } from "../lib/tool-group-draft";

describe("tool-to-community links", () => {
  it("sends a source-aware plan to the neutral community, not KFC recruitment", () => {
    const encoded = encodeToolGroupDraft({
      version: 1,
      kind: "quest",
      label: "A Threat Within",
      sourceUrl: "https://kfcguild.online/tools/forever/encyclopedia/quests/783",
    });
    const html = renderToStaticMarkup(
      <ToolGroupActions
        kind="quest"
        label="A Threat Within"
        sourcePath="/forever/encyclopedia/quests/783"
      />,
    );
    expect(html).toContain(`https://www.wowforeverdiscord.online/lfg?draft=${encoded}`);
    expect(html).toContain(`https://www.wowforeverdiscord.online/raids/new?draft=${encoded}`);
    expect(html).not.toContain("/recruitment");
    expect(html).not.toContain("discord.gg/");
  });

  it("preserves faction and public route settings while omitting a one-player capacity", () => {
    const html = renderToStaticMarkup(
      <ToolGroupActions
        kind="leveling"
        label="Orc leveling"
        sourcePath="/forever/leveling/routes/horde-orc?plan=premade"
        faction="Horde"
        capacity={1}
      />,
    );
    expect(html).toContain("faction=Horde");
    expect(html).toContain("activity=Questing");
  });
});
