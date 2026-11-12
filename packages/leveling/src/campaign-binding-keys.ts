import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import {
  campaignFundingProgressAfter,
  campaignFundingStates,
  type CampaignFundingExecutor,
} from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { guidePartyScenario } from "./campaign-guide-party.js";

/** Take the captured binding-key follow-up while already at the Iridescent Shards. */
export function carryCampaignBindingKeys(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  catalog: QuestCatalog,
  statesForPlan: CampaignFundingExecutor = campaignFundingStates,
  lockedActionIds: ReadonlySet<string> = new Set(),
): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.targetBuild !== catalog.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256) return plan;
  const parents = plan.actions.filter((action) => action.questChanges.some((change) =>
    change.questId === 642 && change.state === "rewarded"));
  const pickups = plan.actions.filter((action) => action.questChanges.some((change) =>
    change.questId === 651 && change.state === "accepted"));
  const parent = parents[0], pickup = pickups[0];
  if (parents.length !== 1 || pickups.length !== 1 || !parent?.source || !pickup?.source ||
    parent.questChanges.length !== 1 || pickup.questChanges.length !== 1 ||
    [parent, pickup].some((action) => action.kind !== "quests" || action.leaderOnly ||
      action.raidOnly || action.xpOptional || action.bundleId || action.dungeonFinishOnly ||
      action.location?.insideDungeon || action.nativeUtilityTags?.length || lockedActionIds.has(action.id)) ||
    parent.source.chapterId !== pickup.source.chapterId || parent.source.version !== pickup.source.version ||
    parent.source.stepId !== pickup.source.stepId) return plan;
  const anchor = plan.actions.indexOf(parent), original = plan.actions.indexOf(pickup);
  if (original <= anchor + 1 || [parent, pickup].some((action) =>
    !plan.legs.some((leg) => leg.id === action.legId &&
      (leg.kind === "preparation" || leg.kind === "xp-bridge")))) return plan;
  const source = sources.find((entry) => entry.guide.chapterId === parent.source!.chapterId &&
    entry.guide.version === parent.source!.version && entry.guide.targetBuild === plan.targetBuild);
  const step = source?.guide.steps.find((entry) => entry.id === parent.source!.stepId);
  if (!step) return plan;
  const view = getGuideStepView(step, campaignPlanSourceProfile(plan), { dungeons: [] });
  const permitted = new Set(["text", ".goto", ".target", ".turnin", ".accept"]);
  const phases = view.directives.filter((directive) =>
    directive.tag === ".turnin" || directive.tag === ".accept");
  if (view.condition !== "match" || view.conditionalDirectives.length ||
    view.directives.some((directive) => !permitted.has(directive.tag)) || phases.length !== 2 ||
    phases[0]!.tag !== ".turnin" || phases[0]!.questId !== 642 ||
    phases[1]!.tag !== ".accept" || phases[1]!.questId !== 651) return plan;
  const positions = view.directives.flatMap((directive) => directive.position ? [directive.position] : []);
  if (positions.length !== 1 || [parent, pickup].some((action) => action.positions.length !== 1 ||
    JSON.stringify(action.positions[0]!.position) !== JSON.stringify(positions[0]))) return plan;
  const quest = catalog.quests.find((entry) => entry.questId === 651);
  if (!quest || quest.minimumLevel === null || quest.providedItem || quest.requiredClasses !== 0 ||
    (!quest.prerequisites.allOf.includes(642) && !quest.prerequisites.anyOf.includes(642))) return plan;
  const before = statesForPlan(plan);
  let reached = false;
  for (const state of before) {
    if (!state.actions.some((action) => action.id === parent.id)) continue;
    const progress = campaignFundingProgressAfter(state, parent.id);
    const known = progress.members.filter((member) => member.level !== null && member.currentXp !== null);
    if (!known.length) continue;
    if (known.length !== 5 || !state.actions.some((action) => action.id === pickup.id)) return plan;
    reached = true;
    if (known.some((member) => member.level! < quest.minimumLevel! ||
      member.questStates["642"] !== "rewarded" ||
      (member.questStates["651"] && member.questStates["651"] !== "not-started") ||
      [...quest.prerequisites.allOf, ...(pickup.requiredQuestIds ?? [])].some((id) =>
        member.questStates[String(id)] !== "rewarded") ||
      (quest.prerequisites.anyOf.length > 0 && !quest.prerequisites.anyOf.some((id) =>
        member.questStates[String(id)] === "rewarded")) ||
      quest.exclusiveWith.some((id) => member.questStates[String(id)] &&
        member.questStates[String(id)] !== "not-started"))) return plan;
  }
  if (!reached) return plan;
  const actions = plan.actions.flatMap((action) => action === pickup ? [] : action === parent
    ? [action, { ...pickup, legId: parent.legId }] : [action]);
  const proposed: CampaignPlan = { ...plan, actions, legs: plan.legs.map((leg) => ({ ...leg,
    actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    questIds: [...new Set(actions.filter((action) => action.legId === leg.id)
      .flatMap((action) => action.questChanges.map((change) => change.questId)))],
  })) };
  const after = statesForPlan(proposed);
  if (regressedFundingScenarios(plan, before, after).length || after.some((state, index) => {
    const originalIds = before[index]!.actions.map((action) => action.id).sort();
    if (JSON.stringify(state.actions.map((action) => action.id).sort()) !== JSON.stringify(originalIds)) return true;
    const party = guidePartyScenario(proposed, state.progress, state.starterMode);
    return auditCampaignQuestLog(party.plan, party.progress, party).some((member) => !member.withinCapacity);
  })) return plan;
  return proposed;
}
