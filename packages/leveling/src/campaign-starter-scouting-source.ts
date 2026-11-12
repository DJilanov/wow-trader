import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { resolveQuestReward } from "./quest-rewards.js";

export interface StarterScoutingSource {
  readonly pickup: CampaignAction;
  readonly entrance: CampaignAction;
  readonly objective: CampaignAction;
  readonly handIn: CampaignAction;
  readonly courierPickup: CampaignAction;
  readonly courierHandIn: CampaignAction;
}

/** Qualify the captured scouting trigger and courier against ordinary Human quest access. */
export function starterScoutingSource(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): StarterScoutingSource | null {
  if (
    !plan.sharedQuestsOnly ||
    plan.race !== "human" ||
    plan.partyPolicy?.partySize !== 5 ||
    catalog.targetBuild !== plan.targetBuild ||
    combat.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256
  )
    return null;
  const library = buildCampaignQuestLibrary(
    sources,
    campaignPlanSourceProfile(plan),
    [],
    new Set(),
    combat.quests,
    campaignLibraryOptions(plan),
  );
  const programs: CampaignAction[][] = [];
  for (const [questId, parentId, minimumLevel, recipientId, recipientName] of [
    [76, 62, 4, 240, "Marshal Dughan"],
    [239, 76, 6, 963, "Deputy Rainer"],
  ] as const) {
    const quest = catalog.quests.find((entry) => entry.questId === questId);
    const reference = combat.quests.find((entry) => entry.questId === questId);
    const program = library.find((entry) => entry.questId === questId);
    if (
      !quest ||
      !reference ||
      !program?.complete ||
      program.held ||
      program.abandoned ||
      program.objective !== (questId === 76 ? "interaction" : "delivery") ||
      program.actions.length !== (questId === 76 ? 3 : 2) ||
      quest.requiredClasses !== 0 ||
      reference.requiredClasses !== 0 ||
      (quest.requiredRaces !== 0 && (BigInt(quest.requiredRaces) & 1n) === 0n) ||
      quest.minimumLevel !== minimumLevel ||
      quest.category !== (questId === 76 ? "unsupported" : "delivery") ||
      quest.prerequisites.allOf.length ||
      quest.prerequisites.anyOf.length !== 1 ||
      quest.prerequisites.anyOf[0] !== parentId ||
      reference.prerequisites?.allOf.length ||
      reference.prerequisites?.anyOf.length !== 1 ||
      reference.prerequisites.anyOf[0] !== parentId ||
      quest.exclusiveWith.length ||
      quest.providedItem ||
      quest.objectives.length ||
      reference.creatureIds.length ||
      reference.itemCreatureIds.length ||
      reference.itemObjectives?.length ||
      reference.onlyCreatureObjectives ||
      reference.killQuotas?.length ||
      reference.killQuotaConflicts?.length ||
      (questId === 76 && !reference.onlyInteractionObjectives) ||
      quest.unsupportedRequirements.some(
        (requirement) =>
          requirement !== "unresolved-objective-text" &&
          !(questId === 76 && requirement === "exploration-trigger"),
      ) ||
      !quest.starts.some(
        (npc) =>
          npc.npcId === 240 &&
          npc.name === "Marshal Dughan" &&
          npc.friendlyToAlliance &&
          npc.positions.some((p) => p.zone === "1429"),
      ) ||
      !quest.ends.some(
        (npc) =>
          npc.npcId === recipientId &&
          npc.name === recipientName &&
          npc.friendlyToAlliance &&
          npc.positions.some((p) => p.zone === "1429"),
      ) ||
      resolveQuestReward(questId, 9, plan.rewardFacts ?? []).xp === null
    )
      return null;
    const states =
      questId === 76
        ? (["accepted", "objectives-complete", "rewarded"] as const)
        : (["accepted", "rewarded"] as const);
    for (const [index, state] of states.entries()) {
      const action = program.actions[index]!;
      const source = sources.find(
        (entry) =>
          entry.guide.chapterId === action.source?.chapterId &&
          entry.guide.version === action.source.version &&
          entry.guide.targetBuild === plan.targetBuild,
      );
      const step = source?.guide.steps.find((entry) => entry.id === action.source?.stepId);
      if (
        !step ||
        action.leaderOnly ||
        action.raidOnly ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.questId !== questId ||
        action.questChanges[0]!.state !== state ||
        action.questChanges[0]!.objectiveIndex !== (state === "objectives-complete" ? 1 : null) ||
        !action.positions.length ||
        action.positions.some((entry) => entry.position.zone !== "1429") ||
        (state !== "objectives-complete" &&
          !step.directives.some(
            (row) =>
              row.tag === ".target" &&
              row.arguments.replace(/^\+/, "").trim() ===
                (state === "accepted" ? "Marshal Dughan" : recipientName),
          ))
      )
        return null;
    }
    programs.push([...program.actions]);
  }
  const objective = programs[0]![1]!;
  const source = sources.find(
    (entry) =>
      entry.reference.sourceId === 116 && entry.guide.chapterId === objective.source?.chapterId,
  );
  const entrance = source?.guide.steps.find((step) => step.id === "source-step-0125");
  const points = entrance?.directives.filter((row) => row.tag === ".goto");
  if (
    !source ||
    !entrance ||
    entrance.condition.trim() ||
    !points?.length ||
    points.some((row) => !row.position || row.position.zone !== "1429" || row.condition.trim()) ||
    entrance.directives.some(
      (row) => !["#optional", "#requires", "#label", "#completewith", ".goto"].includes(row.tag),
    )
  )
    return null;
  return {
    pickup: programs[0]![0]!,
    entrance: {
      ...objective,
      id: "starter-jasperlode-entrance",
      title: "Enter the Jasperlode Mine together",
      instructions: [
        "Scout Jasperlode on the way east. Stay together until every player receives exploration credit; report back on the planned Goldshire return.",
      ],
      kind: "instructions",
      questChanges: [],
      positions: points.map((row) => ({ sourceLine: row.sourceLine, position: row.position! })),
      source: campaignActionSource(source.guide, entrance, entrance.directives),
    },
    objective,
    handIn: programs[0]![2]!,
    courierPickup: programs[1]![0]!,
    courierHandIn: {
      ...programs[1]![1]!,
      instructions: ["Turn in Westbrook Garrison Needs Help!", "Talk to Deputy Rainer"],
      positions: programs[1]![1]!.positions.slice(0, 1),
    },
  };
}
