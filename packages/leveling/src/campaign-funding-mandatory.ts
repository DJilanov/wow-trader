import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { isSharedFundingQuest } from "./quest-catalog.js";
import type { CampaignFundingCollection } from "./campaign-funding-collections.js";

/** Eligible complete future work can move earlier without making a mandatory quest optional. */
export function movableMandatoryFundingQuests(
  plan: CampaignPlan,
  catalog: QuestCatalog,
  beforeIndex: number,
  collections?: ReadonlyMap<number, CampaignFundingCollection>,
): ReadonlySet<number> {
  if (!plan.sharedQuestsOnly) return new Set();
  const result = new Set<number>();
  const owned = new Map<number, { readonly action: CampaignAction; readonly index: number }[]>();
  for (const [index, action] of plan.actions.entries())
    for (const id of new Set(action.questChanges.map((change) => change.questId)))
      owned.set(id, [...(owned.get(id) ?? []), { action, index }]);
  for (const [id, entries] of owned) {
    const quest = catalog.quests.find((entry) => entry.questId === id);
    if (
      !quest ||
      (!isSharedFundingQuest(quest) && !collections?.has(id)) ||
      !entries.some(({ action }) => action.libraryRequired) ||
      entries.some(
        ({ action, index }) =>
          index <= beforeIndex ||
          action.leaderOnly ||
          action.raidOnly ||
          action.dungeonFinishOnly ||
          action.bundleId !== undefined ||
          action.nativeUtilityTags?.length ||
          action.kind !== "quests" ||
          plan.legs.find((leg) => leg.id === action.legId)?.kind === "dungeon",
      )
    )
      continue;
    const phases = entries.flatMap(({ action }) =>
      action.questChanges.filter((change) => change.questId === id),
    );
    if (
      phases[0]?.state !== "accepted" ||
      phases.at(-1)?.state !== "rewarded" ||
      phases.filter((change) => change.state === "accepted").length !== 1 ||
      phases.filter((change) => change.state === "rewarded").length !== 1
    )
      continue;
    if (quest.category === "shared-kills") {
      const counters = phases.filter((change) => change.state === "objectives-complete");
      if (
        counters.length !== quest.objectives.length ||
        quest.objectives.some(
          (objective) =>
            counters.filter((change) => change.objectiveIndex === objective.index).length !== 1,
        )
      )
        continue;
    }
    result.add(id);
  }
  return result;
}
