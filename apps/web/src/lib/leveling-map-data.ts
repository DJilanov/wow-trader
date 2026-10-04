import type { WorldMapArtTile, WorldUiMap, WorldUiMapAssignment } from "@wow-trader/contracts";
import type { ImportedChapter, ImportedDirective, LevelingRoute } from "@wow-trader/leveling";
import { worldToUiMap, type ForeverWorldData } from "./forever-world";

export interface LevelingMapPoint {
  readonly id: string;
  readonly stepId: string;
  readonly sourceLine: number;
  readonly uiMapId: number;
  readonly x: number;
  readonly y: number;
  readonly questId: number | null;
  readonly evidence: "guide_coordinate" | "client_quest_poi";
  readonly outline: readonly { readonly x: number; readonly y: number }[];
}
export interface LevelingZoneArt {
  readonly uiMapId: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tiles: readonly Pick<WorldMapArtTile, "fileDataId" | "rowIndex" | "columnIndex">[];
  readonly overlays: readonly LevelingMapOverlay[];
}
export interface LevelingMapOverlay {
  readonly overlayId: number;
  readonly mapArtId: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly tiles: readonly {
    readonly fileDataId: number;
    readonly rowIndex: number;
    readonly columnIndex: number;
    readonly layerIndex: number;
    readonly width: number;
    readonly height: number;
  }[];
}
export interface LevelingChapterMaps {
  readonly buildNumber: number | null;
  readonly targetBuild: number;
  readonly state: "ready" | "unavailable";
  readonly zones: readonly LevelingZoneArt[];
  readonly points: readonly LevelingMapPoint[];
  readonly unmappedPoints: number;
}
export interface LevelingMapStep {
  readonly id: string;
  readonly positions: readonly {
    readonly sourceLine: number;
    readonly position: NonNullable<ImportedDirective["position"]>;
  }[];
  readonly quests: readonly { readonly questId: number; readonly sourceLine: number }[];
}
export type LevelingMapWorld = Pick<
  ForeverWorldData,
  | "build"
  | "uiMaps"
  | "uiMapAssignments"
  | "uiMapArtLinks"
  | "mapArts"
  | "mapArtLayers"
  | "mapArtTiles"
  | "questPois"
>;

export function importedMapSteps(guide: ImportedChapter): readonly LevelingMapStep[] {
  return guide.steps.map((step) => ({
    id: step.id,
    positions: step.directives.flatMap((directive) =>
      directive.position
        ? [{ sourceLine: directive.sourceLine, position: directive.position }]
        : [],
    ),
    quests: step.directives.flatMap((directive) =>
      directive.questId !== null
        ? [{ sourceLine: directive.sourceLine, questId: directive.questId }]
        : [],
    ),
  }));
}
export function originalMapSteps(route: LevelingRoute): readonly LevelingMapStep[] {
  return route.steps.map((step) => ({
    id: step.id,
    positions: step.position
      ? [
          {
            sourceLine: 0,
            position: { ...step.position, floor: null, space: "map-percent" as const },
          },
        ]
      : [],
    quests: step.questId === null ? [] : [{ sourceLine: 0, questId: step.questId }],
  }));
}
export function emptyLevelingMaps(targetBuild: number): LevelingChapterMaps {
  return {
    buildNumber: null,
    targetBuild,
    state: "unavailable",
    zones: [],
    points: [],
    unmappedPoints: 0,
  };
}
function resolveZone(world: LevelingMapWorld, zone: string): WorldUiMap | null {
  if (/^\d+$/.test(zone)) return world.uiMaps.find((map) => map.uiMapId === Number(zone)) ?? null;
  // Verified alias in the installed Classic RXPGuides map.lua; no modern-layout conversion applies.
  const name = (zone === "StormwindClassic" ? "Stormwind City" : zone).trim().toLowerCase();
  const matches = world.uiMaps.filter((map) => map.system === 0 && map.name.toLowerCase() === name);
  return matches.length === 1 ? matches[0]! : null;
}
function assignmentsFor(world: LevelingMapWorld, uiMapId: number): readonly WorldUiMapAssignment[] {
  return world.uiMapAssignments
    .filter((assignment) => assignment.uiMapId === uiMapId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}
function zoneArt(
  world: LevelingMapWorld,
  map: WorldUiMap,
  overlays: readonly LevelingMapOverlay[],
): LevelingZoneArt {
  const link = world.uiMapArtLinks.filter(
    (entry) => entry.uiMapId === map.uiMapId && entry.phaseId === 0,
  )[0];
  const art = link ? world.mapArts.find((entry) => entry.mapArtId === link.mapArtId) : null;
  const layer = art
    ? world.mapArtLayers
        .filter((entry) => entry.styleId === art.styleId)
        .sort((a, b) => a.layerIndex - b.layerIndex)[0]
    : null;
  return {
    uiMapId: map.uiMapId,
    name: map.name,
    width: layer?.layerWidth ?? 1002,
    height: layer?.layerHeight ?? 668,
    tileWidth: layer?.tileWidth ?? 256,
    tileHeight: layer?.tileHeight ?? 256,
    tiles:
      art && layer
        ? world.mapArtTiles
            .filter(
              (tile) => tile.mapArtId === art.mapArtId && tile.layerIndex === layer.layerIndex,
            )
            .map(({ fileDataId, rowIndex, columnIndex }) => ({ fileDataId, rowIndex, columnIndex }))
        : [],
    overlays:
      art && layer
        ? overlays
            .filter((overlay) => overlay.mapArtId === art.mapArtId)
            .map((overlay) => ({
              ...overlay,
              tiles: overlay.tiles.filter((tile) => tile.layerIndex === layer.layerIndex),
            }))
            .filter((overlay) => overlay.tiles.length > 0)
        : [],
  };
}

export function buildLevelingMaps(
  steps: readonly LevelingMapStep[],
  targetBuild: number,
  world: LevelingMapWorld,
  overlays: readonly LevelingMapOverlay[] = [],
): LevelingChapterMaps {
  const points: LevelingMapPoint[] = [];
  const zones = new Map<number, LevelingZoneArt>();
  let unmappedPoints = 0;
  for (const step of steps) {
    for (const { position, sourceLine } of step.positions) {
      const map = resolveZone(world, position.zone);
      if (!map) {
        unmappedPoints++;
        continue;
      }
      zones.set(map.uiMapId, zones.get(map.uiMapId) ?? zoneArt(world, map, overlays));
      let projected: { readonly x: number; readonly y: number } | null = null;
      if (position.space === "map-percent") {
        if (
          Number.isFinite(position.x) &&
          Number.isFinite(position.y) &&
          position.x >= 0 &&
          position.x <= 100 &&
          position.y >= 0 &&
          position.y <= 100
        )
          projected = { x: position.x / 100, y: position.y / 100 };
      } else {
        // RXP/HBD world axes are reversed relative to the client DB2 Region/QuestPOI axes.
        // The slash suffix, stored as `floor` in archive v1, is actually the world/instance map ID.
        for (const assignment of assignmentsFor(world, map.uiMapId)) {
          if (position.floor !== null && assignment.mapId !== position.floor) continue;
          projected = worldToUiMap(position.y, position.x, assignment);
          if (projected) break;
        }
      }
      if (!projected) {
        unmappedPoints++;
        continue;
      }
      points.push({
        id: `${step.id}-guide-${sourceLine}`,
        stepId: step.id,
        sourceLine,
        uiMapId: map.uiMapId,
        ...projected,
        questId: null,
        evidence: "guide_coordinate",
        outline: [],
      });
    }
    // A different-build map can be used as labeled background art, not as exact quest evidence.
    if (world.build.buildNumber !== targetBuild) continue;
    for (const quest of step.quests) {
      for (const poi of world.questPois.filter((entry) => entry.questId === quest.questId)) {
        const map = world.uiMaps.find((entry) => entry.uiMapId === poi.uiMapId);
        if (!map) continue;
        const assignment = assignmentsFor(world, map.uiMapId).find(
          (entry) => entry.mapId === poi.mapId,
        );
        if (!assignment) continue;
        const outline = poi.points.flatMap((point) => {
          const projected = worldToUiMap(point.x, point.y, assignment);
          return projected ? [projected] : [];
        });
        if (!outline.length || outline.length !== poi.points.length) continue;
        zones.set(map.uiMapId, zones.get(map.uiMapId) ?? zoneArt(world, map, overlays));
        points.push({
          id: `${step.id}-quest-${quest.sourceLine}-${poi.blobId}`,
          stepId: step.id,
          sourceLine: quest.sourceLine,
          uiMapId: map.uiMapId,
          x: outline.reduce((sum, point) => sum + point.x, 0) / outline.length,
          y: outline.reduce((sum, point) => sum + point.y, 0) / outline.length,
          questId: quest.questId,
          evidence: "client_quest_poi",
          outline,
        });
      }
    }
  }
  return {
    buildNumber: world.build.buildNumber,
    targetBuild,
    state: "ready",
    zones: [...zones.values()],
    points,
    unmappedPoints,
  };
}
