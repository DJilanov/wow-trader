import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { isExplicitVendorPurchase } from "./combat-purchase.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";

export interface CampaignQuestPurchase {
  readonly itemId: number;
  readonly objectiveIndex: number;
  readonly quantity: number;
  readonly source: NonNullable<CampaignAction["source"]>;
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A vendor listing alone does not establish how the selected source obtains an item. */
export function purchasedCampaignQuestItems(
  questId: number,
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset | undefined,
): readonly CampaignQuestPurchase[] {
  const items = data?.quests.find((quest) => quest.questId === questId)?.itemObjectives;
  if (
    !data ||
    data.targetBuild !== plan.targetBuild ||
    !sources.length ||
    !items?.some((item) => item.vendorEvidence)
  )
    return [];
  const profile = campaignPlanSourceProfile(plan);
  const npcs = new Map(data.npcs.map((npc) => [npc.id, npc]));
  const purchases = new Map<string, CampaignQuestPurchase>();
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
      if (!item?.vendorEvidence || !item.itemName || item.quantity === null || item.provided)
        continue;
      const counters = view.directives
        .map((directive, offset) => ({ directive, offset }))
        .filter(
          ({ directive }) =>
            directive.tag === ".complete" &&
            directive.questId === questId &&
            Number(directive.arguments.split(",")[1] ?? 1) === objectiveIndex &&
            !displayOnly.has(directive),
        );
      if (counters.length !== 1) continue;
      const { directive, offset } = counters[0]!;
      const counter = /^(.*?)\s*\(x?(\d+)\)\s*$/i.exec(directive.text);
      if (
        !counter ||
        Number(counter[2]) !== item.quantity ||
        normalized(counter[1]!).replace(/^(?:collect|obtain|buy|purchase)\s+/, "") !==
          normalized(item.itemName) ||
        !isExplicitVendorPurchase(view.directives, offset, counter[1], item.vendorEvidence, npcs)
      )
        continue;
      purchases.set(`${objectiveIndex}:${item.itemId}`, {
        itemId: item.itemId,
        objectiveIndex,
        quantity: item.quantity,
        source,
      });
    }
  }
  return [...purchases.values()];
}
