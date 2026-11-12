import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CombatQuestReference } from "./combat-model.js";
import { nearbyLibraryQuest } from "./campaign-library-route.js";
import { CAMPAIGN_DEFERRED_PARTY_QUESTS } from "./campaign-route.js";
import { hasOnlyPostTurnInCleanup } from "./campaign-source-cleanup.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";

export interface CampaignPickupSupport {
  readonly questIds: ReadonlySet<number>;
  readonly neighboringQuestIds: ReadonlyMap<number, readonly number[]>;
}

/** Pickup eligibility does not depend on a measured respawn rate or a mob-drop kill budget. */
export function campaignPickupSupport(
  plan: CampaignPlan,
  library: readonly CampaignLibraryQuest[],
  references: ReadonlyMap<number, CombatQuestReference>,
  sources: readonly CampaignSource[],
  objectStarterQuestIds: ReadonlySet<number> = new Set(),
): CampaignPickupSupport {
  const pickups = plan.sharedQuestsOnly
    ? library.filter(
        (quest) =>
          (quest.worldObjectPickup || objectStarterQuestIds.has(quest.questId)) &&
          quest.complete &&
          !quest.held &&
          (!quest.abandoned ||
            hasOnlyPostTurnInCleanup(
              quest.questId,
              quest.actions,
              sources,
              campaignPlanSourceProfile(plan),
              plan.targetBuild,
            )) &&
          !CAMPAIGN_DEFERRED_PARTY_QUESTS[quest.questId] &&
          !(references.get(quest.questId)?.itemObjectives ?? []).some(
            (item) =>
              item.groundPickup &&
              item.groundPickup.sourceArchiveSha256 !== plan.sourceArchiveSha256,
          ) &&
          (objectStarterQuestIds.has(quest.questId) ||
            plan.actions.some((action) =>
              action.questChanges.some(
                (change) =>
                  change.questId === quest.questId && change.state === "objectives-complete",
              ),
            )),
      )
    : [];
  return {
    questIds: new Set(pickups.map((quest) => quest.questId)),
    neighboringQuestIds: new Map(
      library.flatMap((quest) => {
        if (!["delivery", "interaction"].includes(quest.objective)) return [];
        const roots = pickups
          .filter(
            (pickup) =>
              pickup.questId !== quest.questId && nearbyLibraryQuest(quest, pickup.actions),
          )
          .map((pickup) => pickup.questId);
        return roots.length ? [[quest.questId, roots] as const] : [];
      }),
    ),
  };
}
