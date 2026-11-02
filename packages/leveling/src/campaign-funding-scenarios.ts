import { activeCampaignActions, type CampaignAction, type CampaignPlan } from "./campaign.js";
import {
  guidePartyAnchors,
  guidePartyScenario,
  type GuideStarterPartyMode,
} from "./campaign-guide-party.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { getDungeonBundle } from "./dungeon-bundles.js";
import { updatePremadeDungeonBundle } from "./premade.js";
import {
  forecastCampaignXp,
  type CampaignXpCheckpoint,
  type CampaignXpSectionForecast,
} from "./campaign-xp.js";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import { campaignItemReport, campaignItemsForMember } from "./campaign-item-reports.js";
import type { CampaignItemRequirement } from "./campaign-items.js";
import type { CampaignXpBounds } from "./campaign-xp-bounds.js";
import { advanceCombatPosition } from "./combat-xp.js";

export interface CampaignFundingScenario {
  readonly difficultyPolicy: PremadeProgress["difficultyPolicy"];
  readonly starterMode: GuideStarterPartyMode;
  readonly strategy: PremadeProgress["dungeonFinish"]["strategy"];
  readonly optionalStops: boolean;
}

export interface CampaignFundingState extends CampaignFundingScenario {
  readonly sourceBuild?: number;
  readonly itemRequirements?: readonly CampaignItemRequirement[];
  readonly progress: PremadeProgress;
  readonly actions: readonly CampaignAction[];
  readonly forecast: readonly CampaignXpSectionForecast[];
}

export function campaignFundingScenarioKey(scenario: CampaignFundingScenario): string {
  return `${scenario.difficultyPolicy}/${scenario.starterMode}/${scenario.strategy}/${scenario.optionalStops}`;
}

export function campaignFundingCheckpoints(
  state: CampaignFundingState,
  player: number,
): readonly CampaignXpCheckpoint[] {
  return state.forecast.flatMap((section) => {
    const member = section.members[player]!;
    return [
      ...member.checkpoints,
      ...member.steps.flatMap((step): readonly CampaignXpCheckpoint[] =>
        step.phase === "accepted" &&
        step.status === "blocked" &&
        step.shortfallXp > 0 &&
        step.minimumLevel !== null
          ? [
              {
                actionId: step.actionId,
                targetLevel: step.minimumLevel,
                position: step.before,
                missingXp: step.shortfallXp,
                ready: false,
                planningOnly: false,
              },
            ]
          : [],
      ),
    ];
  });
}

export function campaignFundingStates(plan: CampaignPlan): readonly CampaignFundingState[] {
  const starterOnly = plan.legs.every((leg) => leg.kind === "starter");
  const states: CampaignFundingState[] = [];
  for (const difficultyPolicy of starterOnly
    ? (["at-level"] as const)
    : (["at-level", "experienced-premade"] as const))
    for (const starterMode of starterOnly
      ? (["separate"] as const)
      : (["separate", "together"] as const))
      for (const strategy of starterOnly
        ? (["dungeons"] as const)
        : (["dungeons", "mixed"] as const))
        for (const optionalStops of starterOnly ? [true] : [true, false]) {
          const base = emptyPremadeProgress();
          let progress: PremadeProgress = {
            ...base,
            difficultyPolicy,
            raidGoals: optionalStops,
            dungeonFinish: { ...base.dungeonFinish, strategy },
            members: base.members.map((member) => ({
              ...member,
              level: 1,
              currentXp: 0,
              xpNeedsUpdate: false,
            })),
          };
          if (!optionalStops)
            for (const leg of plan.legs) {
              if (!leg.bundleId) continue;
              const bundle = getDungeonBundle(leg.bundleId, "alliance");
              if (!bundle) throw new Error(`Unknown funding-scenario bundle: ${leg.bundleId}`);
              progress = updatePremadeDungeonBundle(progress, { ...bundle, included: false });
            }
          const scenario = { difficultyPolicy, starterMode, strategy, optionalStops };
          if (starterOnly) {
            states.push({
              ...scenario,
              sourceBuild: plan.targetBuild,
              ...(plan.itemRequirements ? { itemRequirements: plan.itemRequirements } : {}),
              progress,
              actions: activeCampaignActions(plan, progress),
              forecast: forecastCampaignXp(plan, progress),
            });
          } else {
            const party = guidePartyScenario(plan, progress, starterMode);
            states.push({
              ...scenario,
              sourceBuild: party.plan.targetBuild,
              ...(party.plan.itemRequirements
                ? { itemRequirements: party.plan.itemRequirements }
                : {}),
              progress: party.progress,
              actions: activeCampaignActions(party.plan, party.progress),
              forecast: forecastCampaignXp(
                party.plan,
                party.progress,
                guidePartyAnchors(party, []),
              ),
            });
          }
        }
  return states;
}

export function campaignFundingProgressBefore(
  state: CampaignFundingState,
  actionId: string,
): PremadeProgress {
  const order = new Map(state.actions.map((action, index) => [action.id, index]));
  const stop = order.get(actionId);
  if (stop === undefined) throw new Error("Funding checkpoint is absent from its forecast.");
  const itemIndex = indexCampaignItems(state.itemRequirements ?? []);
  return {
    ...state.progress,
    members: state.progress.members.map((member, index) => {
      const questStates = { ...member.questStates };
      const confirmations = { ...member.confirmations };
      let minimums: Readonly<Record<string, number>> | undefined =
        (state.itemRequirements?.length || member.itemHoldings) && state.sourceBuild !== undefined
          ? campaignItemsForMember(itemIndex, member, state.sourceBuild).snapshot()
          : undefined;
      let position: { readonly level: number; readonly currentXp: number } | null =
        member.level === null || member.currentXp === null || member.xpNeedsUpdate
          ? null
          : { level: member.level, currentXp: member.currentXp };
      for (const section of state.forecast) {
        for (const step of section.members[index]!.steps) {
          if ((order.get(step.actionId) ?? Infinity) >= stop) continue;
          if (step.status === "projected") {
            if (step.questId !== null) {
              questStates[String(step.questId)] = step.questStateAfter ?? step.phase;
              if (step.phase === "objectives-complete")
                confirmations[`campaign-objective-${step.questId}-${step.objectiveIndex ?? 1}`] =
                  true;
            } else if (step.phase === "items") {
              minimums = step.itemState.minimums;
              Object.assign(questStates, step.itemState.questStates);
              Object.assign(confirmations, step.itemState.confirmations);
            }
          }
          position = step.after;
          if (position === null) break;
        }
        if (position === null) break;
      }
      return {
        ...member,
        level: position?.level ?? null,
        currentXp: position?.currentXp ?? null,
        xpNeedsUpdate: position === null,
        questStates,
        confirmations,
        ...(minimums && state.sourceBuild !== undefined
          ? {
              itemHoldings: campaignItemReport(
                new CampaignItemLedger(itemIndex, {}, minimums),
                { ...member, questStates, confirmations },
                state.sourceBuild,
              ),
            }
          : {}),
      };
    }),
  };
}

/** Preserve hypothetical intervals alongside reconstructed progress; minimum bars are not observations. */
export function campaignFundingXpBoundsBefore(
  state: CampaignFundingState,
  actionId: string,
): readonly (CampaignXpBounds | null)[] {
  const order = new Map(state.actions.map((action, index) => [action.id, index]));
  const stop = order.get(actionId);
  if (stop === undefined) throw new Error("Funding checkpoint is absent from its forecast.");
  return state.progress.members.map((member, player) => {
    let bounds: CampaignXpBounds | null =
      member.level === null || member.currentXp === null || member.xpNeedsUpdate
        ? null
        : {
            minimum: { level: member.level, currentXp: member.currentXp },
            maximum: { level: member.level, currentXp: member.currentXp },
          };
    for (const section of state.forecast)
      for (const step of section.members[player]!.steps) {
        if ((order.get(step.actionId) ?? Infinity) >= stop) continue;
        if (!step.after) return null;
        if (step.xpBounds) bounds = step.xpBounds.after;
        else if (
          bounds &&
          bounds.minimum.level === step.before.level &&
          bounds.minimum.currentXp === step.before.currentXp
        )
          bounds = {
            minimum: step.after,
            maximum: advanceCombatPosition(bounds.maximum, step.questXp + step.combatXp),
          };
        else return null;
        if (!bounds) return null;
      }
    return bounds;
  });
}
