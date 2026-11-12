import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { isUnrestrictedFundingQuest, type QuestCatalog } from "./quest-catalog.js";
import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";

export interface EarlyNorthernCourier {
  readonly actions: readonly [CampaignAction, CampaignAction];
  readonly beforeActionIds: readonly [string, string];
}

/** Reuse the complete Althalaxx message at its captured stops on the earlier Darkshore visit. */
export function earlyNorthernCourier(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset,
  catalog: QuestCatalog,
): EarlyNorthernCourier | null {
  if (!plan.sharedQuestsOnly || plan.race !== "human" || plan.partyPolicy?.partySize !== 5)
    return null;
  const owned = plan.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === 965),
  );
  if (owned.length !== 2) return null;
  // The shared qualifier excludes selected quests. Recheck this owned program without
  // changing its source eligibility or exposing the temporary selection to the planner.
  const delivery = campaignSourceDeliveries(
    { ...plan, actions: plan.actions.filter((action) => !owned.includes(action)) },
    sources,
    data,
    catalog,
  ).get(965);
  const quest = delivery?.quest;
  if (
    !delivery ||
    !quest ||
    delivery.requiresFreshStart ||
    delivery.approaches?.length ||
    !isUnrestrictedFundingQuest(quest) ||
    quest.category !== "delivery" ||
    quest.minimumLevel !== 13 ||
    quest.providedItem ||
    quest.objectives.length ||
    quest.prerequisites.allOf.length ||
    quest.prerequisites.anyOf.length ||
    quest.exclusiveWith.length ||
    quest.objectStarts?.length ||
    quest.objectEnds?.length ||
    delivery.actions.length !== 2
  )
    return null;
  const actions: CampaignAction[] = [],
    anchors: string[] = [];
  for (const [index, state] of ["accepted", "rewarded"].entries()) {
    const action = owned[index]!,
      captured = delivery.actions[index]!;
    if (
      action.kind !== "quests" ||
      action.leaderOnly ||
      action.raidOnly ||
      action.dungeonFinishOnly ||
      action.itemCollections?.length ||
      !action.fundingCheckpointId ||
      !action.source ||
      action.questChanges.length !== 1 ||
      action.questChanges[0]!.state !== state ||
      !["preparation", "xp-bridge"].includes(
        plan.legs.find((leg) => leg.id === action.legId)?.kind ?? "",
      ) ||
      action.legId === "northern-approach" ||
      !action.positions.length ||
      action.positions.some((entry) => entry.position.zone !== "1439") ||
      JSON.stringify([action.questChanges, action.source, action.positions]) !==
        JSON.stringify([captured.questChanges, captured.source, captured.positions])
    )
      return null;
    const source = sources.find(
      ({ guide }) =>
        guide.targetBuild === plan.targetBuild &&
        guide.chapterId === action.source!.chapterId &&
        guide.version === action.source!.version,
    );
    const at = source?.guide.steps.findIndex((step) => step.id === action.source!.stepId) ?? -1;
    if (!source || at < 0) return null;
    const ordinals = new Map(source.guide.steps.map((step, ordinal) => [step.id, ordinal]));
    const anchor = plan.actions
      .flatMap((candidate) => {
        const binding = candidate.source;
        const ordinal = binding ? ordinals.get(binding.stepId) : undefined;
        return candidate.legId === "northern-approach" &&
          !candidate.leaderOnly &&
          !candidate.raidOnly &&
          binding?.chapterId === source.guide.chapterId &&
          binding.version === source.guide.version &&
          ordinal !== undefined &&
          ordinal > at &&
          candidate.positions.length > 0 &&
          candidate.positions.every((entry) => entry.position.zone === "1439")
          ? [{ action: candidate, ordinal }]
          : [];
      })
      .sort((left, right) => left.ordinal - right.ordinal)[0]?.action;
    if (!anchor) return null;
    actions.push(action);
    anchors.push(anchor.id);
  }
  const first = plan.actions.findIndex((action) => action.id === anchors[0]);
  const second = plan.actions.findIndex((action) => action.id === anchors[1]);
  if (first > second) return null;
  return { actions: [actions[0]!, actions[1]!], beforeActionIds: [anchors[0]!, anchors[1]!] };
}
