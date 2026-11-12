import type { CampaignAction, CampaignPlan } from "./campaign.js";

const separateFields = new Set(["id", "title", "instructions", "questChanges"]);

function collectionStep(action: CampaignAction): string | null {
  if (!action.source || action.libraryObjective !== "collection" ||
    action.libraryQuestId === undefined || !action.questChanges.length ||
    action.questChanges.some((change) => change.questId !== action.libraryQuestId ||
      change.state !== "objectives-complete" || change.objectiveIndex === null)) return null;
  return JSON.stringify(Object.fromEntries(Object.entries(action)
    .filter(([field]) => !separateFields.has(field))));
}

/** One captured collection instruction can complete several counters in the same physical camp. */
export function batchCampaignSourceObjectives(plan: CampaignPlan, minimumIndex: number): CampaignPlan {
  if (!plan.sharedQuestsOnly) return plan;
  const actions: CampaignAction[] = [];
  const aliases = { ...plan.bookmarkAliases };
  let changed = false;
  for (const [index, action] of plan.actions.entries()) {
    const previous = actions.at(-1);
    const signature = index >= minimumIndex ? collectionStep(action) : null;
    if (!previous || actions.length <= minimumIndex || signature === null ||
      collectionStep(previous) !== signature) {
      actions.push(action);
      continue;
    }
    const keys = new Set(previous.questChanges.map((change) => `${change.questId}:${change.objectiveIndex}`));
    const additions = action.questChanges.filter((change) => !keys.has(`${change.questId}:${change.objectiveIndex}`));
    if (additions.length !== action.questChanges.length) {
      actions.push(action);
      continue;
    }
    actions[actions.length - 1] = { ...previous,
      title: `Complete ${previous.questChanges[0]!.title}`,
      questChanges: [...previous.questChanges, ...additions],
      instructions: [...new Set([...previous.instructions, ...action.instructions])],
    };
    aliases[action.id] = previous.id;
    changed = true;
  }
  if (!changed) return plan;
  return { ...plan, actions, bookmarkAliases: aliases,
    legs: plan.legs.map((leg) => ({ ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}
