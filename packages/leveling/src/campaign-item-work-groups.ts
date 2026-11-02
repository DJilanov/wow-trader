import type { CampaignAction, CampaignPlan } from "./campaign.js";

const collectionFields = new Set(["id", "title", "instructions", "itemCollections"]);

function collectionScope(action: CampaignAction): string | null {
  const targets = action.itemCollections;
  if (
    action.kind !== "instructions" ||
    !action.source ||
    action.questChanges.length ||
    !targets?.length ||
    targets.some((target) => target.questId !== targets[0]!.questId)
  )
    return null;
  const context = Object.fromEntries(
    Object.entries(action).filter(([key]) => !collectionFields.has(key)),
  );
  return JSON.stringify([targets[0]!.questId, context]);
}

/** One captured waypoint program should run once for all of that quest's stock targets. */
export function groupCampaignItemWork(plan: CampaignPlan): CampaignPlan {
  const actions: CampaignAction[] = [];
  const aliases: Record<string, string> = { ...plan.bookmarkAliases };
  let changed = false;
  for (const action of plan.actions) {
    const scope = collectionScope(action);
    const previous = actions.at(-1);
    if (!previous || scope === null || collectionScope(previous) !== scope) {
      actions.push(action);
      continue;
    }
    if (
      action.itemCollections!.some((target) =>
        previous.itemCollections!.some(
          (other) =>
            other.itemId === target.itemId && JSON.stringify(other) !== JSON.stringify(target),
        ),
      )
    ) {
      actions.push(action);
      continue;
    }
    actions[actions.length - 1] = {
      ...previous,
      title: [...new Set([previous.title, action.title])].join(" · "),
      instructions: [...new Set([...previous.instructions, ...action.instructions])],
      itemCollections: [
        ...new Map(
          [...previous.itemCollections!, ...action.itemCollections!].map((target) => [
            JSON.stringify(target),
            target,
          ]),
        ).values(),
      ],
    };
    if (action.id !== previous.id) {
      for (const [id, target] of Object.entries(aliases))
        if (target === action.id) aliases[id] = previous.id;
      aliases[action.id] = previous.id;
    }
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
