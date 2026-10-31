import type { CampaignAction, CampaignLeg } from "./campaign.js";
import { orderCampaignQuestStages } from "./campaign-library-route.js";

/** Bring outdoor lead-ins onto their earlier selected visit; dungeon and personal work stay in place. */
export function orderCampaignPrerequisites(
  actions: readonly CampaignAction[],
  legs: readonly CampaignLeg[],
): readonly CampaignAction[] {
  const index = new Map(legs.map((leg, offset) => [leg.id, offset]));
  const stagesByQuest = new Map<number, CampaignAction[]>();
  for (const action of actions) {
    if (!index.has(action.legId))
      throw new Error(`Quest action has no campaign leg: ${action.id}.`);
    for (const id of new Set(action.questChanges.map((change) => change.questId)))
      stagesByQuest.set(id, [...(stagesByQuest.get(id) ?? []), action]);
  }
  const placement = new Map(actions.map((action) => [action.id, action.legId]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const action of actions) {
      const legId = placement.get(action.id)!;
      const destination = legs[index.get(legId)!];
      if (!destination || !["preparation", "xp-bridge"].includes(destination.kind)) continue;
      for (const parent of action.requiredQuestIds ?? []) {
        const stages = stagesByQuest.get(parent) ?? [];
        if (
          !stages.length ||
          stages.some(
            (stage) => stage.leaderOnly !== action.leaderOnly || stage.raidOnly !== action.raidOnly,
          )
        )
          continue;
        if (
          stages.some((stage) => {
            const leg = legs[index.get(placement.get(stage.id)!)!];
            return !leg || !["preparation", "xp-bridge"].includes(leg.kind) || !stage.source;
          })
        )
          continue;
        for (const stage of stages) {
          if (index.get(placement.get(stage.id)!)! <= index.get(legId)!) continue;
          placement.set(stage.id, legId);
          changed = true;
        }
      }
    }
  }
  return legs.flatMap((leg) =>
    orderCampaignQuestStages(
      actions.flatMap((action) =>
        placement.get(action.id) === leg.id ? [{ ...action, legId: leg.id }] : [],
      ),
      true,
    ),
  );
}
