import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfessionLevelingPlanner } from "./profession-leveling-planner";
import type { ProfessionLevelingData } from "../lib/profession-leveling-types";

const data: ProfessionLevelingData = {
  professions: [{ id: 164, slug: "blacksmithing", name: "Blacksmithing" }],
  markets: [{ value: "EU|Test|alliance", label: "EU · Test · alliance" }],
  market: "EU|Test|alliance",
  profession: "blacksmithing",
  scan: { at: "2026-11-12T10:00:00Z", build: 70888, fresh: false },
  recipes: [
    {
      id: 2668,
      name: "Rough Bronze Leggings",
      requiredSkill: 105,
      requiredSkillKnown: false,
      yellowSkill: 145,
      graySkill: 175,
      skillUps: 1,
      inputs: [{ itemId: 2841, quantity: 6 }],
      output: { itemId: 2865, quantity: 1 },
      acquisition: [],
      restriction: null,
    },
  ],
  items: [],
  limitation: null,
};

describe("profession leveling controls", () => {
  it("explains learning costs, missing evidence, scope and estimated skill-ups", () => {
    const html = renderToStaticMarkup(createElement(ProfessionLevelingPlanner, { data }));
    for (const text of [
      "Current skill",
      "Target skill",
      "Character level",
      "Skill-up strategy",
      "Known recipes",
      "Learning price missing",
      "Override learning cost (gold)",
      "Skill required to learn",
      "Learning is charged once",
      "Unknown prices are excluded",
      "Reference prices",
      "Value of crafted items",
      "Deduct vendor returns",
      "Best of vendor / disenchant",
      "shopping budget available",
      "Find lowest-cost route",
    ])
      expect(html).toContain(text);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('value="expected"');
    expect(html).toContain('value="orange"');
    expect(html).toContain("Rough Bronze Leggings learning cost in gold");
  });
  it("disables calculation when market/catalog pricing is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(ProfessionLevelingPlanner, {
        data: { ...data, limitation: "No accepted scan." },
      }),
    );
    expect(html).toContain('fieldset disabled=""');
  });
});
