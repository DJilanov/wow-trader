import type {
  CampaignAction,
  CampaignPlan,
  CampaignQuestChange,
  CampaignSource,
} from "./campaign.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { chapterEligibility } from "./chapter-catalog.js";
import { getGuideStepView, type ImportedDirective } from "./guide-archive.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";

type Phase = Pick<CampaignQuestChange, "questId" | "state" | "objectiveIndex">;

const movedLibraryQuestIds = new Set([631, 632]);
const earlyDesolaceQuestIds = new Set([1437, 1465, 1438, 1439, 1440]);
const movedSourceLegs = new Map([
  ["472:rewarded:0", ["excavation-approach", "dalaran-approach"]],
  ["631:accepted:0", ["dalaran-approach"]],
  ["631:rewarded:0", ["dalaran-approach"]],
  ["632:accepted:0", ["dalaran-approach"]],
  ["632:rewarded:0", ["dalaran-approach"]],
]);

function phaseKey(phase: Phase): string {
  return `${phase.questId}:${phase.state}:${phase.objectiveIndex ?? 0}`;
}

function sourcePhases(directives: readonly ImportedDirective[]): readonly Phase[] | null {
  const result: Phase[] = [];
  for (const directive of directives) {
    const state =
      directive.tag === ".accept"
        ? "accepted"
        : directive.tag === ".complete"
          ? "objectives-complete"
          : directive.tag === ".turnin"
            ? "rewarded"
            : null;
    if (state === null || directive.questId === null) continue;
    const objectiveIndex =
      state === "objectives-complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
    if (
      objectiveIndex !== null &&
      (!Number.isInteger(objectiveIndex) || objectiveIndex < 1 || objectiveIndex > 100)
    )
      return null;
    result.push({ questId: directive.questId, state, objectiveIndex });
  }
  return result;
}

function containsInOrder(action: CampaignAction, phases: readonly Phase[]): boolean {
  let next = 0;
  for (const change of action.questChanges)
    if (next < phases.length && phaseKey(change) === phaseKey(phases[next]!)) next++;
  return next === phases.length;
}

/** Preserve source links when equivalent steps are deduplicated or no longer need splitting. */
export function attachCampaignSourceBookmarkAliases(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const profile = campaignPlanSourceProfile(plan);
  const visits = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.flatMap((visit) =>
    visits.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  const actionIds = new Set(plan.actions.map((action) => action.id));
  const sharedQuestIds = new Set(plan.sharedSourceQuestIds ?? []);
  const phaseCounts = new Map<string, number>();
  for (const action of plan.actions)
    for (const key of new Set(action.questChanges.map(phaseKey)))
      phaseCounts.set(key, (phaseCounts.get(key) ?? 0) + 1);
  const aliases = { ...plan.bookmarkAliases };
  let changed = false;
  for (const leg of plan.legs) {
    const sourceIds = CAMPAIGN_BRIDGES.find((block) => block.id === leg.id)?.sourceIds ?? [];
    const actions = plan.actions.filter((action) => action.legId === leg.id);
    const selectedPhases = new Set(actions.flatMap((action) => action.questChanges.map(phaseKey)));
    if (!selectedPhases.size) continue;
    const add = (id: string, phases: readonly Phase[]): void => {
      if (!phases.length || actionIds.has(id) || Object.hasOwn(aliases, id)) return;
      const candidates = actions.filter((action) => containsInOrder(action, phases));
      if (candidates.length !== 1) return;
      aliases[id] = candidates[0]!.id;
      changed = true;
    };
    for (const { reference, guide } of sources) {
      const chapterMatches = chapterEligibility(reference, profile) === "match";
      const selectedSharedSource = plan.sharedQuestsOnly && reference.family === "questing" &&
        reference.factions.includes("alliance") && actions.some((action) => action.source?.chapterId === guide.chapterId &&
          action.source.version === guide.version);
      if (
        guide.targetBuild !== plan.targetBuild ||
        (!chapterMatches && !selectedSharedSource) ||
        !(leg.id === `start-${reference.sourceId}` || sourceIds.includes(reference.sourceId))
      )
        continue;
      for (const step of guide.steps) {
        const view = getGuideStepView(
          {
            ...step,
            directives: step.directives.filter(
              (directive) => ![".group", ".solo"].includes(directive.tag),
            ),
          },
          profile,
          { dungeons },
        );
        if (view.condition !== "match") continue;
        const raw = sourcePhases(view.directives);
        if (!raw) continue;
        const phases = raw.filter((phase) => selectedPhases.has(phaseKey(phase)));
        // Shared routes qualify ordinary steps independently of solo chapter recommendations.
        if (!chapterMatches && (!phases.length || phases.some((phase) => !sharedQuestIds.has(phase.questId)) ||
          !actions.some((action) => action.source?.chapterId === guide.chapterId && action.source.version === guide.version &&
            action.source.stepId === step.id && containsInOrder(action, phases)))) continue;
        for (const phase of phases) {
          if (phaseCounts.get(phaseKey(phase)) !== 1) continue;
          if (movedLibraryQuestIds.has(phase.questId))
            add(
              `library-quest-${phase.questId}-${phase.state}-${phase.objectiveIndex ?? 0}`,
              [phase],
            );
          if (earlyDesolaceQuestIds.has(phase.questId))
            add(`desolace-maraudon-${reference.sourceId}-${step.id}`, [phase]);
          for (const oldLeg of movedSourceLegs.get(phaseKey(phase)) ?? [])
            add(`${oldLeg}-${reference.sourceId}-${step.id}`, [phase]);
        }
        const base = `${leg.id}-${reference.sourceId}-${step.id}`;
        add(base, phases);
        if (leg.id === "ironforge-rendezvous") add(`${base}-unlock`, phases);
        for (let index = 1; index < phases.length; index++) {
          const phase = phases[index]!,
            prefix = phases.slice(0, index);
          if (
            phase.state !== "accepted" &&
            prefix.some((change) => change.state === "rewarded") &&
            prefix.every((change) => change.state !== "objectives-complete")
          )
            add(`${base}-before-deferred-${phase.questId}`, prefix);
        }
        if (phases.length > 1 && phases.every((phase) => phase.state === "accepted"))
          for (const phase of phases) add(`${base}-deferred-${phase.questId}`, [phase]);
      }
    }
  }
  return changed ? { ...plan, bookmarkAliases: aliases } : plan;
}
