import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset, CombatObjective } from "./combat-model.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";

const required = [{ index: 1, id: 2842, name: "Silver Bar" }, { index: 2, id: 1206, name: "Moss Agate" }] as const;
const objective = "Bring the Brilliant Gold Ring, a Silver Bar, a Moss Agate, and 30 silver coins to Talvash del Kissel in Ironforge.";

interface RingUpgradeMethod {
  readonly plan: CampaignPlan;
  readonly objectives: ReadonlyMap<string, readonly CombatObjective[]>;
}

/** Complete the selected ring upgrade through trade supplies, preserving both real item counters. */
export function attachCampaignRingUpgrade(plan: CampaignPlan, data: CombatDataset): RingUpgradeMethod {
  const objectives = new Map<string, readonly CombatObjective[]>();
  const unchanged = { plan, objectives };
  if (
    !plan.sharedQuestsOnly || plan.dungeonCollectionPolicy !== "selected-clear" ||
    plan.targetBuild !== 70205 || data.targetBuild !== plan.targetBuild ||
    plan.sourceArchiveSha256 !== "af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e" ||
    data.provider.revision !== "e9a67d1a2753a0e64c4c96bf7864788fac7b765f" ||
    data.provider.questSha256 !== "5a8e542d034953ab87c2864e6b5a8d8cb62c154a71052a34c9612ca1e7cdee27" ||
    data.provider.itemSha256 !== "cf635b18db8c97601daa4da2ff2f8767567d4196f1e5f2de5a7224cf138b39c1"
  ) return unchanged;
  const reference = data.quests.find((quest) => quest.questId === 2948);
  const lifecycle = campaignDungeonQuest(2948);
  if (
    !reference || !lifecycle || reference.requiredClasses !== 0 ||
    reference.startItem || reference.creatureIds.length || reference.itemCreatureIds.length ||
    reference.onlyCreatureObjectives || reference.onlyInteractionObjectives ||
    reference.killQuotas?.length || reference.killQuotaConflicts?.length ||
    reference.objectiveText.length !== 1 || reference.objectiveText[0] !== objective ||
    reference.prerequisites?.anyOf.length !== 1 || reference.prerequisites.anyOf[0] !== 2947 ||
    reference.prerequisites.allOf.length || reference.itemObjectives?.length !== required.length ||
    !required.every((item) => reference.itemObjectives?.some((candidate) =>
      candidate.objectiveIndex === item.index && candidate.itemId === item.id &&
      candidate.itemName === item.name && candidate.quantity === 1 &&
      candidate.npcIds.length === 0 && !candidate.provided && !candidate.groundPickup &&
      !candidate.vendorEvidence && !candidate.rewardEvidence,
    ))
  ) return unchanged;
  const phases = plan.actions.filter((action) => action.questChanges.some((change) => change.questId === 2948));
  const pickup = phases.find((action) => action.questChanges[0]?.state === "accepted");
  const work = phases.find((action) => action.questChanges[0]?.state === "objectives-complete");
  const reward = phases.find((action) => action.questChanges[0]?.state === "rewarded");
  if (
    phases.length !== 3 || !pickup || !work || !reward ||
    phases.some((action) => action.source || action.kind !== "quests" || action.leaderOnly || action.raidOnly ||
      action.questChanges.some((change) => change.questId !== 2948)) ||
    !pickup.instructions.includes(lifecycle.pickup ?? "") ||
    !work.instructions.includes(lifecycle.objective ?? "") ||
    !reward.instructions.includes(lifecycle.turnin ?? "") ||
    work.location?.insideDungeon || reward.location?.insideDungeon ||
    work.questChanges.length !== required.length ||
    !required.every((item) =>
      work.questChanges.some((change) => change.state === "objectives-complete" && change.objectiveIndex === item.index) &&
      plan.itemRequirements?.some((requirement) => requirement.questId === 2948 &&
        requirement.itemId === item.id && requirement.objectiveIndex === item.index &&
        requirement.quantity === 1 && !requirement.sourceProvided && !requirement.conflict),
    )
  ) return unchanged;
  objectives.set(work.id, required.map((item): CombatObjective => ({
    questId: 2948, objectiveIndex: item.index, npcIds: [], requiredKills: null, credit: "non-combat",
    source: "Authored QuestieDB e9a67d1a2753a0e64c4c96bf7864788fac7b765f; owner-selected ring upgrade, 2026-11-04",
    reason: `Each player obtains one ${item.name} through AH/trade. The real counter and 30-silver fee remain required; no acquisition kills, XP, price or profession are assumed.`,
  })));
  if (reward.minimumMoneyCopper === 3000) return { plan, objectives };
  return { objectives, plan: { ...plan, actions: plan.actions.map((action): CampaignAction =>
    action === reward ? { ...action, minimumMoneyCopper: 3000 } : action,
  ) } };
}
