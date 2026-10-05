import type { CharacterProfile } from "./profile.js";
import type { DungeonQuest, DungeonVisit } from "./dungeon-model.js";
import { LEVELING_EVIDENCE } from "./westfall.js";

export interface DungeonSchedule {
  readonly level: number | null;
  readonly state: "ready" | "too-early" | "unknown-level" | "reference-only";
  readonly reasons: readonly string[];
}

export function scheduleDungeonVisit(
  visit: DungeonVisit,
  profile: CharacterProfile,
  selectedQuests: readonly DungeonQuest[] = [],
): DungeonSchedule {
  const reasons: string[] = [];
  const atLevel = visit.levels?.atLevel ?? null;
  const level =
    atLevel === null
      ? null
      : Math.max(atLevel, ...selectedQuests.map((quest) => quest.minimumLevel ?? 0));
  if (level === null) reasons.push("At-level recommendation has not been reviewed.");
  if (visit.availability !== "beta")
    reasons.push("This visit is a future/reference-only itinerary.");
  if (level !== null && level > LEVELING_EVIDENCE.betaLevelCap)
    reasons.push(
      `Scheduled level ${level} exceeds the reviewed beta cap of ${LEVELING_EVIDENCE.betaLevelCap}.`,
    );
  if (visit.groupSize === null) reasons.push("Group size and access rules need review.");
  if (profile.level !== null && profile.level > LEVELING_EVIDENCE.betaLevelCap)
    reasons.push(
      "Actual level exceeds the reviewed beta cap; current-build run evidence needs updating.",
    );
  if (visit.faction !== "both" && visit.faction !== profile.faction)
    reasons.push("This visit is not available to this faction.");
  if (reasons.length) return { level, state: "reference-only", reasons };
  if (profile.level === null)
    return {
      level,
      state: "unknown-level",
      reasons: [`Confirm actual level ${level}+ before entry.`],
    };
  if (profile.level < level!)
    return {
      level,
      state: "too-early",
      reasons: [
        `Continue questing to actual level ${level} before entering; a premade group cannot lower this floor.`,
      ],
    };
  return { level, state: "ready", reasons: [] };
}
