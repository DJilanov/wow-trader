import { describe, expect, it } from "vitest";

import type { ReferenceTask } from "./contracts.js";
import {
  buildStillSixtyRecipePlan,
  parseStillSixtyRecipePage,
  parseStillSixtyRecipeSitemap,
} from "./stillsixty-reference.js";

const capturedAt = "2026-10-18T10:00:00.000Z";

function recipePage(recipeSpellId: number, acquisitions: string, extraLinks = ""): string {
  return [
    "<!doctype html><html><head>",
    `<link rel="canonical" href="https://www.stillsixty.com/recipe/${recipeSpellId}">`,
    "</head><body><main>",
    "<h1>Elixir of Testing</h1>",
    acquisitions,
    extraLinks,
    "</main></body></html>",
  ].join("");
}

describe("StillSixty reference parsing", () => {
  it("extracts normalized acquisition kinds and canonical related entities", () => {
    const result = parseStillSixtyRecipePage(
      recipePage(
        2542,
        [
          '<li data-acquisition="merchant"><a href="/npc/340">Kendor Kabonka</a></li>',
          '<li data-acquisition="quest"><a href="/quest/22">Goretusk Liver Pie</a></li>',
        ].join(""),
      ),
      2542,
      capturedAt,
    );

    expect(result).toMatchObject({
      recipeSpellId: 2542,
      name: "Elixir of Testing",
      capturedAt,
      rightsStatus: "review_required",
      acquisitions: [
        {
          kind: "vendor",
          rawKind: "merchant",
          entities: [
            {
              kind: "npc",
              id: 340,
              name: "Kendor Kabonka",
              sourceUrl: "https://www.stillsixty.com/npc/340",
            },
          ],
        },
        {
          kind: "quest",
          rawKind: "quest",
          entities: [
            {
              kind: "quest",
              id: 22,
              name: "Goretusk Liver Pie",
              sourceUrl: "https://www.stillsixty.com/quest/22",
            },
          ],
        },
      ],
    });
  });

  it("uses the page's trainer links when a trainer marker has no nested entity", () => {
    const result = parseStillSixtyRecipePage(
      recipePage(
        2538,
        '<li data-acquisition="trainer">Profession trainer</li>',
        '<a href="/npc/5499/crafting-trainer">Lily Craftwell</a>',
      ),
      2538,
      capturedAt,
    );

    expect(result.acquisitions[0]?.entities).toEqual([
      {
        kind: "npc",
        id: 5499,
        name: "Lily Craftwell",
        sourceUrl: "https://www.stillsixty.com/npc/5499/crafting-trainer",
      },
    ]);
  });

  it("fails closed when the canonical identity or acquisition layout changes", () => {
    expect(() =>
      parseStillSixtyRecipePage(
        recipePage(2542, '<li data-acquisition="trainer">Trainer</li>'),
        2538,
        capturedAt,
      ),
    ).toThrow(/canonical mismatch/);
    expect(() =>
      parseStillSixtyRecipePage(recipePage(2538, "<p>Unknown source</p>"), 2538, capturedAt),
    ).toThrow(/parser review required/);
  });
});

describe("StillSixty recipe coverage planning", () => {
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<urlset>",
    "<url><loc>https://www.stillsixty.com/recipe/2538</loc></url>",
    "<url><loc>https://www.stillsixty.com/recipe/2542</loc></url>",
    "<url><loc>https://www.stillsixty.com/recipe/17552</loc></url>",
    "</urlset>",
  ].join("");

  it("accepts only canonical recipe URLs", () => {
    expect(parseStillSixtyRecipeSitemap(sitemap)).toEqual([
      { recipeSpellId: 2538, sourceUrl: "https://www.stillsixty.com/recipe/2538" },
      { recipeSpellId: 2542, sourceUrl: "https://www.stillsixty.com/recipe/2542" },
      { recipeSpellId: 17552, sourceUrl: "https://www.stillsixty.com/recipe/17552" },
    ]);
    expect(() =>
      parseStillSixtyRecipeSitemap(
        sitemap.replace(
          "https://www.stillsixty.com/recipe/2542",
          "https://example.com/recipe/2542",
        ),
      ),
    ).toThrow(/out-of-scope/);
  });

  it("intersects sitemap IDs with unresolved Forever recipe tasks", () => {
    const queue: readonly ReferenceTask[] = [
      { game: "forever", kind: "spell", id: 17552 },
      { game: "forever", kind: "spell", id: 2538 },
      { game: "forever", kind: "item", id: 2542 },
      { game: "tbc", kind: "spell", id: 2542 },
      { game: "forever", kind: "spell", id: 99999 },
    ];
    const plan = buildStillSixtyRecipePlan(queue, sitemap, new Date(capturedAt));

    expect(plan.summary).toEqual({
      unresolvedRecipeCount: 3,
      sitemapRecipeCount: 3,
      matchedRecipeCount: 2,
      unmatchedRecipeCount: 1,
    });
    expect(plan.tasks.map((task) => task.recipeSpellId)).toEqual([2538, 17552]);
    expect(plan.rights.status).toBe("review_required");
  });
});
