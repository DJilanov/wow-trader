import type { CampaignAction, CampaignQuestChange, CampaignSource } from "./campaign.js";
import type { CharacterProfile } from "./profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { CAMPAIGN_BRIDGES, CAMPAIGN_STARTER_COURIERS } from "./campaign-route.js";

export interface StarterCourierPhase {
  readonly questId: number;
  readonly state: CampaignQuestChange["state"];
  readonly targetLegId: string;
}

/** A reviewed deferral still requires a complete applicable courier in its replacement visit. */
export function campaignStarterCourierTargets(
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  dungeonTags: readonly string[],
): ReadonlyMap<number, string> {
  const targets = new Map<number, string>();
  for (const [identity, targetLegId] of Object.entries(CAMPAIGN_STARTER_COURIERS)) {
    const questId = Number(identity);
    const block = CAMPAIGN_BRIDGES.find((block) => block.id === targetLegId);
    if (!block || block.quests === "starter-source" || !block.quests.includes(questId)) continue;
    const complete = sources.some((source) => {
      if (!block.sourceIds.includes(source.reference.sourceId)) return false;
      const phases = source.guide.steps.flatMap((step) => {
        const view = getGuideStepView(step, profile, { dungeons: dungeonTags });
        return view.condition === "match"
          ? view.directives
              .filter((directive) => directive.questId === questId)
              .map((directive) => directive.tag)
          : [];
      });
      const pickup = phases.indexOf(".accept");
      return pickup >= 0 && phases.lastIndexOf(".turnin") > pickup && !phases.includes(".complete");
    });
    if (complete) targets.set(questId, targetLegId);
  }
  return targets;
}

/** A mixed source step retains its own bookmark; wholly deferred steps point at the later phase. */
export function campaignStarterCourierAliases(
  actions: readonly CampaignAction[],
  deferred: ReadonlyMap<string, readonly StarterCourierPhase[]>,
): readonly (readonly [string, string])[] {
  const present = new Set(actions.map((action) => action.id));
  return [...deferred].flatMap(([oldId, phases]) => {
    if (present.has(oldId)) return [];
    const target = actions.find(
      (action) =>
        !action.leaderOnly &&
        phases.some(
          (phase) =>
            action.legId === phase.targetLegId &&
            action.questChanges.some(
              (change) => change.questId === phase.questId && change.state === phase.state,
            ),
        ),
    );
    return target ? [[oldId, target.id] as const] : [];
  });
}
