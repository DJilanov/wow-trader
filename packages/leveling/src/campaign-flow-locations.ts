import { chapterEligibility } from "./chapter-catalog.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignActionZones, campaignZoneId, campaignZoneInText } from "./campaign-geography.js";
import { PREMADE_STOPS } from "./premade.js";
import { campaignDungeonQuest as getPremadeQuest } from "./campaign-dungeon-reference.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { getCampaignReferenceQuest } from "./campaign-reference-quests.js";

const phases = new Map<string, CampaignAction["questChanges"][number]["state"]>([
  [".accept", "accepted"],
  [".complete", "objectives-complete"],
  [".turnin", "rewarded"],
]);

/** Project actual quest-phase locations, including city returns absent from the manual model. */
export function attachCampaignLocations(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const tags = DUNGEON_VISITS.filter((visit) => selected.has(visit.id)).flatMap(
    (visit) => visit.sourceTag ?? [],
  );
  const locations = new Map<string, Set<string>>();
  for (const source of sources) {
    if (chapterEligibility(source.reference, profile) !== "match") continue;
    let zone: string | null = null;
    for (const step of source.guide.steps) {
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter(
            (directive) => ![".group", ".solo"].includes(directive.tag),
          ),
        },
        profile,
        { dungeons: tags },
      );
      if (view.condition !== "match") continue;
      for (const directive of view.directives) {
        if (directive.position) zone = campaignZoneId(directive.position.zone);
        const phase = phases.get(directive.tag);
        if (!phase || !directive.questId || !zone) continue;
        const index =
          phase === "objectives-complete" ? Number(directive.arguments.split(",")[1] ?? 1) : 0;
        const key = `${directive.questId}:${phase}:${index}`;
        const seen = locations.get(key) ?? new Set<string>();
        seen.add(zone);
        locations.set(key, seen);
      }
    }
  }
  const actions = plan.actions.map((action): CampaignAction => {
    if (["checkpoint", "xp-check", "unverified"].includes(action.kind)) return action;
    const direct = campaignActionZones(action);
    const candidates = new Set(direct);
    if (!candidates.size)
      for (const change of action.questChanges) {
        const found = locations.get(
          `${change.questId}:${change.state}:${change.objectiveIndex ?? 0}`,
        );
        if (found?.size === 1) for (const zone of found) candidates.add(zone);
      }
    const leg = plan.legs.find((entry) => entry.id === action.legId);
    const stop = PREMADE_STOPS.find((entry) => entry.id === leg?.stopId);
    let inside = false;
    for (const change of action.questChanges) {
      const quest = getPremadeQuest(change.questId);
      const reference = getCampaignReferenceQuest(change.questId);
      if (!quest && !reference) continue;
      const core = stop?.quests.some((choice) => choice.questId === change.questId) === true;
      const text =
        change.state === "accepted"
          ? (quest?.pickup ?? reference?.pickup)
          : change.state === "rewarded"
            ? (quest?.turnin ?? reference?.turnin)
            : (quest?.objective ?? reference?.objective);
      const named = text ? campaignZoneInText(text) : null;
      if (!direct.length && named) {
        candidates.clear();
        candidates.add(named);
      }
      if (!candidates.size && stop && /near the dungeon entrance/i.test(text ?? "")) {
        const outer = campaignZoneId(stop.zone);
        if (outer) candidates.add(outer);
      }
      inside ||=
        Boolean(stop) &&
        ((change.state === "accepted" && quest?.pickupStage === "inside") ||
          (core && change.state === "objectives-complete" && quest?.objectiveStage === "inside") ||
          (change.state === "rewarded" && /\binside\b/i.test(quest?.turnin ?? "")));
    }
    if (inside && stop) {
      const outer = campaignZoneId(stop.zone);
      if (outer) return { ...action, location: { zone: outer, insideDungeon: stop.id } };
    }
    return candidates.size === 1 ? { ...action, location: { zone: [...candidates][0]! } } : action;
  });
  return { ...plan, actions };
}
