import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import { mergeCampaignItemRequirements } from "./campaign-items.js";
import { assertCampaignRouteLock, type CampaignRouteLockContext } from "./campaign-route-lock.js";
import { DEFAULT_INCIDENTAL_KILL_XP_PERCENT } from "./campaign-incidental-combat.js";
import { carryPrefixPrerequisites } from "./campaign-prefix-prerequisites.js";

export interface CampaignRoutePrefix {
  readonly schema: "campaign-route-prefix.v1";
  readonly plan: CampaignPlan;
}

function phaseKey(change: CampaignQuestChange): string {
  return `${change.questId}:${change.state}:${change.objectiveIndex ?? 0}`;
}

function instruction(change: CampaignQuestChange): string {
  const verb = change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : "Complete";
  return `${verb} ${change.title}`;
}

/** Restore approved tasks without manufacturing player bars or erasing their outstanding quests. */
export function reuseCampaignRoutePrefix(
  current: CampaignPlan,
  prefix: CampaignRoutePrefix,
  context: CampaignRouteLockContext,
): CampaignPlan {
  if (prefix.schema !== "campaign-route-prefix.v1" || !prefix.plan.sharedQuestsOnly || !current.sharedQuestsOnly)
    throw new Error("Route prefix reuse requires the validated shared-party edition.");
  // V1 certificates cover the owner's common five-player reference profile.
  if (current.incidentalKillXpPercent !== DEFAULT_INCIDENTAL_KILL_XP_PERCENT ||
    current.dungeonCollectionPolicy !== "selected-clear" || current.acquisitionXpPolicy !== "exclude-unpriced-extra")
    throw new Error("The current XP/collection rules differ from the validated route profile.");
  assertCampaignRouteLock(prefix.plan, context);
  if (current.race !== prefix.plan.race || current.leaderClass !== prefix.plan.leaderClass ||
    current.targetBuild !== prefix.plan.targetBuild || current.sourceArchiveSha256 !== prefix.plan.sourceArchiveSha256)
    throw new Error("Route prefix and current route belong to different editions or sources.");
  const approved = prefix.plan.actions;
  if (approved.length !== context.lock.actions.length || approved.at(-1)?.id !== context.lock.boundaryActionId)
    throw new Error("Route prefix must end exactly at its approved handoff.");
  const boundary = current.actions.findIndex((action) => action.id === context.lock.boundaryActionId);
  if (boundary < 0) throw new Error("The current route has no matching approved handoff.");
  const ids = new Set(approved.map((action) => action.id));
  const phases = new Set(approved.flatMap((action) => action.questChanges.map(phaseKey)));
  const paid = new Set(approved.flatMap((action) => action.questChanges
    .filter((change) => change.state === "rewarded").map((change) => change.questId)));
  const tail = current.actions.slice(boundary + 1).flatMap((action): readonly CampaignAction[] => {
    if (ids.has(action.id)) throw new Error(`The route repeats a locked action after its handoff: ${action.id}.`);
    const changes = action.questChanges.filter((change) => !paid.has(change.questId) && !phases.has(phaseKey(change)));
    const collections = action.itemCollections?.filter((target) => !paid.has(target.questId));
    const supplies = action.auctionSupplies?.filter((target) => !paid.has(target.questId));
    if (changes.length === action.questChanges.length && collections?.length === action.itemCollections?.length &&
      supplies?.length === action.auctionSupplies?.length) return [action];
    if (!changes.length && !collections?.length && !supplies?.length) {
      if (action.nativeUtilityTags?.length || action.movement)
        throw new Error(`Review the travel/utility instructions before removing repeated quest work: ${action.id}.`);
      return [];
    }
    const removed = action.questChanges.filter((change) => !changes.includes(change));
    return [{ ...action, questChanges: changes,
      title: changes.length ? changes.map(instruction).join(" · ") : action.title,
      instructions: [...changes.map(instruction), ...action.instructions.filter((line) =>
        !removed.some((change) => line.includes(change.title)) && !changes.some((change) => line.includes(change.title)))],
      ...(collections ? { itemCollections: collections } : {}),
      ...(supplies ? { auctionSupplies: supplies } : {}),
    }];
  });
  const prefixLegs = new Set(prefix.plan.legs.map((leg) => leg.id));
  const boundaryLegId = approved.at(-1)!.legId;
  if (tail.some((action) => prefixLegs.has(action.legId) && action.legId !== boundaryLegId))
    throw new Error("The resumed route returns to an earlier locked leg after its handoff.");
  const prerequisiteWork = carryPrefixPrerequisites(current.actions.slice(0, boundary + 1), approved, tail);
  const actions = [...approved, ...prerequisiteWork, ...tail];
  if (new Set(actions.map((action) => action.id)).size !== actions.length)
    throw new Error("The resumed route contains duplicate action identities.");
  const legs = [...prefix.plan.legs, ...current.legs.filter((leg) => !prefixLegs.has(leg.id))]
    .filter((leg) => actions.some((action) => action.legId === leg.id))
    .map((leg) => {
      const entries = actions.filter((action) => action.legId === leg.id);
      if (prefixLegs.has(leg.id) && entries.length === leg.actionIds.length && entries.every((action, index) => action.id === leg.actionIds[index])) return leg;
      return { ...leg, actionIds: entries.map((action) => action.id),
        questIds: [...new Set([...leg.questIds, ...entries.flatMap((action) => action.questChanges.map((change) => change.questId))])],
      };
    });
  if (actions.some((action) => !legs.some((leg) => leg.id === action.legId)))
    throw new Error("The resumed route has actions without a route leg.");
  const result: CampaignPlan = { ...current, actions, legs,
    defaultCatchUpBatches: Object.fromEntries(Object.entries(current.defaultCatchUpBatches ?? {})
      .filter(([legId]) => !prefixLegs.has(legId))),
    itemRequirements: mergeCampaignItemRequirements([prefix.plan.itemRequirements, current.itemRequirements]),
    sharedSourceQuestIds: [...new Set([...(current.sharedSourceQuestIds ?? []), ...(prefix.plan.sharedSourceQuestIds ?? []),
      ...approved.flatMap((action) => action.questChanges.map((change) => change.questId))])],
  };
  assertCampaignRouteLock(result, context);
  return result;
}
