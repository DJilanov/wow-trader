import type { CampaignAction, CampaignPlan } from "./campaign.js";
import {
  premadeProgressSchema,
  type PremadeMember,
  type PremadeProgress,
} from "./premade-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export function timedQuestFailureKey(questId: number): string {
  return `campaign-timed-failure-${questId}`;
}

export function failedTimedQuestForAction(
  action: CampaignAction,
  member: Pick<PremadeMember, "questStates" | "confirmations">,
): number | null {
  return (
    [
      ...action.questChanges.map((change) => change.questId),
      ...(action.requiredQuestIds ?? []),
    ].find(
      (id) =>
        member.questStates[String(id)] !== "rewarded" &&
        member.confirmations[timedQuestFailureKey(id)] === true,
    ) ?? null
  );
}

/** This records a player's report; it never abandons or reaccepts a quest in the game. */
export function reportCampaignTimedQuestFailure(
  plan: CampaignPlan,
  progress: PremadeProgress,
  questId: number,
  player: number,
): PremadeProgress {
  if (!plan.questTimings?.some((timing) => timing.questId === questId) || !progress.members[player])
    throw new Error("Unknown timed quest or party member.");
  const member = progress.members[player]!;
  if (!["accepted", "objectives-complete"].includes(member.questStates[String(questId)] ?? ""))
    throw new Error("Only an active unhanded-in quest can be reported failed or expired.");
  return premadeProgressSchema.parse({
    ...progress,
    members: progress.members.map((entry, index) =>
      index === player
        ? {
            ...entry,
            xpNeedsUpdate: true,
            confirmations: { ...entry.confirmations, [timedQuestFailureKey(questId)]: true },
          }
        : entry,
    ),
  });
}

/** Resume only after a fresh XP report and explicit confirmation of a new in-game attempt. */
export function resumeCampaignTimedQuestAttempt(
  plan: CampaignPlan,
  progress: PremadeProgress,
  questId: number,
  player: number,
): PremadeProgress {
  const member = progress.members[player];
  if (
    !plan.questTimings?.some((timing) => timing.questId === questId) ||
    !member ||
    member.confirmations[timedQuestFailureKey(questId)] !== true ||
    member.questStates[String(questId)] === "rewarded"
  )
    throw new Error("This party member has no failed timed attempt to resume.");
  if (
    member.xpNeedsUpdate ||
    member.level === null ||
    member.currentXp === null ||
    (member.level === 60
      ? member.currentXp !== 0
      : member.currentXp >= FOREVER_XP_CURVE[member.level]!)
  )
    throw new Error("Record this player's current level and XP before confirming the new attempt.");
  const next = plan.actions.find((action) =>
    action.questChanges.some((change) => change.questId === questId && change.state !== "accepted"),
  );
  if (!next) throw new Error("The timed quest has no remaining objective or hand-in.");
  const confirmations = Object.fromEntries(
    Object.entries(member.confirmations).filter(
      ([key]) =>
        key !== timedQuestFailureKey(questId) && !key.startsWith(`campaign-objective-${questId}-`),
    ),
  );
  const questStates = { ...member.questStates, [questId]: "accepted" as const };
  const journey = progress.campaigns[plan.release];
  const completion = { ...journey?.completion };
  for (const action of plan.actions)
    if (
      action.questChanges.some(
        (change) => change.questId === questId && change.state !== "accepted",
      )
    )
      delete completion[action.id];
  return premadeProgressSchema.parse({
    ...progress,
    campaigns: {
      ...progress.campaigns,
      [plan.release]: { ...journey, selectedActionId: next.id, completion },
    },
    members: progress.members.map((entry, index) =>
      index === player
        ? {
            ...entry,
            questStates,
            confirmations,
            guideXpAnchor: {
              release: plan.release,
              actionId: next.id,
              level: member.level,
              currentXp: member.currentXp,
              questStates,
              confirmations,
              bundleSlotStates: member.bundleSlotStates,
            },
          }
        : entry,
    ),
  });
}
