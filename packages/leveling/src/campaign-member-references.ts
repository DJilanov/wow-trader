import type { CampaignPlan } from "./campaign.js";
import type { CampaignCombatPlan } from "./combat-model.js";
import { campaignQuestObjectiveIndexes } from "./campaign-quest-objectives.js";
import {
  indexSharedPartyCombat,
  type SharedPartyCombatIndex,
} from "./campaign-shared-combat-index.js";

interface CampaignMemberReferences {
  readonly combat: CampaignCombatPlan | undefined;
  readonly objectiveIndexes: ReadonlyMap<number, ReadonlySet<number>>;
  readonly sharedCombatIndex: () => SharedPartyCombatIndex | undefined;
}

/** Keep personal source variants with their owner; canonical provider requirements stay intact. */
export function campaignMemberReferences(
  plan: CampaignPlan,
  player: number,
  personalActionPlayers: Readonly<Record<string, number>> = {},
): CampaignMemberReferences {
  const excluded = new Set(
    plan.actions
      .filter((action) => action.leaderOnly && (personalActionPlayers[action.id] ?? 1) !== player)
      .map((action) => action.id),
  );
  const combat =
    plan.combat && excluded.size
      ? {
          ...plan.combat,
          activities: plan.combat.activities.filter((activity) => !excluded.has(activity.actionId)),
          ...(plan.combat.materialWork
            ? {
                materialWork: plan.combat.materialWork.filter(
                  (work) => !excluded.has(work.actionId),
                ),
              }
            : {}),
        }
      : plan.combat;
  let sharedIndex: SharedPartyCombatIndex | undefined;
  return {
    combat,
    objectiveIndexes: campaignQuestObjectiveIndexes({
      ...plan,
      actions: plan.actions.filter((action) => !excluded.has(action.id)),
      ...(combat ? { combat } : {}),
    }),
    sharedCombatIndex: (): SharedPartyCombatIndex | undefined => {
      if (!plan.combat || !combat) return undefined;
      return (sharedIndex ??= indexSharedPartyCombat(plan.combat, combat.activities));
    },
  };
}
