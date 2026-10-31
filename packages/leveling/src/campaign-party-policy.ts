import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { buildCampaignQuestLibrary, type LibraryObjective } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { partyQuestLootCost, type PartyQuestLootCost } from "./party-quest-cost.js";
import { nearbyLibraryQuest } from "./campaign-library-route.js";
import { orderCampaignPrerequisites } from "./campaign-prerequisite-order.js";
import { CAMPAIGN_BRIDGES, CAMPAIGN_DEFERRED_PARTY_QUESTS } from "./campaign-route.js";
import { PREMADE_STOPS, getPremadeQuest } from "./premade.js";
import { gateQuestIds } from "./dungeon-model.js";

export interface CampaignPartyQuestDecision {
  readonly questId: number;
  readonly objective: LibraryObjective;
  readonly included: boolean;
  readonly reason: string;
  readonly requiredFor: readonly number[];
  readonly lootCost: PartyQuestLootCost | null;
}

export interface CampaignPartyPolicy {
  readonly revision: "five-player-kill-first-20261031-v1";
  readonly partySize: 5;
  readonly decisions: readonly CampaignPartyQuestDecision[];
  readonly unresolvedPrerequisiteIds: readonly number[];
}

function changeDescription(change: CampaignAction["questChanges"][number]): string {
  const verb =
    change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete";
  return `${verb} ${change.title}${change.objectiveIndex === null ? "" : ` (objective ${change.objectiveIndex})`}`;
}

export function applyCampaignPartyQuestPolicy(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data?: CombatDataset,
): CampaignPlan {
  if (!sources.length) return plan;
  if (data && data.targetBuild !== plan.targetBuild)
    throw new Error("Party quest references use a different build.");
  const selectedVisits = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const tags = DUNGEON_VISITS.flatMap((visit) =>
    selectedVisits.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  const library = buildCampaignQuestLibrary(
    sources,
    createCampaignSourceProfile(plan.race, plan.leaderClass),
    tags,
    new Set(),
    data?.quests,
  );
  const byId = new Map<
    number,
    {
      readonly objective: LibraryObjective;
      readonly prerequisiteIds: readonly number[];
      readonly referenceLevel?: number;
    }
  >(library.map((quest) => [quest.questId, quest]));
  const references = new Map(data?.quests.map((quest) => [quest.questId, quest]));
  const present = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  for (const id of present) {
    if (byId.has(id)) continue;
    const reference = references.get(id);
    if (!reference) continue;
    const alternatives = reference.prerequisites?.anyOf ?? [];
    const alternative = alternatives.find((parent) => present.has(parent)) ?? alternatives[0];
    byId.set(id, {
      objective: reference.onlyCreatureObjectives
        ? "shared-kills"
        : reference.itemObjectives?.some((item) => !item.provided) ||
            reference.itemCreatureIds.length > 0
          ? "collection"
          : reference.onlyInteractionObjectives || reference.itemObjectives?.length
            ? "interaction"
            : "delivery",
      prerequisiteIds: reference.prerequisites
        ? [...reference.prerequisites.allOf, ...(alternative === undefined ? [] : [alternative])]
        : (plan.actions.find((action) =>
            action.questChanges.some(
              (change) => change.questId === id && change.state === "accepted",
            ),
          )?.requiredQuestIds ?? []),
    });
  }
  const protectedRoots = new Set<number>();
  const requiredRoots = new Set<number>();
  const dungeonQuestIds = new Set(
    PREMADE_STOPS.flatMap((stop) =>
      stop.quests.filter((quest) => quest.role === "core").map((quest) => quest.questId),
    ),
  );
  const personalStarterIds = new Set<number>();
  const starterLegs = new Set(
    plan.legs.filter((leg) => leg.kind === "starter" && leg.to <= 11).map((leg) => leg.id),
  );
  for (const action of plan.actions) {
    for (const change of action.questChanges) {
      if (
        action.leaderOnly &&
        starterLegs.has(action.legId) &&
        (byId.get(change.questId)?.referenceLevel ?? Infinity) <= 10
      ) {
        personalStarterIds.add(change.questId);
        protectedRoots.add(change.questId);
      }
      if (dungeonQuestIds.has(change.questId) && !CAMPAIGN_DEFERRED_PARTY_QUESTS[change.questId]) {
        protectedRoots.add(change.questId);
        requiredRoots.add(change.questId);
      }
    }
    if (action.raidOnly)
      for (const change of action.questChanges) protectedRoots.add(change.questId);
    for (const id of action.requiredQuestIds ?? [])
      if (action.kind === "checkpoint") {
        protectedRoots.add(id);
        requiredRoots.add(id);
      }
  }
  for (const block of CAMPAIGN_BRIDGES)
    if (block.purpose === "preparation" && block.quests !== "starter-source")
      for (const id of block.quests) if (present.has(id)) protectedRoots.add(id);
  // These selected chains unlock reusable dungeon shortcuts rather than optional XP farms.
  for (const id of [7046, 3802]) if (present.has(id)) protectedRoots.add(id);
  for (const id of present)
    if ((references.get(id)?.requiredClasses ?? 0) > 0) protectedRoots.add(id);
  if (plan.leaderClass) {
    const classCondition = new RegExp(`(?:^|[\\s(/])${plan.leaderClass}(?=[\\s)/]|$)`, "i");
    for (const source of sources)
      for (const step of source.guide.steps)
        for (const directive of step.directives)
          if (
            directive.questId !== null &&
            present.has(directive.questId) &&
            references.get(directive.questId)?.requiredClasses === undefined &&
            [step.condition, directive.condition].some((condition) =>
              classCondition.test(condition),
            )
          )
            protectedRoots.add(directive.questId);
  }
  const requiredFor = new Map<number, Set<number>>();
  const protectionParents = (id: number): readonly number[] => [
    ...(byId.get(id)?.prerequisiteIds ?? []),
    ...gateQuestIds(getPremadeQuest(id)?.gate ?? { kind: "all", gates: [] }),
  ];
  const hasMissingPrerequisite = (id: number, visited: Set<number>): boolean => {
    if (visited.has(id)) return false;
    visited.add(id);
    return protectionParents(id).some(
      (parent) => !present.has(parent) || hasMissingPrerequisite(parent, visited),
    );
  };
  const protect = (questId: number, root: number, visited: Set<number>): void => {
    if (visited.has(questId)) return;
    visited.add(questId);
    const roots = requiredFor.get(questId) ?? new Set<number>();
    roots.add(root);
    requiredFor.set(questId, roots);
    for (const parent of protectionParents(questId)) protect(parent, root, visited);
  };
  for (const root of protectedRoots)
    if (requiredRoots.has(root) || !hasMissingPrerequisite(root, new Set()))
      protect(root, root, new Set());
  const nonCombatFor = new Map<number, Set<number>>();
  const visitKillPrerequisites = (id: number, root: number, visited: Set<number>): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const quest = byId.get(id);
    if (!quest) return;
    if (quest.objective === "delivery" || quest.objective === "interaction") {
      const roots = nonCombatFor.get(id) ?? new Set<number>();
      roots.add(root);
      nonCombatFor.set(id, roots);
    }
    for (const parent of quest.prerequisiteIds) visitKillPrerequisites(parent, root, visited);
  };
  for (const id of present)
    if (byId.get(id)?.objective === "shared-kills")
      for (const parent of byId.get(id)?.prerequisiteIds ?? [])
        visitKillPrerequisites(parent, id, new Set());
  const killActions = plan.actions.filter((action) =>
    action.questChanges.some(
      (change) =>
        change.state === "objectives-complete" &&
        byId.get(change.questId)?.objective === "shared-kills",
    ),
  );
  const nearby = new Set(
    library
      .filter(
        (quest) =>
          ["delivery", "interaction"].includes(quest.objective) &&
          nearbyLibraryQuest(quest, killActions),
      )
      .map((quest) => quest.questId),
  );
  const decisions = new Map<number, CampaignPartyQuestDecision>(
    plan.partyPolicy?.decisions.map((decision) => [decision.questId, decision]),
  );
  for (const id of present) {
    const quest = byId.get(id);
    const deferred = CAMPAIGN_DEFERRED_PARTY_QUESTS[id];
    if (!quest && !deferred) continue;
    const objective = quest?.objective ?? "unclassified";
    const required = [...(requiredFor.get(id) ?? [])];
    const collection = objective === "collection" || objective === "named-trophy";
    const lootCost = collection ? partyQuestLootCost(id, plan, data) : null;
    const included =
      !deferred &&
      (required.length > 0 ||
        objective === "shared-kills" ||
        nonCombatFor.has(id) ||
        nearby.has(id) ||
        lootCost?.eligible === true);
    decisions.set(id, {
      questId: id,
      objective,
      included,
      requiredFor: required,
      lootCost,
      reason:
        deferred ??
        (personalStarterIds.has(id)
          ? "Personal starter work before the shared party route; retain its training and early XP flow."
          : required.length
            ? "Retained for a selected dungeon, preparation chain or class unlock."
            : collection
              ? lootCost!.reason
              : included
                ? "Shared kill credit or a non-farming route task."
                : "Objective or party acquisition needs review; it is not default XP work."),
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const decision of decisions.values()) {
      if (!decision.included || decision.requiredFor.length) continue;
      const blockedParent = byId
        .get(decision.questId)
        ?.prerequisiteIds.find((id) => !present.has(id) || decisions.get(id)?.included === false);
      const unsupportedCourier =
        (decision.objective === "delivery" || decision.objective === "interaction") &&
        !nearby.has(decision.questId) &&
        ![...(nonCombatFor.get(decision.questId) ?? [])].some(
          (root) => decisions.get(root)?.included,
        );
      if (blockedParent === undefined && !unsupportedCourier) continue;
      decisions.set(decision.questId, {
        ...decision,
        included: false,
        reason:
          blockedParent !== undefined
            ? `Its prerequisite ${blockedParent} does not meet the five-player route policy.`
            : "This courier trip does not support an included kill batch or a nearby route task.",
      });
      changed = true;
    }
  }
  const excluded = new Set(
    [...decisions.values()]
      .filter((decision) => !decision.included)
      .map((decision) => decision.questId),
  );
  const selectedActions: CampaignAction[] = plan.actions.flatMap((action) => {
    const questChanges = action.questChanges.filter((change) => !excluded.has(change.questId));
    if (action.questChanges.length && !questChanges.length) return [];
    const accepted = questChanges.filter((change) => change.state === "accepted");
    const requiredQuestIds = accepted.length
      ? [
          ...new Set(
            accepted.flatMap((change) => {
              const acceptance = questChanges.indexOf(change);
              return (
                byId.get(change.questId)?.prerequisiteIds ??
                action.requiredQuestIds ??
                []
              ).filter(
                (id) =>
                  !questChanges
                    .slice(0, acceptance)
                    .some((earlier) => earlier.questId === id && earlier.state === "rewarded"),
              );
            }),
          ),
        ]
      : action.requiredQuestIds;
    if (questChanges.length === action.questChanges.length)
      return [{ ...action, ...(requiredQuestIds ? { requiredQuestIds } : {}) }];
    const descriptions = questChanges.map(changeDescription);
    return [
      {
        ...action,
        title: descriptions.join(" · "),
        instructions: descriptions,
        questChanges,
        ...(requiredQuestIds ? { requiredQuestIds } : {}),
      },
    ];
  });
  const actions = orderCampaignPrerequisites(selectedActions, plan.legs);
  const actionIds = new Set(actions.map((action) => action.id));
  const retainedQuests = new Set(
    actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  return {
    ...plan,
    executionRevision: "workflow-20261031-v7",
    actions,
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
      unresolvedQuestIds: leg.unresolvedQuestIds.filter((id) => !excluded.has(id)),
    })),
    ...(plan.combat
      ? {
          combat: {
            ...plan.combat,
            activities: plan.combat.activities
              .filter((activity) => actionIds.has(activity.actionId))
              .map((activity) => ({
                ...activity,
                objectives: activity.objectives.filter(
                  (objective) => !excluded.has(objective.questId),
                ),
              })),
          },
        }
      : {}),
    ...(plan.library
      ? {
          library: {
            ...plan.library,
            choices: plan.library.choices.map((choice) =>
              excluded.has(choice.questId)
                ? { ...choice, role: "held", reason: decisions.get(choice.questId)!.reason }
                : choice,
            ),
          },
        }
      : {}),
    partyPolicy: {
      revision: "five-player-kill-first-20261031-v1",
      partySize: 5,
      decisions: [...decisions.values()],
      unresolvedPrerequisiteIds: [
        ...new Set(
          [...decisions.values()]
            .filter((decision) => decision.included)
            .flatMap((decision) =>
              (byId.get(decision.questId)?.prerequisiteIds ?? []).filter(
                (id) => !retainedQuests.has(id),
              ),
            ),
        ),
      ],
    },
  };
}
