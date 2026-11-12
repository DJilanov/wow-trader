import type { CampaignAction, CampaignSource } from "./campaign.js";
import type { CharacterProfile } from "./profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { eligibleCampaignLibrarySource } from "./campaign-library-source-profile.js";

/** A reset before a complete program is irrelevant only when that quest has not started. */
export function hasOnlyPrePickupReset(
  questId: number,
  actions: readonly CampaignAction[],
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  targetBuild: number,
  ordinaryQuestIds?: ReadonlySet<number>,
): boolean {
  if (
    actions.length < 2 ||
    actions.some(
      (action) =>
        !action.source ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.questId !== questId,
    )
  )
    return false;
  const pickup = actions[0];
  const handIn = actions.at(-1);
  if (
    !pickup ||
    !handIn ||
    pickup.questChanges[0]!.state !== "accepted" ||
    handIn.questChanges[0]!.state !== "rewarded" ||
    actions
      .slice(1, -1)
      .some((action) => action.questChanges[0]!.state !== "objectives-complete") ||
    pickup.source!.chapterId !== handIn.source!.chapterId ||
    pickup.source!.version !== handIn.source!.version
  )
    return false;
  const owner = sources.find(
    ({ guide }) =>
      guide.chapterId === pickup.source!.chapterId &&
      guide.version === pickup.source!.version &&
      guide.targetBuild === targetBuild,
  );
  if (!owner) return false;
  const pickupIndex = owner.guide.steps.findIndex((step) => step.id === pickup.source!.stepId);
  const returnIndex = owner.guide.steps.findIndex((step) => step.id === handIn.source!.stepId);
  if (pickupIndex < 0 || returnIndex <= pickupIndex) return false;
  let resetFound = false;
  for (const input of sources) {
    if (input.guide.targetBuild !== targetBuild) continue;
    const eligible = eligibleCampaignLibrarySource(
      input,
      profile,
      ordinaryQuestIds?.has(questId) === true,
    );
    if (!eligible) continue;
    for (const [index, step] of eligible.source.guide.steps.entries()) {
      if (
        !step.directives.some(
          (row) => row.tag === ".abandon" && Number(row.arguments.split(",")[0]) === questId,
        )
      )
        continue;
      const view = getGuideStepView(step, profile, { dungeons: [] });
      if (view.condition === "exclude") continue;
      if (
        view.condition !== "match" ||
        view.conditionalDirectives.length ||
        view.runtimeChecks.length ||
        input.guide.chapterId !== owner.guide.chapterId ||
        input.guide.version !== owner.guide.version ||
        index >= pickupIndex ||
        view.directives.some(
          (row) =>
            ![".abandon", "text", "marker", "#optional", "#xprate"].includes(row.tag) ||
            (row.tag === ".abandon" &&
              (row.arguments.trim() !== String(questId) || row.condition.trim() !== "")),
        )
      )
        return false;
      resetFound = true;
    }
  }
  return resetFound;
}
