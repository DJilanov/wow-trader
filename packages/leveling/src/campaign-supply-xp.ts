import type { CampaignPlan } from "./campaign.js";
import type { CombatActivity, CampaignMaterialWork } from "./combat-model.js";
import type { CampaignStarterCatalog } from "./campaign-starters.js";
import {
  isReferencedCampaignMeatSupply,
  type CampaignAuctionSupply,
} from "./campaign-meat-supplies.js";

export function campaignSupplyKey(questId: number, itemId: number): string {
  return `${questId}:${itemId}`;
}

/** Optional meat gathering is outside the baseline. Preserve quest kills, rewards and physical tasks. */
export function campaignSupplyXpBaseline(plan: CampaignPlan): {
  readonly plan: CampaignPlan;
  readonly excludedItems: ReadonlySet<string>;
} {
  const supplies: readonly CampaignAuctionSupply[] = [
    ...(plan.partyPolicy?.decisions.flatMap((decision) =>
      decision.included ? (decision.lootCost?.auctionItems ?? []) : [],
    ) ?? []),
    ...plan.actions.flatMap((action) => action.auctionSupplies ?? []),
    ...(plan.starters?.entries.flatMap((entry) => entry.action.auctionSupplies ?? []) ?? []),
  ];
  const excludedItems = new Set(
    supplies
      .filter(isReferencedCampaignMeatSupply)
      .map((supply) => campaignSupplyKey(supply.questId, supply.itemId)),
  );
  if (!excludedItems.size) return { plan, excludedItems };
  const activities = (rows: readonly CombatActivity[]): readonly CombatActivity[] =>
    rows
      .map((activity) => ({
        ...activity,
        objectives: activity.objectives.filter(
          (objective) =>
            objective.credit !== "personal-loot" ||
            !objective.loot ||
            !excludedItems.has(campaignSupplyKey(objective.questId, objective.loot.itemId)),
        ),
      }))
      .filter((activity) => activity.objectives.length > 0 || activity.profile !== null);
  const materialWork = (rows: readonly CampaignMaterialWork[]): readonly CampaignMaterialWork[] =>
    rows
      .map((work) => ({
        ...work,
        targets: work.targets.filter(
          ({ objective }) =>
            !objective.loot ||
            !excludedItems.has(campaignSupplyKey(objective.questId, objective.loot.itemId)),
        ),
      }))
      .filter((work) => work.targets.length > 0);
  const starters: CampaignStarterCatalog | undefined = plan.starters
    ? {
        ...plan.starters,
        entries: plan.starters.entries.map((entry) => ({
          ...entry,
          activities: activities(entry.activities),
          ...(entry.materialWork ? { materialWork: materialWork(entry.materialWork) } : {}),
        })),
      }
    : undefined;
  return {
    excludedItems,
    plan: {
      ...plan,
      ...(starters ? { starters } : {}),
      ...(plan.combat
        ? {
            combat: {
              ...plan.combat,
              activities: activities(plan.combat.activities),
              ...(plan.combat.materialWork
                ? { materialWork: materialWork(plan.combat.materialWork) }
                : {}),
            },
          }
        : {}),
    },
  };
}
