import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";
import type { QuestCatalog } from "./quest-catalog.js";

export function relocateFundingBatch(
  plan: CampaignPlan,
  batch: CampaignFundingBatch,
  insertion: CampaignAction,
  catalog: QuestCatalog,
  preserveLaterQuestIds: ReadonlySet<number> = new Set(),
): CampaignPlan {
  const moved = new Set(batch.questIds.filter((id) => !preserveLaterQuestIds.has(id)));
  // Moving a source task must not make another party setup skip its required work.
  const mandatory = new Set(
    plan.actions.flatMap((action) => {
      const leg = plan.legs.find((entry) => entry.id === action.legId);
      return action.libraryBackbone || (!action.xpOptional && leg?.kind !== "xp-bridge")
        ? action.questChanges
            .filter((change) => moved.has(change.questId))
            .map((change) => change.questId)
        : [];
    }),
  );
  const movedActions = batch.actions.map((action) =>
    action.questChanges.some((change) => mandatory.has(change.questId))
      ? { ...action, libraryBackbone: true, xpOptional: false }
      : action,
  );
  const aliases: Record<string, string> = { ...plan.bookmarkAliases };
  const actions: CampaignAction[] = [];
  for (const action of plan.actions) {
    if (action.id === insertion.id) actions.push(...movedActions);
    const retained = action.questChanges.filter((change) => !moved.has(change.questId));
    if (retained.length === action.questChanges.length) {
      actions.push(action);
      continue;
    }
    const first = action.questChanges.find((change) => moved.has(change.questId))!;
    const destination = batch.actions.find((entry) =>
      entry.questChanges.some(
        (change) =>
          change.questId === first.questId &&
          change.state === first.state &&
          change.objectiveIndex === first.objectiveIndex,
      ),
    );
    if (!retained.length) {
      if (destination) aliases[action.id] = destination.id;
      continue;
    }
    const labels = retained.map(
      (change) =>
        `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
    );
    const requirements = new Set(action.requiredQuestIds ?? []);
    for (const change of retained) {
      if (change.state !== "accepted") continue;
      const quest = catalog.quests.find((entry) => entry.questId === change.questId);
      const parents = new Set([...(quest?.prerequisites.allOf ?? []), ...(quest?.prerequisites.anyOf ?? [])]);
      for (const earlier of action.questChanges.slice(0, action.questChanges.indexOf(change)))
        if (earlier.state === "rewarded" && moved.has(earlier.questId) && parents.has(earlier.questId))
          requirements.add(earlier.questId);
    }
    actions.push({
      ...action,
      questChanges: retained,
      title: labels.join(" · "),
      instructions: labels,
      // Splitting the source exchange must not let its child precede the moved parent hand-in.
      ...(requirements.size ? { requiredQuestIds: [...requirements] } : {}),
    });
  }
  return {
    ...plan,
    actions,
    bookmarkAliases: aliases,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === leg.id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    })),
  };
}

