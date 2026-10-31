import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { PREMADE_STOPS } from "./premade.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";

/** Replace generic manual task text with the matching, eligible archive quest phase. */
export function attachCampaignDungeonSources(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const visits = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const tags = DUNGEON_VISITS.filter((visit) => visits.has(visit.id)).flatMap(
    (visit) => visit.sourceTag ?? [],
  );
  const library = new Map(
    buildCampaignQuestLibrary(
      sources,
      createCampaignSourceProfile(plan.race, plan.leaderClass),
      tags,
    ).map((quest) => [quest.questId, quest]),
  );
  return {
    ...plan,
    actions: plan.actions.map((action): CampaignAction => {
      if (action.source || action.questChanges.length !== 1) return action;
      const change = action.questChanges[0]!;
      const quest = campaignDungeonQuest(change.questId);
      if (!quest) return action;
      const phases =
        library
          .get(change.questId)
          ?.actions.filter((entry) =>
            entry.questChanges.some((phase) => phase.state === change.state),
          ) ?? [];
      if (!phases.length) return action;
      const described =
        change.state === "accepted"
          ? quest.pickup
          : change.state === "rewarded"
            ? quest.turnin
            : quest.objective;
      return {
        ...action,
        instructions: described
          ? action.instructions
          : [...new Set(phases.flatMap((entry) => entry.instructions))],
        positions: action.positions.length
          ? action.positions
          : phases.flatMap((entry) => entry.positions),
        questChanges:
          change.state === "objectives-complete"
            ? [
                ...new Map(
                  phases
                    .flatMap((entry) => entry.questChanges)
                    .filter(
                      (phase) => phase.questId === change.questId && phase.state === change.state,
                    )
                    .map((phase) => [
                      phase.objectiveIndex,
                      { ...change, objectiveIndex: phase.objectiveIndex },
                    ]),
                ).values(),
              ]
            : action.questChanges,
      };
    }),
  };
}
