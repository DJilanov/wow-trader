import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { eligibleCampaignLibrarySource } from "./campaign-library-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignZoneId } from "./campaign-geography.js";

import {
  capturedSourceNpcHandoffWait,
  type SourceNpcHandoffWait as NpcHandoffWait,
} from "./campaign-source-npc-timers.js";

const supportedTags = new Set([
  "text",
  "marker",
  ".goto",
  ".target",
  ".turnin",
  ".accept",
  ".timer",
  "#xprate",
]);

function capturedWaits(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  catalog: QuestCatalog,
): readonly NpcHandoffWait[] {
  const profile = campaignPlanSourceProfile(plan);
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const candidates = new Map<string, NpcHandoffWait[]>();
  for (const input of sources) {
    if (input.guide.targetBuild !== plan.targetBuild) continue;
    const selected = eligibleCampaignLibrarySource(input, profile, plan.sharedQuestsOnly === true);
    if (!selected) continue;
    for (const step of selected.source.guide.steps) {
      const view = getGuideStepView(step, profile, { dungeons: [] });
      if (
        view.condition !== "match" ||
        view.optional ||
        view.conditionalDirectives.length ||
        view.directives.some(
          (row) =>
            !supportedTags.has(row.tag) &&
            !(row.tag === "#season" && row.arguments.trim() === "0" && !row.condition.trim()),
        )
      )
        continue;
      const wait = capturedSourceNpcHandoffWait(view.directives, quests);
      if (!wait) continue;
      const key = `${wait.parentId}/${wait.childId}/${wait.npcId}`;
      candidates.set(key, [...(candidates.get(key) ?? []), wait]);
    }
  }
  return [...candidates.values()].flatMap((rows) =>
    new Set(rows.map((row) => row.seconds)).size === 1 ? [rows[0]!] : [],
  );
}

function samePlace(left: CampaignAction, right: CampaignAction): boolean {
  return left.positions.some(({ position: point }) =>
    right.positions.some(
      ({ position }) =>
        campaignZoneId(point.zone) !== null &&
        campaignZoneId(point.zone) === campaignZoneId(position.zone) &&
        point.space === position.space &&
        point.floor === position.floor &&
        point.x === position.x &&
        point.y === position.y,
    ),
  );
}

/** Explain an evidenced NPC delay without replacing the addon's actual quest-availability check. */
export function attachCampaignNpcWaits(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256
  )
    return plan;
  const waits = capturedWaits(plan, sources, catalog);
  if (!waits.length) return plan;
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  let changed = false;
  let previousQuestIndex = -1;
  const actions = plan.actions.map((action, index) => {
    const previousIndex = previousQuestIndex;
    if (action.questChanges.length) previousQuestIndex = index;
    if (action.source || action.questChanges.length !== 1) return action;
    const pickup = action.questChanges[0]!;
    if (pickup.state !== "accepted") return action;
    const previous = plan.actions[previousIndex];
    if (!previous || previous.questChanges.length !== 1 || !samePlace(previous, action))
      return action;
    if (
      plan.actions
        .slice(previousIndex + 1, index)
        .some((entry) => entry.positions.length && !samePlace(entry, action))
    )
      return action;
    const returned = previous.questChanges[0]!;
    if (returned.state !== "rewarded") return action;
    const wait = waits.find(
      (row) => row.parentId === returned.questId && row.childId === pickup.questId,
    );
    if (!wait) return action;
    const giver = quests.get(pickup.questId)!.starts.find((npc) => npc.npcId === wait.npcId)!;
    if (
      !giver.positions.some((point) =>
        action.positions.some(
          ({ position }) =>
            campaignZoneId(point.zone) !== null &&
            campaignZoneId(point.zone) === campaignZoneId(position.zone),
        ),
      )
    )
      return action;
    const instruction = `After turning in ${quests.get(wait.parentId)!.title}, stay with ${wait.npcName} for about ${wait.seconds} seconds. Accept ${pickup.title} when the quest becomes available.`;
    if (action.instructions.includes(instruction)) return action;
    changed = true;
    return { ...action, instructions: [...action.instructions, instruction] };
  });
  return changed ? { ...plan, actions } : plan;
}
