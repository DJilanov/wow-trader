export const raidMaterialIds = [
  15410, 17010, 17011, 17012, 17203, 18562, 19726, 19767, 19768, 22682,
];

export function auditCraftInputs(catalogItems, inputs, knownRecipeIds) {
  const raidMaterials = new Set(raidMaterialIds);
  const reagents = new Map();
  for (const input of inputs) {
    if (
      !Number.isInteger(input.recipeSpellId) ||
      !Number.isInteger(input.reagentItemId) ||
      !(input.quantity > 0)
    )
      throw new Error("Invalid recipe reagent evidence");
    const list = reagents.get(input.recipeSpellId) ?? [];
    list.push(input.reagentItemId);
    reagents.set(input.recipeSpellId, list);
  }
  return catalogItems.flatMap((item) => {
    const crafted = item.sources.filter((source) => source.kind === "crafted");
    if (!crafted.length) return [];
    const recipes = crafted.map((source) => {
      const ids = reagents.get(source.spellId);
      if (!knownRecipeIds.has(source.spellId) || !ids?.length)
        return { spellId: source.spellId, status: "unresolved" };
      const blocked = ids.filter((id) => raidMaterials.has(id) || id === 17771);
      return {
        spellId: source.spellId,
        status: blocked.length ? "raid-dependent" : "recipe-inputs-reviewed",
        raidMaterialIds: blocked,
      };
    });
    const available = recipes.some((recipe) => recipe.status === "recipe-inputs-reviewed");
    return [
      {
        id: item.id,
        name: item.name,
        status: available
          ? "recipe-inputs-reviewed"
          : recipes.some((recipe) => recipe.status === "unresolved")
            ? "unresolved"
            : "raid-dependent",
        recipes,
      },
    ];
  });
}
