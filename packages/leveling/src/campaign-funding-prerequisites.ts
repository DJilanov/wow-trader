import type { CampaignAction } from "./campaign.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";

function phaseInstruction(change: CampaignAction["questChanges"][number]): string {
  const verb = change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete";
  return `${verb} ${change.title}`;
}

function sameGiverVisit(
  own: QuestCatalogEntry["starts"],
  other: QuestCatalogEntry["starts"],
  allowNearbyGivers: boolean,
): boolean {
  if (own.some((giver) => other.some((entry) => entry.npcId === giver.npcId))) return true;
  if (!allowNearbyGivers) return false;
  const givers = [...own, ...other];
  if (
    !own.length ||
    !other.length ||
    givers.some((giver) => !giver.friendlyToAlliance || !giver.positions.length)
  )
    return false;
  const positions = givers.flatMap((giver) => giver.positions);
  // Catalog coordinates are map percentages. Every possible endpoint must fit one small camp;
  // a nearby alternative alone cannot justify splitting a remote or ambiguous visit.
  return positions.every((point) =>
    positions.every(
      (otherPoint) =>
        point.zone === otherPoint.zone &&
        Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) <= 0.5,
    ),
  );
}

/** Preserve a captured pickup split from its prerequisite's hand-in at the same giver. */
export function existingFundingPickup(
  quest: QuestCatalogEntry,
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
  existing: readonly CampaignAction[],
  parents: readonly number[],
): CampaignAction | null {
  const captures = existing.filter(
    (action) =>
      action.source && action.questChanges.some((change) => change.questId === quest.questId),
  );
  if (captures.length !== 1) return null;
  const action = captures[0]!;
  const own = action.questChanges.filter((change) => change.questId === quest.questId);
  const others = action.questChanges.filter((change) => change.questId !== quest.questId);
  if (
    action.kind !== "quests" ||
    action.raidOnly ||
    action.dungeonFinishOnly ||
    own.length !== 1 ||
    own[0]!.state !== "accepted" ||
    others.some(
      (change) =>
        change.state !== "rewarded" ||
        !parents.includes(change.questId) ||
        !catalog
          .get(change.questId)
          ?.ends.some((giver) => quest.starts.some((entry) => entry.npcId === giver.npcId)),
    )
  )
    return null;
  return {
    ...action,
    questChanges: own,
    instructions: action.instructions.filter(
      (line) => !others.some((change) => line.includes(change.title)) || line.includes(quest.title),
    ),
  };
}

/** Reorder a captured quest lifecycle without replacing its source behavior with generic work. */
export function existingFundingPrerequisite(
  quest: QuestCatalogEntry,
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
  existing: readonly CampaignAction[],
  allowNearbyGivers: boolean = false,
): readonly CampaignAction[] | null {
  if (!isUnrestrictedFundingQuest(quest)) return null;
  const actions = existing.filter((action) =>
    action.questChanges.some((change) => change.questId === quest.questId),
  );
  const phases = actions.flatMap((action) =>
    action.questChanges.filter((change) => change.questId === quest.questId),
  );
  const pickup = phases.findIndex((change) => change.state === "accepted");
  const reward = phases.findIndex((change) => change.state === "rewarded");
  if (
    pickup < 0 ||
    reward <= pickup ||
    phases.filter((change) => change.state === "accepted").length !== 1 ||
    phases.filter((change) => change.state === "rewarded").length !== 1 ||
    (quest.category === "unsupported" &&
      !phases.some((change) => change.state === "objectives-complete")) ||
    phases.some(
      (change, index) =>
        change.state === "objectives-complete" && (index <= pickup || index >= reward),
    )
  )
    return null;
  for (const action of actions) {
    if (!action.source || action.kind !== "quests" || action.raidOnly || action.dungeonFinishOnly)
      return null;
    const own = action.questChanges.filter((change) => change.questId === quest.questId);
    const others = action.questChanges.filter((change) => change.questId !== quest.questId);
    for (const other of others) {
      if (
        other.state === "objectives-complete" ||
        own.some((change) => change.state === "objectives-complete")
      )
        return null;
      const related = catalog.get(other.questId);
      if (!related) return null;
      const givers = other.state === "accepted" ? related.starts : related.ends;
      if (
        !own.every((change) =>
          sameGiverVisit(
            change.state === "accepted" ? quest.starts : quest.ends,
            givers,
            allowNearbyGivers,
          ),
        )
      )
        return null;
    }
  }
  return actions.map((action) => {
    const changes = action.questChanges.filter((change) => change.questId === quest.questId);
    const removed = action.questChanges.filter((change) => change.questId !== quest.questId);
    return {
      ...action,
      questChanges: changes,
      ...(removed.some((change) => change.state === "accepted") &&
      !changes.some((change) => change.state === "accepted")
        ? { requiredQuestIds: [] }
        : {}),
      title: changes
        .map(
          (change) =>
            `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
        )
        .join(" · "),
      instructions: action.instructions.filter(
        (line) =>
          !removed.some((change) => line === phaseInstruction(change)) ||
          changes.some((change) => line === phaseInstruction(change)),
      ).map((line) => /^She may be dead or busy fighting Stitches.*consider grinding/.test(line)
        ? "If Stitches has killed the quest giver, wait for them to respawn before continuing."
        : line),
    };
  });
}
