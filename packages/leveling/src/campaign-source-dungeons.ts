import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";

/** Use the same source branches when qualifying a method and compiling its native guide. */
export function campaignSourceDungeonTags(): readonly string[] {
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  return DUNGEON_VISITS.flatMap((visit) =>
    selected.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
}
