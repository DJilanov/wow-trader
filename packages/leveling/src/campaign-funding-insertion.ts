import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";
import type { CampaignFundingState } from "./campaign-funding-scenarios.js";
import { campaignActionZones } from "./campaign-geography.js";

interface EarlierVisitOptions {
  readonly state: CampaignFundingState;
  readonly minimumIndex: number;
  readonly targetLevel: number;
  readonly safePickupQuestIds?: ReadonlySet<number>;
}

function sourceStepKey(action: CampaignAction): string | null {
  return action.source ? JSON.stringify([action.source.chapterId, action.source.version, action.source.stepId]) : null;
}

function completedNpcExchange(
  actions: readonly CampaignAction[],
  index: number,
  safePickupQuestIds: ReadonlySet<number> | undefined,
  sourceSteps: ReadonlyMap<string, readonly number[]>,
): readonly CampaignAction[] | null {
  const action = actions[index]!;
  const key = sourceStepKey(action), occurrences = key ? sourceSteps.get(key) : undefined;
  if (key && (!occurrences || occurrences.at(-1) !== index ||
    occurrences.some((at, offset) => at !== occurrences[0]! + offset))) return null;
  const start = occurrences?.[0] ?? index;
  const exchange = actions.slice(start, index + 1);
  if (exchange.some((entry) => entry.legId !== action.legId || entry.kind !== "quests" ||
    entry.leaderOnly || entry.raidOnly || entry.bundleId || entry.dungeonFinishOnly ||
    entry.location?.insideDungeon || entry.nativeUtilityTags?.length || !entry.questChanges.length)) return null;
  const phases = exchange.flatMap((entry) => entry.questChanges);
  return phases.some((change) => change.state === "rewarded") && phases.every((change) =>
    change.state === "rewarded" || (action.source && change.state === "accepted" &&
      safePickupQuestIds?.has(change.questId))) ? exchange : null;
}

function earlierVisits(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  gate: CampaignAction,
  options: EarlierVisitOptions,
): readonly CampaignAction[] {
  if (!plan.sharedQuestsOnly || gate.leaderOnly) return [];
  const active = new Set(options.state.actions.map((action) => action.id));
  const activeActions = plan.actions.filter((action) => active.has(action.id));
  const nextActive = new Map(activeActions.map((action, index) => [action.id, activeActions[index + 1]]));
  const sourceSteps = new Map<string, number[]>();
  for (const [index, action] of plan.actions.entries()) {
    const key = sourceStepKey(action);
    if (key && active.has(action.id)) sourceSteps.set(key, [...(sourceSteps.get(key) ?? []), index]);
  }
  const levels = new Map<string, Map<number, number>>();
  for (const section of options.state.forecast)
    for (const [player, member] of section.members.entries())
      for (const step of member.steps) {
        if (step.status !== "projected" || !step.after) continue;
        const members = levels.get(step.actionId) ?? new Map<number, number>();
        members.set(player, step.after.level);
        levels.set(step.actionId, members);
      }
  const profile = campaignPlanSourceProfile(plan);
  const latest = new Map<string, CampaignAction>();
  const earliest = new Map<string, CampaignAction>();
  const index = plan.actions.findIndex((action) => action.id === gate.id);
  for (let at = index - 1; at >= options.minimumIndex - 1 && at >= 0; at--) {
    const action = plan.actions[at]!;
    const next = nextActive.get(action.id);
    const leg = plan.legs.find((entry) => entry.id === action.legId);
    const nextLeg = next ? plan.legs.find((entry) => entry.id === next.legId) : undefined;
    const bars = levels.get(action.id);
    const zones = campaignActionZones(action);
    const exchange = completedNpcExchange(plan.actions, at, options.safePickupQuestIds, sourceSteps);
    if (!next || !leg || !nextLeg || !["preparation", "xp-bridge"].includes(leg.kind) ||
      !["preparation", "xp-bridge"].includes(nextLeg.kind) || next.location?.insideDungeon ||
      action.kind !== "quests" || action.leaderOnly || action.raidOnly || action.bundleId ||
      action.dungeonFinishOnly || action.location?.insideDungeon || action.nativeUtilityTags?.length ||
      !exchange || exchange.some((entry) => campaignActionZones(entry).length !== 1 ||
        campaignActionZones(entry)[0] !== zones[0]) ||
      zones.length !== 1 || !bars || bars.size !== 5 ||
      Math.min(...bars.values()) < options.targetLevel - 4) continue;
    if (action.source) {
      const source = sources.find(({ guide }) => guide.chapterId === action.source!.chapterId &&
        guide.version === action.source!.version && guide.targetBuild === plan.targetBuild);
      const step = source?.guide.steps.find((entry) => entry.id === action.source!.stepId);
      if (!step) continue;
      const view = getGuideStepView({ ...step,
        directives: step.directives.filter((entry) => ![".group", ".solo"].includes(entry.tag)),
      }, profile, { dungeons: [] });
      if (view.condition !== "match" || view.conditionalDirectives.length || view.directives.some((entry) =>
        [".timer", ".use", ".cast", ".gossip", ".interact", ".hs", ".fly"].includes(entry.tag))) continue;
    }
    if (!latest.has(zones[0]!)) latest.set(zones[0]!, next);
    earliest.set(zones[0]!, next);
  }
  return [...latest.values(), ...earliest.values()];
}

/** Offer local departures and recent reached visits; the caller replays every complete proposal. */
export function fundingInsertionActions(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  gate: CampaignAction,
  earlier?: EarlierVisitOptions,
): readonly CampaignAction[] {
  const index = plan.actions.findIndex((action) => action.id === gate.id);
  if (index < 0) throw new Error("Funding checkpoint is absent from its route.");
  if (earlier && (!Number.isInteger(earlier.minimumIndex) || earlier.minimumIndex < 0 ||
    earlier.minimumIndex > plan.actions.length || !Number.isInteger(earlier.targetLevel) ||
    earlier.targetLevel < 1 || earlier.targetLevel > 60)) throw new Error("Invalid earlier funding visit bounds.");
  const profile = campaignPlanSourceProfile(plan);
  const active = earlier ? new Set(earlier.state.actions.map((action) => action.id)) : null;
  const result = [gate];
  for (let at = index - 1; at >= 0; at--) {
    const action = plan.actions[at]!;
    if (action.legId !== gate.legId || action.kind === "xp-check" || action.kind === "checkpoint")
      break;
    if (
      action.leaderOnly !== gate.leaderOnly ||
      action.kind !== "instructions" ||
      action.questChanges.length ||
      !action.source
    )
      continue;
    if (
      action.nativeUtilityTags &&
      !action.nativeUtilityTags.some((tag) => [".hs", ".fly"].includes(tag))
    )
      continue;
    const source = sources.find(
      (entry) =>
        entry.guide.chapterId === action.source!.chapterId &&
        entry.guide.version === action.source!.version &&
        entry.guide.targetBuild === plan.targetBuild,
    );
    const step = source?.guide.steps.find((entry) => entry.id === action.source!.stepId);
    if (!step) continue;
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter((entry) => ![".group", ".solo"].includes(entry.tag)),
      },
      profile,
      { dungeons: [] },
    );
    if (
      view.condition === "match" &&
      view.directives.some((entry) => [".hs", ".fly"].includes(entry.tag))
    ) {
      result.push(action);
      break;
    }
  }
  return [...new Map([...result, ...(earlier ? earlierVisits(plan, sources, gate, earlier) : [])]
    .filter((action) => !earlier || (plan.actions.indexOf(action) >= earlier.minimumIndex && active!.has(action.id)))
    .map((action) => [action.id, action])).values()];
}
