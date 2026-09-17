import { z } from "zod";

import { isoDateTimeSchema, localeSchema, sha256Schema, wowIdSchema } from "./primitives.js";

const artifactSchema = z.object({
  path: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  sha256: sha256Schema,
});

const rawRecordSchema = z.record(z.string(), z.unknown());
const finiteNumberSchema = z.number().finite();

export const worldSnapshotManifestSchema = z.object({
  schemaVersion: z.literal("world-snapshot-manifest.v1"),
  product: z.string().min(1),
  clientVersion: z.string().min(1),
  buildNumber: z.number().int().positive(),
  buildKey: z.string().regex(/^[a-fA-F0-9]{32}$/),
  cdnKey: z.string().regex(/^[a-fA-F0-9]{32}$/),
  locale: localeSchema,
  extractedAt: isoDateTimeSchema,
  hotfix: z.object({
    status: z.enum(["applied", "missing", "not_available"]),
    sha256: sha256Schema.nullable(),
  }),
  definitions: z.object({
    source: z.string().min(1),
    revision: z.string().min(1),
  }),
  extractor: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    revision: z.string().min(1).nullable(),
  }),
  rawTables: z.record(z.string().min(1), artifactSchema),
  normalizedArtifacts: z.record(z.string().min(1), artifactSchema),
  mapMediaManifest: artifactSchema,
});

export const worldMapSchema = z.object({
  mapId: z.number().int().nonnegative(),
  directory: z.string(),
  name: z.string().min(1),
  description: z.string(),
  mapType: z.number().int().nonnegative(),
  instanceType: z.number().int().nonnegative(),
  expansionId: z.number().int().nonnegative(),
  areaTableId: z.number().int().nonnegative(),
  parentMapId: z.number().int().nonnegative().nullable(),
  cosmeticParentMapId: z.number().int().nonnegative().nullable(),
  maxPlayers: z.number().int().nonnegative(),
  wdtFileDataId: wowIdSchema.nullable(),
  rawRecord: rawRecordSchema,
});

export const worldAreaSchema = z.object({
  areaId: wowIdSchema,
  mapId: z.number().int().nonnegative(),
  parentAreaId: wowIdSchema.nullable(),
  name: z.string().min(1),
  zoneName: z.string(),
  explorationLevel: z.number().int().nonnegative(),
  factionGroupMask: z.number().int().nonnegative(),
  flags: z.array(z.number().int()),
  rawRecord: rawRecordSchema,
});

export const worldUiMapSchema = z.object({
  uiMapId: wowIdSchema,
  name: z.string().min(1),
  parentUiMapId: wowIdSchema.nullable(),
  type: z.number().int().nonnegative(),
  system: z.number().int().nonnegative(),
  flags: z.number().int(),
  rawRecord: rawRecordSchema,
});

export const worldUiMapAssignmentSchema = z.object({
  assignmentId: wowIdSchema,
  uiMapId: wowIdSchema,
  mapId: z.number().int().nonnegative(),
  areaId: wowIdSchema.nullable(),
  orderIndex: z.number().int(),
  uiMinX: finiteNumberSchema,
  uiMinY: finiteNumberSchema,
  uiMaxX: finiteNumberSchema,
  uiMaxY: finiteNumberSchema,
  region: z.array(finiteNumberSchema).length(6),
  rawRecord: rawRecordSchema,
});

export const worldMapArtSchema = z.object({
  mapArtId: wowIdSchema,
  styleId: wowIdSchema,
  rawRecord: rawRecordSchema,
});

export const worldUiMapArtLinkSchema = z.object({
  linkId: wowIdSchema,
  uiMapId: wowIdSchema,
  mapArtId: wowIdSchema,
  phaseId: z.number().int().nonnegative(),
});

export const worldMapArtLayerSchema = z.object({
  layerId: wowIdSchema,
  styleId: wowIdSchema,
  layerIndex: z.number().int().nonnegative(),
  layerWidth: z.number().int().positive(),
  layerHeight: z.number().int().positive(),
  tileWidth: z.number().int().positive(),
  tileHeight: z.number().int().positive(),
  minScale: finiteNumberSchema,
  maxScale: finiteNumberSchema,
  additionalZoomSteps: z.number().int().nonnegative(),
});

export const worldMapArtTileSchema = z.object({
  tileId: wowIdSchema,
  mapArtId: wowIdSchema,
  layerIndex: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  columnIndex: z.number().int().nonnegative(),
  fileDataId: wowIdSchema,
});

export const worldPoiKindSchema = z.enum(["area_poi", "taxi", "game_object"]);

export const worldPoiSchema = z.object({
  kind: worldPoiKindSchema,
  entityId: wowIdSchema,
  name: z.string().min(1),
  description: z.string(),
  mapId: z.number().int().nonnegative().nullable(),
  areaId: wowIdSchema.nullable(),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema,
  iconId: z.number().int().nonnegative().nullable(),
  typeId: z.number().int().nonnegative().nullable(),
  rawRecord: rawRecordSchema,
});

export const worldEncounterSchema = z.object({
  encounterId: wowIdSchema,
  mapId: z.number().int().nonnegative(),
  difficultyId: z.number().int().nonnegative(),
  name: z.string().min(1),
  orderIndex: z.number().int(),
  flags: z.number().int(),
  iconFileDataId: wowIdSchema.nullable(),
  rawRecord: rawRecordSchema,
});

export const worldLfgDungeonSchema = z.object({
  lfgDungeonId: wowIdSchema,
  name: z.string().min(1),
  description: z.string(),
  mapId: z.number().int().nonnegative().nullable(),
  difficultyId: z.number().int().nonnegative(),
  contentTuningId: z.number().int().nonnegative(),
  typeId: z.number().int().nonnegative(),
  subtype: z.number().int().nonnegative(),
  rawRecord: rawRecordSchema,
});

export const worldQuestSchema = z.object({
  questId: wowIdSchema,
  uniqueBitFlag: z.number().int().nonnegative(),
  uiQuestDetailsThemeId: z.number().int().nonnegative(),
  rawRecord: rawRecordSchema,
});

export const worldQuestLineSchema = z.object({
  questLineId: wowIdSchema,
  name: z.string().min(1),
  description: z.string(),
  flags: z.number().int(),
  rawRecord: rawRecordSchema,
});

export const worldQuestLineMemberSchema = z.object({
  relationId: wowIdSchema,
  questLineId: wowIdSchema,
  questId: wowIdSchema,
  orderIndex: z.number().int().nonnegative(),
  flags: z.number().int(),
});

export const worldQuestPoiSchema = z.object({
  blobId: wowIdSchema,
  questId: wowIdSchema,
  mapId: z.number().int().nonnegative(),
  uiMapId: wowIdSchema.nullable(),
  objectiveIndex: z.number().int(),
  objectiveId: z.number().int().nonnegative().nullable(),
  flags: z.number().int(),
  points: z.array(
    z.object({
      pointId: wowIdSchema,
      x: finiteNumberSchema,
      y: finiteNumberSchema,
      z: finiteNumberSchema,
    }),
  ),
  rawRecord: rawRecordSchema,
});

export const worldItemSourceHintSchema = z.object({
  sourceInfoId: wowIdSchema,
  itemModifiedAppearanceId: wowIdSchema,
  itemId: wowIdSchema.nullable(),
  sourceType: z.number().int().nonnegative(),
  description: z.string().min(1),
  rawRecord: rawRecordSchema,
});

export const worldCreatureObjectiveSchema = z.object({
  criteriaTreeId: wowIdSchema,
  criteriaId: wowIdSchema,
  creatureId: wowIdSchema,
  name: z.string().min(1),
  parentCriteriaTreeId: z.number().int().nonnegative(),
  rootCriteriaTreeId: wowIdSchema,
  rootDescription: z.string(),
  orderIndex: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  flags: z.number().int(),
  achievementId: wowIdSchema.nullable(),
  achievementTitle: z.string().nullable(),
  achievementDescription: z.string().nullable(),
  achievementCategoryId: wowIdSchema.nullable(),
  achievementInstanceMapId: z.number().int().nonnegative().nullable(),
  achievementIconFileDataId: wowIdSchema.nullable(),
  encounterIds: z.array(wowIdSchema),
  mapIds: z.array(z.number().int().nonnegative()),
  rawCriteriaTree: rawRecordSchema,
  rawCriteria: rawRecordSchema,
});

export const worldBossSchema = z.object({
  creatureId: wowIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  contextNames: z.array(z.string().min(1)),
  criteriaTreeIds: z.array(wowIdSchema).min(1),
  criteriaIds: z.array(wowIdSchema).min(1),
  achievementIds: z.array(wowIdSchema),
  encounterIds: z.array(wowIdSchema),
  mapIds: z.array(z.number().int().nonnegative()),
  iconFileDataIds: z.array(wowIdSchema),
  identityEvidence: z.literal("criteria_type_0"),
  staticModelStatus: z.enum(["resolved_static", "unresolved_static"]),
});

export const worldBossLocationSchema = z.object({
  creatureId: wowIdSchema,
  bossName: z.string().min(1),
  mapId: z.number().int().nonnegative().nullable(),
  mapName: z.string().min(1).nullable(),
  areaId: wowIdSchema.nullable().optional().default(null),
  uiMapId: wowIdSchema.nullable(),
  x: finiteNumberSchema.nullable(),
  y: finiteNumberSchema.nullable(),
  z: finiteNumberSchema.nullable(),
  precision: z.enum(["map", "point"]),
  evidenceKind: z.enum([
    "encounter_exact_name",
    "achievement_instance_map",
    "criteria_name_exact_map",
    "criteria_name_exact_area",
    "area_poi_exact_name",
  ]),
  evidenceLabel: z.string().min(1),
  requiresReview: z.boolean(),
});

export const worldCreatureModelSchema = z.object({
  creatureId: wowIdSchema,
  displayId: wowIdSchema,
  sourceKinds: z.array(z.enum(["creature_display_slot", "creature_x_display"])).min(1),
  probability: finiteNumberSchema,
  displayScale: finiteNumberSchema,
  modelId: wowIdSchema,
  modelFileDataId: wowIdSchema,
  modelFileDataPresent: z.boolean(),
  textureFileDataIds: z.array(wowIdSchema),
  creatureModelScale: finiteNumberSchema,
  modelScale: finiteNumberSchema,
  collisionWidth: finiteNumberSchema,
  collisionHeight: finiteNumberSchema,
  geometryBounds: z.array(finiteNumberSchema).length(6),
});

export const worldBossSpellCandidateSchema = z.object({
  creatureId: wowIdSchema,
  bossName: z.string().min(1),
  spellId: wowIdSchema,
  spellName: z.string().min(1),
  description: z.string(),
  auraDescription: z.string(),
  iconFileDataId: wowIdSchema.nullable(),
  evidenceKind: z.enum([
    "spell_exact_boss_name",
    "spell_text_mentions_boss",
    "spell_effect_misc_value_matches_creature",
    "criteria_modifier_asset_is_spell",
  ]),
  evidenceText: z.string().min(1),
  spellEffectId: wowIdSchema.nullable(),
  effectIndex: z.number().int().nonnegative().nullable(),
  effectType: z.number().int().nonnegative().nullable(),
  requiresReview: z.literal(true),
});

export const worldLootSourceCandidateSchema = z.object({
  sourceInfoId: wowIdSchema,
  itemId: wowIdSchema.nullable(),
  targetKind: z.enum(["boss", "encounter", "map", "area"]),
  targetId: z.number().int().nonnegative(),
  targetName: z.string().min(1),
  mapId: z.number().int().nonnegative().nullable(),
  creatureId: wowIdSchema.nullable(),
  evidenceKind: z.literal("client_source_hint_name_match"),
  description: z.string().min(1),
  requiresReview: z.literal(true),
});

export const worldMapDifficultySchema = z.object({
  mapDifficultyId: wowIdSchema,
  mapId: z.number().int().nonnegative(),
  difficultyId: z.number().int().nonnegative(),
  difficultyName: z.string().min(1),
  maxPlayers: z.number().int().nonnegative(),
  resetInterval: z.number().int().nonnegative(),
  flags: z.number().int(),
  contentTuningId: wowIdSchema.nullable(),
  rawRecord: rawRecordSchema,
});

export const worldContentTuningSchema = z.object({
  contentTuningId: wowIdSchema,
  expansionId: z.number().int(),
  minimumLevel: z.number().int().nonnegative(),
  maximumLevel: z.number().int().nonnegative(),
  lfgMinimumLevel: z.number().int().nonnegative(),
  lfgMaximumLevel: z.number().int().nonnegative(),
  itemLevel: z.number().int().nonnegative(),
  flags: z.number().int(),
  rawRecord: rawRecordSchema,
});

export const mapMediaManifestSchema = z.object({
  schemaVersion: z.literal("map-media-manifest.v1"),
  product: z.string().min(1),
  clientVersion: z.string().min(1),
  buildNumber: z.number().int().positive(),
  extractedAt: isoDateTimeSchema,
  tiles: z.array(
    z.object({
      fileDataId: wowIdSchema,
      path: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      sha256: sha256Schema,
    }),
  ),
  unavailableTiles: z.array(
    z.object({
      fileDataId: wowIdSchema,
      reason: z.string().min(1),
    }),
  ),
});

export const worldBundleSchema = z.object({
  manifest: worldSnapshotManifestSchema,
  maps: z.array(worldMapSchema),
  areas: z.array(worldAreaSchema),
  uiMaps: z.array(worldUiMapSchema),
  uiMapAssignments: z.array(worldUiMapAssignmentSchema),
  mapArts: z.array(worldMapArtSchema),
  uiMapArtLinks: z.array(worldUiMapArtLinkSchema),
  mapArtLayers: z.array(worldMapArtLayerSchema),
  mapArtTiles: z.array(worldMapArtTileSchema),
  pois: z.array(worldPoiSchema),
  encounters: z.array(worldEncounterSchema),
  lfgDungeons: z.array(worldLfgDungeonSchema),
  quests: z.array(worldQuestSchema),
  questLines: z.array(worldQuestLineSchema),
  questLineMembers: z.array(worldQuestLineMemberSchema),
  questPois: z.array(worldQuestPoiSchema),
  itemSourceHints: z.array(worldItemSourceHintSchema),
  creatureObjectives: z.array(worldCreatureObjectiveSchema),
  bosses: z.array(worldBossSchema),
  bossLocations: z.array(worldBossLocationSchema),
  creatureModels: z.array(worldCreatureModelSchema),
  bossSpellCandidates: z.array(worldBossSpellCandidateSchema),
  lootSourceCandidates: z.array(worldLootSourceCandidateSchema),
  mapDifficulties: z.array(worldMapDifficultySchema),
  contentTunings: z.array(worldContentTuningSchema),
  mapMedia: mapMediaManifestSchema,
});

export type WorldSnapshotManifest = z.infer<typeof worldSnapshotManifestSchema>;
export type WorldMap = z.infer<typeof worldMapSchema>;
export type WorldArea = z.infer<typeof worldAreaSchema>;
export type WorldUiMap = z.infer<typeof worldUiMapSchema>;
export type WorldUiMapAssignment = z.infer<typeof worldUiMapAssignmentSchema>;
export type WorldMapArt = z.infer<typeof worldMapArtSchema>;
export type WorldUiMapArtLink = z.infer<typeof worldUiMapArtLinkSchema>;
export type WorldMapArtLayer = z.infer<typeof worldMapArtLayerSchema>;
export type WorldMapArtTile = z.infer<typeof worldMapArtTileSchema>;
export type WorldPoi = z.infer<typeof worldPoiSchema>;
export type WorldEncounter = z.infer<typeof worldEncounterSchema>;
export type WorldLfgDungeon = z.infer<typeof worldLfgDungeonSchema>;
export type WorldQuest = z.infer<typeof worldQuestSchema>;
export type WorldQuestLine = z.infer<typeof worldQuestLineSchema>;
export type WorldQuestLineMember = z.infer<typeof worldQuestLineMemberSchema>;
export type WorldQuestPoi = z.infer<typeof worldQuestPoiSchema>;
export type WorldItemSourceHint = z.infer<typeof worldItemSourceHintSchema>;
export type WorldCreatureObjective = z.infer<typeof worldCreatureObjectiveSchema>;
export type WorldBoss = z.infer<typeof worldBossSchema>;
export type WorldBossLocation = z.infer<typeof worldBossLocationSchema>;
export type WorldCreatureModel = z.infer<typeof worldCreatureModelSchema>;
export type WorldBossSpellCandidate = z.infer<typeof worldBossSpellCandidateSchema>;
export type WorldLootSourceCandidate = z.infer<typeof worldLootSourceCandidateSchema>;
export type WorldMapDifficulty = z.infer<typeof worldMapDifficultySchema>;
export type WorldContentTuning = z.infer<typeof worldContentTuningSchema>;
export type MapMediaManifest = z.infer<typeof mapMediaManifestSchema>;
export type WorldBundle = z.infer<typeof worldBundleSchema>;
