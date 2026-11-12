import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { GroundPickupReference } from "./quest-ground-pickup.js";
import { reviewedInstantHandIn } from "./campaign-narrative-events.js";

export interface CampaignAddonQuestGuard {
  readonly tag: ".isQuestAvailable" | ".isOnQuest";
  readonly questId: number;
}

export interface CampaignAddonQuestActions {
  readonly actions: readonly CampaignAction[];
  readonly guards: ReadonlyMap<string, CampaignAddonQuestGuard>;
}

type QuestState = "accepted" | "objectives-complete" | "rewarded";

function fundedGroundPickups(action: CampaignAction): readonly GroundPickupReference[] {
  if (action.fundingGroundPickup && action.fundingGroundPickups)
    throw new Error(`Quest action ${action.id} has conflicting ground-object proofs.`);
  const grounds =
    action.fundingGroundPickups ?? (action.fundingGroundPickup ? [action.fundingGroundPickup] : []);
  if (new Set(grounds.map((ground) => ground.objectiveIndex)).size !== grounds.length)
    throw new Error(`Quest action ${action.id} repeats a ground-object objective.`);
  return grounds;
}

/** Only generated, complete quest opportunities may have independent optional lifecycles. */
function opportunityKeys(actions: readonly CampaignAction[]): ReadonlyMap<string, string> {
  const quests = new Map<number, CampaignAction[]>();
  for (const action of actions)
    for (const questId of new Set(action.questChanges.map((change) => change.questId))) {
      const entries = quests.get(questId) ?? [];
      entries.push(action);
      quests.set(questId, entries);
    }
  const keys = new Map<string, string>();
  for (const [questId, entries] of quests) {
    const grounds = fundedGroundPickups(entries[0]!);
    const objectiveIndices = new Set(grounds.map((ground) => ground.objectiveIndex));
    const sameGroundPickup =
      grounds.length > 0 &&
      grounds.every((ground) => ground.questId === questId) &&
      entries.every(
        (action) =>
          action.libraryObjective === "interaction" &&
          !action.itemCollections?.length &&
          JSON.stringify(fundedGroundPickups(action)) === JSON.stringify(grounds) &&
          action.questChanges.every(
            (change) =>
              change.state !== "objectives-complete" ||
              objectiveIndices.has(change.objectiveIndex ?? 1),
          ),
      );
    if (
      !entries.some((action) => action.xpOptional) ||
      entries.some(
        (action) =>
          action.source !== null ||
          action.kind !== "quests" ||
          action.libraryQuestId !== questId ||
          (action.libraryObjective !== "shared-kills" && !sameGroundPickup) ||
          !action.fundingCheckpointId ||
          action.questChanges.some((change) => change.questId !== questId),
      ) ||
      new Set(entries.map((action) => action.fundingCheckpointId)).size < 2
    )
      continue;
    for (const action of entries) keys.set(action.id, `${questId}:${action.fundingCheckpointId!}`);
  }
  return keys;
}

function questInstruction(change: CampaignAction["questChanges"][number]): string {
  return `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : "Complete"} ${change.title}`;
}

function normalizeActions(
  actions: readonly CampaignAction[],
  role: "leader" | "party",
  opportunities: ReadonlyMap<string, string>,
): readonly CampaignAction[] {
  const states = new Map<string, QuestState>();
  const overlappingPickups = new Map<string, number>();
  const repeatedLifecycles = new Map<string, number>();
  const emittedPhases = new Map<string, Set<string>>();
  const normalized: CampaignAction[] = [];
  for (const action of actions) {
    const retained = action.questChanges.filter((change) => {
      const key = opportunities.get(action.id) ?? String(change.questId);
      const current = states.get(key);
      if (current !== undefined && change.state === "accepted") {
        const collection = current === "rewarded" ? repeatedLifecycles : overlappingPickups;
        collection.set(key, (collection.get(key) ?? 0) + 1);
        return false;
      }
      const phaseKey = `${change.state}-${change.objectiveIndex ?? 0}`;
      const phases = emittedPhases.get(key) ?? new Set<string>();
      const repeated = repeatedLifecycles.get(key) ?? 0;
      if (current === "rewarded" && repeated > 0) {
        if (change.state === "rewarded") {
          if (repeated === 1) repeatedLifecycles.delete(key);
          else repeatedLifecycles.set(key, repeated - 1);
        }
        return false;
      }
      const overlapping = overlappingPickups.get(key) ?? 0;
      if (current === "rewarded" && overlapping > 0 && phases.has(phaseKey)) {
        if (change.state === "rewarded") {
          if (overlapping === 1) overlappingPickups.delete(key);
          else overlappingPickups.set(key, overlapping - 1);
        }
        return false;
      }
      if (current === "rewarded")
        throw new Error(
          `${role} guide changes rewarded quest ${change.questId} back to ${change.state}.`,
        );
      if (overlapping > 0 && phases.has(phaseKey)) return false;
      states.set(key, change.state);
      phases.add(phaseKey);
      emittedPhases.set(key, phases);
      return true;
    });
    if (retained.length === action.questChanges.length) {
      normalized.push(action);
      continue;
    }
    if (retained.length === 0) {
      if (action.questChanges.length === 0) normalized.push(action);
      continue;
    }
    normalized.push({
      ...action,
      title: retained.map(questInstruction).join(" · "),
      instructions: retained.map(questInstruction),
      questChanges: retained,
    });
  }
  if (repeatedLifecycles.size > 0)
    throw new Error(
      `${role} guide repeats quest ${[...repeatedLifecycles.keys()]
        .map((key) => Number(key.split(":")[0]))
        .sort((a, b) => a - b)
        .join(", ")} without a matching hand-in.`,
    );
  return normalized;
}

function validateLifecycle(
  actions: readonly CampaignAction[],
  role: "leader" | "party",
  opportunities: ReadonlyMap<string, string>,
  context?: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">,
): void {
  const states = new Map<string, QuestState>();
  const groundObjectives = new Map<string, Set<number>>();
  const completedGroundObjectives = new Map<string, Set<number>>();
  for (const action of actions)
    for (const change of action.questChanges) {
      const key = opportunities.get(action.id) ?? String(change.questId);
      const grounds = fundedGroundPickups(action);
      const required = groundObjectives.get(key) ?? new Set<number>();
      if (grounds.length) {
        for (const ground of grounds) {
          if (ground.questId !== change.questId)
            throw new Error(`Quest action ${action.id} has another quest's ground-object proof.`);
          required.add(ground.objectiveIndex);
        }
        groundObjectives.set(key, required);
      }
      if (required.size) {
        const completed = completedGroundObjectives.get(key) ?? new Set<number>();
        if (change.state === "objectives-complete") {
          if (!required.has(change.objectiveIndex ?? 1))
            throw new Error(`Quest action ${action.id} completes an unproven object objective.`);
          completed.add(change.objectiveIndex ?? 1);
        }
        completedGroundObjectives.set(key, completed);
        if (change.state === "rewarded" && [...required].some((index) => !completed.has(index)))
          throw new Error(
            `${role} guide leaves ground quest ${change.questId} without its object objective.`,
          );
      }
      const current = states.get(key);
      const instantParents = context && change.state === "rewarded"
        ? reviewedInstantHandIn(action, change.questId, context)
        : null;
      if (instantParents?.some((id) => states.get(String(id)) !== "rewarded"))
        throw new Error(`${role} guide reaches instant quest ${change.questId} before its event.`);
      if (current === undefined && change.state !== "accepted" && instantParents === null)
        throw new Error(
          `${role} guide reaches ${change.state} for quest ${change.questId} before its pickup.`,
        );
      if (current !== undefined && change.state === "accepted")
        throw new Error(`${role} guide accepts quest ${change.questId} more than once.`);
      if (current === "rewarded")
        throw new Error(
          `${role} guide changes rewarded quest ${change.questId} back to ${change.state}.`,
        );
      states.set(key, change.state);
    }
  const incomplete = [...states]
    .filter(([, state]) => state !== "rewarded")
    .map(([key]) => Number(key.split(":")[0]))
    .sort((left, right) => left - right);
  if (incomplete.length)
    throw new Error(`${role} guide leaves quest ${incomplete.join(", ")} without a hand-in.`);
}

export function campaignAddonQuestActions(
  actions: readonly CampaignAction[],
  role: "leader" | "party",
  context?: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">,
): CampaignAddonQuestActions {
  const opportunities = opportunityKeys(actions);
  const normalized = normalizeActions(actions, role, opportunities);
  validateLifecycle(normalized, role, opportunities, context);
  const guards = new Map<string, CampaignAddonQuestGuard>();
  for (const action of normalized) {
    if (!opportunities.has(action.id)) continue;
    const change = action.questChanges[0]!;
    guards.set(action.id, {
      tag: change.state === "accepted" ? ".isQuestAvailable" : ".isOnQuest",
      questId: change.questId,
    });
  }
  return { actions: normalized, guards };
}
