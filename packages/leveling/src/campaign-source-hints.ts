import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { attachCampaignMeatSupplyHints } from "./campaign-meat-supplies.js";

/** Share the native adapter's item filtering with the browser's quest instructions. */
export function attachCampaignSourceHints(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const chapters = new Set(plan.actions.flatMap((action) => action.source?.chapterId ?? []));
  const native = campaignNativeInstructions(
    plan,
    sources.filter((source) => chapters.has(source.guide.chapterId)),
  );
  return attachCampaignMeatSupplyHints({
    ...plan,
    actions: plan.actions.map((action) => {
      if (!action.source || action.movement) return action;
      const source = native(action);
      const excluded = new Set(source?.excludedText ?? []);
      if (excluded.size)
        action = {
          ...action,
          instructions: action.instructions.filter((instruction) => !excluded.has(instruction)),
        };
      const hints =
        source?.directives
          .filter(
            (directive) =>
              [".use", ".cast", ".collect", ".gossipoption"].includes(directive.tag) &&
              directive.text,
          )
          .map((directive) => directive.text) ?? [];
      return hints.length
        ? { ...action, instructions: [...new Set([...action.instructions, ...hints])] }
        : action;
    }),
  });
}
