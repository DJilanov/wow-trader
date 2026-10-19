import type { CampaignQuestValidationObservation } from "./quest-validation-evidence.js";

type Observation = CampaignQuestValidationObservation;
type Snapshot = Observation["snapshots"][number];

export function questAcceptanceTime(observation: Observation): number | null {
  for (const event of observation.events) {
    if (event.name !== "QUEST_ACCEPTED") continue;
    if (
      observation.snapshots.some(
        (before) => before.onQuest === false && before.capturedAt <= event.capturedAt,
      ) &&
      observation.snapshots.some(
        (after) => after.onQuest === true && after.capturedAt >= event.capturedAt,
      )
    )
      return event.capturedAt;
  }
  return null;
}

export function questRewardTime(observation: Observation): number | null {
  for (const event of observation.events) {
    if (event.name !== "QUEST_TURNED_IN") continue;
    if (
      observation.snapshots.some(
        (before) => before.rewarded === false && before.capturedAt <= event.capturedAt,
      ) &&
      observation.snapshots.some(
        (after) => after.rewarded === true && after.capturedAt >= event.capturedAt,
      )
    )
      return event.capturedAt;
  }
  return null;
}

export function questReadyTimes(
  observation: Observation,
  objectiveIndexes: readonly number[],
): readonly number[] {
  return observation.snapshots
    .filter(
      (snapshot) =>
        snapshot.onQuest === true &&
        snapshot.readyForTurnIn === true &&
        objectiveIndexes.every((index) =>
          snapshot.objectives.some(
            (objective) =>
              objective.index === index &&
              (objective.finished === true ||
                (objective.required !== null &&
                  objective.required > 0 &&
                  objective.fulfilled !== null &&
                  objective.fulfilled >= objective.required)),
          ),
        ),
    )
    .map((snapshot) => snapshot.capturedAt);
}

function objectiveIncreased(before: Snapshot, after: Snapshot, index: number): boolean {
  const left = before.objectives.find((objective) => objective.index === index);
  const right = after.objectives.find((objective) => objective.index === index);
  if (
    !left ||
    !right ||
    !left.textSha256 ||
    left.textSha256 !== right.textSha256 ||
    left.required !== right.required
  )
    return false;
  return (
    (left.finished === false && right.finished === true) ||
    (left.fulfilled !== null && right.fulfilled !== null && right.fulfilled > left.fulfilled)
  );
}

export function namedTargetCredits(
  observation: Observation,
  objectiveIndexes: readonly number[],
  npcIds: readonly number[],
): readonly { readonly targetFingerprint: string; readonly capturedAt: number }[] {
  if (!objectiveIndexes.length || !npcIds.length) return [];
  return observation.snapshots.flatMap((before, offset) => {
    const target = before.target;
    if (
      !target?.fingerprint ||
      target.npcId === null ||
      !npcIds.includes(target.npcId) ||
      before.onQuest !== true
    )
      return [];
    const after = observation.snapshots
      .slice(offset + 1)
      .find(
        (candidate) =>
          candidate.onQuest === true &&
          objectiveIndexes.every((index) => objectiveIncreased(before, candidate, index)),
      );
    return after ? [{ targetFingerprint: target.fingerprint, capturedAt: after.capturedAt }] : [];
  });
}
