import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";

// Authored return to the Stonefield farm, before Princess is needed in eastern Elwynn.
const princessVisit = {
  questId: 88,
  afterQuestId: 86,
  chapterId: "chapter-116-6-11-elwynn-forest",
  sourceVersion: "import-v2-681cabff0e7cdf4e",
  pickupStep: "source-step-0050",
  returnStep: "source-step-0065",
} as const;

/** Accept Princess during the existing farm return, after the independent mine and pie work. */
export function batchSharedStarterPickupVisit(
  plan: CampaignPlan,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !plan.sharedQuestsOnly ||
    plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    return plan;
  const quest = catalog.quests.find((entry) => entry.questId === princessVisit.questId);
  const delivery = catalog.quests.find((entry) => entry.questId === princessVisit.afterQuestId);
  const giver = quest?.starts.find((entry) => entry.npcId === 244);
  const recipient = delivery?.ends.find((entry) => entry.npcId === 246);
  // Both provider identities and the reviewed farm coordinates must still match.
  if (
    !giver?.friendlyToAlliance ||
    !recipient?.friendlyToAlliance ||
    !giver.positions.some(
      (point) => point.zone === "1429" && point.x === 34.66 && point.y === 84.48,
    ) ||
    !recipient?.positions.some(
      (point) => point.zone === "1429" && point.x === 34.49 && point.y === 84.25,
    )
  )
    return plan;
  const matches = (action: CampaignAction, stepId: string): boolean =>
    action.kind === "quests" &&
    !action.leaderOnly &&
    !action.raidOnly &&
    !action.dungeonFinishOnly &&
    action.source?.chapterId === princessVisit.chapterId &&
    action.source.version === princessVisit.sourceVersion &&
    action.source.stepId === stepId;
  const pickups = plan.actions.filter((action) =>
    action.questChanges.some(
      (change) => change.questId === princessVisit.questId && change.state === "accepted",
    ),
  );
  const pickup = pickups[0];
  const anchor = plan.actions.find(
    (action) =>
      matches(action, princessVisit.returnStep) &&
      action.questChanges.some(
        (change) => change.questId === princessVisit.afterQuestId && change.state === "rewarded",
      ),
  );
  if (
    pickups.length !== 1 ||
    !pickup ||
    !anchor ||
    !matches(pickup, princessVisit.pickupStep) ||
    pickup.legId !== anchor.legId ||
    pickup.nativeUtilityTags?.length ||
    pickup.itemCollections?.length ||
    !pickup.questChanges.every((change) => change.state === "accepted")
  )
    return plan;
  const from = plan.actions.indexOf(pickup),
    to = plan.actions.indexOf(anchor);
  if (
    from >= to ||
    plan.actions.slice(from + 1, to + 1).some(
      (action) =>
        action.legId !== pickup.legId ||
        action.requiredQuestIds?.includes(princessVisit.questId) ||
        action.questChanges.some((change) => {
          const dependent = catalog.quests.find((entry) => entry.questId === change.questId);
          return (
            change.questId === princessVisit.questId ||
            dependent?.prerequisites.allOf.includes(princessVisit.questId) ||
            dependent?.prerequisites.anyOf.includes(princessVisit.questId)
          );
        }),
    )
  )
    return plan;
  const retained = pickup.questChanges.filter((change) => change.questId !== princessVisit.questId);
  const deferred: CampaignAction = {
    ...pickup,
    id: retained.length ? `${pickup.id}-deferred-${princessVisit.questId}` : pickup.id,
    title: `Accept ${quest!.title}`,
    instructions: [`Talk to ${giver.name} and accept ${quest!.title} before leaving the farm.`],
    questChanges: pickup.questChanges.filter((change) => change.questId === princessVisit.questId),
    positions: giver.positions.map((position) => ({
      sourceLine: 0,
      position: { ...position, floor: null, space: "map-percent" },
    })),
  };
  const actions = plan.actions.flatMap((action): CampaignAction[] => {
    if (action === anchor) return [action, deferred];
    if (action !== pickup) return [action];
    if (!retained.length) return [];
    return [
      {
        ...pickup,
        questChanges: retained,
        title: retained.map((change) => `Accept ${change.title}`).join(" · "),
        instructions: retained.map((change) => `Accept ${change.title}.`),
      },
    ];
  });
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}
