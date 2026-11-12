import type { CampaignPlan } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";

export interface ConditionalFundingAlternative {
  readonly batch: CampaignFundingBatch;
  readonly retainedQuestIds: ReadonlySet<number>;
}

/** Retain a complete earlier optional program; its fallback runs only when that visit is skipped. */
export function conditionalFundingAlternative(
  plan: CampaignPlan,
  batch: CampaignFundingBatch,
  beforeIndex: number,
  activeActionIds: ReadonlySet<string>,
): ConditionalFundingAlternative | null {
  const retained = new Set<number>();
  const selectors = new Set<number>();
  for (const questId of batch.questIds) {
    const entries = plan.actions.flatMap((action, index) =>
      action.questChanges.some((change) => change.questId === questId) ? [{ action, index }] : [],
    );
    const optional = entries.find(({ action, index }) => {
      const leg = plan.legs.find((entry) => entry.id === action.legId);
      return index < beforeIndex && leg?.optionalQuestId !== undefined && !leg.requiredVisit;
    });
    if (!optional) continue;
    const leg = plan.legs.find((entry) => entry.id === optional.action.legId)!;
    if (entries.some(({ action, index }) => index >= beforeIndex || action.legId !== leg.id ||
      action.kind !== "quests" || action.leaderOnly || action.raidOnly || action.dungeonFinishOnly ||
      action.bundleId || action.excludedByOptionalQuestId !== undefined || action.optionalForQuestIds?.length ||
      activeActionIds.has(action.id) || action.questChanges.some((change) => change.questId !== questId)))
      return null;
    const changes = entries.flatMap(({ action }) => action.questChanges);
    const counterIndices = (rows: typeof changes): readonly number[] => rows
      .filter((change) => change.questId === questId && change.state === "objectives-complete")
      .map((change) => change.objectiveIndex ?? 1).sort((left, right) => left - right);
    const expected = batch.actions.flatMap((action) => action.questChanges);
    if (changes[0]?.state !== "accepted" || changes.at(-1)?.state !== "rewarded" ||
      changes.filter((change) => change.state === "accepted").length !== 1 ||
      changes.filter((change) => change.state === "rewarded").length !== 1 ||
      JSON.stringify(counterIndices(changes)) !== JSON.stringify(counterIndices(expected)))
      return null;
    retained.add(questId);
    selectors.add(leg.optionalQuestId!);
  }
  if (!retained.size) return { batch, retainedQuestIds: retained };
  if (selectors.size !== 1 || retained.size !== batch.questIds.length) return null;
  const selector = [...selectors][0]!;
  if (batch.actions.some((action) => action.excludedByOptionalQuestId !== undefined &&
    action.excludedByOptionalQuestId !== selector)) return null;
  return { retainedQuestIds: retained, batch: { ...batch,
    actions: batch.actions.map((action) => ({ ...action, excludedByOptionalQuestId: selector })),
  } };
}
