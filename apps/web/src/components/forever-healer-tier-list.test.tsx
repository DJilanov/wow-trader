import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import data from "../lib/data/forever-healer-tier-list.json";
import { healerTierSnapshotSchema } from "../lib/forever-healer-tier-list";
import { ForeverHealerTierList } from "./forever-healer-tier-list";
import { ForeverRankingNavigation } from "./forever-ranking-navigation";
import { ForeverHealerRankingLinks } from "./forever-healer-ranking-links";

describe("healer ranking delivery", () => {
  it("renders actual healing, absorbs, survival and mana with assignment controls", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverHealerTierList, { snapshot: healerTierSnapshotSchema.parse(data) }),
    );
    for (const text of [
      "Group healing",
      "Tank healing",
      "Burst recovery",
      "Useful HPS",
      "Consumed absorbs",
      "Assignment survival",
      "Mana remaining",
      "512 measured fights",
      "Priest",
      "Druid",
      "Shaman",
      "Paladin",
    ])
      expect(html).toContain(text);
    expect(html).toContain("healing-shaman?release=");
    expect(html).not.toContain("DPS results");
    expect(html).toContain("Overhealing · excluded");
  });
  it("links all five ranking categories and promotes healer discovery", () => {
    const html = renderToStaticMarkup(
      createElement(ForeverRankingNavigation, { active: "healers", label: "Class rankings" }),
    );
    expect(html).toContain('href="/forever/tier-list/healers"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Solo DPS");
    expect(html).toContain("Raid DPS");
    expect(html).toContain("Raid tanks");
    expect(renderToStaticMarkup(createElement(ForeverHealerRankingLinks))).toContain(
      'href="/forever/tier-list/healers"',
    );
  });
});
