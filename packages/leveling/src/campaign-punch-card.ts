import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatObjective, CombatQuestReference } from "./combat-model.js";
import { importedStepSchema, type ImportedStep } from "./guide-archive.js";
import reviewed from "./fixtures/gnomeregan-punch-card-method-70205.json" with { type: "json" };

const reviewedSteps = importedStepSchema.array().parse(reviewed.steps);

interface PunchCardMethod {
  readonly source: string;
  readonly outside: readonly string[];
  readonly inside: readonly string[];
}

function signature(step: ImportedStep): string {
  return JSON.stringify([
    step.id,
    step.ordinal,
    step.condition,
    step.directives.map((row) => [row.tag, row.arguments, row.condition, row.text, row.questId]),
  ]);
}

function method(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  quests: readonly CombatQuestReference[],
): PunchCardMethod | null {
  const quest = quests.find((entry) => entry.questId === reviewed.questId);
  const item = quest?.itemObjectives?.[0];
  if (
    plan.targetBuild !== reviewed.targetBuild ||
    plan.sourceArchiveSha256 !== reviewed.sourceArchiveSha256 ||
    !quest ||
    quest.itemObjectives?.length !== 1 ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.onlyCreatureObjectives ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length ||
    item?.itemId !== reviewed.itemId ||
    item.itemName !== "Prismatic Punch Card" ||
    item.objectiveIndex !== 1 ||
    item.quantity !== 1 ||
    item.provided ||
    item.npcIds.length ||
    item.objectIds?.length !== 1 ||
    item.objectIds[0] !== reviewed.objectId
  )
    return null;
  const guides = sources.filter(
    ({ guide }) =>
      guide.chapterId === reviewed.chapterId &&
      guide.version === reviewed.version &&
      guide.targetBuild === plan.targetBuild &&
      guide.sourceSha256 === reviewed.chapterSourceSha256,
  );
  if (guides.length !== 1) return null;
  const steps = guides[0]!.guide.steps.filter((step) =>
    reviewed.steps.some((row) => row.id === step.id),
  );
  if (
    steps.length !== reviewed.steps.length ||
    steps.some((step, index) => signature(step) !== signature(reviewedSteps[index]!))
  )
    return null;
  return {
    source: `${reviewed.chapterId}:${reviewed.version}:${steps.map((step) => step.id).join(",")}; owner-confirmed puzzle method`,
    outside: [
      "Data Rescue: each player gets a White Punch Card from the troggs or gnomes in the entrance caves outside the instance.",
      "Before entering, use the White Punch Card at Matrix Punchograph 3005-A to get a Yellow Punch Card. Keep it for the terminals inside.",
    ],
    inside: [
      "Use the Yellow Punch Card at Matrix Punchograph 3005-B in the gnomish safe zone on the bottom floor, next to the large circular slime room, to get the Blue Punch Card.",
      "Use the Blue Punch Card at Matrix Punchograph 3005-C on the suspended platform next to Electrocutioner 6000 to get the Red Punch Card.",
      "Use the Red Punch Card at Matrix Punchograph 3005-D to get the Prismatic Punch Card. Each player keeps their final card for Master Mechanic Castpipe in Ironforge; the earlier cards are converted, not collected together.",
    ],
  };
}

/** Keep the known terminal puzzle in the clear; only the final quest counter confirms its result. */
export function attachCampaignPunchCardPuzzle(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  quests: readonly CombatQuestReference[],
): { readonly plan: CampaignPlan; readonly objectives: ReadonlyMap<string, CombatObjective> } {
  const proof = method(plan, sources, quests);
  const objectives = new Map<string, CombatObjective>();
  if (!proof) return { plan, objectives };
  const legs = new Map(plan.legs.map((leg) => [leg.id, leg]));
  const selected = plan.actions.filter((action) => {
    const leg = legs.get(action.legId);
    const objectiveIndex = plan.actions.indexOf(action);
    const outsideBrief = plan.actions.findIndex(
      (candidate) =>
        candidate.legId === action.legId &&
        candidate.id.endsWith("-brief") &&
        candidate.questChanges.length === 0 &&
        !candidate.leaderOnly &&
        !candidate.raidOnly,
    );
    return (
      !action.source &&
      !action.leaderOnly &&
      !action.raidOnly &&
      outsideBrief >= 0 &&
      outsideBrief < objectiveIndex &&
      (leg?.stopId === "gnomeregan" || leg?.dungeonVisitId === "gnomeregan") &&
      action.questChanges.length === 1 &&
      action.questChanges[0]!.questId === reviewed.questId &&
      action.questChanges[0]!.state === "objectives-complete" &&
      action.questChanges[0]!.objectiveIndex === 1
    );
  });
  for (const action of selected)
    objectives.set(action.id, {
      questId: reviewed.questId,
      objectiveIndex: 1,
      npcIds: [],
      requiredKills: null,
      credit: "non-combat",
      source: proof.source,
      reason:
        "Acquire the White Punch Card on the entrance clear and convert it at terminals A, B, C and D. No additional acquisition kills or XP are assumed.",
    });
  if (!selected.length) return { plan, objectives };
  const legIds = new Set(selected.map((action) => action.legId));
  return {
    plan: {
      ...plan,
      actions: plan.actions.map((action): CampaignAction => {
        const lines = objectives.has(action.id)
          ? proof.inside
          : legIds.has(action.legId) && action.id.endsWith("-brief")
            ? proof.outside
            : [];
        return lines.length
          ? { ...action, instructions: [...new Set([...action.instructions, ...lines])] }
          : action;
      }),
    },
    objectives,
  };
}
