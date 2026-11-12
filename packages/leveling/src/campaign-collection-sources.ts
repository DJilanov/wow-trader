import type { CampaignAction, CampaignSource } from "./campaign.js";
import type { CharacterProfile } from "./profile.js";
import { eligibleCampaignLibrarySource } from "./campaign-library-source-profile.js";
import { isCommonCampaignQuestMethod } from "./campaign-shared-source.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";

/** Positioned alternatives to one collection phase; the caller verifies the complete lifecycle and cost. */
export function campaignCollectionPhaseSources(
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  targetBuild: number,
  prototypes: ReadonlyMap<number, CampaignAction>,
  ordinaryQuestIds?: ReadonlySet<number>,
  phase: "accepted" | "objectives-complete" = "objectives-complete",
): ReadonlyMap<number, readonly CampaignAction[]> {
  const result = new Map<number, CampaignAction[]>();
  const tag = phase === "accepted" ? ".accept" : ".complete";
  for (const source of sources) {
    const eligible = eligibleCampaignLibrarySource(
      source,
      profile,
      Boolean(ordinaryQuestIds?.size),
    );
    if (!eligible) continue;
    const { guide, reference } = eligible.source;
    if (guide.targetBuild !== targetBuild || reference.family !== "questing") continue;
    for (const step of guide.steps) {
      if (step.directives.some((row) => row.tag === ".dungeon")) continue;
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter((row) => ![".group", ".solo"].includes(row.tag)),
        },
        profile,
        { dungeons: [] },
      );
      if (view.condition !== "match" || view.conditionalDirectives.length) continue;
      if (
        eligible.ordinaryOnly &&
        (!ordinaryQuestIds || !isCommonCampaignQuestMethod(view.directives, ordinaryQuestIds))
      )
        continue;
      const phases = view.directives.filter((row) =>
        [".accept", ".complete", ".turnin"].includes(row.tag),
      );
      if (!phases.length || phases.some((directive) => directive.tag !== tag)) continue;
      const positions = view.directives.flatMap((row) =>
        row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
      );
      if (!positions.length) continue;
      for (const directive of phases) {
        const questId = directive.questId;
        if (questId === null) continue;
        const prototype = prototypes.get(questId);
        if (
          !prototype ||
          prototype.questChanges.length !== 1 ||
          prototype.questChanges[0]!.state !== phase ||
          phases.filter((phase) => phase.questId === questId).length !== 1 ||
          (phase === "objectives-complete" &&
            Number(directive.arguments.split(",")[1] ?? 1) !==
              prototype.questChanges[0]!.objectiveIndex)
        )
          continue;
        const offset = view.directives.indexOf(directive);
        const next = view.directives.findIndex((row, index) => index > offset && row.tag === tag);
        const segment = view.directives.slice(offset, next < 0 ? undefined : next);
        const hints =
          phases.length === 1
            ? view.directives.filter((row) => row.tag === "text").map((row) => row.text)
            : segment
                .filter((row) => [".mob", ".target", ".unitscan"].includes(row.tag))
                .map((row) => `Target: ${row.arguments.replace(/^\+/, "")}`);
        const action: CampaignAction = {
          ...prototype,
          id: `collection-source-${reference.sourceId}-${step.id}-${questId}`,
          // Retain the complete source predicates even when only this counter is selected.
          source: campaignActionSource(guide, step, view.directives),
          positions,
          instructions: [directive.text, ...hints].filter(Boolean),
        };
        result.set(questId, [...(result.get(questId) ?? []), action]);
      }
    }
  }
  return result;
}
