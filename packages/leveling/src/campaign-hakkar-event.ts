import type {
  CampaignAction,
  CampaignPlan,
  CampaignSource,
} from "./campaign.js";
import type {
  CombatDataset,
  CombatObjective,
} from "./combat-model.js";
import { importedStepSchema } from "./guide-archive.js";
import reviewed from "./fixtures/hakkar-event-70205.json" with { type: "json" };

const reviewedStep = importedStepSchema.parse(reviewed.archive.step);

/** Keep the complete summon/egg conversion; none of its components establish extra kill XP. */
export function attachCampaignHakkarEvent(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  dataset: CombatDataset,
): { readonly plan: CampaignPlan; readonly objectives: ReadonlyMap<string, CombatObjective> } {
  const objectives = new Map<string, CombatObjective>();
  const quest = dataset.quests.find((entry) => entry.questId === reviewed.questId);
  const item = quest?.itemObjectives?.[0];
  if (
    plan.targetBuild !== reviewed.targetBuild ||
    dataset.targetBuild !== reviewed.targetBuild ||
    plan.sourceArchiveSha256 !== reviewed.sourceArchiveSha256 ||
    dataset.provider.revision !== reviewed.providerRevision ||
    dataset.provider.questSha256 !== reviewed.questSha256 ||
    dataset.provider.itemSha256 !== reviewed.itemSha256 ||
    dataset.provider.npcSha256 !== reviewed.npcSha256 ||
    !quest ||
    quest.requiredClasses !== 0 ||
    quest.onlyCreatureObjectives ||
    quest.onlyInteractionObjectives ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length ||
    quest.startItem ||
    quest.itemObjectives?.length !== 1 ||
    JSON.stringify(quest.objectiveText) !== JSON.stringify(reviewed.objectiveText) ||
    item?.objectiveIndex !== reviewed.objectiveIndex ||
    item.itemId !== reviewed.outputItem.id ||
    item.itemName !== reviewed.outputItem.name ||
    item.quantity !== reviewed.outputItem.quantity ||
    item.provided ||
    item.npcIds.length ||
    item.objectIds?.length ||
    item.vendorEvidence ||
    item.rewardEvidence ||
    reviewed.physicalNpcs.some(
      (expected) =>
        !dataset.npcs.some(
          (npc) =>
            npc.id === expected.id && npc.name === expected.name && npc.xpEligibility === "assumed",
        ),
    )
  )
    return { plan, objectives };
  const guides = sources.filter(
    ({ guide }) =>
      guide.chapterId === reviewed.archive.chapterId &&
      guide.version === reviewed.archive.version &&
      guide.sourceSha256 === reviewed.archive.sourceSha256 &&
      guide.targetBuild === plan.targetBuild,
  );
  const step = guides[0]?.guide.steps.find((entry) => entry.id === reviewedStep.id);
  if (guides.length !== 1 || JSON.stringify(step) !== JSON.stringify(reviewedStep))
    return { plan, objectives };
  const legs = new Map(plan.legs.map((leg) => [leg.id, leg]));
  const selected = plan.actions.filter((action) => {
    const leg = legs.get(action.legId);
    const context = action.location?.insideDungeon ?? leg?.dungeonVisitId ?? leg?.stopId;
    return (
      context === "sunken-temple" &&
      action.kind === "quests" &&
      !action.source &&
      !action.leaderOnly &&
      !action.raidOnly &&
      action.wholeQuestObjectives &&
      action.questChanges.length === 1 &&
      action.questChanges[0]!.questId === reviewed.questId &&
      action.questChanges[0]!.state === "objectives-complete" &&
      action.questChanges[0]!.objectiveIndex === reviewed.objectiveIndex
    );
  });
  if (selected.length !== 1) return { plan, objectives };
  objectives.set(selected[0]!.id, {
    questId: reviewed.questId,
    objectiveIndex: reviewed.objectiveIndex,
    credit: "non-combat",
    npcIds: [],
    requiredKills: null,
    combatAccess: {
      npcIds: reviewed.physicalNpcs.map((npc) => npc.id),
      itemId: reviewed.outputItem.id,
      quantity: reviewed.outputItem.quantity,
    },
    source: `${reviewed.archive.chapterId}:${reviewed.archive.version}:${reviewedStep.id}`,
    reason:
      "Complete the Hakkar event and use each player's Essence to fill their supplied Egg. Event enemies remain physical requirements; no minion count or additional kill XP is inferred.",
  });
  const eventInstructions = [
    "Keep your Egg of Hakkar. Use an Egg beside the Dragonflayer Skeleton to begin the event; the party completes the minion waves and defeats the Avatar of Hakkar.",
    "Each player loots an Essence of Hakkar, then uses it to fill their own Egg. Keep the Filled Egg of Hakkar for Yeh'kinya in Tanaris.",
  ];
  const actions = plan.actions.map((action): CampaignAction => {
    const accepts = action.questChanges.some(
      (change) => change.questId === reviewed.questId && change.state === "accepted",
    );
    const lines = objectives.has(action.id)
      ? eventInstructions
      : accepts
        ? [
            "Each player receives an Egg of Hakkar at acceptance. Keep it for the Sunken Temple event.",
          ]
        : [];
    return lines.length
      ? { ...action, instructions: [...new Set([...action.instructions, ...lines])] }
      : action;
  });
  return { plan: { ...plan, actions }, objectives };
}
