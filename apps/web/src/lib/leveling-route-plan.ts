import {
  activeCampaignActions,
  emptyPremadeProgress,
  currentCampaignAction,
  campaignSectionFor,
  campaignSectionActions,
  campaignSections,
  getLevelingRace,
  type CampaignAction,
  type CampaignPlan,
  type CharacterProfile,
  type ClassSlug,
  type Faction,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { levelingDashboardPath } from "./leveling-experience";

export type LevelingRouteMode = "questing" | "premade";
export const CAMPAIGN_CHAPTER_PREFIX = "premade-";

export function levelingRouteMode(
  requested: string | undefined,
  faction: Faction,
): LevelingRouteMode {
  if (faction !== "alliance") return "questing";
  if (requested === "questing" || requested === "premade") return requested;
  // Setup and resume links select solo explicitly; bare race URLs show the revised review route.
  return "premade";
}

export function levelingPlanDashboardPath(
  profile: CharacterProfile,
  mode: LevelingRouteMode = profile.faction === "alliance" && profile.party.size === 5
    ? "premade"
    : "questing",
): string {
  const params = new URLSearchParams({ plan: profile.faction === "alliance" ? mode : "questing" });
  if (profile.classSlug) params.set("class", profile.classSlug);
  return `${levelingDashboardPath(profile)}?${params}`;
}

export function campaignLeaderClass(
  profile: CharacterProfile,
  requested: string | string[] | undefined,
): ClassSlug | null {
  return (
    getLevelingRace(profile.faction, profile.raceId)?.classes.find((slug) => slug === requested) ??
    null
  );
}

export function campaignChapterPath(
  plan: CampaignPlan,
  legId: string,
  actionId?: string,
  progress?: PremadeProgress,
): string {
  const chapter = campaignSectionFor(plan, legId, progress);
  if (!chapter) throw new Error("Unknown route chapter.");
  const batchAction =
    actionId &&
    chapter.legIds.some((id) => {
      const batch = plan.catchUpBatches?.find((entry) =>
        entry.actions.some((action) => `${id}-${action.id}` === actionId),
      );
      return (
        batch !== undefined &&
        activeCampaignActions(plan, {
          ...(progress ?? emptyPremadeProgress()),
          selectedBatches: { ...progress?.selectedBatches, [id]: [batch.id] },
        }).some((action) => action.id === actionId)
      );
    });
  if (actionId && !chapter.actionIds.includes(actionId) && !batchAction)
    throw new Error("Step does not belong to this route chapter.");
  const params = new URLSearchParams({ plan: "premade" });
  if (plan.leaderClass) params.set("class", plan.leaderClass);
  return `/forever/leveling/routes/alliance-${plan.race}/chapters/${CAMPAIGN_CHAPTER_PREFIX}${chapter.id}?${params}${actionId ? `#campaign-${actionId}` : ""}`;
}

export function campaignChapterAction(
  plan: CampaignPlan,
  progress: PremadeProgress,
  legId: string,
  previewId: string | null = null,
): CampaignAction | null {
  const chapter = campaignSectionFor(plan, legId, progress);
  if (!chapter) return null;
  const actions = campaignSectionActions(plan, chapter, activeCampaignActions(plan, progress));
  const current = currentCampaignAction(plan, progress);
  const hasSelection =
    progress.campaigns[plan.release]?.selectedActionId !== null &&
    progress.campaigns[plan.release]?.selectedActionId !== undefined;
  return (
    actions.find((action) => action.id === previewId) ??
    (hasSelection && (legId === chapter.id || current.legId === legId)
      ? actions.find((action) => action.id === current.id)
      : undefined) ??
    actions.find((action) => action.legId === legId) ??
    actions[0] ??
    null
  );
}

/** The final starter used to share the first party chapter URL; migrate only that known old scope. */
export function campaignLegacyStarterPath(
  plan: CampaignPlan,
  progress: PremadeProgress,
  requestedChapterId: string,
  actionId: string,
): string | null {
  const starters = plan.legs.filter((leg) => leg.kind === "starter");
  const lastStarter = starters.at(-1);
  const firstShared = campaignSections(plan, progress).find(
    (section) => section.kind !== "starter",
  );
  if (!lastStarter || firstShared?.id !== requestedChapterId) return null;
  const action = activeCampaignActions(plan, progress).find(
    (entry) => entry.id === actionId && entry.legId === lastStarter.id,
  );
  return action ? campaignChapterPath(plan, action.legId, action.id, progress) : null;
}

/** Removed XP reminders can point across a chapter boundary to the next real task. */
export function campaignLegacyXpPath(
  plan: CampaignPlan,
  progress: PremadeProgress,
  requestedChapterId: string,
  oldActionId: string,
): string | null {
  if (!oldActionId.endsWith("-entry-xp") && !oldActionId.startsWith("library-level-gate-"))
    return null;
  const targetId = plan.bookmarkAliases?.[oldActionId];
  if (!targetId) return null;
  const action = activeCampaignActions(plan, progress).find((entry) => entry.id === targetId);
  if (!action || campaignSectionFor(plan, action.legId, progress)?.id === requestedChapterId)
    return null;
  return campaignChapterPath(plan, action.legId, action.id, progress);
}
