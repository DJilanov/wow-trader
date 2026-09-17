import { describe, expect, it } from "vitest";

import {
  applySpecialization,
  getCraftingSpecializationProfiles,
  getProfessionSpecializationOptions,
  isRecipeAvailableWithSpecialization,
  parseProfessionSpecialization,
  resolveSpecialization,
  type ProfessionSpecializationSlug,
} from "./specializations.js";
import type { WorkspaceRecipeCandidate } from "./workspace.js";

describe("profession specializations", () => {
  it("exposes the three extracted TBC Alchemy masteries only for the matching build", () => {
    expect(
      getProfessionSpecializationOptions("wow_anniversary", 69_795, "alchemy").map(
        (option) => option.slug,
      ),
    ).toEqual(["none", "all", "transmutation-master", "potion-master", "elixir-master"]);
    expect(getProfessionSpecializationOptions("wow_anniversary", 69_796, "alchemy")).toHaveLength(
      1,
    );
  });

  it("classifies potions, elixirs, flasks, and transmutes without applying another mastery", () => {
    expect(resolve("potion-master", candidate({ subclassId: 1 }))?.spellId).toBe(28_675);
    expect(resolve("elixir-master", candidate({ subclassId: 2 }))?.spellId).toBe(28_677);
    expect(resolve("elixir-master", candidate({ subclassId: 3 }))?.spellId).toBe(28_677);
    expect(
      resolve("transmutation-master", candidate({ outputKind: "conversion", subclassId: 0 }))
        ?.spellId,
    ).toBe(28_672);
    expect(resolve("potion-master", candidate({ subclassId: 3 }))).toBeNull();
  });

  it("applies the visible provisional expected-output multiplier without changing inputs", () => {
    const value = candidate({ subclassId: 1 });
    const specialization = resolve("potion-master", value);
    const adjusted = applySpecialization(value, specialization);

    expect(adjusted.outputs[0]?.expectedQuantity).toEqual({ numerator: 6n, denominator: 5n });
    expect(adjusted.inputs).toBe(value.inputs);
    expect(specialization?.modelVersion).toBe("tbc-alchemy-mastery-provisional-v1");
  });

  it("falls back safely for unknown URL values", () => {
    expect(parseProfessionSpecialization("made-up")).toBe("none");
    expect(parseProfessionSpecialization("goblin-engineer", "alchemy")).toBe("none");
  });

  it("changes profile choices with the selected profession", () => {
    const [profile] = getCraftingSpecializationProfiles(
      "wow_anniversary",
      69_795,
      { engineering: "goblin-engineer" },
      "engineering",
    );

    expect(profile?.professionName).toBe("Engineering");
    expect(profile?.selected).toBe("goblin-engineer");
    expect(profile?.options.map((option) => option.slug)).toEqual([
      "none",
      "all",
      "gnomish-engineer",
      "goblin-engineer",
    ]);
    expect(profile?.options.find((option) => option.slug === "goblin-engineer")?.spellId).toBe(
      20_221,
    );
  });

  it("locks specialist recipes unless the matching character profile can craft them", () => {
    const goblinRecipe = candidate({
      recipeSpellId: 30_560,
      professionSlug: "engineering",
      subclassId: 0,
    });

    expect(
      isRecipeAvailableWithSpecialization(
        "wow_anniversary",
        69_795,
        { engineering: "gnomish-engineer" },
        goblinRecipe,
      ),
    ).toBe(false);
    expect(
      isRecipeAvailableWithSpecialization(
        "wow_anniversary",
        69_795,
        { engineering: "goblin-engineer" },
        goblinRecipe,
      ),
    ).toBe(true);
  });

  it("applies the guaranteed double yield to the matching tailoring cooldown", () => {
    const value = candidate({
      recipeSpellId: 26_751,
      professionSlug: "tailoring",
      subclassId: 0,
    });
    const specialization = resolveSpecialization(
      "wow_anniversary",
      69_795,
      { tailoring: "mooncloth-tailor" },
      value,
    );
    const adjusted = applySpecialization(value, specialization);

    expect(adjusted.outputs[0]?.expectedQuantity).toEqual({ numerator: 2n, denominator: 1n });
    expect(adjusted.outputs[0]?.minimumQuantity).toBe(2);
    expect(specialization?.modelVersion).toBe("tbc-tailoring-specialization-yield-v1");
  });

  it("allows all branches to resolve the specialist required by each recipe", () => {
    const spellfireRobe = candidate({
      recipeSpellId: 26_754,
      professionSlug: "tailoring",
      subclassId: 0,
    });

    expect(
      isRecipeAvailableWithSpecialization(
        "wow_anniversary",
        69_795,
        { tailoring: "all" },
        spellfireRobe,
      ),
    ).toBe(true);
    expect(
      resolveSpecialization("wow_anniversary", 69_795, { tailoring: "all" }, spellfireRobe)?.slug,
    ).toBe("spellfire-tailor");
  });
});

function resolve(
  slug: ProfessionSpecializationSlug,
  value: WorkspaceRecipeCandidate,
): ReturnType<typeof resolveSpecialization> {
  return resolveSpecialization("wow_anniversary", 69_795, { alchemy: slug }, value);
}

function candidate(values: {
  readonly recipeSpellId?: number;
  readonly professionSlug?: string;
  readonly subclassId: number;
  readonly outputKind?: WorkspaceRecipeCandidate["outputKind"];
}): WorkspaceRecipeCandidate {
  return {
    recipeSpellId: values.recipeSpellId ?? 1,
    recipeName: "Test Recipe",
    professionName: values.professionSlug ?? "Alchemy",
    professionSlug: values.professionSlug ?? "alchemy",
    requiredSkillRank: 375,
    cooldownMs: 0,
    categoryCooldownMs: 0,
    outputKind: values.outputKind ?? "item",
    inputs: [
      {
        itemId: 10,
        name: "Reagent",
        quantity: 1,
        iconFileDataId: 100,
        quality: 1,
        priceLevels: [{ unitPriceCopper: 100n, quantity: 1 }],
      },
    ],
    outputs: [
      {
        itemId: 20,
        name: "Result",
        classId: 0,
        subclassId: values.subclassId,
        quality: 1,
        itemLevel: 1,
        iconFileDataId: 200,
        minimumQuantity: 1,
        maximumQuantity: 1,
        expectedQuantity: { numerator: 1n, denominator: 1n },
        vendorSellPriceCopper: 1_000n,
        priceLevels: [{ unitPriceCopper: 1_000n, quantity: 3, listingCount: 3 }],
        disenchant: null,
      },
    ],
  };
}
