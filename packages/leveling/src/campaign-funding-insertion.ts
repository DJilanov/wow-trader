import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";

/** Consider preparation before the last sourced departure as well as at the level gate. */
export function fundingInsertionActions(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  gate: CampaignAction,
): readonly CampaignAction[] {
  const index = plan.actions.findIndex((action) => action.id === gate.id);
  if (index < 0) throw new Error("Funding checkpoint is absent from its route.");
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  for (let at = index - 1; at >= 0; at--) {
    const action = plan.actions[at]!;
    if (action.legId !== gate.legId || action.kind === "xp-check" || action.kind === "checkpoint")
      break;
    if (
      action.leaderOnly !== gate.leaderOnly ||
      action.kind !== "instructions" ||
      action.questChanges.length ||
      !action.source
    )
      continue;
    if (
      action.nativeUtilityTags &&
      !action.nativeUtilityTags.some((tag) => [".hs", ".fly"].includes(tag))
    )
      continue;
    const source = sources.find(
      (entry) =>
        entry.guide.chapterId === action.source!.chapterId &&
        entry.guide.version === action.source!.version &&
        entry.guide.targetBuild === plan.targetBuild,
    );
    const step = source?.guide.steps.find((entry) => entry.id === action.source!.stepId);
    if (!step) continue;
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter((entry) => ![".group", ".solo"].includes(entry.tag)),
      },
      profile,
      { dungeons: [] },
    );
    if (
      view.condition === "match" &&
      view.directives.some((entry) => [".hs", ".fly"].includes(entry.tag))
    )
      return [gate, action];
  }
  return [gate];
}
