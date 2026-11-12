import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { resolveQuestReward } from "./quest-rewards.js";

export interface EarlyPreparationCouriers {
  readonly lunchPickup: CampaignAction;
  readonly lunchReturn: CampaignAction;
  readonly reportPickup: CampaignAction;
  readonly reportReturn: CampaignAction;
}

/** Qualify the two captured couriers against their actual parcel, giver and recipient. */
export function earlyPreparationCouriers(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset,
  catalog: QuestCatalog,
): EarlyPreparationCouriers | null {
  if (
    !plan.sharedQuestsOnly ||
    plan.race !== "human" ||
    plan.partyPolicy?.partySize !== 5 ||
    data.targetBuild !== plan.targetBuild ||
    catalog.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256 ||
    catalog.providerRevision !== data.provider.revision ||
    catalog.questSha256 !== data.provider.questSha256 ||
    catalog.npcSha256 !== data.provider.npcSha256 ||
    catalog.itemSha256 !== data.provider.itemSha256
  )
    return null;
  const library = buildCampaignQuestLibrary(
    sources,
    campaignPlanSourceProfile(plan),
    DUNGEON_VISITS.flatMap((visit) => (visit.sourceTag ? [visit.sourceTag] : [])),
    new Set(),
    data.quests,
    campaignLibraryOptions(plan),
  );
  const programs: CampaignAction[][] = [];
  for (const [questId, itemId, giverId, recipientId, recipientZone] of [
    [129, 5534, 379, 464, "1433"],
    [120, 1293, 344, 466, "1453"],
  ] as const) {
    const quest = catalog.quests.find((entry) => entry.questId === questId);
    const reference = data.quests.find((entry) => entry.questId === questId);
    const program = library.find((entry) => entry.questId === questId);
    if (
      !quest ||
      !reference ||
      !program?.complete ||
      program.held ||
      program.abandoned ||
      program.objective !== "delivery" ||
      program.actions.length !== 2 ||
      quest.requiredClasses !== 0 ||
      reference.requiredClasses !== 0 ||
      reference.onlyCreatureObjectives ||
      (quest.requiredRaces !== 0 && (BigInt(quest.requiredRaces) & 1n) === 0n) ||
      quest.minimumLevel === null ||
      quest.minimumLevel > 14 ||
      quest.category !== "delivery" ||
      quest.providedItem?.itemId !== itemId ||
      quest.objectives.length ||
      reference.creatureIds.length ||
      reference.itemCreatureIds.length ||
      reference.itemObjectives?.length ||
      reference.killQuotas?.length ||
      reference.killQuotaConflicts?.length ||
      quest.prerequisites.allOf.length ||
      quest.prerequisites.anyOf.length ||
      quest.exclusiveWith.length ||
      quest.unsupportedRequirements.some(
        (requirement) =>
          !["provided-item-interaction", "unresolved-objective-text"].includes(requirement),
      ) ||
      !quest.starts.some(
        (giver) =>
          giver.npcId === giverId &&
          giver.friendlyToAlliance &&
          giver.positions.some((position) => position.zone === "1433"),
      ) ||
      !quest.ends.some(
        (recipient) =>
          recipient.npcId === recipientId &&
          recipient.friendlyToAlliance &&
          recipient.positions.some((position) => position.zone === recipientZone),
      ) ||
      resolveQuestReward(questId, 18, plan.rewardFacts ?? []).xp === null
    )
      return null;
    for (const [index, state] of ["accepted", "rewarded"].entries()) {
      const action = program.actions[index]!;
      const zone = index === 0 ? "1433" : recipientZone;
      const name = (index === 0 ? quest.starts : quest.ends).find(
        (giver) => giver.npcId === (index === 0 ? giverId : recipientId),
      )!.name;
      const source = sources.find(
        (entry) =>
          entry.guide.chapterId === action.source?.chapterId &&
          entry.guide.version === action.source.version &&
          entry.guide.targetBuild === plan.targetBuild,
      );
      const step = source?.guide.steps.find((entry) => entry.id === action.source?.stepId);
      if (
        !action.source ||
        !step ||
        action.leaderOnly ||
        action.raidOnly ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.questId !== questId ||
        action.questChanges[0]!.state !== state ||
        !action.positions.length ||
        action.positions.some((entry) => entry.position.zone !== zone) ||
        !step.directives.some(
          (directive) =>
            directive.tag === ".target" && directive.arguments.replace(/^\+/, "").trim() === name,
        )
      )
        return null;
    }
    programs.push([...program.actions]);
  }
  return {
    lunchPickup: programs[0]![0]!,
    lunchReturn: programs[0]![1]!,
    reportPickup: programs[1]![0]!,
    reportReturn: programs[1]![1]!,
  };
}

/** Give the previously map-less spider counter a separate, catalog-backed approach step. */
export function earlySpiderCamp(
  plan: CampaignPlan,
  data: CombatDataset,
  catalog: QuestCatalog,
): CampaignAction | null {
  const quest = catalog.quests.find((entry) => entry.questId === 245);
  const objective = quest?.objectives[0];
  const giver = quest?.starts.find((entry) => entry.npcId === 888 && entry.friendlyToAlliance);
  const origin = giver?.positions.find((position) => position.zone === "1431");
  const npc = data.npcs.find((entry) => entry.id === 539);
  if (
    !quest ||
    !objective ||
    !origin ||
    !npc ||
    quest.requiredClasses !== 0 ||
    (quest.requiredRaces !== 0 && (BigInt(quest.requiredRaces) & 1n) === 0n) ||
    quest.minimumLevel !== 17 ||
    quest.category !== "shared-kills" ||
    quest.unsupportedRequirements.length ||
    quest.objectives.length !== 1 ||
    objective.npcId !== npc.id ||
    objective.count !== 15 ||
    npc.name !== "Pygmy Venom Web Spider" ||
    npc.rank !== 0 ||
    npc.minimumLevel === null ||
    npc.maximumLevel === null ||
    npc.maximumLevel > 19 ||
    npc.xpEligibility !== "assumed" ||
    !objective.positions.length ||
    objective.positions.some((position) => position.zone !== "1431") ||
    resolveQuestReward(245, 18, plan.rewardFacts ?? []).xp === null
  )
    return null;
  const positions = [...objective.positions]
    .sort(
      (left, right) =>
        Math.hypot(left.x - origin.x, left.y - origin.y) -
        Math.hypot(right.x - origin.x, right.y - origin.y),
    )
    .slice(0, 3);
  return {
    id: "early-duskwood-spiders-camp",
    legId: "early-duskwood-spiders",
    title: "Reach the Pygmy Venom Web Spider camp",
    instructions: [
      "Look for Pygmy Venom Web Spiders at the marked possible locations in western Duskwood. Finish all 15 shared kills, then return together to Watcher Dodds before continuing to Westfall.",
    ],
    positions: positions.map((position) => ({
      sourceLine: 0,
      position: { ...position, floor: null, space: "map-percent" as const },
    })),
    questChanges: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    libraryBackbone: true,
    xpOptional: false,
    location: { zone: "1431", visitOverride: true },
  };
}
