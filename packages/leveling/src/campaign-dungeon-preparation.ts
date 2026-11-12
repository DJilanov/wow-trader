import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";

/** Fund missing entry levels outdoors; the dungeon's own gate and combat remain unchanged. */
export function attachDungeonPreparationCheckpoints(plan: CampaignPlan, minimumIndex: number): CampaignPlan {
  if (!plan.sharedQuestsOnly) return plan;
  const before = new Map<string, CampaignAction>();
  const legs: CampaignLeg[] = [];
  let changed = false;
  for (const leg of plan.legs) {
    const entries = plan.actions.filter((action) => action.legId === leg.id);
    const gate = leg.kind === "dungeon" && leg.stopId
      ? entries.find((action) => action.kind === "checkpoint" && action.targetStopId === leg.stopId &&
          !action.questChanges.length && !action.location?.insideDungeon)
      : undefined;
    const id = `prepare-${leg.id}`;
    if (gate && plan.actions.indexOf(entries[0]!) >= minimumIndex && !plan.legs.some((entry) => entry.id === id)) {
      const preparation: CampaignAction = { ...gate,
        id: `${id}-entry-readiness`, legId: id,
        title: `Prepare for ${leg.title}`,
        instructions: [`Finish the preparation quests before departing for ${leg.title}.`],
      };
      legs.push({ id, title: `Prepare for ${leg.title}`, from: leg.from, to: leg.from,
        kind: "preparation", stopId: null, actionIds: [preparation.id], questIds: [], unresolvedQuestIds: [],
        ...(leg.optionalQuestId !== undefined ? { optionalQuestId: leg.optionalQuestId } : {}),
      });
      before.set(entries[0]!.id, preparation);
      changed = true;
    }
    legs.push(leg);
  }
  return changed ? { ...plan, legs, actions: plan.actions.flatMap((action) => {
    const preparation = before.get(action.id);
    return preparation ? [preparation, action] : [action];
  }) } : plan;
}
