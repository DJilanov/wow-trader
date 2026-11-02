import type { CampaignAction } from "./campaign.js";

export interface CampaignAddonQuestGuard {
  readonly tag: ".isQuestAvailable" | ".isOnQuest";
  readonly questId: number;
}

export interface CampaignAddonQuestActions {
  readonly actions: readonly CampaignAction[];
  readonly guards: ReadonlyMap<string, CampaignAddonQuestGuard>;
}

type QuestState = "accepted" | "objectives-complete" | "rewarded";

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
    const ground = entries[0]?.fundingGroundPickup;
    const sameGroundPickup =
      ground?.questId === questId &&
      entries.every(
        (action) =>
          action.libraryObjective === "interaction" &&
          !action.itemCollections?.length &&
          JSON.stringify(action.fundingGroundPickup) === JSON.stringify(ground) &&
          action.questChanges.every(
            (change) =>
              change.state !== "objectives-complete" ||
              change.objectiveIndex === ground.objectiveIndex,
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
): void {
  const states = new Map<string, QuestState>();
  const groundKeys = new Set<string>();
  const completedGroundKeys = new Set<string>();
  for (const action of actions)
    for (const change of action.questChanges) {
      const key = opportunities.get(action.id) ?? String(change.questId);
      if (opportunities.has(action.id) && action.fundingGroundPickup) {
        groundKeys.add(key);
        if (change.state === "objectives-complete") completedGroundKeys.add(key);
      }
      const current = states.get(key);
      if (current === undefined && change.state !== "accepted")
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
  for (const key of groundKeys)
    if (!completedGroundKeys.has(key))
      throw new Error(
        `${role} guide leaves ground quest ${key.split(":")[0]} without its object objective.`,
      );
}

export function campaignAddonQuestActions(
  actions: readonly CampaignAction[],
  role: "leader" | "party",
): CampaignAddonQuestActions {
  const opportunities = opportunityKeys(actions);
  const normalized = normalizeActions(actions, role, opportunities);
  validateLifecycle(normalized, role, opportunities);
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
