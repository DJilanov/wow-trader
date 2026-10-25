import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRecipeDetail } = vi.hoisted(() => ({ getRecipeDetail: vi.fn() }));
vi.mock("../../../lib/data", () => ({ getRecipeDetail }));
vi.mock("../../../components/production-chain", () => ({ ProductionChain: () => null }));
vi.mock("../../../components/item-icon", () => ({ ItemIcon: () => null }));
import { CatalogRecipePage } from "./page";
import { FOREVER_CATALOG_PAGE_CONFIG } from "../../../lib/catalog-page-config";
import type { RecipeDetail } from "../../../lib/data";

describe("reviewed recipe learning references", () => {
  beforeEach(() => {
    getRecipeDetail.mockReset();
  });
  it("labels matched items and referenced trainers without inventing live costs", async () => {
    const recipe: RecipeDetail = {
      recipeSpellId: 100,
      name: "Copper Belt",
      profession: { name: "Blacksmithing", slug: "blacksmithing" },
      requiredSkillRank: 1,
      craftTimeMs: 1000,
      cooldownMs: 0,
      cooldownCategoryId: null,
      categoryCooldownMs: 0,
      outputKind: "item",
      extractionStatus: "complete",
      build: { version: "1.60.1.70532", number: 70532 },
      inputs: [],
      outputs: [],
      trainers: [],
      productionChain: [],
      teachingItems: [
        {
          itemId: 200,
          name: "Plans: Copper Belt",
          iconFileDataId: null,
          quality: 1,
          referenceLabel: "Wowhead Forever professions · Name-matched teaching item",
        },
      ],
      referenceTrainers: [
        {
          sourceId: 500,
          name: "Trainer",
          referenceLabel: "Wowhead Forever professions · Source-reported relationship",
        },
      ],
    };
    getRecipeDetail.mockResolvedValue(recipe);
    const html = renderToStaticMarkup(
      await CatalogRecipePage({
        params: Promise.resolve({ spellId: "100" }),
        config: FOREVER_CATALOG_PAGE_CONFIG,
      }),
    );
    expect(html).toContain("Name-matched teaching item");
    expect(html).toContain("Referenced trainers");
    expect(html).toContain("/forever/encyclopedia/npcs/500");
    expect(html).not.toContain("observed trainer UI");
    expect(html).toContain("do not guarantee current realm availability");
  });
});
