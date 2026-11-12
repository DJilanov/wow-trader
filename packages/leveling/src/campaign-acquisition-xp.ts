import type { CampaignPlan } from "./campaign.js";
import type { CombatNpc, CombatObjective } from "./combat-model.js";
import { resolveCombatQuota } from "./combat-loot.js";
import { lootQuantityModel, type LootScenario } from "./quest-loot.js";
import { dungeonCollectionXpOmission } from "./campaign-dungeon-collections.js";

export type AcquisitionXpPolicy = "strict" | "exclude-unpriced-extra";

export interface ExcludedAcquisitionXp {
  readonly questId: number;
  readonly objectiveIndex: number;
  readonly itemId: number;
  readonly quantityPerPlayer: number;
  readonly npcId: number;
  readonly npcIds?: readonly number[];
  readonly planningBasis?: "selected-dungeon-clear" | "selected-dungeon-prerequisite";
  readonly sourceUrl: string;
  readonly reason: string;
}

export interface AcquisitionXpBaseline {
  readonly plan: CampaignPlan;
  readonly exclusions: ReadonlyMap<string, readonly ExcludedAcquisitionXp[]>;
  readonly excludedCollectionItems: ReadonlySet<string>;
  readonly unpricedPayoutCandidates: ReadonlyMap<string, readonly UnpricedLootPayoutCandidate[]>;
}

export interface UnpricedLootPayoutCandidate {
  readonly questId: number;
  readonly objectiveIndex: number;
  readonly itemId: number;
  readonly quantityPerPlayer: number;
  readonly npcId: number;
}

/** A resolved collection workload may omit its extra XP; other required combat must stay priced. */
export function canExcludeUnpricedLootPayout(input: {
  readonly npc: CombatNpc;
  readonly objectives: readonly CombatObjective[];
  readonly candidates: readonly UnpricedLootPayoutCandidate[];
}): boolean {
  const { npc, objectives, candidates } = input;
  if (
    npc.xpEligibility !== "assumed" ||
    npc.minimumLevel === null ||
    npc.maximumLevel === null ||
    npc.rank === null ||
    !objectives.length
  )
    return false;
  return objectives.every((objective) => {
    const loot = objective.loot;
    if (
      objective.credit !== "personal-loot" ||
      objective.quotaConflict ||
      !loot ||
      objective.npcIds.length !== 1 ||
      objective.npcIds[0] !== npc.id
    )
      return false;
    return candidates.some(
      (candidate) =>
        candidate.questId === objective.questId &&
        candidate.objectiveIndex === objective.objectiveIndex &&
        candidate.npcId === npc.id &&
        candidate.itemId === loot.itemId &&
        candidate.quantityPerPlayer === loot.quantity,
    );
  });
}

/** Project counted XP only. Physical actions, inventory requirements and raw evidence stay intact. */
export function campaignAcquisitionXpBaseline(
  plan: CampaignPlan,
  policy: AcquisitionXpPolicy = plan.acquisitionXpPolicy ?? "strict",
  scenario: LootScenario = "expected",
): AcquisitionXpBaseline {
  const exclusions = new Map<string, ExcludedAcquisitionXp[]>();
  const excludedCollectionItems = new Set<string>();
  const unpricedPayoutCandidates = new Map<string, UnpricedLootPayoutCandidate[]>();
  const combat = plan.combat;
  if (
    policy !== "exclude-unpriced-extra" ||
    !plan.sharedQuestsOnly ||
    !combat ||
    combat.targetBuild !== plan.targetBuild
  )
    return { plan, exclusions, excludedCollectionItems, unpricedPayoutCandidates };
  const actions = new Map(plan.actions.map((action) => [action.id, action]));
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const profiledPaths = new Set(
    combat.activities.flatMap((activity) =>
      activity.profile && activity.pathId ? [activity.pathId] : [],
    ),
  );
  const activities = combat.activities
    .map((activity) => {
      const action = actions.get(activity.actionId);
      if (!action || action.leaderOnly) return activity;
      const objectives = activity.objectives.filter((objective: CombatObjective): boolean => {
        const dungeon = dungeonCollectionXpOmission(plan, action, activity.environment, objective);
        if (dungeon) {
          exclusions.set(action.id, [...(exclusions.get(action.id) ?? []), dungeon]);
          return false;
        }
        const loot = objective.loot;
        if (
          objective.credit !== "personal-loot" ||
          objective.quotaConflict ||
          !loot ||
          loot.quantity === null ||
          !Number.isSafeInteger(loot.quantity) ||
          loot.quantity < 1 ||
          objective.npcIds.length !== 1 ||
          !action.questChanges.some(
            (change) =>
              change.state === "objectives-complete" &&
              change.questId === objective.questId &&
              (action.wholeQuestObjectives ||
                (change.objectiveIndex ?? 1) === objective.objectiveIndex),
          ) ||
          !plan.itemRequirements?.some(
            (item) =>
              item.questId === objective.questId &&
              item.objectiveIndex === objective.objectiveIndex &&
              item.itemId === loot.itemId &&
              item.quantity === loot.quantity,
          )
        )
          return true;
        const npc = npcs.get(objective.npcIds[0]!);
        // An omission needs the source identity, not invented stats for its unpriced payout.
        if (!npc || npc.xpEligibility !== "assumed") return true;
        const captures =
          combat.lootDrops?.filter(
            (drop) => drop.itemId === loot.itemId && drop.npcId === npc.id,
          ) ?? [];
        const drop = captures[0];
        if (
          captures.length !== 1 ||
          !drop ||
          drop.targetBuild !== plan.targetBuild ||
          (drop.sourceBuild != null && drop.sourceBuild !== plan.targetBuild) ||
          drop.probability <= 0
        )
          return true;
        const singleItem = drop.quantityDistribution
          ? drop.quantityDistribution.every((entry) => entry.percent === 0 || entry.quantity === 1)
          : drop.minimumQuantity === 1 && drop.maximumQuantity === 1;
        const unpricedQuantity =
          lootQuantityModel(drop) === "unknown" ||
          (drop.probabilityBasis === "sample-ratio" && !singleItem);
        const quota = resolveCombatQuota(objective, combat, 5, scenario);
        if (
          quota.kills !== null &&
          loot.sharing !== "unknown" &&
          npc.minimumLevel !== null &&
          npc.maximumLevel !== null &&
          npc.rank !== null &&
          !action.raidOnly &&
          !activity.profile &&
          (!activity.pathId || !profiledPaths.has(activity.pathId))
        )
          unpricedPayoutCandidates.set(action.id, [
            ...(unpricedPayoutCandidates.get(action.id) ?? []),
            {
              questId: objective.questId,
              objectiveIndex: objective.objectiveIndex,
              itemId: loot.itemId,
              quantityPerPlayer: loot.quantity,
              npcId: npc.id,
            },
          ]);
        if (!unpricedQuantity && loot.sharing !== "unknown") return true;
        if (quota.kills !== null) return true;
        const rows = exclusions.get(action.id) ?? [];
        rows.push({
          questId: objective.questId,
          objectiveIndex: objective.objectiveIndex,
          itemId: loot.itemId,
          quantityPerPlayer: loot.quantity,
          npcId: npc.id,
          sourceUrl: drop.sourceUrl,
          reason: quota.reason ?? "The additional acquisition workload is unpriced.",
        });
        exclusions.set(action.id, rows);
        return false;
      });
      return objectives.length === activity.objectives.length
        ? activity
        : { ...activity, objectives };
    })
    .filter((activity) => activity.objectives.length > 0 || activity.profile !== null);
  const materialWork = combat.materialWork
    ?.map((work) => {
      const action = actions.get(work.actionId);
      if (!action) return work;
      const targets = work.targets.filter((target) => {
        const omitted = dungeonCollectionXpOmission(
          plan,
          action,
          work.environment ?? "outdoor",
          target.objective,
        );
        if (!omitted) return true;
        exclusions.set(action.id, [...(exclusions.get(action.id) ?? []), omitted]);
        excludedCollectionItems.add(`${omitted.questId}:${omitted.itemId}`);
        return false;
      });
      return targets.length === work.targets.length ? work : { ...work, targets };
    })
    .filter((work) => work.targets.length > 0);
  return exclusions.size
    ? {
        plan: {
          ...plan,
          combat: { ...combat, activities, ...(materialWork ? { materialWork } : {}) },
        },
        exclusions,
        excludedCollectionItems,
        unpricedPayoutCandidates,
      }
    : { plan, exclusions, excludedCollectionItems, unpricedPayoutCandidates };
}
