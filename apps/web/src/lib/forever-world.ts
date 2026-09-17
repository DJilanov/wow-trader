import { isAbsolute } from "node:path";

import type {
  WorldArea,
  WorldBoss,
  WorldBossLocation,
  WorldBossSpellCandidate,
  WorldContentTuning,
  WorldCreatureModel,
  WorldCreatureObjective,
  WorldEncounter,
  WorldItemSourceHint,
  WorldLfgDungeon,
  WorldLootSourceCandidate,
  WorldMap,
  WorldMapArt,
  WorldMapArtLayer,
  WorldMapArtTile,
  WorldMapDifficulty,
  WorldPoi,
  WorldQuest,
  WorldQuestLine,
  WorldQuestLineMember,
  WorldQuestPoi,
  WorldUiMap,
  WorldUiMapArtLink,
  WorldUiMapAssignment,
} from "@wow-trader/contracts";
import {
  worldAreaSchema,
  worldBossLocationSchema,
  worldBossSchema,
  worldBossSpellCandidateSchema,
  worldContentTuningSchema,
  worldCreatureModelSchema,
  worldCreatureObjectiveSchema,
  worldEncounterSchema,
  worldItemSourceHintSchema,
  worldLfgDungeonSchema,
  worldLootSourceCandidateSchema,
  worldMapArtLayerSchema,
  worldMapArtSchema,
  worldMapArtTileSchema,
  worldMapDifficultySchema,
  worldMapSchema,
  worldPoiSchema,
  worldQuestLineMemberSchema,
  worldQuestLineSchema,
  worldQuestPoiSchema,
  worldQuestSchema,
  worldUiMapArtLinkSchema,
  worldUiMapAssignmentSchema,
  worldUiMapSchema,
} from "@wow-trader/contracts";
import {
  gameBuilds,
  worldAreaVersions,
  worldBossLocations,
  worldBosses,
  worldBossSpellCandidates,
  worldContentTunings,
  worldCreatureModels,
  worldCreatureObjectives,
  worldEncounterVersions,
  worldItemSourceHints,
  worldLfgDungeonVersions,
  worldLootSourceCandidates,
  worldMapArtLayers,
  worldMapArts,
  worldMapArtTiles,
  worldMapDifficulties,
  worldMapVersions,
  worldPoiVersions,
  worldQuestLineMembers,
  worldQuestLineVersions,
  worldQuestPois,
  worldQuestVersions,
  worldSnapshots,
  worldUiMapArtLinks,
  worldUiMapAssignments,
  worldUiMapVersions,
} from "@wow-trader/db";
import { and, desc, eq } from "drizzle-orm";
import { loadWorldSnapshot } from "@wow-trader/world-data";

import { getDatabase } from "./database";

export interface ForeverWorldData {
  readonly build: {
    readonly id: string | null;
    readonly product: string;
    readonly clientVersion: string;
    readonly buildNumber: number;
    readonly locale: string;
    readonly state: "published" | "review_required";
  };
  readonly maps: readonly WorldMap[];
  readonly areas: readonly WorldArea[];
  readonly uiMaps: readonly WorldUiMap[];
  readonly uiMapAssignments: readonly WorldUiMapAssignment[];
  readonly mapArts: readonly WorldMapArt[];
  readonly uiMapArtLinks: readonly WorldUiMapArtLink[];
  readonly mapArtLayers: readonly WorldMapArtLayer[];
  readonly mapArtTiles: readonly WorldMapArtTile[];
  readonly pois: readonly WorldPoi[];
  readonly encounters: readonly WorldEncounter[];
  readonly lfgDungeons: readonly WorldLfgDungeon[];
  readonly quests: readonly WorldQuest[];
  readonly questLines: readonly WorldQuestLine[];
  readonly questLineMembers: readonly WorldQuestLineMember[];
  readonly questPois: readonly WorldQuestPoi[];
  readonly itemSourceHints: readonly WorldItemSourceHint[];
  readonly creatureObjectives: readonly WorldCreatureObjective[];
  readonly bosses: readonly WorldBoss[];
  readonly bossLocations: readonly WorldBossLocation[];
  readonly creatureModels: readonly WorldCreatureModel[];
  readonly bossSpellCandidates: readonly WorldBossSpellCandidate[];
  readonly lootSourceCandidates: readonly WorldLootSourceCandidate[];
  readonly mapDifficulties: readonly WorldMapDifficulty[];
  readonly contentTunings: readonly WorldContentTuning[];
}

export interface ForeverWorldOverview {
  readonly build: ForeverWorldData["build"];
  readonly counts: {
    readonly maps: number;
    readonly uiMaps: number;
    readonly areas: number;
    readonly encounters: number;
    readonly canonicalEncounters: number;
    readonly bosses: number;
    readonly bossLocations: number;
    readonly bossSpellCandidates: number;
    readonly lootSourceCandidates: number;
    readonly quests: number;
    readonly questPois: number;
    readonly sourceHints: number;
  };
}

export interface ForeverMapDirectoryEntry {
  readonly uiMapId: number;
  readonly name: string;
  readonly parentUiMapId: number | null;
  readonly type: number;
  readonly system: number;
  readonly parentName: string | null;
  readonly featured: boolean;
  readonly hasArt: boolean;
  readonly tileCount: number;
  readonly layerWidth: number | null;
  readonly layerHeight: number | null;
  readonly questCount: number;
  readonly markerCount: number;
  readonly previewFileDataId: number | null;
}

export interface ForeverMapMarker {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "area_poi" | "boss" | "quest_poi" | "taxi";
  readonly x: number;
  readonly y: number;
  readonly evidence: "exact_client" | "review_required";
  readonly href: string | null;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface ForeverMapBossRelationship {
  readonly creatureId: number;
  readonly name: string;
  readonly evidenceLabel: string;
  readonly requiresReview: boolean;
}

export interface ForeverMapPageData {
  readonly build: ForeverWorldData["build"];
  readonly map: WorldUiMap;
  readonly assignment: WorldUiMapAssignment | null;
  readonly art: WorldMapArt | null;
  readonly layer: WorldMapArtLayer | null;
  readonly tiles: readonly WorldMapArtTile[];
  readonly markers: readonly ForeverMapMarker[];
  readonly areas: readonly WorldArea[];
  readonly questPois: readonly WorldQuestPoi[];
  readonly bossRelationships: readonly ForeverMapBossRelationship[];
  readonly parentMaps: readonly WorldUiMap[];
}

export interface ForeverInstanceDirectoryEntry {
  readonly mapId: number;
  readonly name: string;
  readonly description: string;
  readonly encounterCount: number;
  readonly rawEncounterCount: number;
  readonly maxPlayers: number;
  readonly instanceType: number;
  readonly difficultyCount: number;
  readonly bossCount: number;
}

export interface ForeverEncounterGroup {
  readonly key: string;
  readonly name: string;
  readonly orderIndex: number;
  readonly variants: readonly WorldEncounter[];
}

export interface ForeverBossDirectoryEntry {
  readonly creatureId: number;
  readonly name: string;
  readonly contextLabel: string | null;
  readonly namingState: "ambiguous" | "criteria_named" | "encounter_named";
  readonly encounterNames: readonly string[];
  readonly locationNames: readonly string[];
  readonly spellCandidateCount: number;
  readonly sourceCandidateCount: number;
  readonly hasExactMapRelationship: boolean;
}

export interface ForeverBossPageData {
  readonly build: ForeverWorldData["build"];
  readonly boss: WorldBoss;
  readonly name: string;
  readonly contextLabel: string | null;
  readonly namingState: ForeverBossDirectoryEntry["namingState"];
  readonly objectives: readonly WorldCreatureObjective[];
  readonly locations: readonly WorldBossLocation[];
  readonly models: readonly WorldCreatureModel[];
  readonly spells: readonly WorldBossSpellCandidate[];
  readonly lootCandidates: readonly WorldLootSourceCandidate[];
  readonly encounters: readonly WorldEncounter[];
  readonly maps: readonly WorldMap[];
  readonly difficulties: readonly {
    readonly difficulty: WorldMapDifficulty;
    readonly tuning: WorldContentTuning | null;
  }[];
}

export interface ForeverSearchEntry {
  readonly id: string;
  readonly type: "boss" | "instance" | "map";
  readonly title: string;
  readonly context: string;
  readonly href: string;
  readonly searchText: string;
}

const featuredUiMapIds = new Set([2482, 2521, 2524, 2548, 2652, 2665]);

let artifactWorldPromise: Promise<ForeverWorldData> | null = null;
let databaseWorldCache:
  | {
      readonly expiresAt: number;
      readonly promise: Promise<ForeverWorldData | null>;
    }
  | undefined;

const databaseWorldCacheTtlMs = 60_000;

export async function getForeverWorldData(): Promise<ForeverWorldData | null> {
  const manifestPath = process.env.WOW_TRADER_WORLD_SNAPSHOT;
  if (manifestPath && process.env.WOW_TRADER_WORLD_PREFER_ARTIFACT === "true") {
    artifactWorldPromise ??= loadArtifactWorld(manifestPath);
    return artifactWorldPromise;
  }
  try {
    const databaseData = await loadCachedDatabaseWorld();
    if (databaseData) return databaseData;
  } catch (error: unknown) {
    if (!process.env.WOW_TRADER_WORLD_SNAPSHOT) throw error;
  }

  if (!manifestPath) return null;
  artifactWorldPromise ??= loadArtifactWorld(manifestPath);
  return artifactWorldPromise;
}

function loadCachedDatabaseWorld(): Promise<ForeverWorldData | null> {
  const now = Date.now();
  if (databaseWorldCache && databaseWorldCache.expiresAt > now) {
    return databaseWorldCache.promise;
  }
  const promise = loadDatabaseWorld();
  databaseWorldCache = { expiresAt: now + databaseWorldCacheTtlMs, promise };
  void promise.catch(() => {
    if (databaseWorldCache?.promise === promise) databaseWorldCache = undefined;
  });
  return promise;
}

export async function getForeverWorldOverview(): Promise<ForeverWorldOverview | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  return {
    build: world.build,
    counts: {
      maps: world.maps.length,
      uiMaps: world.uiMaps.length,
      areas: world.areas.length,
      encounters: world.encounters.length,
      canonicalEncounters: countCanonicalEncounters(world.encounters),
      bosses: world.bosses.length,
      bossLocations: world.bossLocations.length,
      bossSpellCandidates: world.bossSpellCandidates.length,
      lootSourceCandidates: world.lootSourceCandidates.length,
      quests: world.quests.length,
      questPois: world.questPois.length,
      sourceHints: world.itemSourceHints.length,
    },
  };
}

export async function getForeverMapDirectory(): Promise<readonly ForeverMapDirectoryEntry[]> {
  const world = await getForeverWorldData();
  if (!world) return [];
  return world.uiMaps
    .map((uiMap) => {
      const link = selectArtLink(world.uiMapArtLinks, uiMap.uiMapId);
      const art = link
        ? (world.mapArts.find((entry) => entry.mapArtId === link.mapArtId) ?? null)
        : null;
      const layer = art ? selectArtLayer(world.mapArtLayers, art.styleId) : null;
      const assignment = selectMapAssignment(world.uiMapAssignments, uiMap.uiMapId);
      const tiles = link
        ? world.mapArtTiles
            .filter((tile) => tile.mapArtId === link.mapArtId)
            .sort(
              (left, right) =>
                left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex,
            )
        : [];
      return {
        uiMapId: uiMap.uiMapId,
        name: uiMap.name,
        parentUiMapId: uiMap.parentUiMapId,
        type: uiMap.type,
        system: uiMap.system,
        parentName:
          world.uiMaps.find((entry) => entry.uiMapId === uiMap.parentUiMapId)?.name ?? null,
        featured: featuredUiMapIds.has(uiMap.uiMapId),
        hasArt: Boolean(art && layer),
        tileCount: tiles.length,
        layerWidth: layer?.layerWidth ?? null,
        layerHeight: layer?.layerHeight ?? null,
        questCount: new Set(
          world.questPois.filter((poi) => poi.uiMapId === uiMap.uiMapId).map((poi) => poi.questId),
        ).size,
        markerCount: assignment ? buildMapMarkers(world, assignment, uiMap.uiMapId).length : 0,
        previewFileDataId: tiles[Math.floor(tiles.length / 2)]?.fileDataId ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getForeverMapPage(uiMapId: number): Promise<ForeverMapPageData | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const map = world.uiMaps.find((entry) => entry.uiMapId === uiMapId);
  if (!map) return null;
  const link = selectArtLink(world.uiMapArtLinks, uiMapId);
  const art = link
    ? (world.mapArts.find((entry) => entry.mapArtId === link.mapArtId) ?? null)
    : null;
  const layer = art ? selectArtLayer(world.mapArtLayers, art.styleId) : null;
  const assignment = selectMapAssignment(world.uiMapAssignments, uiMapId);
  const tiles = art
    ? world.mapArtTiles
        .filter((tile) => tile.mapArtId === art.mapArtId && tile.layerIndex === layer?.layerIndex)
        .sort(
          (left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex,
        )
    : [];
  const markers = assignment ? buildMapMarkers(world, assignment, uiMapId) : [];
  const areaIds = assignment
    ? collectAreaDescendants(world.areas, assignment.areaId, assignment.mapId)
    : new Set<number>();
  const bossRelationships = assignment ? buildMapBossRelationships(world, assignment, areaIds) : [];
  return {
    build: world.build,
    map,
    assignment,
    art,
    layer,
    tiles,
    markers,
    areas: world.areas.filter((area) => areaIds.has(area.areaId)),
    questPois: world.questPois.filter((poi) => poi.uiMapId === uiMapId),
    bossRelationships,
    parentMaps: getParentUiMaps(world.uiMaps, map),
  };
}

export async function getForeverInstanceDirectory(): Promise<
  readonly ForeverInstanceDirectoryEntry[]
> {
  const world = await getForeverWorldData();
  if (!world) return [];
  return world.maps
    .flatMap((map): ForeverInstanceDirectoryEntry[] => {
      if (map.instanceType !== 1 && map.instanceType !== 2) return [];
      const encounters = world.encounters.filter((encounter) => encounter.mapId === map.mapId);
      if (encounters.length === 0) return [];
      const groups = groupForeverEncounters(encounters);
      const encounterIds = new Set(encounters.map((encounter) => encounter.encounterId));
      return [
        {
          mapId: map.mapId,
          name: map.name,
          description: map.description,
          encounterCount: groups.length,
          rawEncounterCount: encounters.length,
          maxPlayers: map.maxPlayers,
          instanceType: map.instanceType,
          difficultyCount: new Set(encounters.map((encounter) => encounter.difficultyId)).size,
          bossCount: world.bosses.filter((boss) =>
            boss.encounterIds.some((encounterId) => encounterIds.has(encounterId)),
          ).length,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getForeverInstance(mapId: number): Promise<{
  readonly build: ForeverWorldData["build"];
  readonly map: WorldMap;
  readonly encounters: readonly WorldEncounter[];
  readonly encounterGroups: readonly ForeverEncounterGroup[];
  readonly bosses: readonly ForeverBossDirectoryEntry[];
  readonly difficulties: readonly {
    readonly difficulty: WorldMapDifficulty;
    readonly tuning: WorldContentTuning | null;
  }[];
  readonly lootCandidates: readonly WorldLootSourceCandidate[];
  readonly sourceHints: readonly WorldItemSourceHint[];
} | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const map = world.maps.find((entry) => entry.mapId === mapId);
  if (!map || (map.instanceType !== 1 && map.instanceType !== 2)) return null;
  const encounters = world.encounters
    .filter((entry) => entry.mapId === mapId)
    .sort(
      (left, right) => left.orderIndex - right.orderIndex || left.name.localeCompare(right.name),
    );
  if (encounters.length === 0) return null;
  const encounterIds = new Set(encounters.map((encounter) => encounter.encounterId));
  const bossIds = new Set(
    world.bosses
      .filter(
        (boss) =>
          boss.mapIds.includes(mapId) || boss.encounterIds.some((id) => encounterIds.has(id)),
      )
      .map((boss) => boss.creatureId),
  );
  const names = [map.name, ...encounters.map((entry) => entry.name)].map((name) =>
    name.toLowerCase(),
  );
  return {
    build: world.build,
    map,
    encounters,
    encounterGroups: groupForeverEncounters(encounters),
    bosses: buildForeverBossDirectory(world).filter((boss) => bossIds.has(boss.creatureId)),
    difficulties: world.mapDifficulties
      .filter((difficulty) => difficulty.mapId === mapId)
      .map((difficulty) => ({
        difficulty,
        tuning:
          world.contentTunings.find(
            (tuning) => tuning.contentTuningId === difficulty.contentTuningId,
          ) ?? null,
      })),
    lootCandidates: world.lootSourceCandidates.filter(
      (candidate) =>
        (candidate.targetKind === "map" && candidate.targetId === mapId) ||
        (candidate.targetKind === "encounter" && encounterIds.has(candidate.targetId)) ||
        (candidate.targetKind === "boss" && bossIds.has(candidate.targetId)),
    ),
    sourceHints: world.itemSourceHints.filter((hint) =>
      names.some((name) => hint.description.toLowerCase().includes(name)),
    ),
  };
}

export async function getForeverEncounter(encounterId: number): Promise<{
  readonly build: ForeverWorldData["build"];
  readonly encounter: WorldEncounter;
  readonly map: WorldMap | null;
  readonly bosses: readonly ForeverBossDirectoryEntry[];
  readonly lootCandidates: readonly WorldLootSourceCandidate[];
  readonly sourceHints: readonly WorldItemSourceHint[];
} | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const encounter = world.encounters.find((entry) => entry.encounterId === encounterId);
  if (!encounter) return null;
  const bossIds = new Set(
    world.bosses
      .filter((boss) => boss.encounterIds.includes(encounterId))
      .map((boss) => boss.creatureId),
  );
  return {
    build: world.build,
    encounter,
    map: world.maps.find((entry) => entry.mapId === encounter.mapId) ?? null,
    bosses: buildForeverBossDirectory(world).filter((boss) => bossIds.has(boss.creatureId)),
    lootCandidates: world.lootSourceCandidates.filter(
      (candidate) =>
        (candidate.targetKind === "encounter" && candidate.targetId === encounterId) ||
        (candidate.targetKind === "boss" && bossIds.has(candidate.targetId)),
    ),
    sourceHints: world.itemSourceHints.filter((hint) =>
      hint.description.toLowerCase().includes(encounter.name.toLowerCase()),
    ),
  };
}

export function groupForeverEncounters(
  encounters: readonly WorldEncounter[],
): readonly ForeverEncounterGroup[] {
  const groups = new Map<string, WorldEncounter[]>();
  for (const encounter of encounters) {
    const key = normalizeName(encounter.name);
    const variants = groups.get(key) ?? [];
    variants.push(encounter);
    groups.set(key, variants);
  }
  return [...groups.entries()]
    .map(([key, variants]) => ({
      key,
      name: selectEncounterName(variants),
      orderIndex: Math.min(...variants.map((variant) => variant.orderIndex)),
      variants: [...variants].sort(
        (left, right) =>
          left.difficultyId - right.difficultyId || left.orderIndex - right.orderIndex,
      ),
    }))
    .sort(
      (left, right) => left.orderIndex - right.orderIndex || left.name.localeCompare(right.name),
    );
}

export async function getForeverBossDirectory(): Promise<readonly ForeverBossDirectoryEntry[]> {
  const world = await getForeverWorldData();
  return world ? buildForeverBossDirectory(world) : [];
}

export function buildForeverBossDirectory(
  world: ForeverWorldData,
): readonly ForeverBossDirectoryEntry[] {
  return world.bosses
    .map((boss) => {
      const identity = resolveBossIdentity(world, boss);
      const encounters = world.encounters.filter((encounter) =>
        boss.encounterIds.includes(encounter.encounterId),
      );
      const locations = world.bossLocations.filter(
        (location) => location.creatureId === boss.creatureId,
      );
      const encounterIds = new Set(boss.encounterIds);
      return {
        creatureId: boss.creatureId,
        name: identity.name,
        contextLabel: identity.contextLabel,
        namingState: identity.namingState,
        encounterNames: uniqueStrings(encounters.map((encounter) => encounter.name)),
        locationNames: uniqueStrings(
          locations.flatMap((location) =>
            location.mapName
              ? [location.mapName, location.evidenceLabel]
              : [location.evidenceLabel],
          ),
        ),
        spellCandidateCount: world.bossSpellCandidates.filter(
          (spell) => spell.creatureId === boss.creatureId,
        ).length,
        sourceCandidateCount: world.lootSourceCandidates.filter(
          (candidate) =>
            (candidate.targetKind === "boss" && candidate.targetId === boss.creatureId) ||
            (candidate.targetKind === "encounter" && encounterIds.has(candidate.targetId)),
        ).length,
        hasExactMapRelationship: locations.some((location) => !location.requiresReview),
      } satisfies ForeverBossDirectoryEntry;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getForeverBoss(creatureId: number): Promise<ForeverBossPageData | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const boss = world.bosses.find((entry) => entry.creatureId === creatureId);
  if (!boss) return null;
  const identity = resolveBossIdentity(world, boss);
  const encounterIds = new Set(boss.encounterIds);
  const locations = world.bossLocations.filter((location) => location.creatureId === creatureId);
  const mapIds = new Set([
    ...boss.mapIds,
    ...locations.flatMap((location) => (location.mapId === null ? [] : [location.mapId])),
  ]);
  return {
    build: world.build,
    boss,
    name: identity.name,
    contextLabel: identity.contextLabel,
    namingState: identity.namingState,
    objectives: world.creatureObjectives
      .filter((objective) => objective.creatureId === creatureId)
      .sort((left, right) => left.orderIndex - right.orderIndex),
    locations,
    models: world.creatureModels.filter((model) => model.creatureId === creatureId),
    spells: world.bossSpellCandidates
      .filter((spell) => spell.creatureId === creatureId)
      .sort((left, right) => left.spellName.localeCompare(right.spellName)),
    lootCandidates: world.lootSourceCandidates.filter(
      (candidate) =>
        (candidate.targetKind === "boss" && candidate.targetId === creatureId) ||
        (candidate.targetKind === "encounter" && encounterIds.has(candidate.targetId)),
    ),
    encounters: world.encounters.filter((encounter) => encounterIds.has(encounter.encounterId)),
    maps: world.maps.filter((map) => mapIds.has(map.mapId)),
    difficulties: world.mapDifficulties
      .filter((difficulty) => mapIds.has(difficulty.mapId))
      .map((difficulty) => ({
        difficulty,
        tuning:
          world.contentTunings.find(
            (tuning) => tuning.contentTuningId === difficulty.contentTuningId,
          ) ?? null,
      })),
  };
}

export async function getForeverSearchDirectory(): Promise<readonly ForeverSearchEntry[]> {
  const world = await getForeverWorldData();
  if (!world) return [];
  const maps = (await getForeverMapDirectory())
    .filter((map) => map.system === 0)
    .map((map) => ({
      id: `map:${map.uiMapId}`,
      type: "map" as const,
      title: map.name,
      context: map.parentName ?? "World map",
      href: `/forever/encyclopedia/maps/${map.uiMapId}`,
      searchText: `${map.name} ${map.parentName ?? ""} ${map.uiMapId}`,
    }));
  const instances = (await getForeverInstanceDirectory()).map((instance) => ({
    id: `instance:${instance.mapId}`,
    type: "instance" as const,
    title: instance.name,
    context: foreverInstanceTypeLabel(instance.instanceType),
    href: `/forever/encyclopedia/instances/${instance.mapId}`,
    searchText: `${instance.name} ${instance.mapId}`,
  }));
  const bosses = buildForeverBossDirectory(world).map((boss) => ({
    id: `boss:${boss.creatureId}`,
    type: "boss" as const,
    title: boss.name,
    context: boss.contextLabel ?? boss.locationNames[0] ?? "Criteria-backed creature",
    href: `/forever/encyclopedia/bosses/${boss.creatureId}`,
    searchText: `${boss.name} ${boss.contextLabel ?? ""} ${boss.encounterNames.join(" ")} ${boss.locationNames.join(" ")} ${boss.creatureId}`,
  }));
  return [...maps, ...instances, ...bosses];
}

export async function getForeverQuestDirectory(): Promise<{
  readonly build: ForeverWorldData["build"];
  readonly questCount: number;
  readonly poiQuestCount: number;
  readonly lines: readonly {
    readonly questLine: WorldQuestLine;
    readonly members: readonly WorldQuestLineMember[];
  }[];
  readonly discoverableQuestIds: readonly number[];
} | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const poiQuestIds = new Set(world.questPois.map((poi) => poi.questId));
  return {
    build: world.build,
    questCount: world.quests.length,
    poiQuestCount: poiQuestIds.size,
    lines: world.questLines.map((questLine) => ({
      questLine,
      members: world.questLineMembers
        .filter((member) => member.questLineId === questLine.questLineId)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    })),
    discoverableQuestIds: [
      ...new Set([...poiQuestIds, ...world.questLineMembers.map((row) => row.questId)]),
    ].sort((left, right) => left - right),
  };
}

export async function getForeverQuest(questId: number): Promise<{
  readonly build: ForeverWorldData["build"];
  readonly quest: WorldQuest;
  readonly pois: readonly WorldQuestPoi[];
  readonly lines: readonly WorldQuestLine[];
  readonly sourceHints: readonly WorldItemSourceHint[];
} | null> {
  const world = await getForeverWorldData();
  if (!world) return null;
  const quest = world.quests.find((entry) => entry.questId === questId);
  if (!quest) return null;
  const lineIds = new Set(
    world.questLineMembers
      .filter((entry) => entry.questId === questId)
      .map((entry) => entry.questLineId),
  );
  return {
    build: world.build,
    quest,
    pois: world.questPois.filter((poi) => poi.questId === questId),
    lines: world.questLines.filter((line) => lineIds.has(line.questLineId)),
    sourceHints: world.itemSourceHints.filter((hint) =>
      hint.description.toLowerCase().includes(`quest id: ${questId}`),
    ),
  };
}

export function worldToUiMap(
  worldX: number,
  worldY: number,
  assignment: WorldUiMapAssignment,
): { readonly x: number; readonly y: number } | null {
  const [minimumX, minimumY, , maximumX, maximumY] = assignment.region;
  if (
    minimumX === undefined ||
    minimumY === undefined ||
    maximumX === undefined ||
    maximumY === undefined ||
    maximumX === minimumX ||
    maximumY === minimumY
  ) {
    return null;
  }
  const x =
    assignment.uiMinX +
    ((maximumY - worldY) / (maximumY - minimumY)) * (assignment.uiMaxX - assignment.uiMinX);
  const y =
    assignment.uiMinY +
    ((maximumX - worldX) / (maximumX - minimumX)) * (assignment.uiMaxY - assignment.uiMinY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

async function loadArtifactWorld(manifestPath: string): Promise<ForeverWorldData> {
  if (!isAbsolute(manifestPath)) {
    throw new Error("WOW_TRADER_WORLD_SNAPSHOT must be an absolute path");
  }
  const bundle = await loadWorldSnapshot(manifestPath);
  return {
    build: {
      id: null,
      product: bundle.manifest.product,
      clientVersion: bundle.manifest.clientVersion,
      buildNumber: bundle.manifest.buildNumber,
      locale: bundle.manifest.locale,
      state: "review_required",
    },
    maps: bundle.maps,
    areas: bundle.areas,
    uiMaps: bundle.uiMaps,
    uiMapAssignments: bundle.uiMapAssignments,
    mapArts: bundle.mapArts,
    uiMapArtLinks: bundle.uiMapArtLinks,
    mapArtLayers: bundle.mapArtLayers,
    mapArtTiles: bundle.mapArtTiles,
    pois: bundle.pois,
    encounters: bundle.encounters,
    lfgDungeons: bundle.lfgDungeons,
    quests: bundle.quests,
    questLines: bundle.questLines,
    questLineMembers: bundle.questLineMembers,
    questPois: bundle.questPois,
    itemSourceHints: bundle.itemSourceHints,
    creatureObjectives: bundle.creatureObjectives,
    bosses: bundle.bosses,
    bossLocations: bundle.bossLocations,
    creatureModels: bundle.creatureModels,
    bossSpellCandidates: bundle.bossSpellCandidates,
    lootSourceCandidates: bundle.lootSourceCandidates,
    mapDifficulties: bundle.mapDifficulties,
    contentTunings: bundle.contentTunings,
  };
}

async function loadDatabaseWorld(): Promise<ForeverWorldData | null> {
  const database = getDatabase();
  const [snapshot] = await database
    .select({
      buildId: worldSnapshots.buildId,
      product: gameBuilds.product,
      clientVersion: gameBuilds.clientVersion,
      buildNumber: gameBuilds.buildNumber,
      locale: gameBuilds.locale,
      status: worldSnapshots.status,
      publishedAt: worldSnapshots.publishedAt,
    })
    .from(worldSnapshots)
    .innerJoin(gameBuilds, eq(gameBuilds.id, worldSnapshots.buildId))
    .where(and(eq(gameBuilds.product, "wow_classic_beta"), eq(worldSnapshots.status, "published")))
    .orderBy(desc(worldSnapshots.publishedAt))
    .limit(1);
  if (!snapshot) return null;
  const buildId = snapshot.buildId;
  const [
    maps,
    areas,
    uiMaps,
    uiMapAssignments,
    mapArts,
    uiMapArtLinks,
    mapArtLayers,
    mapArtTiles,
    pois,
    encounters,
    lfgDungeons,
    quests,
    questLines,
    questLineMembers,
    questPois,
    itemSourceHints,
    creatureObjectives,
    bosses,
    bossLocations,
    creatureModels,
    bossSpellCandidates,
    lootSourceCandidates,
    mapDifficulties,
    contentTunings,
  ] = await Promise.all([
    database.select().from(worldMapVersions).where(eq(worldMapVersions.buildId, buildId)),
    database.select().from(worldAreaVersions).where(eq(worldAreaVersions.buildId, buildId)),
    database.select().from(worldUiMapVersions).where(eq(worldUiMapVersions.buildId, buildId)),
    database.select().from(worldUiMapAssignments).where(eq(worldUiMapAssignments.buildId, buildId)),
    database.select().from(worldMapArts).where(eq(worldMapArts.buildId, buildId)),
    database.select().from(worldUiMapArtLinks).where(eq(worldUiMapArtLinks.buildId, buildId)),
    database.select().from(worldMapArtLayers).where(eq(worldMapArtLayers.buildId, buildId)),
    database.select().from(worldMapArtTiles).where(eq(worldMapArtTiles.buildId, buildId)),
    database.select().from(worldPoiVersions).where(eq(worldPoiVersions.buildId, buildId)),
    database
      .select()
      .from(worldEncounterVersions)
      .where(eq(worldEncounterVersions.buildId, buildId)),
    database
      .select()
      .from(worldLfgDungeonVersions)
      .where(eq(worldLfgDungeonVersions.buildId, buildId)),
    database.select().from(worldQuestVersions).where(eq(worldQuestVersions.buildId, buildId)),
    database
      .select()
      .from(worldQuestLineVersions)
      .where(eq(worldQuestLineVersions.buildId, buildId)),
    database.select().from(worldQuestLineMembers).where(eq(worldQuestLineMembers.buildId, buildId)),
    database.select().from(worldQuestPois).where(eq(worldQuestPois.buildId, buildId)),
    database.select().from(worldItemSourceHints).where(eq(worldItemSourceHints.buildId, buildId)),
    database
      .select()
      .from(worldCreatureObjectives)
      .where(eq(worldCreatureObjectives.buildId, buildId)),
    database.select().from(worldBosses).where(eq(worldBosses.buildId, buildId)),
    database.select().from(worldBossLocations).where(eq(worldBossLocations.buildId, buildId)),
    database.select().from(worldCreatureModels).where(eq(worldCreatureModels.buildId, buildId)),
    database
      .select()
      .from(worldBossSpellCandidates)
      .where(eq(worldBossSpellCandidates.buildId, buildId)),
    database
      .select()
      .from(worldLootSourceCandidates)
      .where(eq(worldLootSourceCandidates.buildId, buildId)),
    database.select().from(worldMapDifficulties).where(eq(worldMapDifficulties.buildId, buildId)),
    database.select().from(worldContentTunings).where(eq(worldContentTunings.buildId, buildId)),
  ]);
  return {
    build: {
      id: buildId,
      product: snapshot.product,
      clientVersion: snapshot.clientVersion,
      buildNumber: snapshot.buildNumber,
      locale: snapshot.locale,
      state: snapshot.status === "published" ? "published" : "review_required",
    },
    maps: worldMapSchema.array().parse(maps),
    areas: worldAreaSchema.array().parse(areas),
    uiMaps: worldUiMapSchema.array().parse(uiMaps),
    uiMapAssignments: worldUiMapAssignmentSchema.array().parse(uiMapAssignments),
    mapArts: worldMapArtSchema.array().parse(mapArts),
    uiMapArtLinks: worldUiMapArtLinkSchema.array().parse(uiMapArtLinks),
    mapArtLayers: worldMapArtLayerSchema.array().parse(mapArtLayers),
    mapArtTiles: worldMapArtTileSchema.array().parse(mapArtTiles),
    pois: worldPoiSchema.array().parse(pois),
    encounters: worldEncounterSchema.array().parse(encounters),
    lfgDungeons: worldLfgDungeonSchema.array().parse(lfgDungeons),
    quests: worldQuestSchema.array().parse(quests),
    questLines: worldQuestLineSchema.array().parse(questLines),
    questLineMembers: worldQuestLineMemberSchema.array().parse(questLineMembers),
    questPois: worldQuestPoiSchema.array().parse(questPois),
    itemSourceHints: worldItemSourceHintSchema.array().parse(itemSourceHints),
    creatureObjectives: worldCreatureObjectiveSchema.array().parse(creatureObjectives),
    bosses: worldBossSchema.array().parse(bosses),
    bossLocations: worldBossLocationSchema.array().parse(bossLocations),
    creatureModels: worldCreatureModelSchema.array().parse(creatureModels),
    bossSpellCandidates: worldBossSpellCandidateSchema.array().parse(bossSpellCandidates),
    lootSourceCandidates: worldLootSourceCandidateSchema.array().parse(lootSourceCandidates),
    mapDifficulties: worldMapDifficultySchema.array().parse(mapDifficulties),
    contentTunings: worldContentTuningSchema.array().parse(contentTunings),
  };
}

function selectArtLink(
  links: readonly WorldUiMapArtLink[],
  uiMapId: number,
): WorldUiMapArtLink | null {
  return (
    links
      .filter((entry) => entry.uiMapId === uiMapId)
      .sort((left, right) => left.phaseId - right.phaseId)[0] ?? null
  );
}

function selectArtLayer(
  layers: readonly WorldMapArtLayer[],
  styleId: number,
): WorldMapArtLayer | null {
  return (
    layers
      .filter((entry) => entry.styleId === styleId)
      .sort((left, right) => left.layerIndex - right.layerIndex)[0] ?? null
  );
}

function selectMapAssignment(
  assignments: readonly WorldUiMapAssignment[],
  uiMapId: number,
): WorldUiMapAssignment | null {
  return (
    assignments
      .filter((entry) => entry.uiMapId === uiMapId)
      .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null
  );
}

function buildMapMarkers(
  world: ForeverWorldData,
  assignment: WorldUiMapAssignment,
  uiMapId: number,
): readonly ForeverMapMarker[] {
  const areaIds = collectAreaDescendants(world.areas, assignment.areaId, assignment.mapId);
  const placeMarkers = world.pois.flatMap((poi): ForeverMapMarker[] => {
    if ((poi.kind !== "area_poi" && poi.kind !== "taxi") || poi.mapId !== assignment.mapId) {
      return [];
    }
    if (assignment.areaId !== null && poi.areaId !== null && !areaIds.has(poi.areaId)) return [];
    const position = worldToUiMap(poi.x, poi.y, assignment);
    if (!position) return [];
    return [
      {
        id: `${poi.kind}:${poi.entityId}`,
        name: poi.name,
        description: poi.description,
        kind: poi.kind,
        x: position.x,
        y: position.y,
        evidence: "exact_client",
        href: null,
        points: [position],
      },
    ];
  });
  const questMarkers = world.questPois.flatMap((poi): ForeverMapMarker[] => {
    if (poi.uiMapId !== uiMapId || poi.mapId !== assignment.mapId) return [];
    const points = poi.points.flatMap((point) => {
      const position = worldToUiMap(point.x, point.y, assignment);
      return position ? [position] : [];
    });
    if (points.length === 0) return [];
    return [
      {
        id: `quest_poi:${poi.blobId}`,
        name:
          poi.objectiveIndex >= 0
            ? `Quest ${poi.questId} · objective ${poi.objectiveIndex}`
            : `Quest ${poi.questId}`,
        description:
          poi.objectiveIndex >= 0
            ? `Client quest POI record for objective index ${poi.objectiveIndex}.`
            : "Client quest POI record.",
        kind: "quest_poi",
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        evidence: "exact_client",
        href: `/forever/encyclopedia/quests/${poi.questId}`,
        points,
      },
    ];
  });
  const bossMarkers = world.bossLocations.flatMap((location): ForeverMapMarker[] => {
    if (
      location.precision !== "point" ||
      location.mapId !== assignment.mapId ||
      location.x === null ||
      location.y === null
    ) {
      return [];
    }
    const position = worldToUiMap(location.x, location.y, assignment);
    if (!position) return [];
    const boss = world.bosses.find((entry) => entry.creatureId === location.creatureId);
    if (!boss) return [];
    return [
      {
        id: `boss:${location.creatureId}`,
        name: resolveBossIdentity(world, boss).name,
        description: location.evidenceLabel,
        kind: "boss",
        x: position.x,
        y: position.y,
        evidence: location.requiresReview ? "review_required" : "exact_client",
        href: `/forever/encyclopedia/bosses/${location.creatureId}`,
        points: [position],
      },
    ];
  });
  return [...placeMarkers, ...questMarkers, ...bossMarkers];
}

function collectAreaDescendants(
  areas: readonly WorldArea[],
  areaId: number | null,
  mapId: number,
): Set<number> {
  if (areaId === null) {
    return new Set(areas.filter((area) => area.mapId === mapId).map((area) => area.areaId));
  }
  const result = new Set([areaId]);
  let previousSize = -1;
  while (previousSize !== result.size) {
    previousSize = result.size;
    for (const area of areas) {
      if (area.parentAreaId !== null && result.has(area.parentAreaId)) result.add(area.areaId);
    }
  }
  return result;
}

function buildMapBossRelationships(
  world: ForeverWorldData,
  assignment: WorldUiMapAssignment,
  areaIds: ReadonlySet<number>,
): readonly ForeverMapBossRelationship[] {
  const byCreature = new Map<number, ForeverMapBossRelationship>();
  for (const location of world.bossLocations) {
    if (location.precision === "point") continue;
    const matchesUiMap = location.uiMapId === assignment.uiMapId;
    const matchesArea = location.areaId !== null && areaIds.has(location.areaId);
    if (!matchesUiMap && !matchesArea) continue;
    const boss = world.bosses.find((entry) => entry.creatureId === location.creatureId);
    if (!boss) continue;
    const identity = resolveBossIdentity(world, boss);
    const existing = byCreature.get(boss.creatureId);
    if (existing && !existing.requiresReview) continue;
    byCreature.set(boss.creatureId, {
      creatureId: boss.creatureId,
      name: identity.name,
      evidenceLabel: location.evidenceLabel,
      requiresReview: location.requiresReview,
    });
  }
  return [...byCreature.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function getParentUiMaps(maps: readonly WorldUiMap[], current: WorldUiMap): readonly WorldUiMap[] {
  const parents: WorldUiMap[] = [];
  let parentId = current.parentUiMapId;
  const visited = new Set<number>();
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = maps.find((entry) => entry.uiMapId === parentId);
    if (!parent) break;
    parents.unshift(parent);
    parentId = parent.parentUiMapId;
  }
  return parents;
}

function resolveBossIdentity(
  world: ForeverWorldData,
  boss: WorldBoss,
): {
  readonly name: string;
  readonly contextLabel: string | null;
  readonly namingState: ForeverBossDirectoryEntry["namingState"];
} {
  const encounterNames = uniqueStrings(
    world.encounters
      .filter((encounter) => boss.encounterIds.includes(encounter.encounterId))
      .map((encounter) => encounter.name),
  );
  if (encounterNames.length === 1) {
    return {
      name: encounterNames[0] as string,
      contextLabel: null,
      namingState: "encounter_named",
    };
  }
  const objectives = world.creatureObjectives.filter(
    (objective) => objective.creatureId === boss.creatureId,
  );
  const explicitKillName = objectives.find((objective) => {
    const context = `${objective.rootDescription} ${objective.achievementDescription ?? ""}`;
    return (
      /\b(kill|kills|defeat|slay)\b/i.test(context) &&
      !/^complete the following dungeons?\.?$/i.test(objective.achievementDescription ?? "")
    );
  })?.name;
  if (explicitKillName) {
    return { name: explicitKillName, contextLabel: null, namingState: "criteria_named" };
  }
  const contextNames = new Set(
    [...world.maps.map((map) => map.name), ...world.areas.map((area) => area.name)].map(
      normalizeName,
    ),
  );
  const looksLikeCompletionLabel =
    contextNames.has(normalizeName(boss.name)) ||
    objectives.every((objective) =>
      /^complete the following dungeons?\.?$/i.test(objective.achievementDescription ?? ""),
    );
  if (looksLikeCompletionLabel) {
    return {
      name: `Creature ${boss.creatureId}`,
      contextLabel: boss.name,
      namingState: "ambiguous",
    };
  }
  return { name: boss.name, contextLabel: null, namingState: "criteria_named" };
}

function countCanonicalEncounters(encounters: readonly WorldEncounter[]): number {
  return new Set(
    encounters.map((encounter) => `${encounter.mapId}:${normalizeName(encounter.name)}`),
  ).size;
}

function selectEncounterName(variants: readonly WorldEncounter[]): string {
  const counts = new Map<string, number>();
  for (const variant of variants) counts.set(variant.name, (counts.get(variant.name) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      ([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount || leftName.localeCompare(rightName),
    )[0]?.[0] ?? "Unknown encounter"
  );
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function foreverInstanceTypeLabel(instanceType: number): string {
  if (instanceType === 1) return "Dungeon";
  if (instanceType === 2) return "Raid";
  if (instanceType === 3) return "Battleground";
  if (instanceType === 4) return "Arena";
  return "Instanced content";
}
