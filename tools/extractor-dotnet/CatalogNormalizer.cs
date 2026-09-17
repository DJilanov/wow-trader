using System.Globalization;
using System.Text;

namespace WowTrader.Extractor;

internal sealed class CatalogNormalizer
{
  private const int ProfessionCategoryId = 11;
  private const int MaximumTriggerDepth = 8;

  private static readonly HashSet<int> KnownProfessionSkillLines =
  [
      129, // First Aid
        164, // Blacksmithing
        165, // Leatherworking
        171, // Alchemy
        182, // Herbalism
        185, // Cooking
        186, // Mining
        197, // Tailoring
        202, // Engineering
        333, // Enchanting
        356, // Fishing
        393, // Skinning
        755, // Jewelcrafting
    ];

  private readonly IReadOnlyDictionary<string, Db2TableSnapshot> tables;

  public CatalogNormalizer(IReadOnlyDictionary<string, Db2TableSnapshot> tables)
  {
    this.tables = tables;
  }

  public NormalizedCatalog Normalize()
  {
    var itemRows = Index("Item");
    var sparseRows = Index("ItemSparse");
    var searchNameRows = Index("ItemSearchName");
    var spellNameRows = Index("SpellName");
    var spellRows = Index("Spell");
    var skillLineRows = Index("SkillLine");
    var abilityRows = Rows("SkillLineAbility");
    var effectRows = Rows("SpellEffect");
    var reagentRows = Rows("SpellReagents");
    var learnRows = Rows("SpellLearnSpell");
    var itemEffectRows = Rows("ItemEffect");
    var cooldownRows = Rows("SpellCooldowns");
    var categoryRows = Rows("SpellCategories");
    var spellMiscRows = Rows("SpellMisc");
    var castTimeRows = Index("SpellCastTimes");
    var durationRows = Index("SpellDuration");
    var auraOptionRows = Rows("SpellAuraOptions");
    var descriptionVariableRows = Index("SpellDescriptionVariables");
    var spellDescriptionVariableRows = Rows("SpellXDescriptionVariables");

    var effectsBySpell = GroupByPositiveId(effectRows, "SpellID");
    var reagentsBySpell = GroupByPositiveId(reagentRows, "SpellID");
    var learnByRecipe = GroupByPositiveId(learnRows, "LearnSpellID");
    var itemEffectsBySpell = GroupByPositiveId(itemEffectRows, "SpellID");
    var cooldownsBySpell = GroupByPositiveId(cooldownRows, "SpellID");
    var categoriesBySpell = GroupByPositiveId(categoryRows, "SpellID");
    var miscBySpell = GroupByPositiveId(spellMiscRows, "SpellID");
    var auraOptionsBySpell = GroupByPositiveId(auraOptionRows, "SpellID");
    var descriptionVariablesBySpell = spellDescriptionVariableRows
        .Where(row => GetInt(row, "SpellID") > 0)
        .GroupBy(row => GetInt(row, "SpellID"))
        .ToDictionary(
            group => group.Key,
            group => group
                .Select(row => GetInt(row, "SpellDescriptionVariablesID"))
                .Where(id => id > 0)
                .Select(id => descriptionVariableRows.GetValueOrDefault(id))
                .Where(row => row is not null)
                .Select(row => row!)
                .ToArray());

    var professionSkillLines = skillLineRows
        .Where(pair => IsProfession(pair.Key, pair.Value))
        .ToDictionary(pair => pair.Key, pair => pair.Value);

    var recipeCandidates = abilityRows
        .Where(row => professionSkillLines.ContainsKey(GetInt(row, "SkillLine")))
        .GroupBy(row => GetInt(row, "Spell"))
        .Where(group => group.Key > 0)
        .Select(group => CreateRecipeCandidate(group.Key, group.ToArray(), effectsBySpell))
        .Where(candidate => candidate.Outputs.Count > 0)
        .OrderBy(candidate => candidate.SpellId)
        .ToArray();

    var usedProfessionIds = recipeCandidates
        .Select(candidate => GetInt(candidate.Ability, "SkillLine"))
        .ToHashSet();
    var professions = CreateProfessions(professionSkillLines, usedProfessionIds);
    var items = CreateItems(itemRows, sparseRows, searchNameRows);
    var normalizedItemIds = items.Select(item => item.ItemId).ToHashSet();
    var spells = CreateSpells(
        spellNameRows,
        spellRows,
        miscBySpell,
        durationRows,
        auraOptionsBySpell,
        descriptionVariablesBySpell,
        effectsBySpell);
    var itemStats = CreateItemStats(sparseRows, normalizedItemIds);
    var itemDamages = CreateItemDamages(sparseRows, normalizedItemIds);
    var itemResistances = CreateItemResistances(sparseRows, normalizedItemIds);
    var itemSockets = CreateItemSockets(sparseRows, normalizedItemIds);
    var normalizedSpellIds = spells.Select(spell => spell.SpellId).ToHashSet();
    var itemEffects = CreateItemEffects(itemEffectRows, normalizedItemIds, normalizedSpellIds);
    var itemSets = CreateItemSets(Rows("ItemSet"));
    var normalizedItemSetIds = itemSets.Select(itemSet => itemSet.ItemSetId).ToHashSet();
    var itemSetMembers = CreateItemSetMembers(
        Rows("ItemSet"),
        normalizedItemIds,
        normalizedItemSetIds);
    var itemSetEffects = CreateItemSetEffects(
        Rows("ItemSetSpell"),
        normalizedItemSetIds,
        normalizedSpellIds);
    var gameClasses = CreateNamedDefinitions(Rows("ChrClasses"), "Name_lang")
        .Select(pair => new CatalogGameClass(pair.Id, pair.Name))
        .ToArray();
    var gameRaces = CreateNamedDefinitions(Rows("ChrRaces"), "Name_lang")
        .Select(pair => new CatalogGameRace(pair.Id, pair.Name))
        .ToArray();
    var itemClasses = Rows("ItemClass")
        .Select(row => new CatalogItemClassDefinition(
            GetInt(row, "ClassID"),
            GetString(row, "ClassName_lang")))
        .Where(row => row.ClassId >= 0 && !string.IsNullOrWhiteSpace(row.Name))
        .DistinctBy(row => row.ClassId)
        .OrderBy(row => row.ClassId)
        .ToArray();
    var itemSubclasses = CreateItemSubclasses(Rows("ItemSubClass"));
    var itemLimitCategories = CreateItemLimitCategories(Rows("ItemLimitCategory"));
    var gemProperties = CreateGemProperties(Rows("GemProperties"));
    var (itemEnchantments, itemEnchantmentEffects) = CreateItemEnchantments(
        Rows("SpellItemEnchantment"));
    var itemRandomEnchantments = CreateRandomEnchantments(
        Rows("ItemRandomProperties"),
        Rows("ItemRandomSuffix"));
    var itemBonusTrees = CreateItemBonusTrees(Rows("ItemXBonusTree"), normalizedItemIds);
    var itemBonusTreeNodes = CreateItemBonusTreeNodes(Rows("ItemBonusTreeNode"));
    var itemBonuses = CreateItemBonuses(Rows("ItemBonus"));

    var recipes = new List<CatalogRecipe>(recipeCandidates.Length);
    var inputs = new List<CatalogRecipeInput>();
    var outputs = new List<CatalogRecipeOutput>();
    var teachingItems = new List<CatalogRecipeTeachingItem>();

    foreach (var candidate in recipeCandidates)
    {
      var spellId = candidate.SpellId;
      var learningRows = learnByRecipe.GetValueOrDefault(spellId, []);
      var teachingCandidates = ResolveTeachingItems(
          spellId,
          learningRows,
          itemEffectsBySpell);
      var teachingForRecipe = teachingCandidates
          .Where(item => normalizedItemIds.Contains(item.TeachingItemId))
          .ToArray();
      var unresolvedTeachingItems = teachingCandidates
          .Where(item => !normalizedItemIds.Contains(item.TeachingItemId))
          .ToArray();
      teachingItems.AddRange(teachingForRecipe);

      var spellName = spellNameRows.TryGetValue(spellId, out var spellNameRow)
          ? GetString(spellNameRow, "Name_lang")
          : string.Empty;
      var cooldown = SelectDefaultDifficulty(cooldownsBySpell.GetValueOrDefault(spellId, []));
      var category = SelectDefaultDifficulty(categoriesBySpell.GetValueOrDefault(spellId, []));
      var misc = SelectDefaultDifficulty(miscBySpell.GetValueOrDefault(spellId, []));
      var castTimeId = misc is null ? 0 : GetInt(misc, "CastingTimeIndex");
      var craftTime = castTimeRows.TryGetValue(castTimeId, out var castTime)
          ? Math.Max(0, GetInt(castTime, "Base"))
          : 0;
      var cooldownCategoryId = category is null ? 0 : GetInt(category, "Category");
      var teachingItemRequiredRank = teachingForRecipe
          .Select(item => sparseRows.TryGetValue(item.TeachingItemId, out var row)
              ? GetInt(row, "RequiredSkillRank")
              : 0)
          .DefaultIfEmpty(0)
          .Max();

      recipes.Add(new CatalogRecipe(
          spellId,
          GetInt(candidate.Ability, "SkillLine"),
          Math.Max(
              Math.Max(0, GetInt(candidate.Ability, "MinSkillLineRank")),
              teachingItemRequiredRank),
          craftTime,
          cooldown is null ? 0 : Math.Max(0, GetInt(cooldown, "RecoveryTime")),
          cooldownCategoryId > 0 ? cooldownCategoryId : null,
          cooldown is null ? 0 : Math.Max(0, GetInt(cooldown, "CategoryRecoveryTime")),
          DetermineOutputKind(spellName, candidate.Outputs),
          unresolvedTeachingItems.Length > 0
              ? "ambiguous"
              : learningRows.Count > 0 && teachingForRecipe.Length == 0
                  ? "missing_teaching_item"
                  : "complete",
          new Dictionary<string, object?>(StringComparer.Ordinal)
          {
            ["skillLineAbility"] = candidate.Ability,
            ["allSkillLineAbilities"] = candidate.Abilities,
            ["effects"] = effectsBySpell.GetValueOrDefault(spellId, []),
            ["cooldown"] = cooldown,
            ["category"] = category,
            ["spellMisc"] = misc,
            ["teachingItemCandidates"] = teachingCandidates,
            ["unresolvedTeachingItems"] = unresolvedTeachingItems,
          }));

      foreach (var reagentRow in reagentsBySpell.GetValueOrDefault(spellId, []))
      {
        var reagentIds = GetIntArray(reagentRow, "Reagent");
        var reagentCounts = GetIntArray(reagentRow, "ReagentCount");
        for (var index = 0; index < Math.Min(reagentIds.Length, reagentCounts.Length); index++)
        {
          if (reagentIds[index] > 0 && reagentCounts[index] > 0)
          {
            inputs.Add(new CatalogRecipeInput(
                spellId,
                reagentIds[index],
                reagentCounts[index],
                false));
          }
        }
      }

      outputs.AddRange(candidate.Outputs.Select(output => new CatalogRecipeOutput(
          spellId,
          output.ItemId,
          output.EnchantmentId,
          output.MinimumQuantity,
          output.MaximumQuantity,
          output.ExpectedNumerator,
          output.ExpectedDenominator)));
    }

    var (transformations, transformationInputs, transformationOutputs) = CreateItemTransformations(
        itemEffectRows,
        effectsBySpell,
        reagentsBySpell,
        recipeCandidates.Select(candidate => candidate.SpellId).ToHashSet(),
        normalizedItemIds,
        normalizedSpellIds);

    return new NormalizedCatalog(
        items,
        spells,
        itemStats,
        itemDamages,
        itemResistances,
        itemSockets,
        itemEffects,
        itemSets,
        itemSetMembers,
        itemSetEffects,
        gameClasses,
        gameRaces,
        itemClasses,
        itemSubclasses,
        itemLimitCategories,
        gemProperties,
        itemEnchantments,
        itemEnchantmentEffects,
        itemRandomEnchantments,
        itemBonusTrees,
        itemBonusTreeNodes,
        itemBonuses,
        professions,
        recipes,
        inputs.OrderBy(input => input.RecipeSpellId).ThenBy(input => input.ReagentItemId).ToArray(),
        outputs.OrderBy(output => output.RecipeSpellId).ThenBy(output => output.OutputItemId).ToArray(),
        teachingItems
            .DistinctBy(item => (item.RecipeSpellId, item.TeachingItemId, item.LearningSpellId))
            .OrderBy(item => item.RecipeSpellId)
            .ThenBy(item => item.TeachingItemId)
            .ToArray(),
        transformations,
        transformationInputs,
        transformationOutputs);
  }

  private static (
      IReadOnlyList<CatalogTransformation> Transformations,
      IReadOnlyList<CatalogTransformationInput> Inputs,
      IReadOnlyList<CatalogTransformationOutput> Outputs) CreateItemTransformations(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> itemEffectRows,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> effectsBySpell,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> reagentsBySpell,
      IReadOnlySet<int> professionRecipeSpellIds,
      IReadOnlySet<int> itemIds,
      IReadOnlySet<int> spellIds)
  {
    var transformations = new List<CatalogTransformation>();
    var inputs = new List<CatalogTransformationInput>();
    var outputs = new List<CatalogTransformationOutput>();

    foreach (var itemEffect in itemEffectRows)
    {
      var transformationId = GetInt(itemEffect, "id");
      var spellId = GetInt(itemEffect, "SpellID");
      var sourceItemId = GetInt(itemEffect, "ParentItemID");

      // A single negative charge means the casting item is consumed. Other item-use spells can
      // depend on stateful charges or reusable tools and are not safe material transformations.
      if (
          transformationId <= 0 ||
          spellId <= 0 ||
          sourceItemId <= 0 ||
          GetInt(itemEffect, "TriggerType") != 0 ||
          GetInt(itemEffect, "Charges") != -1 ||
          professionRecipeSpellIds.Contains(spellId) ||
          !spellIds.Contains(spellId) ||
          !itemIds.Contains(sourceItemId))
      {
        continue;
      }

      var resolvedOutputs = ResolveOutputs(spellId, effectsBySpell, [], 0)
          .Where(output => output.ItemId is int itemId && itemIds.Contains(itemId))
          .DistinctBy(output => (
              output.ItemId,
              output.MinimumQuantity,
              output.MaximumQuantity,
              output.ExpectedNumerator,
              output.ExpectedDenominator))
          .ToArray();
      if (resolvedOutputs.Length == 0) continue;

      var inputQuantities = new Dictionary<int, int> { [sourceItemId] = 1 };
      foreach (var reagentRow in reagentsBySpell.GetValueOrDefault(spellId, []))
      {
        var reagentIds = GetIntArray(reagentRow, "Reagent");
        var reagentCounts = GetIntArray(reagentRow, "ReagentCount");
        for (var index = 0; index < Math.Min(reagentIds.Length, reagentCounts.Length); index++)
        {
          var itemId = reagentIds[index];
          var quantity = reagentCounts[index];
          if (itemId <= 0 || quantity <= 0 || !itemIds.Contains(itemId)) continue;
          inputQuantities[itemId] = inputQuantities.GetValueOrDefault(itemId) + quantity;
        }
      }

      transformations.Add(new CatalogTransformation(
          transformationId,
          spellId,
          sourceItemId,
          "item_use",
          Math.Max(0, GetInt(itemEffect, "CoolDownMSec")),
          Math.Max(0, GetInt(itemEffect, "CategoryCoolDownMSec")),
          "complete",
          new Dictionary<string, object?>(StringComparer.Ordinal)
          {
            ["itemEffect"] = itemEffect,
            ["reagents"] = reagentsBySpell.GetValueOrDefault(spellId, []),
            ["effects"] = effectsBySpell.GetValueOrDefault(spellId, []),
            ["consumedTriggerItemQuantity"] = 1,
          }));
      inputs.AddRange(inputQuantities
          .OrderBy(pair => pair.Key)
          .Select(pair => new CatalogTransformationInput(
              transformationId,
              pair.Key,
              pair.Value)));
      outputs.AddRange(resolvedOutputs.Select(output => new CatalogTransformationOutput(
          transformationId,
          output.ItemId!.Value,
          output.MinimumQuantity,
          output.MaximumQuantity,
          output.ExpectedNumerator,
          output.ExpectedDenominator)));
    }

    return (
        transformations.OrderBy(row => row.TransformationId).ToArray(),
        inputs.OrderBy(row => row.TransformationId).ThenBy(row => row.ItemId).ToArray(),
        outputs.OrderBy(row => row.TransformationId).ThenBy(row => row.ItemId).ToArray());
  }

  private static IReadOnlyList<CatalogItem> CreateItems(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> itemRows,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> sparseRows,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> searchNameRows)
  {
    var ids = itemRows.Keys.Concat(sparseRows.Keys).Concat(searchNameRows.Keys).Distinct().Order();
    var items = new List<CatalogItem>();
    foreach (var id in ids)
    {
      itemRows.TryGetValue(id, out var item);
      sparseRows.TryGetValue(id, out var sparse);
      searchNameRows.TryGetValue(id, out var searchName);
      var name = FirstNonEmpty(
          GetString(sparse, "Display_lang"),
          GetString(searchName, "Display_lang"));
      if (string.IsNullOrWhiteSpace(name)) continue;

      var requiredSkill = GetInt(sparse, "RequiredSkill");
      var icon = GetInt(item, "IconFileDataID");
      var itemSetId = GetInt(sparse, "ItemSet");
      var limitCategoryId = GetInt(sparse, "LimitCategory");
      var socketBonusEnchantmentId = GetInt(sparse, "Socket_match_enchantment_ID");
      var gemPropertiesId = GetInt(sparse, "Gem_properties");
      var randomSuffixGroupId = GetInt(sparse, "ItemRandomSuffixGroupID");
      var randomPropertyId = GetInt(sparse, "RandomSelect");
      var requiredAbilityId = GetInt(sparse, "RequiredAbility");
      var minimumFactionId = GetInt(sparse, "MinFactionID");
      items.Add(new CatalogItem(
          id,
          name,
          GetString(sparse, "Description_lang"),
          Math.Max(0, GetInt(item, "ClassID")),
          Math.Max(0, GetInt(item, "SubclassID")),
          Math.Max(0, FirstNonZero(GetInt(sparse, "OverallQualityID"), GetInt(searchName, "OverallQualityID"))),
          Math.Max(0, FirstNonZero(GetInt(sparse, "RequiredLevel"), GetInt(searchName, "RequiredLevel"))),
          Math.Max(0, GetInt(sparse, "ItemLevel")),
          requiredSkill > 0 ? requiredSkill : null,
          Math.Max(0, GetInt(sparse, "RequiredSkillRank")),
          Math.Max(1, GetInt(sparse, "Stackable")),
          Math.Max(0, GetInt(sparse, "Bonding")),
          Math.Max(0, GetInt(sparse, "InventoryType")),
          GetInt(sparse, "AllowableClass"),
          GetIntArray(sparse, "AllowableRace"),
          Math.Max(0, GetInt(sparse, "MaxCount")),
          Math.Max(0, GetInt(sparse, "MaxDurability")),
          Math.Max(0, GetInt(sparse, "ItemDelay")),
          Math.Max(0, GetInt(sparse, "DamageType")),
          itemSetId > 0 ? itemSetId : null,
          limitCategoryId > 0 ? limitCategoryId : null,
          socketBonusEnchantmentId > 0 ? socketBonusEnchantmentId : null,
          gemPropertiesId > 0 ? gemPropertiesId : null,
          randomSuffixGroupId > 0 ? randomSuffixGroupId : null,
          randomPropertyId > 0 ? randomPropertyId : null,
          requiredAbilityId > 0 ? requiredAbilityId : null,
          minimumFactionId > 0 ? minimumFactionId : null,
          Math.Max(0, GetInt(sparse, "MinReputation")),
          Math.Max(0, GetLong(sparse, "BuyPrice")).ToString(CultureInfo.InvariantCulture),
          Math.Max(0, GetLong(sparse, "SellPrice")).ToString(CultureInfo.InvariantCulture),
          icon > 0 ? icon : null,
          new Dictionary<string, object?>(StringComparer.Ordinal)
          {
            ["item"] = item,
            ["itemSparse"] = sparse,
            ["itemSearchName"] = searchName,
          }));
    }
    return items;
  }

  private static IReadOnlyList<CatalogSpell> CreateSpells(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> spellNameRows,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> spellRows,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> miscBySpell,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> durationRows,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> auraOptionsBySpell,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>[]> descriptionVariablesBySpell,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> effectsBySpell) =>
      spellNameRows
          .Select(pair =>
          {
            spellRows.TryGetValue(pair.Key, out var spell);
            var misc = SelectDefaultDifficulty(miscBySpell.GetValueOrDefault(pair.Key, []));
            var durationId = GetInt(misc, "DurationIndex");
            durationRows.TryGetValue(durationId, out var duration);
            var auraOptions = SelectDefaultDifficulty(auraOptionsBySpell.GetValueOrDefault(pair.Key, []));
            var variables = descriptionVariablesBySpell.GetValueOrDefault(pair.Key, []);
            return new CatalogSpell(
                pair.Key,
                GetString(pair.Value, "Name_lang"),
                GetString(spell, "Description_lang"),
                GetString(spell, "AuraDescription_lang"),
                Math.Max(0, GetInt(duration, "Duration")),
                Math.Max(0, GetInt(duration, "MaxDuration")),
                auraOptions is null ? null : Math.Max(0, GetInt(auraOptions, "ProcChance")),
                auraOptions is null ? null : GetInt(auraOptions, "ProcCharges"),
                auraOptions is null ? null : Math.Max(0, GetInt(auraOptions, "ProcCategoryRecovery")),
                string.Join('\n', variables.Select(row => GetString(row, "Variables"))
                    .Where(value => !string.IsNullOrWhiteSpace(value))),
                new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                  ["spellName"] = pair.Value,
                  ["spell"] = spell,
                  ["spellMisc"] = misc,
                  ["spellDuration"] = duration,
                  ["spellAuraOptions"] = auraOptions,
                  ["descriptionVariables"] = variables,
                  ["effects"] = effectsBySpell.GetValueOrDefault(pair.Key, []),
                });
          })
          .Where(spell => !string.IsNullOrWhiteSpace(spell.Name))
          .OrderBy(spell => spell.SpellId)
          .ToArray();

  private static IReadOnlyList<CatalogItemStat> CreateItemStats(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> sparseRows,
      IReadOnlySet<int> itemIds)
  {
    var result = new List<CatalogItemStat>();
    foreach (var (itemId, row) in sparseRows.Where(pair => itemIds.Contains(pair.Key)))
    {
      var types = GetIntArray(row, "StatModifier_bonusStat");
      var values = GetIntArray(row, "StatModifier_bonusAmount");
      for (var slot = 0; slot < Math.Min(types.Length, values.Length); slot++)
      {
        if (types[slot] >= 0 && values[slot] != 0)
        {
          result.Add(new CatalogItemStat(itemId, slot, types[slot], values[slot]));
        }
      }
    }
    return result.OrderBy(row => row.ItemId).ThenBy(row => row.Slot).ToArray();
  }

  private static IReadOnlyList<CatalogItemDamage> CreateItemDamages(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> sparseRows,
      IReadOnlySet<int> itemIds)
  {
    var result = new List<CatalogItemDamage>();
    foreach (var (itemId, row) in sparseRows.Where(pair => itemIds.Contains(pair.Key)))
    {
      var minimums = GetIntArray(row, "MinDamage");
      var maximums = GetIntArray(row, "MaxDamage");
      var damageType = Math.Max(0, GetInt(row, "DamageType"));
      for (var slot = 0; slot < Math.Min(minimums.Length, maximums.Length); slot++)
      {
        if (minimums[slot] != 0 || maximums[slot] != 0)
        {
          result.Add(new CatalogItemDamage(
              itemId,
              slot,
              damageType,
              minimums[slot],
              maximums[slot]));
        }
      }
    }
    return result.OrderBy(row => row.ItemId).ThenBy(row => row.Slot).ToArray();
  }

  private static IReadOnlyList<CatalogItemResistance> CreateItemResistances(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> sparseRows,
      IReadOnlySet<int> itemIds) =>
      sparseRows
          .Where(pair => itemIds.Contains(pair.Key))
          .SelectMany(pair => GetIntArray(pair.Value, "Resistances")
              .Select((value, school) => new CatalogItemResistance(pair.Key, school, value)))
          .Where(row => row.Value != 0)
          .OrderBy(row => row.ItemId)
          .ThenBy(row => row.School)
          .ToArray();

  private static IReadOnlyList<CatalogItemSocket> CreateItemSockets(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> sparseRows,
      IReadOnlySet<int> itemIds) =>
      sparseRows
          .Where(pair => itemIds.Contains(pair.Key))
          .SelectMany(pair => GetIntArray(pair.Value, "SocketType")
              .Select((socketType, slot) => new CatalogItemSocket(pair.Key, slot, socketType)))
          .Where(row => row.SocketType > 0)
          .OrderBy(row => row.ItemId)
          .ThenBy(row => row.Slot)
          .ToArray();

  private static IReadOnlyList<CatalogItemEffect> CreateItemEffects(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      IReadOnlySet<int> itemIds,
      IReadOnlySet<int> spellIds) =>
      rows.Select(row => new CatalogItemEffect(
              GetInt(row, "id"),
              GetInt(row, "ParentItemID"),
              Math.Max(0, GetInt(row, "LegacySlotIndex")),
              GetInt(row, "SpellID"),
              Math.Max(0, GetInt(row, "TriggerType")),
              GetInt(row, "Charges"),
              GetInt(row, "CoolDownMSec"),
              GetInt(row, "CategoryCoolDownMSec"),
              PositiveOrNull(GetInt(row, "SpellCategoryID")),
              PositiveOrNull(GetInt(row, "ChrSpecializationID")),
              PositiveOrNull(GetInt(row, "PlayerConditionID"))))
          .Where(row => row.ItemEffectId > 0 && spellIds.Contains(row.SpellId) && itemIds.Contains(row.ItemId))
          .DistinctBy(row => row.ItemEffectId)
          .OrderBy(row => row.ItemId)
          .ThenBy(row => row.Slot)
          .ThenBy(row => row.ItemEffectId)
          .ToArray();

  private static IReadOnlyList<CatalogItemSet> CreateItemSets(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogItemSet(
              GetInt(row, "id"),
              GetString(row, "Name_lang"),
              GetInt(row, "SetFlags"),
              PositiveOrNull(GetInt(row, "RequiredSkill")),
              Math.Max(0, GetInt(row, "RequiredSkillRank")),
              row))
          .Where(row => row.ItemSetId > 0 && !string.IsNullOrWhiteSpace(row.Name))
          .DistinctBy(row => row.ItemSetId)
          .OrderBy(row => row.ItemSetId)
          .ToArray();

  private static IReadOnlyList<CatalogItemSetMember> CreateItemSetMembers(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      IReadOnlySet<int> itemIds,
      IReadOnlySet<int> itemSetIds) =>
      rows.SelectMany(row => GetIntArray(row, "ItemID")
              .Select((itemId, slot) => new CatalogItemSetMember(GetInt(row, "id"), itemId, slot)))
          .Where(row => itemSetIds.Contains(row.ItemSetId) && itemIds.Contains(row.ItemId))
          .DistinctBy(row => (row.ItemSetId, row.ItemId))
          .OrderBy(row => row.ItemSetId)
          .ThenBy(row => row.Slot)
          .ToArray();

  private static IReadOnlyList<CatalogItemSetEffect> CreateItemSetEffects(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      IReadOnlySet<int> itemSetIds,
      IReadOnlySet<int> spellIds) =>
      rows.Select(row => new CatalogItemSetEffect(
              GetInt(row, "id"),
              GetInt(row, "ItemSetID"),
              GetInt(row, "SpellID"),
              Math.Max(0, GetInt(row, "Threshold")),
              PositiveOrNull(GetInt(row, "ChrSpecID"))))
          .Where(row =>
              row.ItemSetEffectId > 0 &&
              itemSetIds.Contains(row.ItemSetId) &&
              spellIds.Contains(row.SpellId))
          .DistinctBy(row => row.ItemSetEffectId)
          .OrderBy(row => row.ItemSetId)
          .ThenBy(row => row.Threshold)
          .ThenBy(row => row.ItemSetEffectId)
          .ToArray();

  private static IReadOnlyList<(int Id, string Name)> CreateNamedDefinitions(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      string nameField) =>
      rows.Select(row => (Id: GetInt(row, "id"), Name: GetString(row, nameField)))
          .Where(row => row.Id > 0 && !string.IsNullOrWhiteSpace(row.Name))
          .DistinctBy(row => row.Id)
          .OrderBy(row => row.Id)
          .ToArray();

  private static IReadOnlyList<CatalogItemSubclassDefinition> CreateItemSubclasses(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogItemSubclassDefinition(
              Math.Max(0, GetInt(row, "ClassID")),
              Math.Max(0, GetInt(row, "SubClassID")),
              GetString(row, "DisplayName_lang"),
              GetString(row, "VerboseName_lang"),
              Math.Max(0, GetInt(row, "PrerequisiteProficiency"))))
          .Where(row => !string.IsNullOrWhiteSpace(row.Name) || !string.IsNullOrWhiteSpace(row.VerboseName))
          .DistinctBy(row => (row.ClassId, row.SubclassId))
          .OrderBy(row => row.ClassId)
          .ThenBy(row => row.SubclassId)
          .ToArray();

  private static IReadOnlyList<CatalogItemLimitCategory> CreateItemLimitCategories(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogItemLimitCategory(
              GetInt(row, "id"),
              GetString(row, "Name_lang"),
              Math.Max(0, GetInt(row, "Quantity")),
              GetInt(row, "Flags")))
          .Where(row => row.LimitCategoryId > 0 && !string.IsNullOrWhiteSpace(row.Name))
          .DistinctBy(row => row.LimitCategoryId)
          .OrderBy(row => row.LimitCategoryId)
          .ToArray();

  private static IReadOnlyList<CatalogGemProperty> CreateGemProperties(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogGemProperty(
              GetInt(row, "id"),
              GetInt(row, "Enchant_ID"),
              Math.Max(0, GetInt(row, "Type")),
              Math.Max(0, GetInt(row, "Min_item_level"))))
          .Where(row => row.GemPropertiesId > 0 && row.EnchantmentId > 0)
          .DistinctBy(row => row.GemPropertiesId)
          .OrderBy(row => row.GemPropertiesId)
          .ToArray();

  private static (
      IReadOnlyList<CatalogItemEnchantment> Enchantments,
      IReadOnlyList<CatalogItemEnchantmentEffect> Effects) CreateItemEnchantments(
          IReadOnlyList<IReadOnlyDictionary<string, object?>> rows)
  {
    var enchantments = new List<CatalogItemEnchantment>();
    var effects = new List<CatalogItemEnchantmentEffect>();
    foreach (var row in rows)
    {
      var enchantmentId = GetInt(row, "id");
      if (enchantmentId <= 0) continue;
      enchantments.Add(new CatalogItemEnchantment(
          enchantmentId,
          GetString(row, "Name_lang"),
          GetInt(row, "Charges"),
          PositiveOrNull(GetInt(row, "GemItemID")),
          PositiveOrNull(GetInt(row, "Condition_ID")),
          PositiveOrNull(GetInt(row, "RequiredSkillID")),
          Math.Max(0, GetInt(row, "RequiredSkillRank")),
          Math.Max(0, GetInt(row, "MinLevel")),
          Math.Max(0, GetInt(row, "MaxLevel")),
          row));

      var effectTypes = GetIntArray(row, "Effect");
      var minimums = GetIntArray(row, "EffectPointsMin");
      var maximums = GetIntArray(row, "EffectPointsMax");
      var arguments = GetIntArray(row, "EffectArg");
      var length = new[] { effectTypes.Length, minimums.Length, maximums.Length, arguments.Length }.Min();
      for (var slot = 0; slot < length; slot++)
      {
        if (effectTypes[slot] != 0)
        {
          effects.Add(new CatalogItemEnchantmentEffect(
              enchantmentId,
              slot,
              effectTypes[slot],
              minimums[slot],
              maximums[slot],
              arguments[slot]));
        }
      }
    }
    return (
        enchantments.DistinctBy(row => row.EnchantmentId).OrderBy(row => row.EnchantmentId).ToArray(),
        effects.OrderBy(row => row.EnchantmentId).ThenBy(row => row.Slot).ToArray());
  }

  private static IReadOnlyList<CatalogItemRandomEnchantment> CreateRandomEnchantments(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> propertyRows,
      IReadOnlyList<IReadOnlyDictionary<string, object?>> suffixRows)
  {
    var result = new List<CatalogItemRandomEnchantment>();
    AddRows("property", propertyRows, includeAllocation: false);
    AddRows("suffix", suffixRows, includeAllocation: true);
    return result.OrderBy(row => row.Kind, StringComparer.Ordinal)
        .ThenBy(row => row.VariantId)
        .ThenBy(row => row.Slot)
        .ToArray();

    void AddRows(
        string kind,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
        bool includeAllocation)
    {
      foreach (var row in rows)
      {
        var variantId = GetInt(row, "id");
        var enchantments = GetIntArray(row, "Enchantment");
        var allocations = includeAllocation ? GetIntArray(row, "AllocationPct") : [];
        for (var slot = 0; slot < enchantments.Length; slot++)
        {
          if (variantId > 0 && enchantments[slot] > 0)
          {
            result.Add(new CatalogItemRandomEnchantment(
                kind,
                variantId,
                GetString(row, "Name_lang"),
                slot,
                enchantments[slot],
                slot < allocations.Length ? Math.Max(0, allocations[slot]) : 0));
          }
        }
      }
    }
  }

  private static IReadOnlyList<CatalogItemBonusTree> CreateItemBonusTrees(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      IReadOnlySet<int> itemIds) =>
      rows.Select(row => new CatalogItemBonusTree(
              GetInt(row, "ItemID"),
              GetInt(row, "ItemBonusTreeID")))
          .Where(row => itemIds.Contains(row.ItemId) && row.BonusTreeId > 0)
          .Distinct()
          .OrderBy(row => row.ItemId)
          .ThenBy(row => row.BonusTreeId)
          .ToArray();

  private static IReadOnlyList<CatalogItemBonusTreeNode> CreateItemBonusTreeNodes(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogItemBonusTreeNode(
              GetInt(row, "id"),
              GetInt(row, "ParentItemBonusTreeID"),
              Math.Max(0, GetInt(row, "ItemContext")),
              PositiveOrNull(GetInt(row, "ChildItemBonusTreeID")),
              PositiveOrNull(GetInt(row, "ChildItemBonusListID")),
              PositiveOrNull(GetInt(row, "ChildItemLevelSelectorID")),
              row))
          .Where(row => row.NodeId > 0 && row.BonusTreeId > 0)
          .DistinctBy(row => row.NodeId)
          .OrderBy(row => row.BonusTreeId)
          .ThenBy(row => row.NodeId)
          .ToArray();

  private static IReadOnlyList<CatalogItemBonus> CreateItemBonuses(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.Select(row => new CatalogItemBonus(
              GetInt(row, "ParentItemBonusListID"),
              Math.Max(0, GetInt(row, "OrderIndex")),
              GetInt(row, "Type"),
              GetIntArray(row, "Value")))
          .Where(row => row.BonusListId > 0)
          .OrderBy(row => row.BonusListId)
          .ThenBy(row => row.OrderIndex)
          .ToArray();

  private static IReadOnlyList<CatalogProfession> CreateProfessions(
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> professionRows,
      IReadOnlySet<int> usedProfessionIds)
  {
    var slugs = new HashSet<string>(StringComparer.Ordinal);
    var professions = new List<CatalogProfession>();
    foreach (var pair in professionRows.Where(pair => usedProfessionIds.Contains(pair.Key)).OrderBy(pair => pair.Key))
    {
      var name = GetString(pair.Value, "DisplayName_lang");
      if (string.IsNullOrWhiteSpace(name)) continue;
      var slug = Slugify(name);
      if (slug.Length == 0 || !slugs.Add(slug)) slug = $"skill-{pair.Key}";
      slugs.Add(slug);
      professions.Add(new CatalogProfession(pair.Key, name, slug, pair.Value));
    }
    return professions;
  }

  private RecipeCandidate CreateRecipeCandidate(
      int spellId,
      IReadOnlyList<IReadOnlyDictionary<string, object?>> abilities,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> effectsBySpell)
  {
    var ability = abilities
        .OrderBy(row => GetInt(row, "MinSkillLineRank"))
        .ThenBy(row => GetInt(row, "SkillLine"))
        .First();
    var outputs = ResolveOutputs(spellId, effectsBySpell, [], 0)
        .DistinctBy(output => (output.ItemId, output.EnchantmentId, output.MinimumQuantity, output.MaximumQuantity))
        .ToArray();
    return new RecipeCandidate(spellId, ability, abilities, outputs);
  }

  private static IReadOnlyList<ResolvedOutput> ResolveOutputs(
      int spellId,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> effectsBySpell,
      HashSet<int> visited,
      int depth)
  {
    if (depth > MaximumTriggerDepth || !visited.Add(spellId)) return [];
    var outputs = new List<ResolvedOutput>();
    foreach (var effect in effectsBySpell.GetValueOrDefault(spellId, []))
    {
      var itemId = GetInt(effect, "EffectItemType");
      if (itemId > 0)
      {
        var (minimum, maximum, numerator, denominator) = ResolveQuantity(effect);
        outputs.Add(new ResolvedOutput(itemId, null, minimum, maximum, numerator, denominator));
      }

      var effectType = GetInt(effect, "Effect");
      if (effectType is 53 or 54)
      {
        var enchantmentId = GetIntArray(effect, "EffectMiscValue").FirstOrDefault();
        if (enchantmentId > 0)
        {
          outputs.Add(new ResolvedOutput(null, enchantmentId, 1, 1, 1, 1));
        }
      }

      var triggerSpell = GetInt(effect, "EffectTriggerSpell");
      if (triggerSpell > 0)
      {
        outputs.AddRange(ResolveOutputs(
            triggerSpell,
            effectsBySpell,
            new HashSet<int>(visited),
            depth + 1));
      }
    }
    return outputs;
  }

  private static (int Minimum, int Maximum, int Numerator, int Denominator) ResolveQuantity(
      IReadOnlyDictionary<string, object?> effect)
  {
    var basePoints = GetInt(effect, "EffectBasePoints");
    var dieSides = GetInt(effect, "EffectDieSides");
    var minimum = Math.Max(1, basePoints + 1);
    var maximum = Math.Max(minimum, basePoints + Math.Max(1, dieSides));
    var numerator = minimum + maximum;
    var denominator = 2;
    var divisor = GreatestCommonDivisor(numerator, denominator);
    return (minimum, maximum, numerator / divisor, denominator / divisor);
  }

  private static IReadOnlyList<CatalogRecipeTeachingItem> ResolveTeachingItems(
      int recipeSpellId,
      IReadOnlyList<IReadOnlyDictionary<string, object?>> learningRows,
      IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> itemEffectsBySpell)
  {
    var result = new List<CatalogRecipeTeachingItem>();
    foreach (var itemEffect in itemEffectsBySpell.GetValueOrDefault(recipeSpellId, []))
    {
      var itemId = GetInt(itemEffect, "ParentItemID");
      if (itemId > 0) result.Add(new CatalogRecipeTeachingItem(recipeSpellId, itemId, null));
    }
    foreach (var learningRow in learningRows)
    {
      var learningSpellId = GetInt(learningRow, "SpellID");
      foreach (var itemEffect in itemEffectsBySpell.GetValueOrDefault(learningSpellId, []))
      {
        var itemId = GetInt(itemEffect, "ParentItemID");
        if (itemId > 0)
        {
          result.Add(new CatalogRecipeTeachingItem(recipeSpellId, itemId, learningSpellId));
        }
      }
    }
    return result;
  }

  private static string DetermineOutputKind(string spellName, IReadOnlyList<ResolvedOutput> outputs)
  {
    if (spellName.Contains("Transmute", StringComparison.OrdinalIgnoreCase)) return "conversion";
    if (outputs.Any(output => output.EnchantmentId is not null)) return "enchantment";
    return "item";
  }

  private static IReadOnlyDictionary<string, object?>? SelectDefaultDifficulty(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows) =>
      rows.OrderBy(row => GetInt(row, "DifficultyID") == 0 ? 0 : 1).FirstOrDefault();

  private IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> Index(string tableName) =>
      Rows(tableName).ToDictionary(row => GetInt(row, "id"));

  private IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows(string tableName) =>
      tables.TryGetValue(tableName, out var table)
          ? table.EffectiveRows
          : throw new KeyNotFoundException($"Required table '{tableName}' was not extracted");

  private static IReadOnlyDictionary<int, IReadOnlyList<IReadOnlyDictionary<string, object?>>> GroupByPositiveId(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
      string field) =>
      rows.Where(row => GetInt(row, field) > 0)
          .GroupBy(row => GetInt(row, field))
          .ToDictionary(
              group => group.Key,
              group => (IReadOnlyList<IReadOnlyDictionary<string, object?>>)group.ToArray());

  private static bool IsProfession(int skillLineId, IReadOnlyDictionary<string, object?> row) =>
      GetInt(row, "CategoryID") == ProfessionCategoryId || KnownProfessionSkillLines.Contains(skillLineId);

  private static int GetInt(IReadOnlyDictionary<string, object?>? row, string field)
  {
    if (row is null || !row.TryGetValue(field, out var value) || value is null) return 0;
    return Convert.ToInt32(value, CultureInfo.InvariantCulture);
  }

  private static long GetLong(IReadOnlyDictionary<string, object?>? row, string field)
  {
    if (row is null || !row.TryGetValue(field, out var value) || value is null) return 0;
    return Convert.ToInt64(value, CultureInfo.InvariantCulture);
  }

  private static int[] GetIntArray(IReadOnlyDictionary<string, object?>? row, string field)
  {
    if (row is null || !row.TryGetValue(field, out var value) || value is not IEnumerable<object?> values)
    {
      return [];
    }
    return values.Select(item => Convert.ToInt32(item, CultureInfo.InvariantCulture)).ToArray();
  }

  private static int? PositiveOrNull(int value) => value > 0 ? value : null;

  private static string GetString(IReadOnlyDictionary<string, object?>? row, string field)
  {
    if (row is null || !row.TryGetValue(field, out var value)) return string.Empty;
    return value as string ?? string.Empty;
  }

  private static string FirstNonEmpty(params string[] values) =>
      values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

  private static int FirstNonZero(params int[] values) => values.FirstOrDefault(value => value != 0);

  private static int GreatestCommonDivisor(int left, int right)
  {
    while (right != 0) (left, right) = (right, left % right);
    return Math.Abs(left);
  }

  private static string Slugify(string value)
  {
    var builder = new StringBuilder();
    var pendingSeparator = false;
    foreach (var character in value.Normalize(NormalizationForm.FormD))
    {
      if (char.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
      if (char.IsLetterOrDigit(character))
      {
        if (pendingSeparator && builder.Length > 0) builder.Append('-');
        builder.Append(char.ToLowerInvariant(character));
        pendingSeparator = false;
      }
      else
      {
        pendingSeparator = true;
      }
    }
    return builder.ToString();
  }

  private sealed record RecipeCandidate(
      int SpellId,
      IReadOnlyDictionary<string, object?> Ability,
      IReadOnlyList<IReadOnlyDictionary<string, object?>> Abilities,
      IReadOnlyList<ResolvedOutput> Outputs);

  private sealed record ResolvedOutput(
      int? ItemId,
      int? EnchantmentId,
      int MinimumQuantity,
      int MaximumQuantity,
      int ExpectedNumerator,
      int ExpectedDenominator);
}
