using System.Collections;
using System.Globalization;
using System.Text;

namespace WowTrader.Extractor;

internal sealed class WorldNormalizer
{
  private readonly IReadOnlyDictionary<string, Db2TableSnapshot> tables;

  public WorldNormalizer(IReadOnlyDictionary<string, Db2TableSnapshot> tables)
  {
    this.tables = tables;
  }

  public NormalizedWorld Normalize()
  {
    var appearanceItems = Rows("ItemModifiedAppearance")
        .ToDictionary(row => Int(row, "id"), row => PositiveOrNull(row, "ItemID"));
    var questPoints = Rows("QuestPOIPoint")
        .Select(row => new
        {
          BlobId = Int(row, "QuestPOIBlobID"),
          Point = new WorldQuestPoiPoint(
              Int(row, "id"),
              Double(row, "X"),
              Double(row, "Y"),
              Double(row, "Z")),
        })
        .GroupBy(entry => entry.BlobId)
        .ToDictionary(
            group => group.Key,
            group => (IReadOnlyList<WorldQuestPoiPoint>)group
                .Select(entry => entry.Point)
                .OrderBy(point => point.PointId)
                .ToArray());

    var maps = Rows("Map").Select(row => new WorldMap(
        Int(row, "id"),
        Text(row, "Directory"),
        RequiredText(row, "MapName_lang", "Map"),
        FirstNonEmpty(Text(row, "MapDescription0_lang"), Text(row, "MapDescription1_lang")),
        Int(row, "MapType"),
        Int(row, "InstanceType"),
        Int(row, "ExpansionID"),
        Int(row, "AreaTableID"),
        NonNegativeOrNull(row, "ParentMapID"),
        NonNegativeOrNull(row, "CosmeticParentMapID"),
        Math.Max(0, Int(row, "MaxPlayers")),
        PositiveOrNull(row, "WdtFileDataID"),
        row)).OrderBy(entry => entry.MapId).ToArray();

    var areas = Rows("AreaTable").Select(row => new WorldArea(
        Int(row, "id"),
        Math.Max(0, Int(row, "ContinentID")),
        PositiveOrNull(row, "ParentAreaID"),
        RequiredText(row, "AreaName_lang", "AreaTable"),
        Text(row, "ZoneName"),
        Math.Max(0, Int(row, "ExplorationLevel")),
        Math.Max(0, Int(row, "FactionGroupMask")),
        Ints(row, "Flags"),
        row)).OrderBy(entry => entry.AreaId).ToArray();

    var uiMaps = Rows("UiMap").Select(row => new WorldUiMap(
        Int(row, "id"),
        RequiredText(row, "Name_lang", "UiMap"),
        PositiveOrNull(row, "ParentUiMapID"),
        Math.Max(0, Int(row, "Type")),
        Math.Max(0, Int(row, "System")),
        Int(row, "Flags"),
        row)).OrderBy(entry => entry.UiMapId).ToArray();

    var assignments = Rows("UiMapAssignment").Select(row =>
    {
      var uiMin = Doubles(row, "UiMin", 2);
      var uiMax = Doubles(row, "UiMax", 2);
      return new WorldUiMapAssignment(
          Int(row, "id"),
          Int(row, "UiMapID"),
          Math.Max(0, Int(row, "MapID")),
          PositiveOrNull(row, "AreaID"),
          Int(row, "OrderIndex"),
          uiMin[0],
          uiMin[1],
          uiMax[0],
          uiMax[1],
          Doubles(row, "Region", 6),
          row);
    }).OrderBy(entry => entry.AssignmentId).ToArray();

    var mapArts = Rows("UiMapArt").Select(row => new WorldMapArt(
        Int(row, "id"),
        Int(row, "UiMapArtStyleID"),
        row)).OrderBy(entry => entry.MapArtId).ToArray();

    var artLinks = Rows("UiMapXMapArt").Select(row => new WorldUiMapArtLink(
        Int(row, "id"),
        Int(row, "UiMapID"),
        Int(row, "UiMapArtID"),
        Math.Max(0, Int(row, "PhaseID")))).OrderBy(entry => entry.LinkId).ToArray();

    var artLayers = Rows("UiMapArtStyleLayer").Select(row => new WorldMapArtLayer(
        Int(row, "id"),
        Int(row, "UiMapArtStyleID"),
        Math.Max(0, Int(row, "LayerIndex")),
        Positive(row, "LayerWidth"),
        Positive(row, "LayerHeight"),
        Positive(row, "TileWidth"),
        Positive(row, "TileHeight"),
        Double(row, "MinScale"),
        Double(row, "MaxScale"),
        Math.Max(0, Int(row, "AdditionalZoomSteps")))).OrderBy(entry => entry.LayerId).ToArray();

    var artTiles = Rows("UiMapArtTile").Select(row => new WorldMapArtTile(
        Int(row, "id"),
        Int(row, "UiMapArtID"),
        Math.Max(0, Int(row, "LayerIndex")),
        Math.Max(0, Int(row, "RowIndex")),
        Math.Max(0, Int(row, "ColIndex")),
        Positive(row, "FileDataID"))).OrderBy(entry => entry.TileId).ToArray();

    var pois = NormalizePois();

    var encounters = Rows("DungeonEncounter").Select(row => new WorldEncounter(
        Int(row, "id"),
        Math.Max(0, Int(row, "MapID")),
        Math.Max(0, Int(row, "DifficultyID")),
        RequiredText(row, "Name_lang", "DungeonEncounter"),
        Int(row, "OrderIndex"),
        Int(row, "Flags"),
        PositiveOrNull(row, "SpellIconFileID"),
        row)).OrderBy(entry => entry.EncounterId).ToArray();

    var lfgDungeons = Rows("LFGDungeons").Select(row => new WorldLfgDungeon(
        Int(row, "id"),
        RequiredText(row, "Name_lang", "LFGDungeons"),
        Text(row, "Description_lang"),
        PositiveOrNull(row, "MapID"),
        Math.Max(0, Int(row, "DifficultyID")),
        Math.Max(0, Int(row, "ContentTuningID")),
        Math.Max(0, Int(row, "TypeID")),
        Math.Max(0, Int(row, "Subtype")),
        row)).OrderBy(entry => entry.LfgDungeonId).ToArray();

    var quests = Rows("QuestV2").Select(row => new WorldQuest(
        Int(row, "id"),
        Math.Max(0, Int(row, "UniqueBitFlag")),
        Math.Max(0, Int(row, "UiQuestDetailsThemeID")),
        row)).OrderBy(entry => entry.QuestId).ToArray();

    var questLines = Rows("QuestLine").Select(row => new WorldQuestLine(
        Int(row, "id"),
        RequiredText(row, "Name_lang", "QuestLine"),
        Text(row, "Description_lang"),
        Int(row, "Flags"),
        row)).OrderBy(entry => entry.QuestLineId).ToArray();

    var questLineMembers = Rows("QuestLineXQuest").Select(row => new WorldQuestLineMember(
        Int(row, "id"),
        Positive(row, "QuestLineID"),
        Positive(row, "QuestID"),
        Math.Max(0, Int(row, "OrderIndex")),
        Int(row, "Flags"))).OrderBy(entry => entry.RelationId).ToArray();

    var questPois = Rows("QuestPOIBlob").Select(row =>
    {
      var blobId = Int(row, "id");
      return new WorldQuestPoi(
          blobId,
          Positive(row, "QuestID"),
          Math.Max(0, Int(row, "MapID")),
          PositiveOrNull(row, "UiMapID"),
          Int(row, "ObjectiveIndex"),
          PositiveOrNull(row, "ObjectiveID"),
          Int(row, "Flags"),
          questPoints.GetValueOrDefault(blobId) ?? [],
          row);
    }).OrderBy(entry => entry.BlobId).ToArray();

    var sourceHints = Rows("CollectableSourceInfo").Select(row =>
    {
      var appearanceId = Positive(row, "ItemModifiedAppearanceID");
      return new WorldItemSourceHint(
          Int(row, "id"),
          appearanceId,
          appearanceItems.GetValueOrDefault(appearanceId),
          Math.Max(0, Int(row, "SourceTypeEnum")),
          RequiredText(row, "Description", "CollectableSourceInfo"),
          row);
    }).OrderBy(entry => entry.SourceInfoId).ToArray();

    var creatureObjectives = NormalizeCreatureObjectives(encounters, maps);
    var creatureModels = NormalizeCreatureModels();
    var bosses = NormalizeBosses(creatureObjectives, encounters, creatureModels);
    var bossLocations = NormalizeBossLocations(
        bosses,
        creatureObjectives,
        encounters,
        maps,
        areas,
        pois);
    var bossSpellCandidates = NormalizeBossSpellCandidates(bosses, creatureObjectives);
    var lootSourceCandidates = NormalizeLootSourceCandidates(
        sourceHints,
        bosses,
        encounters,
        maps,
        areas);
    var mapDifficulties = NormalizeMapDifficulties();
    var contentTunings = NormalizeContentTunings();

    return new NormalizedWorld(
        maps,
        areas,
        uiMaps,
        assignments,
        mapArts,
        artLinks,
        artLayers,
        artTiles,
        pois,
        encounters,
        lfgDungeons,
        quests,
        questLines,
        questLineMembers,
        questPois,
        sourceHints,
        creatureObjectives,
        bosses,
        bossLocations,
        creatureModels,
        bossSpellCandidates,
        lootSourceCandidates,
        mapDifficulties,
        contentTunings);
  }

  private IReadOnlyList<WorldCreatureObjective> NormalizeCreatureObjectives(
      IReadOnlyList<WorldEncounter> encounters,
      IReadOnlyList<WorldMap> maps)
  {
    var criteriaById = Rows("Criteria").ToDictionary(row => Int(row, "id"));
    var trees = Rows("CriteriaTree");
    var treeById = trees.ToDictionary(row => Int(row, "id"));
    var achievementsByRoot = Rows("Achievement")
        .Where(row => PositiveOrNull(row, "Criteria_tree") is not null)
        .GroupBy(row => Int(row, "Criteria_tree"))
        .ToDictionary(group => group.Key, group => group.OrderBy(row => Int(row, "id")).Last());
    var encounterLookup = encounters.ToLookup(
        encounter => NormalizeEntityName(encounter.Name),
        StringComparer.Ordinal);
    var mapLookup = maps.ToLookup(map => NormalizeEntityName(map.Name), StringComparer.Ordinal);
    var mapIds = maps.Select(map => map.MapId).ToHashSet();

    var objectives = new List<WorldCreatureObjective>();
    foreach (var tree in trees)
    {
      var criteriaId = PositiveOrNull(tree, "CriteriaID");
      if (criteriaId is null || !criteriaById.TryGetValue(criteriaId.Value, out var criteria)) continue;
      if (Int(criteria, "Type") != 0 || Int(criteria, "Asset") <= 0) continue;

      var name = Text(tree, "Description_lang").Trim();
      if (name.Length == 0) continue;
      var root = FindCriteriaRoot(tree, treeById);
      var rootId = Int(root, "id");
      achievementsByRoot.TryGetValue(rootId, out var achievement);
      var normalizedName = NormalizeEntityName(name);
      var matchingEncounters = encounterLookup[normalizedName]
          .OrderBy(encounter => encounter.EncounterId)
          .ToArray();
      var objectiveMapIds = matchingEncounters.Select(encounter => encounter.MapId)
          .Concat(mapLookup[normalizedName].Select(map => map.MapId))
          .ToHashSet();
      var achievementMapId = achievement is null ? null : PositiveOrNull(achievement, "Instance_ID");
      if (achievementMapId is not null && mapIds.Contains(achievementMapId.Value))
      {
        objectiveMapIds.Add(achievementMapId.Value);
      }

      objectives.Add(new WorldCreatureObjective(
          Int(tree, "id"),
          criteriaId.Value,
          Positive(criteria, "Asset"),
          name,
          Math.Max(0, Int(tree, "Parent")),
          rootId,
          Text(root, "Description_lang").Trim(),
          Math.Max(0, Int(tree, "OrderIndex")),
          Math.Max(0, Int(tree, "Amount")),
          Int(tree, "Flags"),
          achievement is null ? null : Int(achievement, "id"),
          achievement is null ? null : Text(achievement, "Title_lang").Trim(),
          achievement is null ? null : Text(achievement, "Description_lang").Trim(),
          achievement is null ? null : PositiveOrNull(achievement, "Category"),
          achievementMapId is not null && mapIds.Contains(achievementMapId.Value)
              ? achievementMapId
              : null,
          achievement is null ? null : PositiveOrNull(achievement, "IconFileID"),
          matchingEncounters.Select(encounter => encounter.EncounterId).ToArray(),
          objectiveMapIds.Order().ToArray(),
          tree,
          criteria));
    }

    return objectives.OrderBy(objective => objective.CreatureId)
        .ThenBy(objective => objective.CriteriaTreeId)
        .ToArray();
  }

  private IReadOnlyList<WorldCreatureModel> NormalizeCreatureModels()
  {
    var displayRows = Rows("CreatureDisplayInfo").ToDictionary(row => Int(row, "id"));
    var modelRows = Rows("CreatureModelData").ToDictionary(row => Int(row, "id"));
    var modelFiles = Rows("ModelFileData")
        .Select(row => PositiveOrNull(row, "FileDataID"))
        .Where(fileDataId => fileDataId is not null)
        .Select(fileDataId => fileDataId!.Value)
        .ToHashSet();
    var links = new Dictionary<(int CreatureId, int DisplayId), MutableCreatureDisplayLink>();

    foreach (var creature in Rows("Creature"))
    {
      var creatureId = Int(creature, "id");
      var displayIds = Ints(creature, "DisplayID");
      var probabilities = Values(creature, "DisplayProbability")
          .Select(value => Convert.ToDouble(value, CultureInfo.InvariantCulture))
          .ToArray();
      for (var index = 0; index < displayIds.Count; index += 1)
      {
        var displayId = displayIds[index];
        if (displayId <= 0) continue;
        AddCreatureDisplayLink(
            links,
            creatureId,
            displayId,
            index < probabilities.Length ? probabilities[index] : 0,
            1,
            "creature_display_slot");
      }
    }

    foreach (var relation in Rows("CreatureXDisplayInfo"))
    {
      AddCreatureDisplayLink(
          links,
          Positive(relation, "CreatureID"),
          Positive(relation, "CreatureDisplayInfoID"),
          Double(relation, "Probability"),
          Double(relation, "Scale"),
          "creature_x_display");
    }

    var models = new List<WorldCreatureModel>();
    foreach (var link in links.Values.OrderBy(link => link.CreatureId).ThenBy(link => link.DisplayId))
    {
      if (!displayRows.TryGetValue(link.DisplayId, out var display)) continue;
      var modelId = PositiveOrNull(display, "ModelID");
      if (modelId is null || !modelRows.TryGetValue(modelId.Value, out var model)) continue;
      var modelFileDataId = PositiveOrNull(model, "FileDataID");
      if (modelFileDataId is null) continue;
      models.Add(new WorldCreatureModel(
          link.CreatureId,
          link.DisplayId,
          link.SourceKinds.Order(StringComparer.Ordinal).ToArray(),
          link.Probability,
          link.DisplayScale,
          modelId.Value,
          modelFileDataId.Value,
          modelFiles.Contains(modelFileDataId.Value),
          Ints(display, "TextureVariationFileDataID").Where(id => id > 0).Distinct().Order().ToArray(),
          Double(display, "CreatureModelScale"),
          Double(model, "ModelScale"),
          Double(model, "CollisionWidth"),
          Double(model, "CollisionHeight"),
          Doubles(model, "GeoBox", 6)));
    }
    return models;
  }

  private static IReadOnlyList<WorldBoss> NormalizeBosses(
      IReadOnlyList<WorldCreatureObjective> objectives,
      IReadOnlyList<WorldEncounter> encounters,
      IReadOnlyList<WorldCreatureModel> creatureModels)
  {
    var encounterById = encounters.ToDictionary(encounter => encounter.EncounterId);
    var creaturesWithModels = creatureModels.Select(model => model.CreatureId).ToHashSet();
    return objectives.Where(IsBossObjective)
        .GroupBy(objective => objective.CreatureId)
        .Select(group =>
        {
          var rows = group.ToArray();
          var name = rows.OrderByDescending(BossNameScore)
              .ThenBy(row => row.CriteriaTreeId)
              .Select(row => row.Name)
              .First();
          var aliases = rows.Where(IsBossNameObjective)
              .Select(row => row.Name)
              .Append(name)
              .Concat(rows.Select(row => BossNameFromRoot(row.RootDescription)))
              .Where(name => name.Length > 0)
              .Distinct(StringComparer.OrdinalIgnoreCase)
              .Order(StringComparer.OrdinalIgnoreCase)
              .ToArray();
          var encounterIds = rows.SelectMany(row => row.EncounterIds).Distinct().Order().ToArray();
          var icons = rows.Select(row => row.AchievementIconFileDataId)
              .Where(icon => icon is not null)
              .Select(icon => icon!.Value)
              .Concat(encounterIds.Select(id => encounterById[id].IconFileDataId)
                  .Where(icon => icon is not null)
                  .Select(icon => icon!.Value))
              .Distinct()
              .Order()
              .ToArray();
          return new WorldBoss(
              group.Key,
              name,
              aliases,
              rows.SelectMany(row => new[]
                  {
                    row.RootDescription,
                    row.AchievementTitle ?? "",
                    row.AchievementDescription ?? "",
                  })
                  .Where(value => value.Length > 0)
                  .Distinct(StringComparer.OrdinalIgnoreCase)
                  .Order(StringComparer.OrdinalIgnoreCase)
                  .ToArray(),
              rows.Select(row => row.CriteriaTreeId).Distinct().Order().ToArray(),
              rows.Select(row => row.CriteriaId).Distinct().Order().ToArray(),
              rows.Select(row => row.AchievementId)
                  .Where(id => id is not null)
                  .Select(id => id!.Value)
                  .Distinct()
                  .Order()
                  .ToArray(),
              encounterIds,
              rows.SelectMany(row => row.MapIds).Distinct().Order().ToArray(),
              icons,
              "criteria_type_0",
              creaturesWithModels.Contains(group.Key) ? "resolved_static" : "unresolved_static");
        })
        .OrderBy(boss => boss.CreatureId)
        .ToArray();
  }

  private static IReadOnlyList<WorldBossLocation> NormalizeBossLocations(
      IReadOnlyList<WorldBoss> bosses,
      IReadOnlyList<WorldCreatureObjective> objectives,
      IReadOnlyList<WorldEncounter> encounters,
      IReadOnlyList<WorldMap> maps,
      IReadOnlyList<WorldArea> areas,
      IReadOnlyList<WorldPoi> pois)
  {
    var mapById = maps.ToDictionary(map => map.MapId);
    var encounterById = encounters.ToDictionary(encounter => encounter.EncounterId);
    var bossByCreature = bosses.ToDictionary(boss => boss.CreatureId);
    var results = new Dictionary<string, WorldBossLocation>(StringComparer.Ordinal);

    foreach (var objective in objectives.Where(objective => bossByCreature.ContainsKey(objective.CreatureId)))
    {
      var boss = bossByCreature[objective.CreatureId];
      foreach (var encounterId in objective.EncounterIds)
      {
        var encounter = encounterById[encounterId];
        AddBossLocation(results, new WorldBossLocation(
            boss.CreatureId,
            boss.Name,
            encounter.MapId,
            mapById.GetValueOrDefault(encounter.MapId)?.Name,
            null,
            null,
            null,
            null,
            null,
            "map",
            "encounter_exact_name",
            encounter.Name,
            false));
      }

      if (objective.AchievementInstanceMapId is int achievementMapId)
      {
        AddBossLocation(results, new WorldBossLocation(
            boss.CreatureId,
            boss.Name,
            achievementMapId,
            mapById.GetValueOrDefault(achievementMapId)?.Name,
            null,
            null,
            null,
            null,
            null,
            "map",
            "achievement_instance_map",
            objective.AchievementTitle ?? objective.RootDescription,
            false));
      }

      foreach (var map in maps.Where(map =>
                   string.Equals(
                       NormalizeEntityName(map.Name),
                       NormalizeEntityName(objective.Name),
                       StringComparison.Ordinal)))
      {
        AddBossLocation(results, new WorldBossLocation(
            boss.CreatureId,
            boss.Name,
            map.MapId,
            map.Name,
            null,
            null,
            null,
            null,
            null,
            "map",
            "criteria_name_exact_map",
            objective.Name,
            true));
      }

      foreach (var area in areas.Where(area =>
                   string.Equals(
                       NormalizeEntityName(area.Name),
                       NormalizeEntityName(objective.Name),
                       StringComparison.Ordinal)))
      {
        AddBossLocation(results, new WorldBossLocation(
            boss.CreatureId,
            boss.Name,
            area.MapId,
            mapById.GetValueOrDefault(area.MapId)?.Name,
            area.AreaId,
            null,
            null,
            null,
            null,
            "map",
            "criteria_name_exact_area",
            objective.Name,
            true));
      }
    }

    foreach (var boss in bosses)
    {
      var aliases = boss.Aliases.Select(NormalizeEntityName).ToHashSet(StringComparer.Ordinal);
      foreach (var poi in pois.Where(poi =>
                   poi.Kind == "area_poi" && aliases.Contains(NormalizeEntityName(poi.Name))))
      {
        AddBossLocation(results, new WorldBossLocation(
            boss.CreatureId,
            boss.Name,
            poi.MapId,
            poi.MapId is int mapId ? mapById.GetValueOrDefault(mapId)?.Name : null,
            null,
            null,
            poi.X,
            poi.Y,
            poi.Z,
            "point",
            "area_poi_exact_name",
            poi.Name,
            true));
      }
    }

    return results.Values.OrderBy(location => location.CreatureId)
        .ThenBy(location => location.MapId)
        .ThenBy(location => location.EvidenceKind, StringComparer.Ordinal)
        .ToArray();
  }

  private IReadOnlyList<WorldBossSpellCandidate> NormalizeBossSpellCandidates(
      IReadOnlyList<WorldBoss> bosses,
      IReadOnlyList<WorldCreatureObjective> objectives)
  {
    var spellNames = Rows("SpellName").ToDictionary(row => Int(row, "id"), row => Text(row, "Name_lang").Trim());
    var spellText = Rows("Spell").ToDictionary(row => Int(row, "id"));
    var spellIcons = Rows("SpellMisc")
        .GroupBy(row => Int(row, "SpellID"))
        .ToDictionary(
            group => group.Key,
            group => group.OrderBy(row => Int(row, "DifficultyID"))
                .Select(row => PositiveOrNull(row, "SpellIconFileDataID"))
                .FirstOrDefault(icon => icon is not null));
    var bossByCreature = bosses.ToDictionary(boss => boss.CreatureId);
    var candidates = new Dictionary<string, WorldBossSpellCandidate>(StringComparer.Ordinal);

    foreach (var boss in bosses)
    {
      foreach (var (spellId, spellName) in spellNames)
      {
        spellText.TryGetValue(spellId, out var textRow);
        var description = textRow is null ? "" : Text(textRow, "Description_lang").Trim();
        var auraDescription = textRow is null ? "" : Text(textRow, "AuraDescription_lang").Trim();
        var matchingAlias = boss.Aliases.FirstOrDefault(alias =>
            EntityPhraseMatches(spellName, alias) ||
            EntityPhraseMatches(description, alias) ||
            EntityPhraseMatches(auraDescription, alias));
        if (matchingAlias is null) continue;
        var evidenceKind = string.Equals(
            NormalizeEntityName(spellName),
            NormalizeEntityName(matchingAlias),
            StringComparison.Ordinal)
            ? "spell_exact_boss_name"
            : "spell_text_mentions_boss";
        AddSpellCandidate(candidates, new WorldBossSpellCandidate(
            boss.CreatureId,
            boss.Name,
            spellId,
            spellName,
            description,
            auraDescription,
            spellIcons.GetValueOrDefault(spellId),
            evidenceKind,
            matchingAlias,
            null,
            null,
            null,
            true));
      }
    }

    foreach (var effect in Rows("SpellEffect"))
    {
      var matchingCreatureIds = Ints(effect, "EffectMiscValue")
          .Where(value => bossByCreature.ContainsKey(value))
          .Distinct()
          .ToArray();
      if (matchingCreatureIds.Length == 0) continue;
      var spellId = Positive(effect, "SpellID");
      var spellName = spellNames.GetValueOrDefault(spellId) ?? $"Spell {spellId}";
      spellText.TryGetValue(spellId, out var textRow);
      foreach (var creatureId in matchingCreatureIds)
      {
        var boss = bossByCreature[creatureId];
        AddSpellCandidate(candidates, new WorldBossSpellCandidate(
            creatureId,
            boss.Name,
            spellId,
            spellName,
            textRow is null ? "" : Text(textRow, "Description_lang").Trim(),
            textRow is null ? "" : Text(textRow, "AuraDescription_lang").Trim(),
            spellIcons.GetValueOrDefault(spellId),
            "spell_effect_misc_value_matches_creature",
            creatureId.ToString(CultureInfo.InvariantCulture),
            Int(effect, "id"),
            Math.Max(0, Int(effect, "EffectIndex")),
            Math.Max(0, Int(effect, "Effect")),
            true));
      }
    }

    var modifiers = Rows("ModifierTree");
    var modifierChildren = modifiers.ToLookup(row => Math.Max(0, Int(row, "Parent")));
    var modifierById = modifiers.ToDictionary(row => Int(row, "id"));
    foreach (var objective in objectives.Where(objective => bossByCreature.ContainsKey(objective.CreatureId)))
    {
      var modifierRootId = PositiveOrNull(objective.RawCriteria, "Modifier_tree_ID");
      if (modifierRootId is null || !modifierById.ContainsKey(modifierRootId.Value)) continue;
      foreach (var modifier in WalkModifierTree(modifierRootId.Value, modifierById, modifierChildren))
      {
        var spellId = PositiveOrNull(modifier, "Asset");
        if (spellId is null || !spellNames.TryGetValue(spellId.Value, out var spellName)) continue;
        spellText.TryGetValue(spellId.Value, out var textRow);
        var boss = bossByCreature[objective.CreatureId];
        AddSpellCandidate(candidates, new WorldBossSpellCandidate(
            boss.CreatureId,
            boss.Name,
            spellId.Value,
            spellName,
            textRow is null ? "" : Text(textRow, "Description_lang").Trim(),
            textRow is null ? "" : Text(textRow, "AuraDescription_lang").Trim(),
            spellIcons.GetValueOrDefault(spellId.Value),
            "criteria_modifier_asset_is_spell",
            $"modifier {Int(modifier, "id")} type {Int(modifier, "Type")}",
            null,
            null,
            null,
            true));
      }
    }

    return candidates.Values.OrderBy(candidate => candidate.CreatureId)
        .ThenBy(candidate => candidate.SpellId)
        .ThenBy(candidate => candidate.EvidenceKind, StringComparer.Ordinal)
        .ToArray();
  }

  private static IReadOnlyList<WorldLootSourceCandidate> NormalizeLootSourceCandidates(
      IReadOnlyList<WorldItemSourceHint> sourceHints,
      IReadOnlyList<WorldBoss> bosses,
      IReadOnlyList<WorldEncounter> encounters,
      IReadOnlyList<WorldMap> maps,
      IReadOnlyList<WorldArea> areas)
  {
    var results = new Dictionary<string, WorldLootSourceCandidate>(StringComparer.Ordinal);
    foreach (var hint in sourceHints)
    {
      foreach (var boss in bosses.Where(boss =>
                   boss.Aliases.Any(alias => EntityPhraseMatches(hint.Description, alias))))
      {
        AddLootCandidate(results, new WorldLootSourceCandidate(
            hint.SourceInfoId,
            hint.ItemId,
            "boss",
            boss.CreatureId,
            boss.Name,
            boss.MapIds.Count == 1 ? boss.MapIds[0] : null,
            boss.CreatureId,
            "client_source_hint_name_match",
            hint.Description,
            true));
      }
      foreach (var encounter in encounters.Where(encounter =>
                   EntityPhraseMatches(hint.Description, encounter.Name)))
      {
        AddLootCandidate(results, new WorldLootSourceCandidate(
            hint.SourceInfoId,
            hint.ItemId,
            "encounter",
            encounter.EncounterId,
            encounter.Name,
            encounter.MapId,
            null,
            "client_source_hint_name_match",
            hint.Description,
            true));
      }
      foreach (var map in maps.Where(map => EntityPhraseMatches(hint.Description, map.Name)))
      {
        AddLootCandidate(results, new WorldLootSourceCandidate(
            hint.SourceInfoId,
            hint.ItemId,
            "map",
            map.MapId,
            map.Name,
            map.MapId,
            null,
            "client_source_hint_name_match",
            hint.Description,
            true));
      }
      foreach (var area in areas.Where(area =>
                   IsUsefulAreaSourceName(area.Name) &&
                   EntityPhraseMatches(hint.Description, area.Name)))
      {
        AddLootCandidate(results, new WorldLootSourceCandidate(
            hint.SourceInfoId,
            hint.ItemId,
            "area",
            area.AreaId,
            area.Name,
            area.MapId,
            null,
            "client_source_hint_name_match",
            hint.Description,
            true));
      }
    }
    return results.Values.OrderBy(candidate => candidate.SourceInfoId)
        .ThenBy(candidate => candidate.TargetKind, StringComparer.Ordinal)
        .ThenBy(candidate => candidate.TargetId)
        .ToArray();
  }

  private IReadOnlyList<WorldMapDifficulty> NormalizeMapDifficulties()
  {
    var difficultyNames = Rows("Difficulty")
        .ToDictionary(row => Int(row, "id"), row => Text(row, "Name_lang").Trim());
    return Rows("MapDifficulty").Select(row =>
    {
      var difficultyId = Math.Max(0, Int(row, "DifficultyID"));
      return new WorldMapDifficulty(
          Int(row, "id"),
          Math.Max(0, Int(row, "MapID")),
          difficultyId,
          difficultyNames.GetValueOrDefault(difficultyId) ?? $"Difficulty {difficultyId}",
          Math.Max(0, Int(row, "MaxPlayers")),
          Math.Max(0, Int(row, "ResetInterval")),
          Int(row, "Flags"),
          PositiveOrNull(row, "ContentTuningID"),
          row);
    }).OrderBy(entry => entry.MapId).ThenBy(entry => entry.DifficultyId).ToArray();
  }

  private IReadOnlyList<WorldContentTuning> NormalizeContentTunings() =>
      Rows("ContentTuning").Select(row => new WorldContentTuning(
          Int(row, "id"),
          Int(row, "ExpansionID"),
          Math.Max(0, Int(row, "MinLevelSquish")),
          Math.Max(0, Int(row, "MaxLevelSquish")),
          Math.Max(0, Int(row, "LfgMinLevel")),
          Math.Max(0, Int(row, "LfgMaxLevel")),
          Math.Max(0, Int(row, "ILevel")),
          Int(row, "Flags"),
          row)).OrderBy(entry => entry.ContentTuningId).ToArray();

  private static IReadOnlyDictionary<string, object?> FindCriteriaRoot(
      IReadOnlyDictionary<string, object?> tree,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> treeById)
  {
    var current = tree;
    var visited = new HashSet<int>();
    while (PositiveOrNull(current, "Parent") is int parentId &&
           visited.Add(parentId) &&
           treeById.TryGetValue(parentId, out var parent))
    {
      current = parent;
    }
    return current;
  }

  private static bool IsBossObjective(WorldCreatureObjective objective)
  {
    if (objective.EncounterIds.Count > 0) return true;
    if (objective.AchievementCategoryId is 15593 or 15594) return true;
    var root = NormalizeEntityName(objective.RootDescription);
    return root.StartsWith("kill ", StringComparison.Ordinal) ||
        root.Contains(" kills ", StringComparison.Ordinal) ||
        root.StartsWith("defeat ", StringComparison.Ordinal) ||
        root.StartsWith("complete the barrow deeps", StringComparison.Ordinal) ||
        root.StartsWith("complete hyjal summit", StringComparison.Ordinal);
  }

  private static bool IsBossNameObjective(WorldCreatureObjective objective)
  {
    if (objective.EncounterIds.Count > 0) return true;
    if (objective.AchievementCategoryId == 15594) return true;
    var root = NormalizeEntityName(objective.RootDescription);
    return root.StartsWith("kill ", StringComparison.Ordinal) ||
        root.StartsWith("defeat ", StringComparison.Ordinal) ||
        root.StartsWith("complete the barrow deeps", StringComparison.Ordinal) ||
        root.StartsWith("complete hyjal summit", StringComparison.Ordinal);
  }

  private static string BossNameFromRoot(string description)
  {
    var trimmed = description.Trim();
    if (trimmed.StartsWith("Kill ", StringComparison.OrdinalIgnoreCase)) return trimmed[5..].Trim();
    if (trimmed.StartsWith("Defeat ", StringComparison.OrdinalIgnoreCase))
    {
      return trimmed[7..].Trim().TrimEnd('.');
    }
    return "";
  }

  private static int BossNameScore(WorldCreatureObjective objective)
  {
    var score = 0;
    if (objective.EncounterIds.Count > 0) score += 100;
    var root = NormalizeEntityName(objective.RootDescription);
    if (root.StartsWith("kill ", StringComparison.Ordinal) ||
        root.StartsWith("defeat ", StringComparison.Ordinal)) score += 80;
    if (objective.AchievementCategoryId == 15594) score += 60;
    if (objective.AchievementCategoryId == 15593) score += 10;
    if (NormalizeEntityName(objective.Name) == root) score -= 10;
    return score;
  }

  private static void AddCreatureDisplayLink(
      IDictionary<(int CreatureId, int DisplayId), MutableCreatureDisplayLink> links,
      int creatureId,
      int displayId,
      double probability,
      double scale,
      string sourceKind)
  {
    var key = (creatureId, displayId);
    if (!links.TryGetValue(key, out var link))
    {
      link = new MutableCreatureDisplayLink(creatureId, displayId);
      links.Add(key, link);
    }
    link.Probability = Math.Max(link.Probability, probability);
    if (scale > 0) link.DisplayScale = scale;
    link.SourceKinds.Add(sourceKind);
  }

  private static void AddBossLocation(
      IDictionary<string, WorldBossLocation> results,
      WorldBossLocation location)
  {
    var key = string.Join(
        ':',
        location.CreatureId,
        location.MapId,
        location.AreaId,
        location.UiMapId,
        location.X,
        location.Y,
        location.EvidenceKind);
    results.TryAdd(key, location);
  }

  private static void AddSpellCandidate(
      IDictionary<string, WorldBossSpellCandidate> results,
      WorldBossSpellCandidate candidate)
  {
    var key = string.Join(
        ':',
        candidate.CreatureId,
        candidate.SpellId,
        candidate.EvidenceKind,
        candidate.SpellEffectId);
    results.TryAdd(key, candidate);
  }

  private static void AddLootCandidate(
      IDictionary<string, WorldLootSourceCandidate> results,
      WorldLootSourceCandidate candidate)
  {
    var key = string.Join(
        ':',
        candidate.SourceInfoId,
        candidate.TargetKind,
        candidate.TargetId);
    results.TryAdd(key, candidate);
  }

  private static IEnumerable<IReadOnlyDictionary<string, object?>> WalkModifierTree(
      int rootId,
      IReadOnlyDictionary<int, IReadOnlyDictionary<string, object?>> byId,
      ILookup<int, IReadOnlyDictionary<string, object?>> children)
  {
    var pending = new Stack<int>();
    var visited = new HashSet<int>();
    pending.Push(rootId);
    while (pending.Count > 0)
    {
      var id = pending.Pop();
      if (!visited.Add(id) || !byId.TryGetValue(id, out var row)) continue;
      yield return row;
      foreach (var child in children[id].OrderByDescending(child => Int(child, "id")))
      {
        pending.Push(Int(child, "id"));
      }
    }
  }

  private static bool EntityPhraseMatches(string text, string entityName)
  {
    var normalizedEntity = NormalizeEntityName(entityName);
    if (normalizedEntity.Length < 5) return false;
    var normalizedText = NormalizeEntityName(text);
    return string.Equals(normalizedText, normalizedEntity, StringComparison.Ordinal) ||
        $" {normalizedText} ".Contains($" {normalizedEntity} ", StringComparison.Ordinal);
  }

  private static bool IsUsefulAreaSourceName(string areaName)
  {
    var normalized = NormalizeEntityName(areaName);
    return normalized is not ("blacksmith" or "ruins" or "test" or "unknown" or "unused" or "world") &&
        !normalized.StartsWith("unused ", StringComparison.Ordinal) &&
        !normalized.StartsWith("test ", StringComparison.Ordinal);
  }

  private static string NormalizeEntityName(string value)
  {
    var builder = new StringBuilder(value.Length);
    var pendingSpace = false;
    foreach (var character in value.ToLowerInvariant())
    {
      if (char.IsLetterOrDigit(character))
      {
        if (pendingSpace && builder.Length > 0) builder.Append(' ');
        builder.Append(character);
        pendingSpace = false;
      }
      else
      {
        pendingSpace = true;
      }
    }
    return builder.ToString();
  }

  private sealed class MutableCreatureDisplayLink(int creatureId, int displayId)
  {
    public int CreatureId { get; } = creatureId;
    public int DisplayId { get; } = displayId;
    public HashSet<string> SourceKinds { get; } = new(StringComparer.Ordinal);
    public double Probability { get; set; }
    public double DisplayScale { get; set; } = 1;
  }

  private IReadOnlyList<WorldPoi> NormalizePois()
  {
    var pois = new List<WorldPoi>();
    pois.AddRange(Rows("AreaPOI").Select(row =>
    {
      var position = Doubles(row, "Pos", 3);
      return new WorldPoi(
          "area_poi",
          Int(row, "id"),
          RequiredText(row, "Name_lang", "AreaPOI"),
          Text(row, "Description_lang"),
          NonNegativeOrNull(row, "ContinentID"),
          PositiveOrNull(row, "AreaID"),
          position[0],
          position[1],
          position[2],
          NonNegativeOrNull(row, "Icon"),
          null,
          row);
    }));
    pois.AddRange(Rows("TaxiNodes").Select(row =>
    {
      var position = Doubles(row, "Pos", 3);
      return new WorldPoi(
          "taxi",
          Int(row, "id"),
          RequiredText(row, "Name_lang", "TaxiNodes"),
          "",
          NonNegativeOrNull(row, "ContinentID"),
          null,
          position[0],
          position[1],
          position[2],
          NonNegativeOrNull(row, "MinimapAtlasMemberID"),
          null,
          row);
    }));
    pois.AddRange(Rows("GameObjects").Select(row =>
    {
      var position = Doubles(row, "Pos", 3);
      return new WorldPoi(
          "game_object",
          Int(row, "id"),
          FallbackText(row, "Name_lang", "Game object"),
          "",
          null,
          null,
          position[0],
          position[1],
          position[2],
          NonNegativeOrNull(row, "DisplayID"),
          NonNegativeOrNull(row, "TypeID"),
          row);
    }));
    return pois.OrderBy(entry => entry.Kind, StringComparer.Ordinal)
        .ThenBy(entry => entry.EntityId)
        .ToArray();
  }

  private IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows(string tableName) =>
      tables.TryGetValue(tableName, out var table)
          ? table.EffectiveRows
          : throw new KeyNotFoundException($"World table '{tableName}' was not extracted");

  private static int Int(IReadOnlyDictionary<string, object?> row, string key)
  {
    if (!row.TryGetValue(key, out var value) || value is null)
    {
      throw new InvalidDataException($"Required numeric field '{key}' is missing");
    }
    return Convert.ToInt32(value, CultureInfo.InvariantCulture);
  }

  private static int Positive(IReadOnlyDictionary<string, object?> row, string key)
  {
    var value = Int(row, key);
    return value > 0 ? value : throw new InvalidDataException($"Field '{key}' must be positive");
  }

  private static int? PositiveOrNull(IReadOnlyDictionary<string, object?> row, string key)
  {
    var value = Int(row, key);
    return value > 0 ? value : null;
  }

  private static int? NonNegativeOrNull(IReadOnlyDictionary<string, object?> row, string key)
  {
    var value = Int(row, key);
    return value >= 0 ? value : null;
  }

  private static double Double(IReadOnlyDictionary<string, object?> row, string key)
  {
    if (!row.TryGetValue(key, out var value) || value is null)
    {
      throw new InvalidDataException($"Required floating-point field '{key}' is missing");
    }
    var number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
    return double.IsFinite(number)
        ? number
        : throw new InvalidDataException($"Field '{key}' is not finite");
  }

  private static string Text(IReadOnlyDictionary<string, object?> row, string key) =>
      row.TryGetValue(key, out var value) ? Convert.ToString(value, CultureInfo.InvariantCulture) ?? "" : "";

  private static string RequiredText(
      IReadOnlyDictionary<string, object?> row,
      string key,
      string tableName)
  {
    var value = Text(row, key).Trim();
    return value.Length > 0
        ? value
        : throw new InvalidDataException($"{tableName} row {Int(row, "id")} has no '{key}'");
  }

  private static string FallbackText(
      IReadOnlyDictionary<string, object?> row,
      string key,
      string entityLabel)
  {
    var value = Text(row, key).Trim();
    return value.Length > 0 ? value : $"{entityLabel} {Int(row, "id")}";
  }

  private static string FirstNonEmpty(params string[] values) =>
      values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";

  private static IReadOnlyList<int> Ints(IReadOnlyDictionary<string, object?> row, string key) =>
      Values(row, key).Select(value => Convert.ToInt32(value, CultureInfo.InvariantCulture)).ToArray();

  private static IReadOnlyList<double> Doubles(
      IReadOnlyDictionary<string, object?> row,
      string key,
      int requiredLength)
  {
    var values = Values(row, key)
        .Select(value => Convert.ToDouble(value, CultureInfo.InvariantCulture))
        .ToArray();
    if (values.Length != requiredLength || values.Any(value => !double.IsFinite(value)))
    {
      throw new InvalidDataException($"Field '{key}' must contain {requiredLength} finite values");
    }
    return values;
  }

  private static IEnumerable<object> Values(
      IReadOnlyDictionary<string, object?> row,
      string key)
  {
    if (!row.TryGetValue(key, out var value) || value is not IEnumerable enumerable || value is string)
    {
      throw new InvalidDataException($"Required array field '{key}' is missing");
    }
    return enumerable.Cast<object>();
  }
}
