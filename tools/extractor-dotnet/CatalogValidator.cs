namespace WowTrader.Extractor;

internal static class CatalogValidator
{
  public static ValidationReport Validate(
      BuildMetadata build,
      string hotfixStatus,
      IReadOnlyDictionary<string, Db2TableSnapshot> tables,
      NormalizedCatalog catalog,
      bool requireTbcGoldenRecipe)
  {
    var issues = new List<ValidationIssue>();
    var itemIds = UniqueIds(catalog.Items.Select(item => item.ItemId), "item", issues);
    var spellIds = UniqueIds(catalog.Spells.Select(spell => spell.SpellId), "spell", issues);
    var professionIds = UniqueIds(
        catalog.Professions.Select(profession => profession.SkillLineId),
        "profession",
        issues);
    var recipeIds = UniqueIds(catalog.Recipes.Select(recipe => recipe.RecipeSpellId), "recipe", issues);
    var transformationIds = UniqueIds(
        catalog.Transformations.Select(transformation => transformation.TransformationId),
        "transformation",
        issues);
    var itemSetIds = UniqueIds(catalog.ItemSets.Select(itemSet => itemSet.ItemSetId), "item_set", issues);

    foreach (var row in catalog.ItemStats)
    {
      Require(itemIds, row.ItemId, "item_stat_item_missing", row.ItemId, issues);
    }
    foreach (var row in catalog.ItemDamages)
    {
      Require(itemIds, row.ItemId, "item_damage_item_missing", row.ItemId, issues);
    }
    foreach (var row in catalog.ItemResistances)
    {
      Require(itemIds, row.ItemId, "item_resistance_item_missing", row.ItemId, issues);
    }
    foreach (var row in catalog.ItemSockets)
    {
      Require(itemIds, row.ItemId, "item_socket_item_missing", row.ItemId, issues);
    }
    foreach (var row in catalog.ItemEffects)
    {
      Require(itemIds, row.ItemId, "item_effect_item_missing", row.ItemEffectId, issues);
      Require(spellIds, row.SpellId, "item_effect_spell_missing", row.ItemEffectId, issues);
    }
    foreach (var row in catalog.ItemSetMembers)
    {
      Require(itemSetIds, row.ItemSetId, "item_set_member_set_missing", row.ItemId, issues);
      Require(itemIds, row.ItemId, "item_set_member_item_missing", row.ItemId, issues);
    }
    foreach (var row in catalog.ItemSetEffects)
    {
      Require(itemSetIds, row.ItemSetId, "item_set_effect_set_missing", row.ItemSetEffectId, issues);
      Require(spellIds, row.SpellId, "item_set_effect_spell_missing", row.ItemSetEffectId, issues);
    }

    foreach (var recipe in catalog.Recipes)
    {
      Require(spellIds, recipe.RecipeSpellId, "recipe_spell_missing", recipe.RecipeSpellId, issues);
      Require(
          professionIds,
          recipe.ProfessionSkillLineId,
          "recipe_profession_missing",
          recipe.RecipeSpellId,
          issues);
    }
    foreach (var input in catalog.RecipeInputs)
    {
      Require(recipeIds, input.RecipeSpellId, "input_recipe_missing", input.RecipeSpellId, issues);
      Require(itemIds, input.ReagentItemId, "input_item_missing", input.RecipeSpellId, issues);
    }
    foreach (var output in catalog.RecipeOutputs)
    {
      Require(recipeIds, output.RecipeSpellId, "output_recipe_missing", output.RecipeSpellId, issues);
      if (output.OutputItemId is int itemId)
      {
        Require(itemIds, itemId, "output_item_missing", output.RecipeSpellId, issues);
      }
    }
    foreach (var item in catalog.RecipeTeachingItems)
    {
      Require(recipeIds, item.RecipeSpellId, "teaching_recipe_missing", item.RecipeSpellId, issues);
      Require(itemIds, item.TeachingItemId, "teaching_item_missing", item.RecipeSpellId, issues);
      if (item.LearningSpellId is int learningSpellId)
      {
        Require(spellIds, learningSpellId, "learning_spell_missing", item.RecipeSpellId, issues);
      }
    }
    foreach (var transformation in catalog.Transformations)
    {
      Require(
          spellIds,
          transformation.SpellId,
          "transformation_spell_missing",
          transformation.TransformationId,
          issues);
      Require(
          itemIds,
          transformation.SourceItemId,
          "transformation_source_item_missing",
          transformation.TransformationId,
          issues);
    }
    foreach (var input in catalog.TransformationInputs)
    {
      Require(
          transformationIds,
          input.TransformationId,
          "transformation_input_parent_missing",
          input.TransformationId,
          issues);
      Require(
          itemIds,
          input.ItemId,
          "transformation_input_item_missing",
          input.TransformationId,
          issues);
    }
    foreach (var output in catalog.TransformationOutputs)
    {
      Require(
          transformationIds,
          output.TransformationId,
          "transformation_output_parent_missing",
          output.TransformationId,
          issues);
      Require(
          itemIds,
          output.ItemId,
          "transformation_output_item_missing",
          output.TransformationId,
          issues);
    }

    if (catalog.Recipes.Count == 0)
    {
      issues.Add(new ValidationIssue("error", "no_recipes", "No profession recipes were discovered"));
    }
    var ambiguousRecipes = catalog.Recipes.Count(recipe => recipe.ExtractionStatus == "ambiguous");
    if (ambiguousRecipes > 0)
    {
      issues.Add(new ValidationIssue(
          "warning",
          "ambiguous_recipes",
          $"{ambiguousRecipes} recipes contain unresolved client relationships; inspect their raw records"));
    }
    if (string.Equals(hotfixStatus, "missing", StringComparison.Ordinal))
    {
      issues.Add(new ValidationIssue(
          "warning",
          "hotfix_cache_missing",
          "No matching DBCache.bin was found; this snapshot must not be auto-published"));
    }
    if (requireTbcGoldenRecipe)
    {
      ValidateTbcGoldenRecipe(catalog, issues);
      ValidateTbcGoldenItem(catalog, issues);
      ValidateTbcGoldenTransformation(catalog, issues);
    }

    var encryptedSections = tables.Values.Sum(table => table.EncryptedSectionCount);
    var encryptedRecords = tables.Values.Sum(table => table.EncryptedRecordCount);
    if (encryptedRecords > 0)
    {
      issues.Add(new ValidationIssue(
          "warning",
          "encrypted_records",
          $"The client root reports {encryptedRecords} encrypted DB2 records across {encryptedSections} sections"));
    }

    return new ValidationReport(
        issues.All(issue => issue.Severity != "error"),
        build,
        hotfixStatus,
        new ValidationCounts(
            catalog.Items.Count,
            catalog.Spells.Count,
            catalog.ItemStats.Count,
            catalog.ItemDamages.Count,
            catalog.ItemResistances.Count,
            catalog.ItemSockets.Count,
            catalog.ItemEffects.Count,
            catalog.ItemSets.Count,
            catalog.ItemSetMembers.Count,
            catalog.ItemSetEffects.Count,
            catalog.Professions.Count,
            catalog.Recipes.Count,
            catalog.RecipeInputs.Count,
            catalog.RecipeOutputs.Count,
            catalog.RecipeTeachingItems.Count,
            catalog.Transformations.Count,
            catalog.TransformationInputs.Count,
            catalog.TransformationOutputs.Count,
            tables.ToDictionary(pair => pair.Key, pair => pair.Value.EffectiveRows.Count),
            encryptedSections,
            encryptedRecords),
        issues);
  }

  private static void ValidateTbcGoldenTransformation(
      NormalizedCatalog catalog,
      ICollection<ValidationIssue> issues)
  {
    var transformation = catalog.Transformations.FirstOrDefault(candidate =>
        candidate.SpellId == 28_100 && candidate.SourceItemId == 22_572);
    AddGoldenIssue(
        transformation is not null,
        "golden_transformation_missing",
        "Mote of Air item-use transformation spell 28100 is missing",
        issues);
    if (transformation is null) return;

    AddGoldenIssue(
        catalog.TransformationInputs.Any(input =>
            input.TransformationId == transformation.TransformationId &&
            input.ItemId == 22_572 &&
            input.Quantity == 10),
        "golden_transformation_input_missing",
        "Create Primal Air must consume ten Motes of Air including the triggering item",
        issues);
    AddGoldenIssue(
        catalog.TransformationOutputs.Any(output =>
            output.TransformationId == transformation.TransformationId &&
            output.ItemId == 22_451 &&
            output.MinimumQuantity == 1 &&
            output.MaximumQuantity == 1),
        "golden_transformation_output_missing",
        "Create Primal Air must produce one Primal Air",
        issues);
  }

  private static void ValidateTbcGoldenRecipe(
      NormalizedCatalog catalog,
      ICollection<ValidationIssue> issues)
  {
    const int recipeId = 17_563;
    AddGoldenIssue(
        catalog.Recipes.Any(recipe => recipe.RecipeSpellId == recipeId),
        "golden_recipe_missing",
        "TBC golden recipe spell 17563 is missing",
        issues);
    AddGoldenIssue(
        catalog.RecipeInputs.Any(input =>
            input.RecipeSpellId == recipeId && input.ReagentItemId == 12_808),
        "golden_input_missing",
        "TBC recipe 17563 does not consume item 12808",
        issues);
    AddGoldenIssue(
        catalog.RecipeOutputs.Any(output =>
            output.RecipeSpellId == recipeId && output.OutputItemId == 7_080),
        "golden_output_missing",
        "TBC recipe 17563 does not produce item 7080",
        issues);
    AddGoldenIssue(
        catalog.RecipeTeachingItems.Any(item =>
            item.RecipeSpellId == recipeId && item.TeachingItemId == 13_486),
        "golden_teaching_item_missing",
        "TBC recipe 17563 is not linked to teaching item 13486",
        issues);
  }

  private static void ValidateTbcGoldenItem(
      NormalizedCatalog catalog,
      ICollection<ValidationIssue> issues)
  {
    const int itemId = 32_837;
    var item = catalog.Items.FirstOrDefault(row => row.ItemId == itemId);
    AddGoldenItemIssue(item is not null, "golden_item_missing", "Warglaive item 32837 is missing", issues);
    if (item is null) return;

    AddGoldenItemIssue(
        item.Quality == 5 && item.ItemLevel == 156 && item.RequiredLevel == 70,
        "golden_item_identity_mismatch",
        "Warglaive 32837 does not have the expected quality and level facts",
        issues);
    AddGoldenItemIssue(
        item.DelayMs == 2_800 && item.MaxDurability == 125 && item.ItemSetId == 699,
        "golden_item_equipment_mismatch",
        "Warglaive 32837 does not have the expected weapon and set facts",
        issues);
    AddGoldenItemIssue(
        catalog.ItemStats.Count(row => row.ItemId == itemId) == 3,
        "golden_item_stats_missing",
        "Warglaive 32837 does not have its three client stat rows",
        issues);
    AddGoldenItemIssue(
        catalog.ItemDamages.Any(row =>
            row.ItemId == itemId && row.Minimum == 214 && row.Maximum == 398),
        "golden_item_damage_missing",
        "Warglaive 32837 does not have its 214-398 damage row",
        issues);
    AddGoldenItemIssue(
        catalog.ItemEffects.Any(row => row.ItemId == itemId && row.SpellId == 15_810),
        "golden_item_effect_missing",
        "Warglaive 32837 is not linked to item spell 15810",
        issues);
  }

  private static void AddGoldenItemIssue(
      bool passed,
      string code,
      string message,
      ICollection<ValidationIssue> issues)
  {
    if (!passed) issues.Add(new ValidationIssue("error", code, message, 32_837));
  }

  private static void AddGoldenIssue(
      bool passed,
      string code,
      string message,
      ICollection<ValidationIssue> issues)
  {
    if (!passed) issues.Add(new ValidationIssue("error", code, message, 17_563));
  }

  private static HashSet<int> UniqueIds(
      IEnumerable<int> values,
      string kind,
      ICollection<ValidationIssue> issues)
  {
    var ids = new HashSet<int>();
    foreach (var id in values)
    {
      if (!ids.Add(id))
      {
        issues.Add(new ValidationIssue(
            "error",
            $"duplicate_{kind}_id",
            $"Duplicate {kind} ID {id}",
            id));
      }
    }
    return ids;
  }

  private static void Require(
      IReadOnlySet<int> ids,
      int targetId,
      string code,
      int ownerId,
      ICollection<ValidationIssue> issues)
  {
    if (!ids.Contains(targetId))
    {
      issues.Add(new ValidationIssue(
          "error",
          code,
          $"Entity {ownerId} references missing ID {targetId}",
          ownerId));
    }
  }
}
