import type { CampaignAction } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";

export const CAMPAIGN_QUEST_GUARDS: ReadonlySet<string> = new Set([
  ".isOnQuest",
  ".isNotOnQuest",
  ".isQuestTurnedIn",
  ".isQuestComplete",
  ".isQuestNotComplete",
  ".isQuestAvailable",
]);

/** A split follow-up runs after the source NPC's prerequisite hand-in, not while it is still held. */
export function normalizeQuestPickupGuard(
  directive: ImportedDirective,
  action: CampaignAction,
  source: readonly ImportedDirective[],
): ImportedDirective {
  if (directive.tag !== ".isQuestComplete" || !/^\d+$/.test(directive.arguments.trim()))
    return directive;
  const parent = Number(directive.arguments);
  if (
    !action.requiredQuestIds?.includes(parent) ||
    action.questChanges.some((change) => change.questId === parent && change.state === "rewarded")
  )
    return directive;
  const handIn = source.findIndex((entry) => entry.tag === ".turnin" && entry.questId === parent);
  const pickup = source.findIndex(
    (entry) =>
      entry.tag === ".accept" &&
      action.questChanges.some(
        (change) => change.questId === entry.questId && change.state === "accepted",
      ),
  );
  return handIn >= 0 && pickup > handIn ? { ...directive, tag: ".isQuestTurnedIn" } : directive;
}

/** RXP completion guards require an active completed quest; availability means not yet turned in. */
export function freshQuestGuardSatisfied(
  directive: ImportedDirective,
  questId: number,
  phase: CampaignAction["questChanges"][number]["state"],
  prerequisites: ReadonlySet<number>,
): boolean {
  if (!/^\d+$/.test(directive.arguments.trim())) return false;
  const id = Number(directive.arguments),
    own = id === questId;
  if (!own && !prerequisites.has(id)) return false;
  const active = own && phase !== "accepted";
  const complete = own && phase === "rewarded";
  const turnedIn = !own;
  switch (directive.tag) {
    case ".isOnQuest":
      return active;
    case ".isNotOnQuest":
      return !active;
    case ".isQuestComplete":
      return active && complete;
    case ".isQuestNotComplete":
      return !(active && complete);
    case ".isQuestTurnedIn":
      return turnedIn;
    case ".isQuestAvailable":
      return !turnedIn;
    default:
      return false;
  }
}
