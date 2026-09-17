import type { CatalogBundle } from "@wow-trader/contracts";

export type ValidationSeverity = "error" | "warning";

export interface CatalogValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly entityId?: number;
}

export interface CatalogValidationReport {
  readonly valid: boolean;
  readonly counts: {
    readonly items: number;
    readonly spells: number;
    readonly itemStats: number;
    readonly itemDamages: number;
    readonly itemResistances: number;
    readonly itemSockets: number;
    readonly itemEffects: number;
    readonly itemSets: number;
    readonly itemSetMembers: number;
    readonly itemSetEffects: number;
    readonly professions: number;
    readonly recipes: number;
    readonly recipeInputs: number;
    readonly recipeOutputs: number;
    readonly recipeTeachingItems: number;
    readonly transformations: number;
    readonly transformationInputs: number;
    readonly transformationOutputs: number;
  };
  readonly issues: readonly CatalogValidationIssue[];
}

export interface ValidateCatalogOptions {
  readonly requireTbcGoldenRecipe?: boolean;
}

export function validateCatalog(
  bundle: CatalogBundle,
  options: ValidateCatalogOptions = {},
): CatalogValidationReport {
  const issues: CatalogValidationIssue[] = [];
  const itemIds = uniqueIds(bundle.items, (item) => item.itemId, "item", issues);
  const spellIds = uniqueIds(bundle.spells, (spell) => spell.spellId, "spell", issues);
  const professionIds = uniqueIds(
    bundle.professions,
    (profession) => profession.skillLineId,
    "profession",
    issues,
  );
  const recipeIds = uniqueIds(bundle.recipes, (recipe) => recipe.recipeSpellId, "recipe", issues);
  const transformationIds = uniqueIds(
    bundle.transformations,
    (transformation) => transformation.transformationId,
    "transformation",
    issues,
  );
  const itemSetIds = uniqueIds(bundle.itemSets, (itemSet) => itemSet.itemSetId, "item_set", issues);

  for (const row of [
    ...bundle.itemStats,
    ...bundle.itemDamages,
    ...bundle.itemResistances,
    ...bundle.itemSockets,
  ]) {
    requireReference(itemIds, row.itemId, "item_fact_item_missing", issues);
  }
  for (const effect of bundle.itemEffects) {
    requireReference(
      itemIds,
      effect.itemId,
      "item_effect_item_missing",
      issues,
      effect.itemEffectId,
    );
    requireReference(
      spellIds,
      effect.spellId,
      "item_effect_spell_missing",
      issues,
      effect.itemEffectId,
    );
  }
  for (const member of bundle.itemSetMembers) {
    requireReference(
      itemSetIds,
      member.itemSetId,
      "item_set_member_set_missing",
      issues,
      member.itemId,
    );
    requireReference(itemIds, member.itemId, "item_set_member_item_missing", issues);
  }
  for (const effect of bundle.itemSetEffects) {
    requireReference(
      itemSetIds,
      effect.itemSetId,
      "item_set_effect_set_missing",
      issues,
      effect.itemSetEffectId,
    );
    requireReference(
      spellIds,
      effect.spellId,
      "item_set_effect_spell_missing",
      issues,
      effect.itemSetEffectId,
    );
  }

  for (const recipe of bundle.recipes) {
    requireReference(spellIds, recipe.recipeSpellId, "recipe_spell_missing", issues);
    requireReference(
      professionIds,
      recipe.professionSkillLineId,
      "recipe_profession_missing",
      issues,
      recipe.recipeSpellId,
    );
  }

  for (const input of bundle.recipeInputs) {
    requireReference(recipeIds, input.recipeSpellId, "input_recipe_missing", issues);
    requireReference(
      itemIds,
      input.reagentItemId,
      "input_item_missing",
      issues,
      input.recipeSpellId,
    );
  }

  for (const output of bundle.recipeOutputs) {
    requireReference(recipeIds, output.recipeSpellId, "output_recipe_missing", issues);
    if (output.outputItemId !== null) {
      requireReference(
        itemIds,
        output.outputItemId,
        "output_item_missing",
        issues,
        output.recipeSpellId,
      );
    }
  }

  for (const teachingItem of bundle.recipeTeachingItems) {
    requireReference(recipeIds, teachingItem.recipeSpellId, "teaching_recipe_missing", issues);
    requireReference(
      itemIds,
      teachingItem.teachingItemId,
      "teaching_item_missing",
      issues,
      teachingItem.recipeSpellId,
    );
    if (teachingItem.learningSpellId !== null) {
      requireReference(
        spellIds,
        teachingItem.learningSpellId,
        "learning_spell_missing",
        issues,
        teachingItem.recipeSpellId,
      );
    }
  }

  for (const transformation of bundle.transformations) {
    requireReference(
      spellIds,
      transformation.spellId,
      "transformation_spell_missing",
      issues,
      transformation.transformationId,
    );
    requireReference(
      itemIds,
      transformation.sourceItemId,
      "transformation_source_item_missing",
      issues,
      transformation.transformationId,
    );
  }
  for (const input of bundle.transformationInputs) {
    requireReference(
      transformationIds,
      input.transformationId,
      "transformation_input_parent_missing",
      issues,
      input.transformationId,
    );
    requireReference(
      itemIds,
      input.itemId,
      "transformation_input_item_missing",
      issues,
      input.transformationId,
    );
  }
  for (const output of bundle.transformationOutputs) {
    requireReference(
      transformationIds,
      output.transformationId,
      "transformation_output_parent_missing",
      issues,
      output.transformationId,
    );
    requireReference(
      itemIds,
      output.itemId,
      "transformation_output_item_missing",
      issues,
      output.transformationId,
    );
  }

  for (const recipeId of recipeIds) {
    if (!bundle.recipeOutputs.some((output) => output.recipeSpellId === recipeId)) {
      issues.push({
        severity: "warning",
        code: "recipe_without_output",
        message: `Recipe spell ${recipeId} has no normalized output`,
        entityId: recipeId,
      });
    }
  }

  if (options.requireTbcGoldenRecipe) {
    validateTbcGoldenRecipe(bundle, issues);
    validateTbcGoldenItem(bundle, issues);
    validateTbcGoldenTransformation(bundle, issues);
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    counts: {
      items: bundle.items.length,
      spells: bundle.spells.length,
      itemStats: bundle.itemStats.length,
      itemDamages: bundle.itemDamages.length,
      itemResistances: bundle.itemResistances.length,
      itemSockets: bundle.itemSockets.length,
      itemEffects: bundle.itemEffects.length,
      itemSets: bundle.itemSets.length,
      itemSetMembers: bundle.itemSetMembers.length,
      itemSetEffects: bundle.itemSetEffects.length,
      professions: bundle.professions.length,
      recipes: bundle.recipes.length,
      recipeInputs: bundle.recipeInputs.length,
      recipeOutputs: bundle.recipeOutputs.length,
      recipeTeachingItems: bundle.recipeTeachingItems.length,
      transformations: bundle.transformations.length,
      transformationInputs: bundle.transformationInputs.length,
      transformationOutputs: bundle.transformationOutputs.length,
    },
    issues,
  };
}

function validateTbcGoldenTransformation(
  bundle: CatalogBundle,
  issues: CatalogValidationIssue[],
): void {
  const transformation = bundle.transformations.find(
    (candidate) => candidate.spellId === 28_100 && candidate.sourceItemId === 22_572,
  );
  const checks = [
    {
      passed: transformation !== undefined,
      code: "golden_transformation_missing",
      message: "Mote of Air item-use transformation spell 28100 is missing",
    },
    {
      passed:
        transformation !== undefined &&
        bundle.transformationInputs.some(
          (input) =>
            input.transformationId === transformation.transformationId &&
            input.itemId === 22_572 &&
            input.quantity === 10,
        ),
      code: "golden_transformation_input_missing",
      message: "Create Primal Air must consume ten Motes of Air including the triggering item",
    },
    {
      passed:
        transformation !== undefined &&
        bundle.transformationOutputs.some(
          (output) =>
            output.transformationId === transformation.transformationId &&
            output.itemId === 22_451 &&
            output.minimumQuantity === 1 &&
            output.maximumQuantity === 1,
        ),
      code: "golden_transformation_output_missing",
      message: "Create Primal Air must produce one Primal Air",
    },
  ];
  for (const check of checks) {
    if (!check.passed) {
      issues.push({
        severity: "error",
        code: check.code,
        message: check.message,
        entityId: transformation?.transformationId ?? 28_100,
      });
    }
  }
}

function validateTbcGoldenItem(bundle: CatalogBundle, issues: CatalogValidationIssue[]): void {
  const itemId = 32_837;
  const item = bundle.items.find((row) => row.itemId === itemId);
  const checks = [
    {
      passed: item !== undefined,
      code: "golden_item_missing",
      message: "Warglaive item 32837 is missing",
    },
    {
      passed: item?.quality === 5 && item.itemLevel === 156 && item.requiredLevel === 70,
      code: "golden_item_identity_mismatch",
      message: "Warglaive 32837 does not have the expected quality and level facts",
    },
    {
      passed: item?.delayMs === 2_800 && item.maxDurability === 125 && item.itemSetId === 699,
      code: "golden_item_equipment_mismatch",
      message: "Warglaive 32837 does not have the expected weapon and set facts",
    },
    {
      passed: bundle.itemStats.filter((row) => row.itemId === itemId).length === 3,
      code: "golden_item_stats_missing",
      message: "Warglaive 32837 does not have its three client stat rows",
    },
    {
      passed: bundle.itemDamages.some(
        (row) => row.itemId === itemId && row.minimum === 214 && row.maximum === 398,
      ),
      code: "golden_item_damage_missing",
      message: "Warglaive 32837 does not have its 214-398 damage row",
    },
    {
      passed: bundle.itemEffects.some((row) => row.itemId === itemId && row.spellId === 15_810),
      code: "golden_item_effect_missing",
      message: "Warglaive 32837 is not linked to item spell 15810",
    },
  ];

  for (const check of checks) {
    if (!check.passed) {
      issues.push({
        severity: "error",
        code: check.code,
        message: check.message,
        entityId: itemId,
      });
    }
  }
}

function validateTbcGoldenRecipe(bundle: CatalogBundle, issues: CatalogValidationIssue[]): void {
  const recipeId = 17_563;
  const checks = [
    {
      passed: bundle.recipes.some((recipe) => recipe.recipeSpellId === recipeId),
      code: "golden_recipe_missing",
      message: "TBC golden recipe spell 17563 is missing",
    },
    {
      passed: bundle.recipeInputs.some(
        (input) => input.recipeSpellId === recipeId && input.reagentItemId === 12_808,
      ),
      code: "golden_input_missing",
      message: "TBC golden recipe 17563 does not consume item 12808",
    },
    {
      passed: bundle.recipeOutputs.some(
        (output) => output.recipeSpellId === recipeId && output.outputItemId === 7_080,
      ),
      code: "golden_output_missing",
      message: "TBC golden recipe 17563 does not produce item 7080",
    },
    {
      passed: bundle.recipeTeachingItems.some(
        (item) => item.recipeSpellId === recipeId && item.teachingItemId === 13_486,
      ),
      code: "golden_teaching_item_missing",
      message: "TBC golden recipe 17563 is not linked to teaching item 13486",
    },
  ];

  for (const check of checks) {
    if (!check.passed) {
      issues.push({
        severity: "error",
        code: check.code,
        message: check.message,
        entityId: recipeId,
      });
    }
  }
}

function uniqueIds<T>(
  records: readonly T[],
  selectId: (record: T) => number,
  kind: string,
  issues: CatalogValidationIssue[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const record of records) {
    const id = selectId(record);
    if (ids.has(id)) {
      issues.push({
        severity: "error",
        code: `duplicate_${kind}_id`,
        message: `Duplicate ${kind} ID ${id}`,
        entityId: id,
      });
    }
    ids.add(id);
  }
  return ids;
}

function requireReference(
  ids: ReadonlySet<number>,
  targetId: number,
  code: string,
  issues: CatalogValidationIssue[],
  ownerId = targetId,
): void {
  if (!ids.has(targetId)) {
    issues.push({
      severity: "error",
      code,
      message: `Entity ${ownerId} references missing ID ${targetId}`,
      entityId: ownerId,
    });
  }
}
