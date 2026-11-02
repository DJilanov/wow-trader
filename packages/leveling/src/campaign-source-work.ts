import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignMaterialWork } from "./combat-model.js";

const contentFields = new Set([
  "id",
  "title",
  "instructions",
  "itemCollections",
  "questChanges",
  "kind",
]);
function context(action: CampaignAction): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(action)
        .filter(([key]) => !contentFields.has(key))
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    ),
  );
}

/** Keep an adjacent captured kill-and-stock program in one executable step. */
export function combineCampaignSourceWork(
  plan: CampaignPlan,
  materials: readonly CampaignMaterialWork[],
): CampaignPlan {
  const work = new Map(materials.map((entry) => [entry.actionId, entry]));
  const actions: CampaignAction[] = [];
  const aliases = { ...plan.bookmarkAliases };
  let changed = false;
  for (const action of plan.actions) {
    const previous = actions.at(-1);
    const source = previous && work.get(previous.id);
    if (
      !previous ||
      !source ||
      !source.targets.length ||
      source.targets.some((target) => !target.sourceBlocksCompletion) ||
      previous.kind !== "instructions" ||
      previous.questChanges.length ||
      !previous.itemCollections?.length ||
      action.kind !== "quests" ||
      action.itemCollections?.length ||
      !action.questChanges.length ||
      action.questChanges.some((change) => change.state !== "objectives-complete") ||
      !action.source ||
      context(previous) !== context(action)
    ) {
      actions.push(action);
      continue;
    }
    actions[actions.length - 1] = {
      ...action,
      itemCollections: previous.itemCollections,
      instructions: [...new Set([...previous.instructions, ...action.instructions])],
    };
    for (const [id, target] of Object.entries(aliases))
      if (target === previous.id) aliases[id] = action.id;
    aliases[previous.id] = action.id;
    changed = true;
  }
  return changed
    ? {
        ...plan,
        actions,
        bookmarkAliases: aliases,
        legs: plan.legs.map((leg) => ({
          ...leg,
          actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
        })),
      }
    : plan;
}
