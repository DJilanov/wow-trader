import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import type { CampaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignZoneId, campaignZoneInText } from "./campaign-geography.js";
import type { CampaignStarterVisitRule } from "./campaign-starter-visit-rules.js";
import { starterWestfallActions } from "./campaign-starter-westfall.js";

const replaceablePickupTags = new Set([
  ".goto",
  ".waypoint",
  ".line",
  ".accept",
  ".target",
  ".unitscan",
]);

function replacementPickup(
  action: CampaignAction,
  rule: CampaignStarterVisitRule,
  catalog: QuestCatalog,
  native: CampaignNativeInstructions,
): CampaignAction | null {
  const replacement = rule.replacementPickup!;
  const quest = catalog.quests.find((entry) => entry.questId === replacement.questId);
  const giver = quest?.starts.find(
    (entry) => entry.npcId === replacement.npcId && entry.friendlyToAlliance,
  );
  const positions = giver?.positions.filter((point) => point.zone === rule.arrivalZone) ?? [];
  const lowered = native(action);
  if (
    !giver ||
    (replacement.requirePosition && positions.length !== 1) ||
    action.source?.conditions ||
    action.itemCollections?.length ||
    action.questChanges.length !== 1 ||
    !lowered ||
    lowered.directives.some((directive) => !replaceablePickupTags.has(directive.tag))
  )
    return null;
  return {
    ...action,
    source: null,
    positions: positions.map((position) => ({
      sourceLine: 0,
      position: { ...position, floor: null, space: "map-percent" },
    })),
    instructions: replacement.instructions,
    location: { zone: rule.arrivalZone, visitOverride: true },
  };
}

export function proposeCampaignStarterVisit(
  plan: CampaignPlan,
  rule: CampaignStarterVisitRule,
  catalog: QuestCatalog,
  native: CampaignNativeInstructions,
): CampaignPlan | null {
  const questIds = new Set(rule.questIds);
  const primary = plan.actions.filter(
    (action) =>
      action.questChanges.some((change) => questIds.has(change.questId)) ||
      (action.pickupQuestId !== undefined && questIds.has(action.pickupQuestId)),
  );
  if (primary.some((action) => action.questChanges.some((change) => !questIds.has(change.questId))))
    return null;
  const westfall = rule.consolidateWestfall ? starterWestfallActions(plan, primary, native) : null;
  if (rule.consolidateWestfall && !westfall) return null;
  const selected = westfall?.actions ?? primary;
  const destination = plan.actions.findIndex((action) => action.id === rule.afterActionId);
  const anchor = plan.actions[destination];
  if (
    !anchor ||
    !selected.length ||
    plan.legs.find((leg) => leg.id === anchor.legId)?.kind !== "starter" ||
    selected.some(
      (action) =>
        !action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        plan.legs.find((leg) => leg.id === action.legId)?.kind !== "starter" ||
        plan.actions.indexOf(action) >= destination,
    )
  )
    return null;
  const transit = native(anchor)?.directives.find((directive) =>
    [".fly", ".hs", ".zone"].includes(directive.tag),
  );
  const arrival =
    anchor.movement?.destination ??
    (transit
      ? (campaignZoneId(transit.arguments.split(",")[0]!) ?? campaignZoneInText(transit.text))
      : anchor.location?.zone);
  if (arrival !== rule.arrivalZone) return null;
  for (const questId of questIds) {
    const changes = selected.flatMap((action) =>
      action.questChanges.filter((change) => change.questId === questId),
    );
    if (
      changes.filter((change) => change.state === "accepted").length !== 1 ||
      changes.filter((change) => change.state === "rewarded").length !== 1 ||
      changes[0]?.state !== "accepted" ||
      changes.at(-1)?.state !== "rewarded"
    )
      return null;
  }
  const moved: CampaignAction[] = [];
  for (const action of selected) {
    let entry: CampaignAction = { ...action, legId: anchor.legId };
    if (
      rule.replacementPickup &&
      action.questChanges.some(
        (change) =>
          change.questId === rule.replacementPickup!.questId && change.state === "accepted",
      )
    ) {
      const replacement = replacementPickup(entry, rule, catalog, native);
      if (!replacement) return null;
      entry = replacement;
    }
    if (rule.overrideAccessZone)
      entry = { ...entry, location: { zone: rule.arrivalZone, visitOverride: true } };
    if (rule.consolidateWestfall && entry.libraryQuestId === 12)
      entry = { ...entry, xpTargetLevel: 14, fundingCheckpointId: anchor.id };
    moved.push(entry);
  }
  const ids = new Set(selected.map((action) => action.id));
  const actions = plan.actions.flatMap((action) =>
    ids.has(action.id) || action === westfall?.retired
      ? []
      : action === anchor
        ? [action, ...moved]
        : [action],
  );
  return {
    ...plan,
    actions,
    ...(westfall
      ? { bookmarkAliases: { ...plan.bookmarkAliases, [westfall.retired.id]: anchor.id } }
      : {}),
    ...(plan.combat
      ? {
          combat: {
            ...plan.combat,
            activities: plan.combat.activities.map((activity) =>
              ids.has(activity.actionId) ? { ...activity, pathId: anchor.legId } : activity,
            ),
          },
        }
      : {}),
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === leg.id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    })),
  };
}
