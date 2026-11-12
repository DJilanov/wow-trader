import type { CampaignAction } from "./campaign.js";
import type { GuideStepView } from "./guide-archive.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";

export interface CapturedNpcPickupApproach {
  readonly actionId: string;
  readonly npcId: number;
  readonly npcName: string;
  readonly positions: CampaignAction["positions"];
}

/** Reuse an immediately preceding prerequisite hand-in at the same named NPC. */
export function capturedNpcPickupApproach(
  action: CampaignAction,
  current: GuideStepView,
  previous: GuideStepView | undefined,
  quest: QuestCatalogEntry,
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
): CapturedNpcPickupApproach | null {
  if (
    !action.source ||
    action.positions.length ||
    action.questChanges.length !== 1 ||
    action.questChanges[0]!.state !== "accepted" ||
    action.questChanges[0]!.questId !== quest.questId ||
    current.condition !== "match" ||
    current.conditionalDirectives.length ||
    !previous ||
    previous.condition !== "match" ||
    previous.conditionalDirectives.length ||
    previous.optional
  )
    return null;
  const targets = (view: GuideStepView): Set<string> =>
    new Set(
      view.directives
        .filter((row) => row.tag === ".target")
        .map((row) => row.arguments.trim().toLowerCase()),
    );
  const named = targets(current),
    priorNames = targets(previous);
  if (named.size !== 1 || priorNames.size !== 1 || !priorNames.has([...named][0]!)) return null;
  const givers = quest.starts.filter(
    (npc) => npc.friendlyToAlliance && npc.positions.length && named.has(npc.name.toLowerCase()),
  );
  if (givers.length !== 1) return null;
  const giver = givers[0]!;
  const parents = new Set([
    ...quest.prerequisites.allOf,
    ...quest.prerequisites.anyOf,
    ...(action.requiredQuestIds ?? []),
  ]);
  const returned = previous.directives.filter((row) => row.tag === ".turnin");
  if (
    !returned.length ||
    returned.some(
      (row) =>
        row.questId === null ||
        !parents.has(row.questId) ||
        !catalog
          .get(row.questId)
          ?.ends.some((npc) => npc.npcId === giver.npcId && npc.friendlyToAlliance),
    )
  )
    return null;
  const returnedIds = new Set(returned.map((row) => row.questId!));
  if (
    previous.directives.some((row) => {
      if ([".isQuestComplete", ".isOnQuest"].includes(row.tag))
        return !/^\d+$/.test(row.arguments.trim()) || !returnedIds.has(Number(row.arguments));
      return !["text", "marker", ".goto", ".target", ".turnin"].includes(row.tag);
    })
  )
    return null;
  const positions = previous.directives.flatMap((row) =>
    row.tag === ".goto" && row.position
      ? [{ sourceLine: row.sourceLine, position: row.position }]
      : [],
  );
  if (positions.length !== 1) return null;
  const point = positions[0]!.position;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    (point.space !== "world" && ![point.x, point.y].every((value) => value >= 0 && value <= 100)) ||
    !giver.positions.some(
      (position) =>
        campaignZoneId(position.zone) !== null &&
        campaignZoneId(position.zone) === campaignZoneId(point.zone),
    )
  )
    return null;
  return { actionId: action.id, npcId: giver.npcId, npcName: giver.name, positions };
}
