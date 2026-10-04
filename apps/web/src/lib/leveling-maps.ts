import { getForeverWorldData } from "./forever-world";
import { getLevelingMapOverlays } from "./leveling-map-overlays";
import {
  buildLevelingMaps,
  emptyLevelingMaps,
  type LevelingMapStep,
  type LevelingChapterMaps,
} from "./leveling-map-data";

export async function getLevelingMaps(
  steps: readonly LevelingMapStep[],
  targetBuild: number,
): Promise<LevelingChapterMaps> {
  if (!process.env.DATABASE_URL && !process.env.WOW_TRADER_WORLD_SNAPSHOT)
    return emptyLevelingMaps(targetBuild);
  try {
    const world = await getForeverWorldData();
    if (!world) return emptyLevelingMaps(targetBuild);
    let overlays: Awaited<ReturnType<typeof getLevelingMapOverlays>> = [];
    try {
      overlays = await getLevelingMapOverlays(world.build.product, world.build.buildNumber);
    } catch {
      console.warn(
        "Leveling map reveal layers could not be loaded; base map art remains available.",
      );
    }
    return buildLevelingMaps(steps, targetBuild, world, overlays);
  } catch {
    // Map availability must not take an otherwise validated quest reader offline.
    console.warn("Leveling map data could not be loaded; the quest reader remains available.");
    return emptyLevelingMaps(targetBuild);
  }
}
