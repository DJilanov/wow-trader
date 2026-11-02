import {
  getGuideStepView,
  type ImportedChapter,
  type ImportedDirective,
  type ImportedStep,
  type GuideStepView,
  RUNTIME_CHECK_TAGS,
} from "./guide-archive.js";
import type { CharacterProfile } from "./profile.js";
import type { CombatQuestReference } from "./combat-model.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";

export type CampaignSourcePhaseSelector = (
  step: ImportedStep,
  view: GuideStepView,
  directive: ImportedDirective,
) => boolean;

function phaseKey(directive: ImportedDirective): string | null {
  if (!directive.questId || ![".accept", ".complete", ".turnin"].includes(directive.tag))
    return null;
  return `${directive.tag}:${directive.questId}:${directive.tag === ".complete" ? Number(directive.arguments.split(",")[1] ?? 1) : 0}`;
}

function questGuardKey(directives: readonly ImportedDirective[]): string | null {
  const guards: string[] = [];
  for (const directive of directives) {
    if (!RUNTIME_CHECK_TAGS.has(directive.tag)) continue;
    if (!CAMPAIGN_QUEST_GUARDS.has(directive.tag)) return null;
    const args = directive.arguments.split(",").map((value) => value.trim());
    if (args.some((value) => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))))
      return null;
    if ([".isQuestComplete", ".isQuestNotComplete"].includes(directive.tag) && args.length !== 1)
      return null;
    guards.push(`${directive.tag}:${args.join(",")}`);
  }
  return [...new Set(guards)].sort().join(";");
}

interface FallbackPhase {
  readonly ordinal: number;
  readonly guards: readonly ImportedDirective[];
  readonly guardKey: string;
}

/** An opportunistic guarded phase must not consume its later full completion witness. */
export function createCampaignSourcePhaseSelector(
  guide: ImportedChapter,
  profile: CharacterProfile,
  dungeons: readonly string[],
  questReferences: readonly CombatQuestReference[] = [],
  followingGuides: readonly ImportedChapter[] = [],
): CampaignSourcePhaseSelector {
  const fallbacks = new Map<string, FallbackPhase[]>();
  const eligible: {
    readonly ordinal: number;
    readonly directives: readonly ImportedDirective[];
  }[] = [];
  const parents = new Map(questReferences.map((quest) => [quest.questId, quest.prerequisites]));
  const steps: ImportedStep[] = [...guide.steps];
  let ordinalOffset = Math.max(0, ...guide.steps.map((step) => step.ordinal));
  for (const following of followingGuides) {
    if (following.targetBuild !== guide.targetBuild)
      throw new Error("Source fallback sequence mixes client builds.");
    steps.push(
      ...following.steps.map((step) => ({ ...step, ordinal: ordinalOffset + step.ordinal })),
    );
    ordinalOffset += Math.max(0, ...following.steps.map((step) => step.ordinal));
  }
  for (const step of steps) {
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
    const displayOnly = displayOnlyQuestPhases(view.directives);
    const directives = view.directives.filter((directive) => !displayOnly.has(directive));
    eligible.push({ ordinal: step.ordinal, directives });
    const guardKey = questGuardKey(directives);
    if (guardKey === null) continue;
    const guards = directives.filter((directive) => CAMPAIGN_QUEST_GUARDS.has(directive.tag));
    for (const directive of directives) {
      const key = phaseKey(directive);
      if (key)
        fallbacks.set(key, [
          ...(fallbacks.get(key) ?? []),
          { ordinal: step.ordinal, guards, guardKey },
        ]);
    }
  }
  const selections = new Map<string, boolean>();
  const selectionKey = (ordinal: number, directive: ImportedDirective): string =>
    `${ordinal}:${directive.tag}:${directive.arguments}`;
  const decide = (
    ordinal: number,
    directives: readonly ImportedDirective[],
    directive: ImportedDirective,
  ): boolean => {
    const hasResourceGuard = directives.some((check) =>
      [".itemcount", ".money"].includes(check.tag),
    );
    const key = phaseKey(directive);
    const currentGuards = questGuardKey(
      directives.filter((check) => ![".itemcount", ".money"].includes(check.tag)),
    );
    if (!hasResourceGuard && (currentGuards === null || currentGuards === "")) return true;
    const priorPickup =
      hasResourceGuard && directive.tag === ".complete"
        ? eligible
            .filter(
              (entry) =>
                entry.ordinal < ordinal &&
                questGuardKey(entry.directives) === "" &&
                entry.directives.some(
                  (row) => row.tag === ".accept" && row.questId === directive.questId,
                ),
            )
            .at(-1)
        : undefined;
    const openPickup =
      priorPickup !== undefined &&
      !eligible.some(
        (entry) =>
          entry.ordinal > priorPickup.ordinal &&
          entry.ordinal < ordinal &&
          entry.directives.some(
            (row) =>
              (row.tag === ".turnin" && row.questId === directive.questId) ||
              (row.tag === ".abandon" && Number(row.arguments.split(",")[0]) === directive.questId),
          ),
      );
    const fallback =
      key === null
        ? undefined
        : fallbacks
            .get(key)
            ?.find(
              (candidate) =>
                candidate.ordinal > ordinal &&
                (candidate.guardKey === "" ||
                  (hasResourceGuard && candidate.guardKey === currentGuards) ||
                  (openPickup &&
                    candidate.guards.length > 0 &&
                    candidate.guards.every(
                      (guard) =>
                        guard.tag === ".isQuestAvailable" &&
                        guard.arguments.trim() === String(directive.questId),
                    ))),
            );
    if (fallback === undefined) return true;
    if (directives.some((entry) => phaseKey(entry) && entry.questId !== directive.questId))
      return true;
    for (const between of eligible) {
      if (between.ordinal <= ordinal || between.ordinal >= fallback.ordinal) continue;
      for (const entry of between.directives) {
        const own = entry.questId === directive.questId;
        if (
          own &&
          entry.tag === ".turnin" &&
          selections.get(selectionKey(between.ordinal, entry)) === false
        )
          continue;
        if (
          own &&
          (entry.tag === ".abandon" ||
            entry.tag === ".turnin" ||
            (directive.tag === ".turnin" && entry.tag === ".accept") ||
            (directive.tag === ".accept" && entry.tag === ".complete"))
        )
          return true;
        const changedQuest =
          entry.tag === ".abandon" ? Number(entry.arguments.split(",")[0]) : entry.questId;
        if (phaseKey(entry) || entry.tag === ".abandon")
          for (const guard of fallback.guards) {
            if (
              !guard.arguments
                .split(",")
                .map(Number)
                .includes(changedQuest ?? 0)
            )
              continue;
            // Own objective progress preserves active/history guards, but can flip completion guards.
            if (
              !own ||
              entry.tag !== ".complete" ||
              [".isQuestComplete", ".isQuestNotComplete"].includes(guard.tag)
            )
              return true;
          }
        if (entry.tag !== ".accept" || own || entry.questId === null) continue;
        const required = parents.get(entry.questId);
        if ([...(required?.allOf ?? []), ...(required?.anyOf ?? [])].includes(directive.questId!))
          return true;
        if (
          between.directives.some(
            (check) =>
              [".isQuestTurnedIn", ".isQuestComplete"].includes(check.tag) &&
              check.arguments.split(",").map(Number).includes(directive.questId!),
          )
        )
          return true;
      }
    }
    return false;
  };
  // Every intervening hand-in is later in source order. Resolve those first without recursion.
  for (const entry of [...eligible].sort((left, right) => right.ordinal - left.ordinal))
    for (const directive of entry.directives)
      if (phaseKey(directive))
        selections.set(
          selectionKey(entry.ordinal, directive),
          decide(entry.ordinal, entry.directives, directive),
        );
  return (step, view, directive): boolean =>
    !displayOnlyQuestPhases(view.directives).has(directive) &&
    (selections.get(selectionKey(step.ordinal, directive)) ?? true);
}
