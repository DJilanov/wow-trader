namespace WowTrader.Extractor;

internal sealed record BuildMetadata(
    string Product,
    string ClientVersion,
    int BuildNumber,
    string BuildKey,
    string CdnKey);

internal sealed record ArtifactDescriptor(string Path, int RecordCount, string Sha256);

internal sealed record HotfixManifest(string Status, string? Sha256);

internal sealed record DefinitionsManifest(string Source, string Revision);

internal sealed record ExtractorManifest(string Name, string Version, string? Revision);

internal sealed record SnapshotManifest(
    string SchemaVersion,
    string Product,
    string ClientVersion,
    int BuildNumber,
    string BuildKey,
    string CdnKey,
    string Locale,
    DateTimeOffset ExtractedAt,
    HotfixManifest Hotfix,
    DefinitionsManifest Definitions,
    ExtractorManifest Extractor,
    IReadOnlyDictionary<string, ArtifactDescriptor> RawTables,
    IReadOnlyDictionary<string, ArtifactDescriptor> NormalizedArtifacts);

internal sealed record Db2TableSnapshot(
    string Name,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> BaseRows,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> EffectiveRows,
    int EncryptedSectionCount,
    int EncryptedRecordCount);

internal sealed record WorldSnapshotManifest(
    string SchemaVersion,
    string Product,
    string ClientVersion,
    int BuildNumber,
    string BuildKey,
    string CdnKey,
    string Locale,
    DateTimeOffset ExtractedAt,
    HotfixManifest Hotfix,
    DefinitionsManifest Definitions,
    ExtractorManifest Extractor,
    IReadOnlyDictionary<string, ArtifactDescriptor> RawTables,
    IReadOnlyDictionary<string, ArtifactDescriptor> NormalizedArtifacts,
    ArtifactDescriptor MapMediaManifest);

internal sealed record WorldMap(
    int MapId,
    string Directory,
    string Name,
    string Description,
    int MapType,
    int InstanceType,
    int ExpansionId,
    int AreaTableId,
    int? ParentMapId,
    int? CosmeticParentMapId,
    int MaxPlayers,
    int? WdtFileDataId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldArea(
    int AreaId,
    int MapId,
    int? ParentAreaId,
    string Name,
    string ZoneName,
    int ExplorationLevel,
    int FactionGroupMask,
    IReadOnlyList<int> Flags,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldUiMap(
    int UiMapId,
    string Name,
    int? ParentUiMapId,
    int Type,
    int System,
    int Flags,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldUiMapAssignment(
    int AssignmentId,
    int UiMapId,
    int MapId,
    int? AreaId,
    int OrderIndex,
    double UiMinX,
    double UiMinY,
    double UiMaxX,
    double UiMaxY,
    IReadOnlyList<double> Region,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldMapArt(
    int MapArtId,
    int StyleId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldUiMapArtLink(
    int LinkId,
    int UiMapId,
    int MapArtId,
    int PhaseId);

internal sealed record WorldMapArtLayer(
    int LayerId,
    int StyleId,
    int LayerIndex,
    int LayerWidth,
    int LayerHeight,
    int TileWidth,
    int TileHeight,
    double MinScale,
    double MaxScale,
    int AdditionalZoomSteps);

internal sealed record WorldMapArtTile(
    int TileId,
    int MapArtId,
    int LayerIndex,
    int RowIndex,
    int ColumnIndex,
    int FileDataId);

internal sealed record WorldPoi(
    string Kind,
    int EntityId,
    string Name,
    string Description,
    int? MapId,
    int? AreaId,
    double X,
    double Y,
    double Z,
    int? IconId,
    int? TypeId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldEncounter(
    int EncounterId,
    int MapId,
    int DifficultyId,
    string Name,
    int OrderIndex,
    int Flags,
    int? IconFileDataId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldLfgDungeon(
    int LfgDungeonId,
    string Name,
    string Description,
    int? MapId,
    int DifficultyId,
    int ContentTuningId,
    int TypeId,
    int Subtype,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldQuest(
    int QuestId,
    int UniqueBitFlag,
    int UiQuestDetailsThemeId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldQuestLine(
    int QuestLineId,
    string Name,
    string Description,
    int Flags,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldQuestLineMember(
    int RelationId,
    int QuestLineId,
    int QuestId,
    int OrderIndex,
    int Flags);

internal sealed record WorldQuestPoiPoint(int PointId, double X, double Y, double Z);

internal sealed record WorldQuestPoi(
    int BlobId,
    int QuestId,
    int MapId,
    int? UiMapId,
    int ObjectiveIndex,
    int? ObjectiveId,
    int Flags,
    IReadOnlyList<WorldQuestPoiPoint> Points,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldItemSourceHint(
    int SourceInfoId,
    int ItemModifiedAppearanceId,
    int? ItemId,
    int SourceType,
    string Description,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldCreatureObjective(
    int CriteriaTreeId,
    int CriteriaId,
    int CreatureId,
    string Name,
    int ParentCriteriaTreeId,
    int RootCriteriaTreeId,
    string RootDescription,
    int OrderIndex,
    int Amount,
    int Flags,
    int? AchievementId,
    string? AchievementTitle,
    string? AchievementDescription,
    int? AchievementCategoryId,
    int? AchievementInstanceMapId,
    int? AchievementIconFileDataId,
    IReadOnlyList<int> EncounterIds,
    IReadOnlyList<int> MapIds,
    IReadOnlyDictionary<string, object?> RawCriteriaTree,
    IReadOnlyDictionary<string, object?> RawCriteria);

internal sealed record WorldBoss(
    int CreatureId,
    string Name,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> ContextNames,
    IReadOnlyList<int> CriteriaTreeIds,
    IReadOnlyList<int> CriteriaIds,
    IReadOnlyList<int> AchievementIds,
    IReadOnlyList<int> EncounterIds,
    IReadOnlyList<int> MapIds,
    IReadOnlyList<int> IconFileDataIds,
    string IdentityEvidence,
    string StaticModelStatus);

internal sealed record WorldBossLocation(
    int CreatureId,
    string BossName,
    int? MapId,
    string? MapName,
    int? AreaId,
    int? UiMapId,
    double? X,
    double? Y,
    double? Z,
    string Precision,
    string EvidenceKind,
    string EvidenceLabel,
    bool RequiresReview);

internal sealed record WorldCreatureModel(
    int CreatureId,
    int DisplayId,
    IReadOnlyList<string> SourceKinds,
    double Probability,
    double DisplayScale,
    int ModelId,
    int ModelFileDataId,
    bool ModelFileDataPresent,
    IReadOnlyList<int> TextureFileDataIds,
    double CreatureModelScale,
    double ModelScale,
    double CollisionWidth,
    double CollisionHeight,
    IReadOnlyList<double> GeometryBounds);

internal sealed record WorldBossSpellCandidate(
    int CreatureId,
    string BossName,
    int SpellId,
    string SpellName,
    string Description,
    string AuraDescription,
    int? IconFileDataId,
    string EvidenceKind,
    string EvidenceText,
    int? SpellEffectId,
    int? EffectIndex,
    int? EffectType,
    bool RequiresReview);

internal sealed record WorldLootSourceCandidate(
    int SourceInfoId,
    int? ItemId,
    string TargetKind,
    int TargetId,
    string TargetName,
    int? MapId,
    int? CreatureId,
    string EvidenceKind,
    string Description,
    bool RequiresReview);

internal sealed record WorldMapDifficulty(
    int MapDifficultyId,
    int MapId,
    int DifficultyId,
    string DifficultyName,
    int MaxPlayers,
    int ResetInterval,
    int Flags,
    int? ContentTuningId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record WorldContentTuning(
    int ContentTuningId,
    int ExpansionId,
    int MinimumLevel,
    int MaximumLevel,
    int LfgMinimumLevel,
    int LfgMaximumLevel,
    int ItemLevel,
    int Flags,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record NormalizedWorld(
    IReadOnlyList<WorldMap> Maps,
    IReadOnlyList<WorldArea> Areas,
    IReadOnlyList<WorldUiMap> UiMaps,
    IReadOnlyList<WorldUiMapAssignment> UiMapAssignments,
    IReadOnlyList<WorldMapArt> MapArts,
    IReadOnlyList<WorldUiMapArtLink> UiMapArtLinks,
    IReadOnlyList<WorldMapArtLayer> MapArtLayers,
    IReadOnlyList<WorldMapArtTile> MapArtTiles,
    IReadOnlyList<WorldPoi> Pois,
    IReadOnlyList<WorldEncounter> Encounters,
    IReadOnlyList<WorldLfgDungeon> LfgDungeons,
    IReadOnlyList<WorldQuest> Quests,
    IReadOnlyList<WorldQuestLine> QuestLines,
    IReadOnlyList<WorldQuestLineMember> QuestLineMembers,
    IReadOnlyList<WorldQuestPoi> QuestPois,
    IReadOnlyList<WorldItemSourceHint> ItemSourceHints,
    IReadOnlyList<WorldCreatureObjective> CreatureObjectives,
    IReadOnlyList<WorldBoss> Bosses,
    IReadOnlyList<WorldBossLocation> BossLocations,
    IReadOnlyList<WorldCreatureModel> CreatureModels,
    IReadOnlyList<WorldBossSpellCandidate> BossSpellCandidates,
    IReadOnlyList<WorldLootSourceCandidate> LootSourceCandidates,
    IReadOnlyList<WorldMapDifficulty> MapDifficulties,
    IReadOnlyList<WorldContentTuning> ContentTunings);

internal sealed record CatalogItem(
    int ItemId,
    string Name,
    string Description,
    int ClassId,
    int SubclassId,
    int Quality,
    int RequiredLevel,
    int ItemLevel,
    int? RequiredSkillId,
    int RequiredSkillRank,
    int StackSize,
    int Binding,
    int InventoryType,
    int AllowableClassMask,
    IReadOnlyList<int> AllowableRaceMask,
    int MaxCount,
    int MaxDurability,
    int DelayMs,
    int DamageType,
    int? ItemSetId,
    int? LimitCategoryId,
    int? SocketBonusEnchantmentId,
    int? GemPropertiesId,
    int? RandomSuffixGroupId,
    int? RandomPropertyId,
    int? RequiredAbilityId,
    int? MinimumFactionId,
    int MinimumReputation,
    string BuyPriceCopper,
    string SellPriceCopper,
    int? IconFileDataId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogSpell(
    int SpellId,
    string Name,
    string Description,
    string AuraDescription,
    int DurationMs,
    int MaximumDurationMs,
    int? ProcChance,
    int? ProcCharges,
    int? ProcCooldownMs,
    string DescriptionVariables,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogItemStat(int ItemId, int Slot, int StatType, int Value);

internal sealed record CatalogItemDamage(
    int ItemId,
    int Slot,
    int DamageType,
    int Minimum,
    int Maximum);

internal sealed record CatalogItemResistance(int ItemId, int School, int Value);

internal sealed record CatalogItemSocket(int ItemId, int Slot, int SocketType);

internal sealed record CatalogItemEffect(
    int ItemEffectId,
    int ItemId,
    int Slot,
    int SpellId,
    int TriggerType,
    int Charges,
    int CooldownMs,
    int CategoryCooldownMs,
    int? SpellCategoryId,
    int? SpecializationId,
    int? PlayerConditionId);

internal sealed record CatalogItemSet(
    int ItemSetId,
    string Name,
    int Flags,
    int? RequiredSkillId,
    int RequiredSkillRank,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogItemSetMember(int ItemSetId, int ItemId, int Slot);

internal sealed record CatalogItemSetEffect(
    int ItemSetEffectId,
    int ItemSetId,
    int SpellId,
    int Threshold,
    int? SpecializationId);

internal sealed record CatalogGameClass(int ClassId, string Name);

internal sealed record CatalogGameRace(int RaceId, string Name);

internal sealed record CatalogItemClassDefinition(int ClassId, string Name);

internal sealed record CatalogItemSubclassDefinition(
    int ClassId,
    int SubclassId,
    string Name,
    string VerboseName,
    int PrerequisiteProficiency);

internal sealed record CatalogItemLimitCategory(
    int LimitCategoryId,
    string Name,
    int Quantity,
    int Flags);

internal sealed record CatalogGemProperty(
    int GemPropertiesId,
    int EnchantmentId,
    int SocketType,
    int MinimumItemLevel);

internal sealed record CatalogItemEnchantment(
    int EnchantmentId,
    string Name,
    int Charges,
    int? GemItemId,
    int? ConditionId,
    int? RequiredSkillId,
    int RequiredSkillRank,
    int MinimumLevel,
    int MaximumLevel,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogItemEnchantmentEffect(
    int EnchantmentId,
    int Slot,
    int EffectType,
    int MinimumPoints,
    int MaximumPoints,
    int Argument);

internal sealed record CatalogItemRandomEnchantment(
    string Kind,
    int VariantId,
    string Name,
    int Slot,
    int EnchantmentId,
    int AllocationPercent);

internal sealed record CatalogItemBonusTree(int ItemId, int BonusTreeId);

internal sealed record CatalogItemBonusTreeNode(
    int NodeId,
    int BonusTreeId,
    int ItemContext,
    int? ChildBonusTreeId,
    int? ChildBonusListId,
    int? ChildItemLevelSelectorId,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogItemBonus(
    int BonusListId,
    int OrderIndex,
    int Type,
    IReadOnlyList<int> Values);

internal sealed record CatalogProfession(
    int SkillLineId,
    string Name,
    string Slug,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogRecipe(
    int RecipeSpellId,
    int ProfessionSkillLineId,
    int RequiredSkillRank,
    int CraftTimeMs,
    int CooldownMs,
    int? CooldownCategoryId,
    int CategoryCooldownMs,
    string OutputKind,
    string ExtractionStatus,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogRecipeInput(
    int RecipeSpellId,
    int ReagentItemId,
    int Quantity,
    bool Optional);

internal sealed record CatalogRecipeOutput(
    int RecipeSpellId,
    int? OutputItemId,
    int? EnchantmentId,
    int MinimumQuantity,
    int MaximumQuantity,
    int ExpectedQuantityNumerator,
    int ExpectedQuantityDenominator);

internal sealed record CatalogRecipeTeachingItem(
    int RecipeSpellId,
    int TeachingItemId,
    int? LearningSpellId);

internal sealed record CatalogTransformation(
    int TransformationId,
    int SpellId,
    int SourceItemId,
    string Kind,
    int CooldownMs,
    int CategoryCooldownMs,
    string ExtractionStatus,
    IReadOnlyDictionary<string, object?> RawRecord);

internal sealed record CatalogTransformationInput(
    int TransformationId,
    int ItemId,
    int Quantity);

internal sealed record CatalogTransformationOutput(
    int TransformationId,
    int ItemId,
    int MinimumQuantity,
    int MaximumQuantity,
    int ExpectedQuantityNumerator,
    int ExpectedQuantityDenominator);

internal sealed record NormalizedCatalog(
    IReadOnlyList<CatalogItem> Items,
    IReadOnlyList<CatalogSpell> Spells,
    IReadOnlyList<CatalogItemStat> ItemStats,
    IReadOnlyList<CatalogItemDamage> ItemDamages,
    IReadOnlyList<CatalogItemResistance> ItemResistances,
    IReadOnlyList<CatalogItemSocket> ItemSockets,
    IReadOnlyList<CatalogItemEffect> ItemEffects,
    IReadOnlyList<CatalogItemSet> ItemSets,
    IReadOnlyList<CatalogItemSetMember> ItemSetMembers,
    IReadOnlyList<CatalogItemSetEffect> ItemSetEffects,
    IReadOnlyList<CatalogGameClass> GameClasses,
    IReadOnlyList<CatalogGameRace> GameRaces,
    IReadOnlyList<CatalogItemClassDefinition> ItemClasses,
    IReadOnlyList<CatalogItemSubclassDefinition> ItemSubclasses,
    IReadOnlyList<CatalogItemLimitCategory> ItemLimitCategories,
    IReadOnlyList<CatalogGemProperty> GemProperties,
    IReadOnlyList<CatalogItemEnchantment> ItemEnchantments,
    IReadOnlyList<CatalogItemEnchantmentEffect> ItemEnchantmentEffects,
    IReadOnlyList<CatalogItemRandomEnchantment> ItemRandomEnchantments,
    IReadOnlyList<CatalogItemBonusTree> ItemBonusTrees,
    IReadOnlyList<CatalogItemBonusTreeNode> ItemBonusTreeNodes,
    IReadOnlyList<CatalogItemBonus> ItemBonuses,
    IReadOnlyList<CatalogProfession> Professions,
    IReadOnlyList<CatalogRecipe> Recipes,
    IReadOnlyList<CatalogRecipeInput> RecipeInputs,
    IReadOnlyList<CatalogRecipeOutput> RecipeOutputs,
    IReadOnlyList<CatalogRecipeTeachingItem> RecipeTeachingItems,
    IReadOnlyList<CatalogTransformation> Transformations,
    IReadOnlyList<CatalogTransformationInput> TransformationInputs,
    IReadOnlyList<CatalogTransformationOutput> TransformationOutputs);

internal sealed record ValidationIssue(
    string Severity,
    string Code,
    string Message,
    int? EntityId = null);

internal sealed record ValidationCounts(
    int Items,
    int Spells,
    int ItemStats,
    int ItemDamages,
    int ItemResistances,
    int ItemSockets,
    int ItemEffects,
    int ItemSets,
    int ItemSetMembers,
    int ItemSetEffects,
    int Professions,
    int Recipes,
    int RecipeInputs,
    int RecipeOutputs,
    int RecipeTeachingItems,
    int Transformations,
    int TransformationInputs,
    int TransformationOutputs,
    IReadOnlyDictionary<string, int> RawTableRows,
    int EncryptedSections,
    int EncryptedRecords);

internal sealed record ValidationReport(
    bool Valid,
    BuildMetadata Build,
    string HotfixStatus,
    ValidationCounts Counts,
    IReadOnlyList<ValidationIssue> Issues);
