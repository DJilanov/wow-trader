import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { isExplicitGroundPickup } from "./campaign-ground-pickup.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";
import { getGuideStepView } from "./guide-archive.js";

/** Full source-backed ground counters have no creature-drop cost; their item quotas remain required. */
export function groundCampaignQuestItemKeys(
  questId: number,
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset | undefined,
): ReadonlySet<string> {
  const result = new Set<string>();
  const quest = data?.quests.find((entry) => entry.questId === questId);
  const items = quest?.itemObjectives?.filter(
    (item) =>
      item.objectIds?.length &&
      !item.npcIds.length &&
      !item.provided &&
      !item.vendorEvidence &&
      !item.rewardEvidence &&
      item.quantity !== null &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0,
  );
  if (!data || data.targetBuild !== plan.targetBuild || !quest || !items?.length || !sources.length)
    return result;
  const profile = campaignPlanSourceProfile(plan);
  for (const action of plan.actions) {
    const source = action.source;
    const changes = action.questChanges.filter(
      (change) => change.questId === questId && change.state === "objectives-complete",
    );
    if (!source || !changes.length) continue;
    const guide = sources.find(
      (entry) =>
        entry.guide.targetBuild === plan.targetBuild &&
        entry.guide.chapterId === source.chapterId &&
        entry.guide.version === source.version,
    )?.guide;
    const step = guide?.steps.find((entry) => entry.id === source.stepId);
    if (!step) continue;
    const view = getGuideStepView(step, profile, { dungeons: [] });
    if (view.condition !== "match") continue;
    const displayOnly = displayOnlyQuestPhases(view.directives);
    for (const change of changes) {
      const objectiveIndex = change.objectiveIndex ?? 1;
      const item = items.find((entry) => entry.objectiveIndex === objectiveIndex);
      if (!item) continue;
      const requirements =
        plan.itemRequirements?.filter(
          (requirement) =>
            requirement.questId === questId &&
            requirement.objectiveIndex === objectiveIndex &&
            requirement.itemId === item.itemId,
        ) ?? [];
      if (
        requirements.length !== 1 ||
        requirements[0]!.quantity !== item.quantity ||
        requirements[0]!.conflict ||
        requirements[0]!.sourceProvided
      )
        continue;
      const counters = view.directives.filter(
        (directive) =>
          directive.tag === ".complete" &&
          directive.questId === questId &&
          Number(directive.arguments.split(",")[1] ?? 1) === objectiveIndex,
      );
      if (
        counters.length !== 1 ||
        displayOnly.has(counters[0]!) ||
        !isExplicitGroundPickup(quest, objectiveIndex, view.directives)
      )
        continue;
      result.add(`${objectiveIndex}:${item.itemId}`);
    }
  }
  return result;
}
