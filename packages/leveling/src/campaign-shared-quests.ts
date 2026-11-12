import type { CampaignAction, CampaignPlan, CampaignQuestChange } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";

const personalAccessRequirements = new Set([
  "requiredSkill",
  "requiredSpell",
  "requiredSpecialization",
  "requiredRanks",
]);

function describe(change: CampaignQuestChange): string {
  const verb =
    change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete";
  return `${verb} ${change.title}${change.objectiveIndex === null ? "" : ` (objective ${change.objectiveIndex})`}`;
}

/** Keep an ordinary quest lifecycle that every member of the Human party can take. */
export function selectSharedCampaignQuests(
  plan: CampaignPlan,
  catalog: QuestCatalog,
): CampaignPlan {
  if (plan.race !== "human")
    throw new Error("Shared ordinary-quest preparation currently requires a Human starting route.");
  if (catalog.targetBuild !== plan.targetBuild)
    throw new Error("Shared quest catalog belongs to a different build.");
  if (catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256)
    throw new Error("Shared quest catalog belongs to a different source archive.");
  const eligible = new Set(
    catalog.quests
      .filter(
        (quest) =>
          quest.requiredClasses === 0 &&
          (quest.requiredRaces === 0 || (BigInt(quest.requiredRaces) & 1n) !== 0n) &&
          !quest.unsupportedRequirements.some((requirement) =>
            personalAccessRequirements.has(requirement),
          ),
      )
      .map((quest) => quest.questId),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const quest of catalog.quests) {
      if (!eligible.has(quest.questId)) continue;
      if (
        quest.prerequisites.allOf.some((id) => !eligible.has(id)) ||
        (quest.prerequisites.anyOf.length > 0 &&
          quest.prerequisites.anyOf.every((id) => !eligible.has(id)))
      ) {
        eligible.delete(quest.questId);
        changed = true;
      }
    }
  }
  const selected = new Set(
    plan.actions.flatMap((action) => [
      ...action.questChanges.map((change) => change.questId),
      ...(action.itemCollections?.map((item) => item.questId) ?? []),
    ]),
  );
  const excluded = new Set([...selected].filter((id) => !eligible.has(id)));
  const actions = plan.actions.flatMap((action): CampaignAction[] => {
    const questChanges = action.questChanges.filter((change) => eligible.has(change.questId));
    const itemCollections = action.itemCollections?.filter((item) => eligible.has(item.questId));
    if (action.questChanges.length > 0 && questChanges.length === 0 && !itemCollections?.length)
      return [];
    if (action.itemCollections?.length && !itemCollections?.length && !questChanges.length)
      return [];
    if (action.pickupQuestId !== undefined && !eligible.has(action.pickupQuestId)) return [];
    if (
      action.optionalForQuestIds?.length &&
      action.optionalForQuestIds.every((id) => !eligible.has(id)) &&
      !questChanges.length &&
      !itemCollections?.length
    )
      return [];
    const mixed = questChanges.length !== action.questChanges.length;
    return [
      {
        ...action,
        leaderOnly: false,
        questChanges,
        ...(mixed
          ? {
              title: questChanges.map(describe).join(" · "),
              instructions: questChanges.map(describe),
            }
          : {}),
        ...(itemCollections ? { itemCollections } : {}),
        ...(action.auctionSupplies
          ? { auctionSupplies: action.auctionSupplies.filter((item) => eligible.has(item.questId)) }
          : {}),
        ...(action.optionalForQuestIds
          ? { optionalForQuestIds: action.optionalForQuestIds.filter((id) => eligible.has(id)) }
          : {}),
      },
    ];
  });
  const actionIds = new Set(actions.map((action) => action.id));
  const retainedIds = new Set(
    actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  return {
    ...plan,
    release: plan.release.endsWith("-shared") ? plan.release : `${plan.release}-shared`,
    dungeonCollectionPolicy: "selected-clear",
    sharedQuestsOnly: true,
    acquisitionXpPolicy: "exclude-unpriced-extra",
    sharedSourceQuestIds: catalog.quests
      .filter((quest) => quest.requiredClasses === 0)
      .map((quest) => quest.questId),
    sharedQuestExclusions: [...new Set([...(plan.sharedQuestExclusions ?? []), ...excluded])].sort(
      (left, right) => left - right,
    ),
    actions,
    starters: { entries: [], routes: [] },
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: leg.questIds.filter((id) => retainedIds.has(id)),
      unresolvedQuestIds: leg.unresolvedQuestIds.filter((id) => eligible.has(id)),
    })),
    ...(plan.itemRequirements
      ? { itemRequirements: plan.itemRequirements.filter((item) => eligible.has(item.questId)) }
      : {}),
    ...(plan.catchUpBatches
      ? { catchUpBatches: plan.catchUpBatches.filter((batch) => eligible.has(batch.questId)) }
      : {}),
    ...(plan.bookmarkAliases
      ? {
          bookmarkAliases: Object.fromEntries(
            Object.entries(plan.bookmarkAliases).flatMap(
              ([alias, originalTarget]): [string, string][] => {
                let target = originalTarget;
                const visited = new Set([alias]);
                while (
                  !actionIds.has(target) &&
                  plan.bookmarkAliases?.[target] &&
                  !visited.has(target)
                ) {
                  visited.add(target);
                  target = plan.bookmarkAliases[target]!;
                }
                return actionIds.has(target) ? [[alias, target]] : [];
              },
            ),
          ),
        }
      : {}),
    ...(plan.combat
      ? {
          combat: {
            ...plan.combat,
            activities: plan.combat.activities
              .filter((activity) => actionIds.has(activity.actionId))
              .map((activity) => ({
                ...activity,
                objectives: activity.objectives.filter((objective) =>
                  eligible.has(objective.questId),
                ),
              })),
            ...(plan.combat.materialWork
              ? {
                  materialWork: plan.combat.materialWork
                    .filter((work) => actionIds.has(work.actionId))
                    .map((work) => ({
                      ...work,
                      targets: work.targets.filter((target) =>
                        eligible.has(target.objective.questId),
                      ),
                    })),
                }
              : {}),
          },
        }
      : {}),
    ...(plan.library
      ? {
          library: {
            ...plan.library,
            choices: plan.library.choices.map((choice) =>
              eligible.has(choice.questId)
                ? choice
                : {
                    ...choice,
                    role: "held",
                    reason:
                      "This quest is not available to every member of the ordinary-quest party.",
                  },
            ),
          },
        }
      : {}),
    ...(plan.partyPolicy
      ? {
          partyPolicy: {
            ...plan.partyPolicy,
            decisions: plan.partyPolicy.decisions.map((decision) =>
              eligible.has(decision.questId)
                ? decision
                : {
                    ...decision,
                    included: false,
                    requiredFor: [],
                    reason:
                      "This quest is not available to every member of the ordinary-quest party.",
                  },
            ),
          },
        }
      : {}),
  };
}
