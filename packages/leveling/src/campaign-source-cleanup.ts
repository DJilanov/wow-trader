import type { CampaignAction, CampaignSource } from "./campaign.js";
import type { CharacterProfile } from "./profile.js";
import { chapterEligibility, getChapterLabel } from "./chapter-catalog.js";
import { getGuideStepView } from "./guide-archive.js";

const cleanupTags = new Set([".abandon", "#optional", "#completewith", "#season", "text"]);

/** Recognizes optional cleanup after a complete source lifecycle; never emits abandonment. */
export function hasOnlyPostTurnInCleanup(
  questId: number,
  actions: readonly CampaignAction[],
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  targetBuild: number,
): boolean {
  const phases = actions.flatMap((action) => action.questChanges);
  const handIns = actions.filter((action) =>
    action.questChanges.some((change) => change.questId === questId && change.state === "rewarded"),
  );
  if (
    handIns.length !== 1 ||
    !phases.some((change) => change.questId === questId && change.state === "accepted") ||
    !phases.some(
      (change) => change.questId === questId && change.state === "objectives-complete",
    ) ||
    actions.some(
      (action) =>
        !action.source || action.questChanges.some((change) => change.questId !== questId),
    )
  )
    return false;
  const ordered = [...sources]
    .filter(
      (source) =>
        source.guide.targetBuild === targetBuild &&
        chapterEligibility(source.reference, profile) === "match",
    )
    .sort(
      (left, right) =>
        getChapterLabel(left.reference, profile).minimumLevel -
          getChapterLabel(right.reference, profile).minimumLevel ||
        left.reference.sourceId - right.reference.sourceId,
    );
  const identity = (action: CampaignAction): string =>
    `${action.source!.chapterId}:${action.source!.version}:${action.source!.stepId}`;
  const selected = new Set(actions.map(identity));
  const found = new Set<string>();
  const handInIdentity = identity(handIns[0]!);
  const mentionsQuest = (tag: string, argumentsValue: string): boolean =>
    [".abandon", ".accept", ".complete", ".turnin"].includes(tag) &&
    Number(argumentsValue.split(",")[0]) === questId;
  let handInReached = false;
  let cleanupReached = false;
  for (const { guide } of ordered) {
    for (const step of guide.steps) {
      if (!step.directives.some((directive) => mentionsQuest(directive.tag, directive.arguments)))
        continue;
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter(
            (directive) => ![".group", ".solo"].includes(directive.tag),
          ),
        },
        profile,
        { dungeons: [] },
      );
      if (view.condition === "exclude") continue;
      if (
        (view.condition === "unknown" &&
          step.directives.some((directive) => mentionsQuest(directive.tag, directive.arguments))) ||
        view.conditionalDirectives.some((directive) =>
          mentionsQuest(directive.tag, directive.arguments),
        )
      )
        return false;
      if (view.condition !== "match") continue;
      const key = `${guide.chapterId}:${guide.version}:${step.id}`;
      if (selected.has(key)) found.add(key);
      const abandons = view.directives.filter(
        (directive) =>
          directive.tag === ".abandon" && Number(directive.arguments.split(",")[0]) === questId,
      );
      if (abandons.length) {
        // An optional marker alone cannot make an early abandonment a completed task.
        if (
          !handInReached ||
          !view.directives.some((directive) => directive.tag === "#optional") ||
          view.runtimeChecks.length ||
          view.directives.some(
            (directive) =>
              !cleanupTags.has(directive.tag) ||
              (directive.tag === ".abandon" &&
                (directive.arguments.trim() !== String(questId) ||
                  directive.condition.trim() !== "")),
          )
        )
          return false;
        cleanupReached = true;
      }
      const questPhases = view.directives.filter(
        (directive) =>
          directive.questId === questId &&
          [".accept", ".complete", ".turnin"].includes(directive.tag),
      );
      if (cleanupReached && questPhases.length) return false;
      if (key === handInIdentity) handInReached = true;
    }
  }
  return cleanupReached && found.size === selected.size;
}
