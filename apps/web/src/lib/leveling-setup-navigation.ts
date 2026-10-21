import type { CharacterProfile } from "@wow-trader/leveling";
import { withHelperBasePath } from "./site-path";

export type LevelingSetupStage = 0 | 1 | 2;

export function levelingSetupHistoryPath(
  stage: LevelingSetupStage,
  profile: CharacterProfile,
  editingId?: string,
): string {
  const params = new URLSearchParams({
    stage: stage === 2 ? "style" : stage === 1 ? "race" : "faction",
    draft: JSON.stringify(profile),
  });
  if (editingId) params.set("edit", editingId);
  return withHelperBasePath(`/forever/leveling?${params}`);
}
