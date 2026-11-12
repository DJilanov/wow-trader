import type { CampaignAction, CampaignSource } from "./campaign.js";
import type { CharacterProfile } from "./profile.js";
import { getChapterLabel } from "./chapter-catalog.js";
import { getGuideStepView, type ImportedDirective, type ImportedStep } from "./guide-archive.js";
import { eligibleCampaignLibrarySource } from "./campaign-library-source-profile.js";
import { isCommonCampaignQuestMethod } from "./campaign-shared-source.js";
import { matchesCampaignSourcePhase } from "./campaign-source-conditions.js";

const cleanupTags = new Set([
  ".abandon",
  "#optional",
  "#completewith",
  "#hidewindow",
  "#season",
  "#era",
  "#era/som",
  "#softcore",
  "#softcoreserver",
  "text",
]);

function groupMarkerMatches(row: ImportedDirective, size: number): boolean {
  return (
    row.condition.trim() === "" &&
    (row.arguments.trim() === "" ||
      (/^[1-9]\d*$/.test(row.arguments.trim()) && Number(row.arguments) <= size))
  );
}

function selectedGroupSource(
  actions: readonly CampaignAction[],
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  targetBuild: number,
): string | null {
  const first = actions[0],
    last = actions.at(-1);
  if (
    profile.party.size <= 1 ||
    actions.length < 3 ||
    first?.questChanges[0]?.state !== "accepted" ||
    last?.questChanges[0]?.state !== "rewarded" ||
    actions
      .slice(1, -1)
      .some((action) => action.questChanges[0]?.state !== "objectives-complete") ||
    actions.some((action) => action.questChanges.length !== 1 || !action.source)
  )
    return null;
  const owner = sources.filter(
    ({ guide }) =>
      guide.targetBuild === targetBuild &&
      actions.every(
        (action) =>
          action.source!.chapterId === guide.chapterId && action.source!.version === guide.version,
      ),
  );
  if (owner.length !== 1) return null;
  const guide = owner[0]!.guide;
  let previousOrdinal = 0;
  for (const action of actions) {
    const steps = guide.steps.filter((step) => step.id === action.source!.stepId);
    if (steps.length !== 1) return null;
    const step = steps[0]!;
    if (step.ordinal <= previousOrdinal) return null;
    previousOrdinal = step.ordinal;
    const groups = step.directives.filter((row) => row.tag === ".group");
    if (
      step.directives.some((row) => row.tag === ".solo") ||
      (action.questChanges[0]!.state === "objectives-complete" && groups.length !== 1) ||
      groups.length > 1 ||
      groups.some((row) => !groupMarkerMatches(row, profile.party.size))
    )
      return null;
    const view = getGuideStepView(
      { ...step, directives: step.directives.filter((row) => row.tag !== ".group") },
      profile,
      { dungeons: [] },
    );
    if (
      view.condition !== "match" ||
      view.conditionalDirectives.some((row) => !["text", ".link"].includes(row.tag)) ||
      !view.directives.some((row) => matchesCampaignSourcePhase(action, row))
    )
      return null;
  }
  return `${guide.chapterId}:${guide.version}`;
}

function isUnselectedSoloAlternative(
  step: ImportedStep,
  questId: number,
  actions: readonly CampaignAction[],
): boolean {
  const solo = step.directives.filter((row) => row.tag === ".solo");
  const phases = step.directives.filter(
    (row) => row.questId === questId && [".accept", ".complete", ".turnin"].includes(row.tag),
  );
  return (
    solo.length === 1 &&
    solo[0]!.arguments.trim() === "" &&
    solo[0]!.condition.trim() === "" &&
    !step.directives.some((row) => [".group", ".abandon"].includes(row.tag)) &&
    phases.length > 0 &&
    phases.every((row) => actions.some((action) => matchesCampaignSourcePhase(action, row)))
  );
}

/** Recognizes passive journal cleanup after a complete source lifecycle; never emits abandonment. */
export function hasOnlyPostTurnInCleanup(
  questId: number,
  actions: readonly CampaignAction[],
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  targetBuild: number,
  ordinaryQuestIds?: ReadonlySet<number>,
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
  const groupSource = selectedGroupSource(actions, sources, profile, targetBuild);
  const ordered = sources
    .flatMap((source) => {
      if (source.guide.targetBuild !== targetBuild) return [];
      if (groupSource && `${source.guide.chapterId}:${source.guide.version}` !== groupSource)
        return [];
      const eligible = eligibleCampaignLibrarySource(
        source,
        profile,
        ordinaryQuestIds?.has(questId) === true,
      );
      return eligible ? [eligible] : [];
    })
    .sort(
      (left, right) =>
        getChapterLabel(left.source.reference, profile).minimumLevel -
          getChapterLabel(right.source.reference, profile).minimumLevel ||
        left.source.reference.sourceId - right.source.reference.sourceId,
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
  for (const {
    source: { guide },
    ordinaryOnly,
  } of ordered) {
    for (const step of guide.steps) {
      if (!step.directives.some((directive) => mentionsQuest(directive.tag, directive.arguments)))
        continue;
      const key = `${guide.chapterId}:${guide.version}:${step.id}`;
      if (
        selected.has(key) &&
        step.directives.some(
          (row) => row.tag === ".group" && !groupMarkerMatches(row, profile.party.size),
        )
      )
        return false;
      // A complete captured group program owns its lifecycle. An explicit,
      // unselected solo duplicate cannot make that program conditional.
      if (
        groupSource &&
        !handInReached &&
        !selected.has(key) &&
        isUnselectedSoloAlternative(step, questId, actions)
      )
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
      if (
        ordinaryOnly &&
        view.directives.some((directive) =>
          [".accept", ".complete", ".turnin"].includes(directive.tag),
        ) &&
        (!ordinaryQuestIds || !isCommonCampaignQuestMethod(view.directives, ordinaryQuestIds))
      )
        return false;
      if (selected.has(key)) {
        const own = actions.filter((action) => identity(action) === key);
        if (
          own.some((action) =>
            action.questChanges.some(
              (change) =>
                !view.directives.some((directive) =>
                  matchesCampaignSourcePhase({ ...action, questChanges: [change] }, directive),
                ),
            ),
          )
        )
          return false;
        found.add(key);
      }
      const abandons = view.directives.filter(
        (directive) =>
          directive.tag === ".abandon" && Number(directive.arguments.split(",")[0]) === questId,
      );
      if (abandons.length) {
        const hiddenNextStep =
          view.directives.some((directive) => directive.tag === "#hidewindow") &&
          view.directives.some(
            (directive) =>
              directive.tag === "#completewith" && directive.arguments.trim() === "next",
          );
        // UI cleanup markers cannot make an early abandonment a completed task.
        if (
          !handInReached ||
          (!hiddenNextStep &&
            !view.directives.some((directive) => directive.tag === "#optional")) ||
          view.runtimeChecks.length ||
          view.directives.some(
            (directive) =>
              !cleanupTags.has(directive.tag) ||
              (directive.tag === "#hidewindow" &&
                (directive.arguments.trim() !== "" || directive.condition.trim() !== "")) ||
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
      if (
        questPhases.some(
          (directive) => !actions.some((action) => matchesCampaignSourcePhase(action, directive)),
        )
      )
        return false;
      if ((cleanupReached || (groupSource && handInReached)) && questPhases.length) return false;
      if (key === handInIdentity) handInReached = true;
    }
  }
  return cleanupReached && found.size === selected.size;
}
