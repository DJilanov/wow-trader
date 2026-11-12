import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignCombatState } from "./campaign-combat.js";
import {
  MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP,
  MAXIMUM_DUNGEON_BOSS_ENEMY_LEVEL_GAP,
} from "./campaign-combat-policy.js";
import { matchesCombatBossIdentity } from "./combat-boss-reference.js";
import { campaignMaterialTargetNeeded } from "./campaign-material-combat.js";
import { campaignSupplyKey } from "./campaign-supply-xp.js";
import { combatObjectiveKey, type CombatNpc, type CombatObjective } from "./combat-model.js";
import type { PremadeMember } from "./premade-model.js";
import { PREMADE_STOPS } from "./premade.js";

export interface CampaignCombatParticipant {
  readonly execute: boolean;
  readonly questStates: PremadeMember["questStates"];
  readonly confirmations: Readonly<Record<string, boolean>>;
  readonly minimumItems: ReadonlyMap<number, number>;
  readonly combat: CampaignCombatState;
}

export interface CampaignCombatRequirement {
  readonly targetLevel: number | null;
  readonly nonBossNpcs: readonly CombatNpc[];
  readonly unknownNpcIds: readonly number[];
}

function objectiveNeeded(
  action: CampaignAction,
  objective: CombatObjective,
  member: CampaignCombatParticipant,
): boolean {
  if (!member.execute || (objective.credit === "non-combat" && !objective.combatAccess)) return false;
  if (objective.combatAccess && "itemId" in objective.combatAccess &&
    (member.minimumItems.get(objective.combatAccess.itemId) ?? 0) >= objective.combatAccess.quantity)
    return false;
  const state = member.questStates[String(objective.questId)];
  if (
    state === "rewarded" ||
    state === "objectives-complete" ||
    member.confirmations[`campaign-objective-${objective.questId}-${objective.objectiveIndex}`]
  )
    return false;
  if (
    state !== "accepted" &&
    !action.questChanges.some(
      (change) => change.questId === objective.questId && change.state === "accepted",
    )
  )
    return false;
  const counted = member.combat.counters.get(combatObjectiveKey(objective));
  return !(
    objective.credit === "shared-kills" &&
    objective.requiredKills !== null &&
    counted !== null &&
    counted !== undefined &&
    counted >= objective.requiredKills
  );
}

/** Index once, then check pending combat against the bars before its first kill. */
export function createCampaignCombatReadiness(
  plan: CampaignPlan,
): (
  action: CampaignAction,
  participants?: readonly CampaignCombatParticipant[],
  excludedSupplyItems?: ReadonlySet<string>,
) => CampaignCombatRequirement {
  const npcs = new Map(plan.combat?.npcs.map((npc) => [npc.id, npc]) ?? []);
  const bosses = new Map(plan.combat?.bossReferences?.map((boss) => [boss.npcId, boss]) ?? []);
  const legs = new Map(plan.legs.map((leg) => [leg.id, leg]));
  const stopVisits = new Map(PREMADE_STOPS.map((stop) => [stop.id as string, stop.visitIds]));
  const activities = new Map<string, NonNullable<CampaignPlan["combat"]>["activities"]>();
  for (const activity of plan.combat?.activities ?? [])
    activities.set(activity.actionId, [...(activities.get(activity.actionId) ?? []), activity]);
  const materials = new Map(plan.combat?.materialWork?.map((work) => [work.actionId, work]) ?? []);
  return (action, participants, excludedSupplyItems): CampaignCombatRequirement => {
    const required = new Map<number, CombatNpc>();
    const bossLevels: number[] = [];
    const unknown = new Set<number>();
    const leg = legs.get(action.legId);
    const context =
      action.location?.insideDungeon ??
      leg?.dungeonVisitId ??
      (leg?.kind === "dungeon" ? leg.stopId : null);
    const visits = context ? (stopVisits.get(context) ?? [context]) : [];
    const include = (npcId: number, environment: "outdoor" | "dungeon"): void => {
      const npc = npcs.get(npcId);
      if (!npc) {
        unknown.add(npcId);
        return;
      }
      const boss = bosses.get(npcId);
      if (
        environment === "dungeon" &&
        visits.length > 0 &&
        matchesCombatBossIdentity(npc, boss, plan.targetBuild) &&
        boss.dungeonVisitIds.some((visit) => visits.includes(visit))
      ) {
        if (npc.maximumLevel === null) unknown.add(npcId);
        else bossLevels.push(npc.maximumLevel - MAXIMUM_DUNGEON_BOSS_ENEMY_LEVEL_GAP);
        return;
      }
      if (npc.maximumLevel === null) unknown.add(npcId);
      required.set(npcId, npc);
    };
    for (const activity of activities.get(action.id) ?? []) {
      for (const objective of activity.objectives)
        if (
          (objective.credit !== "non-combat" || Boolean(objective.combatAccess)) &&
          (!participants ||
            participants.some((member) => objectiveNeeded(action, objective, member)))
        )
          for (const npcId of [...objective.npcIds, ...(objective.combatAccess?.npcIds ?? [])])
            include(npcId, activity.environment);
      for (const pack of activity.profile?.packs ?? [])
        if (
          pack.kills > 0 &&
          (!participants ||
            participants.some(
              (member) =>
                member.execute &&
                (!activity.pathId ||
                  (member.combat.pathKills.get(`${activity.pathId}:${pack.npcId}`) ?? 0) <
                    pack.kills),
            ))
        )
          include(pack.npcId, activity.environment);
    }
    for (const target of materials.get(action.id)?.targets ?? []) {
      const collection = action.itemCollections?.find(
        (item) => item.confirmationKey === target.confirmationKey,
      );
      if (
        !collection ||
        excludedSupplyItems?.has(campaignSupplyKey(collection.questId, collection.itemId)) ||
        (participants &&
          !participants.some(
            (member) =>
              member.execute &&
              campaignMaterialTargetNeeded(
                collection,
                member.questStates,
                member.confirmations,
                member.minimumItems,
              ),
          ))
      )
        continue;
      for (const npcId of target.possibleDropNpcIds)
        include(npcId, materials.get(action.id)?.environment ?? "outdoor");
    }
    const levels = [
      ...bossLevels,
      ...[...required.values()].flatMap((npc) =>
        npc.maximumLevel === null ? [] : [npc.maximumLevel - MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP],
      ),
    ];
    return {
      targetLevel: levels.length ? Math.max(1, ...levels) : null,
      nonBossNpcs: [...required.values()],
      unknownNpcIds: [...unknown],
    };
  };
}
