import { activeCampaignActions, currentCampaignAction, type CampaignPlan } from "./campaign.js";
import {
  campaignSections,
  campaignSectionTarget,
  type CampaignSection,
} from "./campaign-sections.js";
import {
  forecastCampaignXp,
  type CampaignXpSectionForecast,
  type XpPosition,
} from "./campaign-xp.js";
import {
  premadeProgressSchema,
  type PremadeProgress,
  type CampaignXpAnchor,
} from "./premade-model.js";
import { recordPremadeXp } from "./premade.js";
import { questEligibility } from "./quest-eligibility.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import {
  guidePartyScenario,
  guidePartyAnchors,
  type GuidePartyScenario,
} from "./campaign-guide-party.js";

export interface CampaignGuideSection {
  readonly chapter: CampaignSection;
  readonly targetLevel: number;
  readonly targetKind: "target" | "entry";
  readonly audience: "personal" | "party";
  readonly forecast: CampaignXpSectionForecast;
  readonly planned: CampaignXpSectionForecast;
  readonly basis: "route-start" | "saved-update";
  readonly missingCombat: boolean;
  readonly assumedStarterPlayers: readonly number[];
  readonly unavailableStarterPlayers: readonly number[];
}
export interface CampaignGuideForecast {
  readonly sections: readonly CampaignGuideSection[];
  readonly startingLevel: number;
  readonly recordedPlayers: readonly number[];
}

interface GuideCache {
  readonly scenarios: Map<string, GuidePartyScenario>;
  readonly plans: Map<string, readonly CampaignXpSectionForecast[]>;
  readonly forecasts: Map<string, CampaignGuideForecast>;
}
const cache = new WeakMap<CampaignPlan, GuideCache>();
function retain<T>(entries: Map<string, T>, key: string, value: T): T {
  if (entries.size >= 4) entries.delete(entries.keys().next().value!);
  entries.set(key, value);
  return value;
}

function validBar(value: XpPosition): boolean {
  return (
    Number.isInteger(value.level) &&
    value.level >= 1 &&
    value.level <= 60 &&
    Number.isInteger(value.currentXp) &&
    value.currentXp >= 0 &&
    (value.level === 60 ? value.currentXp === 0 : value.currentXp < FOREVER_XP_CURVE[value.level]!)
  );
}

export function recordCampaignGuideXp(
  plan: CampaignPlan,
  progress: PremadeProgress,
  playerIndex: number,
  level: number,
  currentXp: number,
  actionId: string,
): PremadeProgress {
  if (!activeCampaignActions(plan, progress).some((action) => action.id === actionId))
    throw new Error("Choose an active guide step before updating your XP.");
  const updated = recordPremadeXp(progress, playerIndex, level, currentXp);
  const member = updated.members[playerIndex]!;
  return premadeProgressSchema.parse({
    ...updated,
    members: updated.members.map((entry, index) =>
      index !== playerIndex
        ? entry
        : {
            ...entry,
            guideXpAnchor: {
              release: plan.release,
              actionId,
              level,
              currentXp,
              questStates: { ...member.questStates },
              confirmations: { ...member.confirmations },
              bundleSlotStates: { ...member.bundleSlotStates },
            },
          },
    ),
  });
}

/** One-time migration records where an existing fresh bar was being used; never invents a bar. */
export function initializeCampaignGuideAnchors(
  plan: CampaignPlan,
  progress: PremadeProgress,
): PremadeProgress {
  if (!plan.actions.length) return progress;
  let next = progress;
  const actionId = currentCampaignAction(plan, progress).id;
  for (const [index, member] of progress.members.entries()) {
    if (
      member.guideXpAnchor ||
      member.xpNeedsUpdate ||
      member.level === null ||
      member.currentXp === null ||
      !validBar({ level: member.level, currentXp: member.currentXp })
    )
      continue;
    next = recordCampaignGuideXp(plan, next, index, member.level, member.currentXp, actionId);
  }
  return next;
}

function starterTarget(
  plan: CampaignPlan,
  section: CampaignSection,
  planned: CampaignXpSectionForecast,
): number {
  const ids = new Set(section.actionIds);
  const minimums = plan.actions
    .filter((action) => ids.has(action.id))
    .flatMap((action) =>
      action.questChanges
        .filter((change) => change.state === "accepted")
        .map(
          (change) => questEligibility(change.questId, plan.rewardFacts ?? []).minimumLevel ?? 1,
        ),
    );
  const member = planned.members[0];
  const calculated =
    member?.endpoint && member.steps.length
      ? Math.min(60, member.endpoint.level + (member.endpoint.currentXp > 0 ? 1 : 0))
      : section.to;
  return Math.max(1, calculated, ...minimums);
}

/** A continuous player-facing plan. The strict actual-XP calculator and saved reports stay separate. */
export function forecastCampaignGuide(
  plan: CampaignPlan,
  progress: PremadeProgress,
  options: { readonly startingLevel?: number } = {},
): CampaignGuideForecast {
  const startingLevel = options.startingLevel ?? 1;
  if (!validBar({ level: startingLevel, currentXp: 0 }))
    throw new Error("Invalid guide starting level.");
  const sections = campaignSections(plan, progress);
  if (!sections.length) return { sections: [], startingLevel, recordedPlayers: [] };
  const model: PremadeProgress = {
    ...progress,
    members: progress.members.map((member) => ({
      ...member,
      level: startingLevel,
      currentXp: 0,
      xpNeedsUpdate: false,
      questStates: {},
      confirmations: {},
      bundleSlotStates: {},
    })),
  };
  // Bookmarks, actual reports and UI timing do not change a route-start forecast.
  // Keep at most four configurations per immutable plan; discarded plans are collectable.
  const configuration = JSON.stringify({
    ...model,
    campaigns: {},
    stages: {},
    timings: {},
    selectedStage: "prepare",
    selectedStopId: "thanes",
    members: model.members.map((member) => ({ ...member, guideXpAnchor: undefined })),
  });
  let currentCache = cache.get(plan);
  if (!currentCache) {
    currentCache = { scenarios: new Map(), plans: new Map(), forecasts: new Map() };
    cache.set(plan, currentCache);
  }
  const scenario =
    currentCache.scenarios.get(configuration) ??
    retain(currentCache.scenarios, configuration, guidePartyScenario(plan, model));
  const planned =
    currentCache.plans.get(configuration) ??
    retain(
      currentCache.plans,
      configuration,
      forecastCampaignXp(scenario.plan, scenario.progress, guidePartyAnchors(scenario, [])),
    );
  const active = activeCampaignActions(plan, progress);
  const order = new Map(active.map((action, index) => [action.id, index]));
  const migrated = initializeCampaignGuideAnchors(plan, progress);
  const anchors: (CampaignXpAnchor & { readonly player: number })[] = migrated.members.flatMap(
    (member, index) => {
      const anchor = member.guideXpAnchor;
      const actionId = anchor && (plan.bookmarkAliases?.[anchor.actionId] ?? anchor.actionId);
      return anchor &&
        actionId &&
        anchor.release === plan.release &&
        order.has(actionId) &&
        validBar(anchor) &&
        anchor.level === member.level &&
        anchor.currentXp === member.currentXp
        ? [{ ...anchor, actionId, player: index + 1 }]
        : [];
    },
  );
  const key = `${configuration}:${JSON.stringify(anchors)}`;
  const existing = currentCache.forecasts.get(key);
  if (existing) return existing;
  const forecast = anchors.length
    ? forecastCampaignXp(scenario.plan, scenario.progress, guidePartyAnchors(scenario, anchors))
    : planned;
  const plannedById = new Map(planned.map((section) => [section.sectionId, section]));
  const forecastById = new Map(forecast.map((section) => [section.sectionId, section]));
  return retain(currentCache.forecasts, key, {
    startingLevel,
    recordedPlayers: anchors.map((anchor) => anchor.player),
    sections: sections.map((chapter, index): CampaignGuideSection => {
      const end = Math.max(-1, ...chapter.actionIds.map((id) => order.get(id) ?? -1));
      const audience = chapter.kind === "starter" ? "personal" : "party";
      const relevantAnchors = anchors.filter(
        (anchor) =>
          (audience !== "personal" || anchor.player === 1) &&
          (order.get(anchor.actionId) ?? Infinity) <= end,
      );
      return {
        chapter,
        audience,
        targetKind: chapter.kind === "dungeon" ? "entry" : "target",
        targetLevel:
          chapter.kind === "starter"
            ? starterTarget(plan, chapter, plannedById.get(chapter.id)!)
            : campaignSectionTarget(sections, index, progress, plan.rewardFacts).level,
        forecast: forecastById.get(chapter.id)!,
        planned: plannedById.get(chapter.id)!,
        basis: relevantAnchors.length ? "saved-update" : "route-start",
        assumedStarterPlayers:
          audience === "party"
            ? scenario.assumedPlayers.filter(
                (player) => !relevantAnchors.some((anchor) => anchor.player === player),
              )
            : [],
        unavailableStarterPlayers:
          audience === "party"
            ? scenario.unavailablePlayers.filter(
                (player) => !relevantAnchors.some((anchor) => anchor.player === player),
              )
            : [],
        missingCombat:
          !plan.combat ||
          forecastById
            .get(chapter.id)!
            .members.some(
              (member) =>
                member.evidence.combat === "unresolved" ||
                member.combatRows.some((row) => row.basis === "unknown"),
            ),
      };
    }),
  });
}
