import { canonicalJson, type CatalogBundle, type JsonValue } from "@wow-trader/contracts";

export type SemanticChangeKind = "added" | "removed" | "changed";
export type SemanticChangeImpact =
  "identity" | "equipment" | "economy" | "availability" | "evidence";

export interface SemanticFieldChange {
  readonly field: string;
  readonly before: JsonValue | null;
  readonly after: JsonValue | null;
  readonly impact: SemanticChangeImpact;
}

export interface SemanticEntityChange {
  readonly id: number;
  readonly name: string;
  readonly kind: SemanticChangeKind;
  readonly fields: readonly SemanticFieldChange[];
}

export interface SemanticCatalogDiff {
  readonly fromBuild: number;
  readonly toBuild: number;
  readonly items: readonly SemanticEntityChange[];
  readonly recipes: readonly SemanticEntityChange[];
  readonly professions: readonly SemanticEntityChange[];
  readonly summary: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly economyChanges: number;
  };
}

interface SemanticRecord {
  readonly id: number;
  readonly name: string;
  readonly value: Readonly<Record<string, JsonValue>>;
}

export function createSemanticCatalogDiff(
  from: CatalogBundle,
  to: CatalogBundle,
): SemanticCatalogDiff {
  const items = diffSemanticRecords(itemRecords(from), itemRecords(to), itemImpact);
  const recipes = diffSemanticRecords(recipeRecords(from), recipeRecords(to), () => "economy");
  const professions = diffSemanticRecords(
    professionRecords(from),
    professionRecords(to),
    (field) => (field === "name" || field === "slug" ? "identity" : "availability"),
  );
  const changes = [...items, ...recipes, ...professions];
  return {
    fromBuild: from.manifest.buildNumber,
    toBuild: to.manifest.buildNumber,
    items,
    recipes,
    professions,
    summary: {
      added: changes.filter((change) => change.kind === "added").length,
      removed: changes.filter((change) => change.kind === "removed").length,
      changed: changes.filter((change) => change.kind === "changed").length,
      economyChanges:
        recipes.length +
        items.filter((change) => change.fields.some((field) => field.impact === "economy")).length,
    },
  };
}

function itemRecords(bundle: CatalogBundle): readonly SemanticRecord[] {
  return bundle.items.map((item) => {
    const { rawRecord, ...facts } = item;
    void rawRecord;
    return {
      id: item.itemId,
      name: item.name,
      value: {
        ...facts,
        stats: sorted(bundle.itemStats.filter((row) => row.itemId === item.itemId)),
        damages: sorted(bundle.itemDamages.filter((row) => row.itemId === item.itemId)),
        resistances: sorted(bundle.itemResistances.filter((row) => row.itemId === item.itemId)),
        sockets: sorted(bundle.itemSockets.filter((row) => row.itemId === item.itemId)),
        effects: sorted(bundle.itemEffects.filter((row) => row.itemId === item.itemId)),
      } as Readonly<Record<string, JsonValue>>,
    };
  });
}

function recipeRecords(bundle: CatalogBundle): readonly SemanticRecord[] {
  const spellNames = new Map(bundle.spells.map((spell) => [spell.spellId, spell.name]));
  return bundle.recipes.map((recipe) => {
    const { rawRecord, ...facts } = recipe;
    void rawRecord;
    return {
      id: recipe.recipeSpellId,
      name: spellNames.get(recipe.recipeSpellId) ?? `Recipe ${recipe.recipeSpellId}`,
      value: {
        ...facts,
        inputs: sorted(
          bundle.recipeInputs.filter((row) => row.recipeSpellId === recipe.recipeSpellId),
        ),
        outputs: sorted(
          bundle.recipeOutputs.filter((row) => row.recipeSpellId === recipe.recipeSpellId),
        ),
        teachingItems: sorted(
          bundle.recipeTeachingItems.filter((row) => row.recipeSpellId === recipe.recipeSpellId),
        ),
      } as Readonly<Record<string, JsonValue>>,
    };
  });
}

function professionRecords(bundle: CatalogBundle): readonly SemanticRecord[] {
  return bundle.professions.map((profession) => ({
    id: profession.skillLineId,
    name: profession.name,
    value: {
      skillLineId: profession.skillLineId,
      name: profession.name,
      slug: profession.slug,
      recipeIds: bundle.recipes
        .filter((recipe) => recipe.professionSkillLineId === profession.skillLineId)
        .map((recipe) => recipe.recipeSpellId)
        .sort(numericSort),
    },
  }));
}

function diffSemanticRecords(
  from: readonly SemanticRecord[],
  to: readonly SemanticRecord[],
  impactForField: (field: string) => SemanticChangeImpact,
): readonly SemanticEntityChange[] {
  const fromById = new Map(from.map((record) => [record.id, record]));
  const toById = new Map(to.map((record) => [record.id, record]));
  const ids = [...new Set([...fromById.keys(), ...toById.keys()])].sort(numericSort);
  const changes: SemanticEntityChange[] = [];
  for (const id of ids) {
    const previous = fromById.get(id);
    const current = toById.get(id);
    if (!previous && current) {
      changes.push({ id, name: current.name, kind: "added", fields: [] });
      continue;
    }
    if (previous && !current) {
      changes.push({ id, name: previous.name, kind: "removed", fields: [] });
      continue;
    }
    if (!previous || !current) continue;
    const fields = changedFields(previous.value, current.value, impactForField);
    if (fields.length) changes.push({ id, name: current.name, kind: "changed", fields });
  }
  return changes;
}

function changedFields(
  before: Readonly<Record<string, JsonValue>>,
  after: Readonly<Record<string, JsonValue>>,
  impactForField: (field: string) => SemanticChangeImpact,
): readonly SemanticFieldChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((field) => {
    const previous = before[field] ?? null;
    const current = after[field] ?? null;
    return canonicalJson(previous) === canonicalJson(current)
      ? []
      : [{ field, before: previous, after: current, impact: impactForField(field) }];
  });
}

function itemImpact(field: string): SemanticChangeImpact {
  if (["name", "description", "classId", "subclassId"].includes(field)) return "identity";
  if (["buyPriceCopper", "sellPriceCopper", "stackSize"].includes(field)) return "economy";
  if (
    [
      "requiredLevel",
      "requiredSkillId",
      "requiredSkillRank",
      "allowableClassMask",
      "allowableRaceMask",
    ].includes(field)
  ) {
    return "availability";
  }
  if (field === "iconFileDataId") return "evidence";
  return "equipment";
}

function sorted<T>(rows: readonly T[]): JsonValue {
  return [...rows]
    .sort((left, right) =>
      canonicalJson(left as JsonValue).localeCompare(canonicalJson(right as JsonValue)),
    )
    .map((row) => row as JsonValue);
}

function numericSort(left: number, right: number): number {
  return left - right;
}
