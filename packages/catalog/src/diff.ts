import { canonicalJson, type CatalogBundle, type JsonValue } from "@wow-trader/contracts";

export interface EntityDiff {
  readonly added: readonly number[];
  readonly removed: readonly number[];
  readonly changed: readonly number[];
}

export interface CatalogDiff {
  readonly fromBuild: number;
  readonly toBuild: number;
  readonly items: EntityDiff;
  readonly spells: EntityDiff;
  readonly professions: EntityDiff;
  readonly recipes: EntityDiff;
  readonly transformations: EntityDiff;
}

export function diffCatalogs(from: CatalogBundle, to: CatalogBundle): CatalogDiff {
  return {
    fromBuild: from.manifest.buildNumber,
    toBuild: to.manifest.buildNumber,
    items: diffRecords(from.items, to.items, (record) => record.itemId),
    spells: diffRecords(from.spells, to.spells, (record) => record.spellId),
    professions: diffRecords(from.professions, to.professions, (record) => record.skillLineId),
    recipes: diffRecipeTopology(from, to),
    transformations: diffTransformationTopology(from, to),
  };
}

function diffTransformationTopology(from: CatalogBundle, to: CatalogBundle): EntityDiff {
  const topology = (bundle: CatalogBundle) =>
    bundle.transformations.map((transformation) => ({
      ...transformation,
      inputs: bundle.transformationInputs.filter(
        (input) => input.transformationId === transformation.transformationId,
      ),
      outputs: bundle.transformationOutputs.filter(
        (output) => output.transformationId === transformation.transformationId,
      ),
    }));
  return diffRecords(topology(from), topology(to), (record) => record.transformationId);
}

function diffRecipeTopology(from: CatalogBundle, to: CatalogBundle): EntityDiff {
  const fromTopology = from.recipes.map((recipe) => ({
    ...recipe,
    inputs: from.recipeInputs.filter((input) => input.recipeSpellId === recipe.recipeSpellId),
    outputs: from.recipeOutputs.filter((output) => output.recipeSpellId === recipe.recipeSpellId),
    teachingItems: from.recipeTeachingItems.filter(
      (item) => item.recipeSpellId === recipe.recipeSpellId,
    ),
  }));
  const toTopology = to.recipes.map((recipe) => ({
    ...recipe,
    inputs: to.recipeInputs.filter((input) => input.recipeSpellId === recipe.recipeSpellId),
    outputs: to.recipeOutputs.filter((output) => output.recipeSpellId === recipe.recipeSpellId),
    teachingItems: to.recipeTeachingItems.filter(
      (item) => item.recipeSpellId === recipe.recipeSpellId,
    ),
  }));

  return diffRecords(fromTopology, toTopology, (record) => record.recipeSpellId);
}

function diffRecords<T>(
  from: readonly T[],
  to: readonly T[],
  selectId: (record: T) => number,
): EntityDiff {
  const fromById = new Map(from.map((record) => [selectId(record), record]));
  const toById = new Map(to.map((record) => [selectId(record), record]));
  const added = [...toById.keys()].filter((id) => !fromById.has(id)).sort(numericSort);
  const removed = [...fromById.keys()].filter((id) => !toById.has(id)).sort(numericSort);
  const changed = [...toById.entries()]
    .filter(([id, record]) => {
      const previous = fromById.get(id);
      return previous !== undefined && serialize(previous) !== serialize(record);
    })
    .map(([id]) => id)
    .sort(numericSort);

  return { added, removed, changed };
}

function serialize(value: unknown): string {
  return canonicalJson(value as JsonValue);
}

function numericSort(left: number, right: number): number {
  return left - right;
}
