import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";

export interface CampaignQuestTiming {
  readonly questId: number;
  readonly title: string;
  readonly timeLimitSeconds: number;
}

export function questDeadlineLabel(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds <= 0)
    throw new Error("Quest deadline must be a positive number of seconds.");
  return seconds % 60 === 0
    ? `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`
    : `${seconds} seconds`;
}

export function timedQuestAcceptanceInstruction(timing: CampaignQuestTiming): string {
  return `Timed quest: ${questDeadlineLabel(timing.timeLimitSeconds)} from acceptance. Get everyone ready before accepting ${timing.title}; each player's own game quest timer is authoritative. Finish and hand in before it expires.`;
}

/** Carry client deadlines through every selected source, including personal starter exports. */
export function attachCampaignQuestTiming(plan: CampaignPlan, catalog: QuestCatalog): CampaignPlan {
  const allActions = [
    ...plan.actions,
    ...(plan.starters?.entries.map((entry) => entry.action) ?? []),
  ];
  const selected = new Set(
    allActions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const timings = catalog.quests.flatMap((quest): CampaignQuestTiming[] =>
    selected.has(quest.questId) && quest.timeLimitSeconds !== undefined
      ? [{ questId: quest.questId, title: quest.title, timeLimitSeconds: quest.timeLimitSeconds }]
      : [],
  );
  if (!timings.length) return plan;
  if (
    plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    throw new Error("Quest timing and route references differ.");
  const byId = new Map(timings.map((timing) => [timing.questId, timing]));
  const decorate = (action: CampaignAction): CampaignAction => {
    const own = [...new Set(action.questChanges.map((change) => change.questId))].flatMap(
      (id) => byId.get(id) ?? [],
    );
    if (!own.length) return action;
    const notes = own.flatMap((timing) =>
      action.questChanges.some(
        (change) => change.questId === timing.questId && change.state === "accepted",
      )
        ? [timedQuestAcceptanceInstruction(timing)]
        : [
            `${timing.title} must be handed in within ${questDeadlineLabel(timing.timeLimitSeconds)} of acceptance. If it fails or expires, report the failure and take a new attempt in game; do not mark the hand-in complete.`,
          ],
    );
    if (
      JSON.stringify(action.questTimings) === JSON.stringify(own) &&
      notes.every((note) => action.instructions.includes(note))
    )
      return action;
    return {
      ...action,
      questTimings: own,
      instructions: [
        ...action.instructions,
        ...notes.filter((note) => !action.instructions.includes(note)),
      ],
    };
  };
  return {
    ...plan,
    questTimings: timings,
    actions: plan.actions.map(decorate),
    ...(plan.starters
      ? {
          starters: {
            ...plan.starters,
            entries: plan.starters.entries.map((entry) => ({
              ...entry,
              action: decorate(entry.action),
            })),
          },
        }
      : {}),
  };
}

/** Timed work must stay together; travel takes real time, but unrelated work is never inserted. */
export function campaignTimedQuestMethodIssues(
  actions: readonly CampaignAction[],
  timings: readonly CampaignQuestTiming[] = [],
): ReadonlyMap<number, string> {
  const issues = new Map<number, string>();
  for (const timing of timings) {
    const phases = actions.flatMap((action, index) =>
      action.questChanges
        .filter((change) => change.questId === timing.questId)
        .map((change, phase) => ({ index, phase, state: change.state })),
    );
    if (!phases.length) continue;
    const accepted = phases.filter((change) => change.state === "accepted");
    const rewarded = phases.filter((change) => change.state === "rewarded");
    if (
      accepted.length !== 1 ||
      rewarded.length !== 1 ||
      accepted[0]!.index > rewarded[0]!.index ||
      (accepted[0]!.index === rewarded[0]!.index && accepted[0]!.phase > rewarded[0]!.phase) ||
      phases.some(
        (entry) =>
          entry.index < accepted[0]!.index ||
          entry.index > rewarded[0]!.index ||
          (entry.index === accepted[0]!.index && entry.phase < accepted[0]!.phase) ||
          (entry.index === rewarded[0]!.index && entry.phase > rewarded[0]!.phase),
      )
    ) {
      issues.set(
        timing.questId,
        `${timing.title}: the timed attempt needs one pickup followed by one hand-in.`,
      );
      continue;
    }
    if (
      actions
        .slice(accepted[0]!.index + 1, rewarded[0]!.index)
        .some((action) =>
          action.questChanges.length
            ? action.questChanges.some((change) => change.questId !== timing.questId)
            : !action.movement,
        )
    )
      issues.set(
        timing.questId,
        `${timing.title}: move unrelated work outside its ${questDeadlineLabel(timing.timeLimitSeconds)} attempt before starting the timer.`,
      );
  }
  return issues;
}
