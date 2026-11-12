import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignMaterialWork, CombatDataset } from "./combat-model.js";
import { combatObjectiveKey } from "./combat-model.js";
import { matchesCombatBossIdentity } from "./combat-boss-reference.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";

interface DungeonStarterWork {
  readonly plan: CampaignPlan;
  readonly work: readonly CampaignMaterialWork[];
  readonly retainedObjectiveKeys: ReadonlySet<string>;
}

function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Acquire a retained quest starter at its journal-defined boss, before accepting its carry quest. */
export function attachDungeonStarterWork(
  plan: CampaignPlan,
  data: CombatDataset,
): DungeonStarterWork {
  const work: CampaignMaterialWork[] = [];
  const retainedObjectiveKeys = new Set<string>();
  if (plan.targetBuild !== data.targetBuild) return { plan, work, retainedObjectiveKeys };
  const quests = new Map(data.quests.map((quest) => [quest.questId, quest]));
  const bosses = new Map(data.bossReferences?.map((boss) => [boss.npcId, boss]) ?? []);
  const before = new Map<string, CampaignAction>();
  const fees = new Map<string, CampaignAction>();
  for (const [at, action] of plan.actions.entries()) {
    const change = action.questChanges[0];
    const context = action.location?.insideDungeon;
    if (
      action.source ||
      action.kind !== "quests" ||
      action.leaderOnly ||
      action.raidOnly ||
      action.questChanges.length !== 1 ||
      change?.state !== "accepted" ||
      !context ||
      action.itemCollections?.length
    )
      continue;
    const reference = quests.get(change.questId),
      quest = campaignDungeonQuest(change.questId);
    const item = reference?.itemObjectives?.[0],
      starter = reference?.startItem;
    const selectedRing =
      plan.dungeonCollectionPolicy === "selected-clear" &&
      context === "gnomeregan" &&
      change.questId === 2945 &&
      starter?.itemId === 9326 &&
      item?.npcIds.length === 1 &&
      item.npcIds[0] === 6212;
    const visit = DUNGEON_VISITS.find((entry) => entry.id === context);
    if (
      !reference ||
      !quest ||
      !visit ||
      !starter ||
      !item ||
      reference.requiredClasses !== 0 ||
      reference.onlyCreatureObjectives ||
      reference.onlyInteractionObjectives ||
      reference.creatureIds.length ||
      reference.killQuotas?.length ||
      reference.killQuotaConflicts?.length ||
      reference.itemObjectives?.length !== 1 ||
      item.itemId !== starter.itemId ||
      item.itemName !== starter.name ||
      item.quantity !== 1 ||
      item.objectiveIndex !== 1 ||
      item.provided ||
      item.groundPickup ||
      item.npcIds.length !== 1 ||
      quest.pickupStage !== "inside" ||
      (quest.objectiveStage !== "before" && !(selectedRing && quest.objectiveStage === "inside")) ||
      action.instructions.length !== 1 ||
      action.instructions[0] !== quest.pickup
    )
      continue;
    const npc = data.npcs.find((entry) => entry.id === item.npcIds[0]),
      boss = bosses.get(item.npcIds[0]!);
    const namedSource = selectedRing
      ? npc?.id === 6212 && npc.name === "Dark Iron Agent" && npc.zoneIds.includes(721)
      : matchesCombatBossIdentity(npc, boss, plan.targetBuild) &&
        boss.dungeonVisitIds.includes(context);
    if (
      !namedSource ||
      !npc ||
      !new RegExp(
        `^Use (?:the )?${literal(starter.name)} dropped by (?:the )?${literal(npc.name)} inside ${literal(visit.name)}[.!]?$`,
        "i",
      ).test(quest.pickup ?? "")
    )
      continue;
    const phases = plan.actions.filter((entry) =>
      entry.questChanges.some((row) => row.questId === change.questId),
    );
    const counterlessRing = selectedRing && phases.length === 2 && phases[1]?.questChanges[0]?.state === "rewarded";
    const carry = counterlessRing ? undefined : phases[1],
      reward = counterlessRing ? phases[1] : phases[2];
    const requirements = plan.itemRequirements?.filter((entry) => entry.questId === change.questId);
    if (
      requirements?.length !== 1 ||
      requirements[0]!.itemId !== item.itemId ||
      requirements[0]!.objectiveIndex !== 1 ||
      requirements[0]!.quantity !== 1 ||
      requirements[0]!.conflict ||
      requirements[0]!.sourceProvided ||
      (!counterlessRing && phases.length !== 3) ||
      phases[0] !== action ||
      !reward ||
      (!counterlessRing && (!carry || carry.source ||
      (selectedRing
        ? carry.location?.insideDungeon !== context
        : Boolean(carry.location?.insideDungeon)) ||
      carry.legId !== action.legId ||
      carry.questChanges.length !== 1 ||
      carry.instructions.length !== 1 ||
      carry.instructions[0] !== quest.objective ||
      carry.questChanges[0]!.state !== "objectives-complete" ||
      (carry.questChanges[0]!.objectiveIndex ?? 1) !== 1)) ||
      reward.source ||
      (selectedRing
        ? reward.location?.insideDungeon !== context
        : Boolean(reward.location?.insideDungeon)) ||
      reward.legId !== action.legId ||
      reward.questChanges.length !== 1 ||
      reward.instructions.length !== 1 ||
      reward.instructions[0] !== quest.turnin ||
      reward.questChanges[0]?.state !== "rewarded" ||
      plan.actions
        .slice(at + 1, plan.actions.indexOf(carry ?? reward))
        .some((entry) =>
          entry.questChanges.some(
            (row) =>
              row.state === "rewarded" &&
              plan.itemRequirements?.some(
                (requirement) =>
                  requirement.questId === row.questId && requirement.itemId === item.itemId,
              ),
          ),
        )
    )
      continue;
    const id = `${action.id}-starter`;
    const target = {
      questId: change.questId,
      itemId: item.itemId,
      quantity: 1,
      objectiveBitmask: 1,
      confirmationKey: `campaign-item-${id}-${item.itemId}`,
    };
    const stock: CampaignAction = {
      ...action,
      id,
      title: `Obtain ${starter.name}`,
      kind: "instructions",
      instructions: [
        selectedRing
          ? `Before using the ring, make sure every player has one ${starter.name} from the Dark Iron Agents. Return to the Clean Zone together to clean the rings.`
          : `Before leaving the dungeon, make sure every player has one ${starter.name}. Keep it for the following quest.`,
      ],
      questChanges: [],
      itemCollections: [target],
    };
    const existing = plan.actions.find((entry) => entry.id === id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(stock)) continue;
    if (!existing) before.set(action.id, stock);
    if (selectedRing && reward.minimumMoneyCopper !== 300)
      fees.set(reward.id, { ...reward, minimumMoneyCopper: 300 });
    work.push({
      id: `${id}-material-work`,
      actionId: id,
      environment: "dungeon",
      targets: [
        {
          confirmationKey: target.confirmationKey,
          sourceOrdinal: 0,
          sourceBlocksCompletion: true,
          possibleDropNpcIds: item.npcIds,
          objective: {
            questId: change.questId,
            objectiveIndex: 1,
            npcIds: item.npcIds,
            requiredKills: null,
            credit: "personal-loot",
            source: `Journal quest ${change.questId}; matched dungeon starter ${item.itemId}`,
            reason:
              "Each player needs the starter before pickup; no drop quantity, sharing or kill payout is inferred.",
            loot: { itemId: item.itemId, quantity: 1, sharing: item.sharing },
          },
        },
      ],
    });
    retainedObjectiveKeys.add(combatObjectiveKey({ questId: change.questId, objectiveIndex: 1 }));
  }
  if (!before.size && !fees.size) return { plan, work, retainedObjectiveKeys };
  const actions = plan.actions.flatMap((action) =>
    before.has(action.id) ? [before.get(action.id)!, fees.get(action.id) ?? action] : [fees.get(action.id) ?? action],
  );
  return {
    plan: {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    },
    work,
    retainedObjectiveKeys,
  };
}
