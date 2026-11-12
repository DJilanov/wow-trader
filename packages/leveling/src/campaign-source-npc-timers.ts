import type { CampaignAction } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";

export interface SourceNpcHandoffWait {
  readonly parentId: number;
  readonly childId: number;
  readonly npcId: number;
  readonly npcName: string;
  readonly seconds: number;
}

/** Read an ordered hand-in, NPC wait and dependent pickup from a resolved source view. */
export function capturedSourceNpcHandoffWait(
  directives: readonly ImportedDirective[],
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
): SourceNpcHandoffWait | null {
  const returns = directives.filter((row) => row.tag === ".turnin");
  const pickups = directives.filter((row) => row.tag === ".accept");
  const timers = directives.filter((row) => row.tag === ".timer");
  if (returns.length !== 1 || pickups.length !== 1 || timers.length !== 1) return null;
  const parent = catalog.get(returns[0]!.questId ?? 0);
  const child = catalog.get(pickups[0]!.questId ?? 0);
  const timer = timers[0]!;
  const amount = /^([1-9]\d{0,2})(?:,[^\r\n]*)?$/.exec(timer.arguments.trim());
  if (!parent || !child || !amount || Number(amount[1]) > 300) return null;
  if (
    ![...child.prerequisites.allOf, ...child.prerequisites.anyOf].includes(parent.questId) ||
    directives.indexOf(returns[0]!) >= directives.indexOf(timer) ||
    directives.indexOf(timer) >= directives.indexOf(pickups[0]!)
  )
    return null;
  const names = new Set(directives.filter((row) => row.tag === ".target")
    .map((row) => row.arguments.trim().toLowerCase()));
  const positions = directives.flatMap((row) => row.position ?? []);
  const givers = child.starts.filter((npc) =>
    names.size === 1 && names.has(npc.name.toLowerCase()) && npc.friendlyToAlliance &&
    parent.ends.some((recipient) => recipient.npcId === npc.npcId && recipient.friendlyToAlliance) &&
    npc.positions.some((point) => positions.some((position) =>
      campaignZoneId(point.zone) !== null &&
      campaignZoneId(point.zone) === campaignZoneId(position.zone),
    )),
  );
  if (givers.length !== 1) return null;
  return { parentId: parent.questId, childId: child.questId, npcId: givers[0]!.npcId,
    npcName: givers[0]!.name, seconds: Number(amount[1]) };
}

export function isCapturedSourceNpcTimer(
  action: CampaignAction,
  directive: ImportedDirective,
  directives: readonly ImportedDirective[],
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
): boolean {
  if (!action.source || directive.tag !== ".timer" || action.questChanges.length !== 1 ||
    directives.find((row) => row.tag === ".timer") !== directive) return false;
  const wait = capturedSourceNpcHandoffWait(directives, catalog);
  if (!wait) return false;
  const change = action.questChanges[0]!;
  return (
    ((change.state === "rewarded" && change.questId === wait.parentId) ||
      (change.state === "accepted" && change.questId === wait.childId)) &&
    action.positions.some(({ position }) => directives.some(({ position: captured }) =>
      captured && campaignZoneId(captured.zone) !== null &&
      campaignZoneId(captured.zone) === campaignZoneId(position.zone) &&
      captured.space === position.space && captured.floor === position.floor &&
      captured.x === position.x && captured.y === position.y,
    ))
  );
}
