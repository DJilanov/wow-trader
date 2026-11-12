import type { CampaignAction } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";
import { hasUnrestrictedQuestAccess, type QuestCatalogEntry } from "./quest-catalog.js";
import { guaranteedQuestPrerequisites } from "./quest-prerequisite-closure.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";
import {
  campaignSourceCheckMap,
  createCampaignSourceConditions,
  matchesCampaignSourcePhase,
} from "./campaign-source-conditions.js";
import { capturedQuestNpc } from "./campaign-source-endpoints.js";

const dialogueTags: ReadonlySet<string> = new Set([
  "text", "marker", ".accept", ".turnin", ".target", ".goto", ".waypoint", ".line",
  ".group", ".solo", ".xp", ".maxlevel", "#label", "#requires", "#completewith",
  "#sticky", "#loop", "#optional", "#xprate", ...CAMPAIGN_QUEST_GUARDS,
]);

/** Scope a co-quest's NPC display guard exactly as the model and native split step already do. */
export function isUnselectedNpcQuestGuard(
  action: CampaignAction,
  guard: ImportedDirective,
  directives: readonly ImportedDirective[],
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
): boolean {
  const change = action.questChanges[0];
  if (
    !action.source || action.kind !== "quests" || action.questChanges.length !== 1 ||
    !change || !["accepted", "rewarded"].includes(change.state) ||
    !directives.includes(guard) || !CAMPAIGN_QUEST_GUARDS.has(guard.tag) ||
    !/^\d+$/.test(guard.arguments.trim()) ||
    directives.some((row) => !dialogueTags.has(row.tag) || row.condition.trim())
  ) return false;
  const quest = catalog.get(change.questId), guardedId = Number(guard.arguments);
  if (!quest || !hasUnrestrictedQuestAccess(quest) || !catalog.has(guardedId)) return false;
  const parents = guaranteedQuestPrerequisites(quest, catalog, action.requiredQuestIds ?? []);
  if (!parents || guardedId === quest.questId || parents.has(guardedId)) return false;
  const conditions = createCampaignSourceConditions(directives);
  if (
    !conditions || campaignSourceCheckMap(action, conditions).has(guard) ||
    !conditions.phases.some((row) => matchesCampaignSourcePhase(action, row))
  ) return false;
  const npc = capturedQuestNpc(action, directives,
    change.state === "accepted" ? quest.starts : quest.ends);
  if (!npc) return false;
  return conditions.phases.some((phase): boolean => {
    if (phase.questId === quest.questId || phase.questId === null) return false;
    const sibling = catalog.get(phase.questId);
    if (!sibling || !hasUnrestrictedQuestAccess({ ...sibling,
      unsupportedRequirements: sibling.unsupportedRequirements.filter((flag) =>
        flag !== "provided-item-interaction" && flag !== "unresolved-objective-text"),
    })) return false;
    const linked =
      ((guard.tag === ".isOnQuest" || guard.tag === ".isQuestComplete") &&
        phase.tag === ".turnin" && phase.questId === guardedId) ||
      ((guard.tag === ".isNotOnQuest" || guard.tag === ".isQuestAvailable") &&
        phase.tag === ".accept" && phase.questId === guardedId) ||
      (guard.tag === ".isQuestTurnedIn" && phase.tag === ".accept" &&
        [...sibling.prerequisites.allOf, ...sibling.prerequisites.anyOf].includes(guardedId));
    if (!linked) return false;
    const other = capturedQuestNpc(action, directives,
      phase.tag === ".accept" ? sibling.starts : sibling.ends);
    return other?.npcId === npc.npcId;
  });
}
