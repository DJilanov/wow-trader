import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfessionLevelingResult } from "./profession-leveling-result";
import type { ProfessionLevelingPlan } from "../lib/profession-leveling-types";

const plan: ProfessionLevelingPlan = {
  from: 1,
  reached: 5,
  target: 10,
  status: "partial",
  mode: "expected",
  totalCopper: "20200",
  materialCopper: "200",
  recipeCopper: "20000",
  steps: [
    {
      from: 1,
      to: 5,
      recipeId: 2660,
      recipeName: "Rough Sharpening Stone",
      crafts: 4,
      learning: "Trainer",
    },
  ],
  shopping: [
    {
      itemId: 2835,
      name: "Rough Stone",
      needed: 4,
      purchased: 20,
      costCopper: "200",
      recipeQuantity: 0,
    },
  ],
  excluded: 12,
  searchLimited: true,
  transitions: 100,
};

describe("profession leveling result", () => {
  it("separates learning costs, partial coverage, whole-stack leftovers and model limits", () => {
    const html = renderToStaticMarkup(createElement(ProfessionLevelingResult, { plan }));
    for (const text of [
      "Partial route",
      "of 10",
      "Estimated net cost",
      "Shopping &amp; learning budget",
      "Expected returns",
      "Materials",
      "Recipes &amp; learning",
      "2g 00s 00c",
      "16",
      "left over",
      "does not prove a global minimum",
      "not a verified Forever server probability",
      "Copy list",
    ])
      expect(html).toContain(text);
  });
  it("does not warn about probabilistic counts in an orange-only plan", () => {
    const html = renderToStaticMarkup(
      createElement(ProfessionLevelingResult, {
        plan: { ...plan, mode: "orange", status: "complete", target: 5 },
      }),
    );
    expect(html).toContain("Your leveling plan");
    expect(html).not.toContain("Craft counts include estimated yellow/green skill-ups");
  });
});
